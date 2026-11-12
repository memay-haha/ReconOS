"""S3 client for the object storage that holds raw output (G8).

Only the Backend API and background tasks reach it; workers never do:
docs/architecture/system.md. Content is written byte for byte, parsing comes
afterwards and never touches the stored object.
"""

import hashlib
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import aioboto3

from app.core.config import Settings, get_settings

# Large raw output is streamed, so chunks stay small and memory flat.
CHUNK_SIZE = 1024 * 1024


@asynccontextmanager
async def object_storage(
    settings: Settings | None = None,
) -> AsyncIterator[tuple[Any, str]]:
    """Yield an S3 client together with the bucket it should write to."""
    settings = settings or get_settings()
    session = aioboto3.Session()
    async with session.client(
        "s3",
        endpoint_url=settings.s3_endpoint,
        aws_access_key_id=settings.s3_access_key.get_secret_value(),
        aws_secret_access_key=settings.s3_secret_key.get_secret_value(),
    ) as client:
        yield client, settings.s3_bucket


async def put_object_stream(key: str, body: bytes, settings: Settings | None = None) -> None:
    async with object_storage(settings) as (client, bucket):
        await client.put_object(Bucket=bucket, Key=key, Body=body)


async def get_object_stream(key: str, settings: Settings | None = None) -> AsyncIterator[bytes]:
    async with object_storage(settings) as (client, bucket):
        response = await client.get_object(Bucket=bucket, Key=key)
        async for chunk in response["Body"].iter_chunks(CHUNK_SIZE):
            yield chunk


async def delete_object(key: str, settings: Settings | None = None) -> None:
    """Only for test fixtures and retention jobs. Parsers never delete (G8)."""
    async with object_storage(settings) as (client, bucket):
        await client.delete_object(Bucket=bucket, Key=key)


# S3 DeleteObjects takes at most 1000 keys per call.
_BAD_PREFIX = "prefix must name one folder"
_DELETE_BATCH = 1000


async def delete_prefix(prefix: str, settings: Settings | None = None) -> int:
    """Delete every object under `prefix`. Only for a program hard delete (G8).

    Returns the number of objects removed. Running it again removes nothing
    more, so a retry is safe.
    """
    if not prefix.endswith("/") or prefix == "/":
        raise ValueError(_BAD_PREFIX)
    removed = 0
    async with object_storage(settings) as (client, bucket):
        paginator = client.get_paginator("list_objects_v2")
        async for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            keys = [{"Key": item["Key"]} for item in page.get("Contents", [])]
            for start in range(0, len(keys), _DELETE_BATCH):
                batch = keys[start : start + _DELETE_BATCH]
                await client.delete_objects(Bucket=bucket, Delete={"Objects": batch, "Quiet": True})
                removed += len(batch)
    return removed


# S3 multipart parts must be at least 5 MiB, except the last one.
PART_SIZE = 8 * 1024 * 1024


class ObjectTooLargeError(Exception):
    """The streamed body went past the size limit; nothing was stored."""


def _check_size(size: int, max_bytes: int) -> None:
    if size > max_bytes:
        raise ObjectTooLargeError


async def put_object_from_stream(
    key: str,
    chunks: AsyncIterator[bytes],
    *,
    content_type: str,
    max_bytes: int,
    settings: Settings | None = None,
) -> tuple[int, str]:
    """Store a streamed body byte for byte. Returns its size and SHA-256 (G8).

    Memory stays at one part whatever the file size: a small body goes up in
    one PUT, a large one as a multipart upload. Any failure, the size limit
    included, aborts the upload so no partial object is left behind.
    """
    digest = hashlib.sha256()
    size = 0
    buffer = bytearray()
    async with object_storage(settings) as (client, bucket):
        upload_id: str | None = None
        parts: list[dict[str, Any]] = []
        try:
            async for chunk in chunks:
                size += len(chunk)
                _check_size(size, max_bytes)
                digest.update(chunk)
                buffer.extend(chunk)
                while len(buffer) >= PART_SIZE:
                    if upload_id is None:
                        created = await client.create_multipart_upload(
                            Bucket=bucket, Key=key, ContentType=content_type
                        )
                        upload_id = created["UploadId"]
                    part = bytes(buffer[:PART_SIZE])
                    del buffer[:PART_SIZE]
                    sent = await client.upload_part(
                        Bucket=bucket,
                        Key=key,
                        UploadId=upload_id,
                        PartNumber=len(parts) + 1,
                        Body=part,
                    )
                    parts.append({"PartNumber": len(parts) + 1, "ETag": sent["ETag"]})
            if upload_id is None:
                await client.put_object(
                    Bucket=bucket, Key=key, Body=bytes(buffer), ContentType=content_type
                )
            else:
                if buffer:
                    sent = await client.upload_part(
                        Bucket=bucket,
                        Key=key,
                        UploadId=upload_id,
                        PartNumber=len(parts) + 1,
                        Body=bytes(buffer),
                    )
                    parts.append({"PartNumber": len(parts) + 1, "ETag": sent["ETag"]})
                await client.complete_multipart_upload(
                    Bucket=bucket,
                    Key=key,
                    UploadId=upload_id,
                    MultipartUpload={"Parts": parts},
                )
        except BaseException:
            if upload_id is not None:
                await client.abort_multipart_upload(Bucket=bucket, Key=key, UploadId=upload_id)
            raise
    return size, digest.hexdigest()
