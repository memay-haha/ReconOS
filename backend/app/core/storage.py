"""S3 client for the object storage that holds raw output (G8).

Only the Backend API and background tasks reach it; workers never do:
docs/architecture/system.md. Content is written byte for byte, parsing comes
afterwards and never touches the stored object.
"""

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
