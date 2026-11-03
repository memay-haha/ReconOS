"""Object storage client against the test bucket: docs/architecture/system.md."""

import uuid

from app.core.storage import delete_object, get_object_stream, object_storage, put_object_stream


async def test_round_trip_through_the_test_bucket() -> None:
    key = f"probe/{uuid.uuid4()}.txt"
    payload = b"raw output stays byte for byte\n"

    await put_object_stream(key, payload)
    try:
        read_back = b""
        async for chunk in get_object_stream(key):
            read_back += chunk
    finally:
        await delete_object(key)

    assert read_back == payload


async def test_client_targets_the_test_bucket() -> None:
    async with object_storage() as (client, bucket):
        response = await client.list_objects_v2(Bucket=bucket, MaxKeys=1)

    assert bucket.endswith("-test")
    assert response["ResponseMetadata"]["HTTPStatusCode"] == 200
