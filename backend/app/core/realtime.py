"""Realtime events over Redis pub/sub.

Any core process publishes a state change; the Backend API subscribes and pushes
what each account may see over WebSocket: docs/architecture/system.md, section
Realtime. Event shape: docs/api/architecture.md, section WebSocket.

A service queues an event on its session with `queue_event` (or a typed helper
such as `queue_job_event`). `app.core.db.session_scope` publishes the queue only
after the transaction commits, so a rolled back change never reaches a browser:
docs/architecture/request-flow.md. `publish_job_event` publishes at once, for a
caller that has already committed.

Publishing is best effort. A Redis failure is logged and swallowed: the change
is already in PostgreSQL, and the browser refreshes every open query when its
WebSocket reconnects.
"""

import json
import uuid
from collections.abc import AsyncGenerator, Mapping
from datetime import UTC, datetime
from typing import Any, Final, Literal, get_args

import redis.asyncio as redis
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings

EVENT_CHANNEL = "reconos:events"

EventType = Literal[
    "job.status_changed",
    "finding.created",
    "asset.discovered",
    "alert.created",
    "worker.status_changed",
]
EVENT_TYPES: Final[frozenset[str]] = frozenset(get_args(EventType))

# Every call out of the process carries a timeout: .claude/rules/error-handling.md.
REDIS_TIMEOUT_SECONDS: Final = 2.0

_PENDING_KEY: Final = "reconos_realtime_pending"

log = structlog.get_logger()


def build_client(
    settings: Settings | None = None, *, socket_timeout: float | None = REDIS_TIMEOUT_SECONDS
) -> redis.Redis:
    """Client for the event channel. A subscriber passes `socket_timeout=None` to wait idle."""
    settings = settings or get_settings()
    password = settings.redis_password.get_secret_value() if settings.redis_password else None
    return redis.from_url(
        settings.redis_url,
        password=password,
        decode_responses=True,
        socket_connect_timeout=REDIS_TIMEOUT_SECONDS,
        socket_timeout=socket_timeout,
    )


def build_event(
    event_type: EventType,
    program_id: uuid.UUID | None,
    data: Mapping[str, Any],
    at: datetime | None = None,
) -> dict[str, Any]:
    """One event in the documented shape. `program_id` None marks system-wide data.

    `data` carries identifiers and states only, never a credential (G7).
    """
    return {
        "type": event_type,
        "program_id": str(program_id) if program_id is not None else None,
        "data": dict(data),
        "at": (at or datetime.now(UTC)).isoformat().replace("+00:00", "Z"),
    }


def parse_event(raw: str) -> dict[str, Any] | None:
    """Decode one message from the channel, or None when it is not a known event."""
    try:
        event = json.loads(raw)
    except ValueError:
        return None
    if not isinstance(event, dict) or event.get("type") not in EVENT_TYPES:
        return None
    program_id = event.get("program_id")
    if program_id is not None and not isinstance(program_id, str):
        return None
    return event


async def publish_event(event: dict[str, Any], settings: Settings | None = None) -> None:
    """Publish one state change. Raises on a Redis failure; callers want `publish_events`."""
    client = build_client(settings)
    try:
        await client.publish(EVENT_CHANNEL, json.dumps(event))
    finally:
        await client.aclose()


async def publish_events(events: list[dict[str, Any]], settings: Settings | None = None) -> None:
    """Publish events in order on one connection. Never raises."""
    if not events:
        return
    client = build_client(settings)
    try:
        for event in events:
            await client.publish(EVENT_CHANNEL, json.dumps(event))
    except (redis.RedisError, OSError) as error:
        log.warning("realtime_publish_failed", error_type=type(error).__name__, dropped=len(events))
    finally:
        await client.aclose()


def queue_event(session: AsyncSession, event: dict[str, Any]) -> None:
    """Publish `event` once the session's transaction commits."""
    session.info.setdefault(_PENDING_KEY, []).append(event)


def take_pending_events(session: AsyncSession) -> list[dict[str, Any]]:
    """Remove and return the events queued on the session."""
    pending: list[dict[str, Any]] = session.info.pop(_PENDING_KEY, [])
    return pending


def queue_job_event(
    session: AsyncSession, *, job_id: uuid.UUID, program_id: uuid.UUID, status: str
) -> None:
    """Queue `job.status_changed`: call in the same transaction as the status UPDATE."""
    queue_event(session, _job_event(job_id, program_id, status))


def queue_worker_event(session: AsyncSession, *, worker_id: uuid.UUID, is_online: bool) -> None:
    """Queue `worker.status_changed`. Worker data belongs to no program."""
    queue_event(
        session,
        build_event(
            "worker.status_changed", None, {"worker_id": str(worker_id), "is_online": is_online}
        ),
    )


async def publish_job_event(
    *,
    job_id: uuid.UUID,
    program_id: uuid.UUID,
    status: str,
    settings: Settings | None = None,
) -> None:
    """Publish `job.status_changed` now. Call only after the change has committed."""
    await publish_events([_job_event(job_id, program_id, status)], settings)


def _job_event(job_id: uuid.UUID, program_id: uuid.UUID, status: str) -> dict[str, Any]:
    return build_event("job.status_changed", program_id, {"job_id": str(job_id), "status": status})


async def subscribe_events(
    settings: Settings | None = None,
) -> AsyncGenerator[dict[str, Any]]:
    """Yield events until the caller stops iterating."""
    client = build_client(settings, socket_timeout=None)
    pubsub = client.pubsub()
    try:
        await pubsub.subscribe(EVENT_CHANNEL)
        async for message in pubsub.listen():
            if message["type"] != "message":
                continue
            parsed: dict[str, Any] = json.loads(message["data"])
            yield parsed
    finally:
        # redis-py leaves PubSub.aclose unannotated.
        await pubsub.aclose()  # type: ignore[no-untyped-call]
        await client.aclose()
