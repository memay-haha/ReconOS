"""Redis pub/sub used to push events to the browser: docs/architecture/system.md."""

import asyncio
import json
import uuid
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.config import Settings
from app.core.db import session_scope
from app.core.realtime import (
    EVENT_CHANNEL,
    build_client,
    build_event,
    parse_event,
    publish_event,
    publish_events,
    publish_job_event,
    queue_job_event,
    queue_worker_event,
    subscribe_events,
    take_pending_events,
)


async def _collect(marker: str, stop: asyncio.Event) -> list[dict[str, Any]]:
    """Events carrying `marker` until `stop`. The channel is shared with other tests."""
    seen: list[dict[str, Any]] = []
    client = build_client(socket_timeout=None)
    pubsub = client.pubsub()
    try:
        await pubsub.subscribe(EVENT_CHANNEL)
        while not stop.is_set():
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=0.2)
            if message is not None and marker in message["data"]:
                seen.append(json.loads(message["data"]))
    finally:
        await pubsub.aclose()  # type: ignore[no-untyped-call]  # redis-py leaves it unannotated
        await client.aclose()
    return seen


async def test_subscriber_receives_a_published_event() -> None:
    event = {"type": "job_status_changed", "job_id": str(uuid.uuid4()), "status": "running"}

    async def first_event() -> dict[str, object]:
        async for received in subscribe_events():
            if received == event:
                return received
        raise AssertionError("subscription closed without an event")

    task = asyncio.create_task(first_event())
    await asyncio.sleep(0.2)  # let the subscription register before publishing
    await publish_event(event)

    received = await asyncio.wait_for(task, timeout=5)

    assert received == event


def test_channel_name_is_fixed() -> None:
    assert EVENT_CHANNEL == "reconos:events"


def test_build_event_has_the_documented_shape() -> None:
    program_id = uuid.uuid4()
    at = datetime(2026, 11, 1, 8, 0, tzinfo=UTC)

    event = build_event("job.status_changed", program_id, {"status": "running"}, at)

    assert event == {
        "type": "job.status_changed",
        "program_id": str(program_id),
        "data": {"status": "running"},
        "at": "2026-11-01T08:00:00Z",
    }


def test_build_event_without_program_is_system_wide() -> None:
    assert build_event("worker.status_changed", None, {})["program_id"] is None


@pytest.mark.parametrize(
    "raw",
    [
        "not json",
        "[]",
        json.dumps({"type": "job.deleted", "program_id": None}),
        json.dumps({"type": "job.status_changed", "program_id": 7}),
    ],
)
def test_parse_event_rejects_unknown_shapes(raw: str) -> None:
    assert parse_event(raw) is None


def test_parse_event_accepts_a_known_event() -> None:
    event = build_event("alert.created", None, {})
    assert parse_event(json.dumps(event)) == event


async def test_queued_events_publish_only_after_commit(db_engine: AsyncEngine) -> None:
    marker = str(uuid.uuid4())
    program_id = uuid.uuid4()
    stop = asyncio.Event()
    task = asyncio.create_task(_collect(marker, stop))
    await asyncio.sleep(0.2)

    with pytest.raises(RuntimeError):
        async with session_scope(db_engine) as session:
            queue_job_event(
                session, job_id=uuid.UUID(marker), program_id=program_id, status="cancelled"
            )
            raise RuntimeError("roll back")
    async with session_scope(db_engine) as session:
        queue_job_event(session, job_id=uuid.UUID(marker), program_id=program_id, status="queued")

    await asyncio.sleep(0.5)
    stop.set()
    seen = await asyncio.wait_for(task, timeout=5)

    assert [event["data"] for event in seen] == [{"job_id": marker, "status": "queued"}]
    assert seen[0]["program_id"] == str(program_id)


async def test_take_pending_events_empties_the_queue(db_engine: AsyncEngine) -> None:
    worker_id = uuid.uuid4()
    async with session_scope(db_engine) as session:
        queue_worker_event(session, worker_id=worker_id, is_online=False)
        pending = take_pending_events(session)
        assert take_pending_events(session) == []

    assert pending[0]["type"] == "worker.status_changed"
    assert pending[0]["data"] == {"worker_id": str(worker_id), "is_online": False}


async def test_publish_job_event_reaches_subscribers() -> None:
    marker = str(uuid.uuid4())
    stop = asyncio.Event()
    task = asyncio.create_task(_collect(marker, stop))
    await asyncio.sleep(0.2)

    await publish_job_event(job_id=uuid.UUID(marker), program_id=uuid.uuid4(), status="running")

    await asyncio.sleep(0.5)
    stop.set()
    seen = await asyncio.wait_for(task, timeout=5)
    assert [event["data"]["status"] for event in seen] == ["running"]


async def test_publish_failure_is_logged_not_raised(
    settings_factory: Callable[..., Settings],
) -> None:
    # Port 9 (discard) has no Redis. The change is already committed: publishing must not fail it.
    settings = settings_factory(redis_url="redis://127.0.0.1:9/0")

    await publish_events([build_event("alert.created", None, {})], settings)
    await publish_events([], settings)
