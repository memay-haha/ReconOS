"""Redis pub/sub used to push events to the browser: docs/architecture/system.md."""

import asyncio
import uuid

from app.core.realtime import EVENT_CHANNEL, publish_event, subscribe_events


async def test_subscriber_receives_a_published_event() -> None:
    event = {"type": "job_status_changed", "job_id": str(uuid.uuid4()), "status": "running"}

    async def first_event() -> dict[str, object]:
        async for received in subscribe_events():
            return received
        raise AssertionError("subscription closed without an event")

    task = asyncio.create_task(first_event())
    await asyncio.sleep(0.2)  # let the subscription register before publishing
    await publish_event(event)

    received = await asyncio.wait_for(task, timeout=5)

    assert received == event


def test_channel_name_is_fixed() -> None:
    assert EVENT_CHANNEL == "reconos:events"
