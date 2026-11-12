"""Background tasks sent by name, after the transaction that asked for them commits.

A module queues a task on its session with `queue_task`; `app.core.db.session_scope`
sends the queue once the commit succeeds and drops it on rollback, the same way
realtime events travel: docs/architecture/system.md. So the parse task never
reaches the background process before its raw output row is visible (G8), and
a module never imports the module that runs the task: raw_output names the
parse task, scope names the scope recompute of asset:
docs/architecture/dependency-graph.md.

Redis carries identifiers only, never data from a request or a credential.
"""

import asyncio
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass, field
from typing import Any, Final
from urllib.parse import urlsplit, urlunsplit

import structlog
from celery import Celery
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings

# Task names. The background process registers a task under each name:
# app/background/.
PARSE_RAW_OUTPUT_TASK: Final = "reconos.parse_raw_output"
RECOMPUTE_IN_SCOPE_TASK: Final = "reconos.recompute_in_scope"
PURGE_PROGRAM_OBJECTS_TASK: Final = "reconos.purge_program_objects"
RUN_DUE_SCHEDULES_TASK: Final = "reconos.run_due_schedules"

# Queues of the background process: docs/architecture/system.md.
PARSE_QUEUE: Final = "parse"
SCHEDULE_QUEUE: Final = "schedule"

_PENDING_KEY: Final = "reconos_tasks_pending"

log = structlog.get_logger()


@dataclass(frozen=True)
class PendingTask:
    name: str
    queue: str
    kwargs: Mapping[str, Any] = field(default_factory=dict)


SendTask = Callable[[PendingTask], Awaitable[None]]


def broker_url(settings: Settings) -> str:
    """REDIS_URL with the password put in. The result is never logged."""
    parts = urlsplit(settings.redis_url)
    password = settings.redis_password.get_secret_value() if settings.redis_password else ""
    if not password:
        return settings.redis_url
    host = parts.netloc.rsplit("@", 1)[-1]
    netloc = f"{parts.username or ''}:{password}@{host}"
    return urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment))


def build_producer(settings: Settings | None = None) -> Celery:
    """A Celery app that only sends: JSON, never pickle."""
    settings = settings or get_settings()
    app = Celery("reconos-producer", broker=broker_url(settings))
    app.conf.update(task_serializer="json", accept_content=["json"], broker_connection_timeout=5)
    return app


_producer: Celery | None = None


async def _send_with_celery(task: PendingTask) -> None:
    global _producer  # one producer per process, built on first use
    if _producer is None:
        _producer = build_producer()
    # send_task blocks on the broker socket, so it runs off the event loop.
    await asyncio.to_thread(
        _producer.send_task, task.name, kwargs=dict(task.kwargs), queue=task.queue
    )


_sender: SendTask = _send_with_celery


def set_sender(sender: SendTask) -> SendTask:
    """Replace how tasks leave the process; returns the previous sender. For tests."""
    global _sender  # swapped by tests only
    previous, _sender = _sender, sender
    return previous


def queue_task(session: AsyncSession, name: str, *, queue: str, kwargs: Mapping[str, Any]) -> None:
    """Send the task once the session's transaction commits."""
    session.info.setdefault(_PENDING_KEY, []).append(PendingTask(name, queue, dict(kwargs)))


def take_pending_tasks(session: AsyncSession) -> list[PendingTask]:
    """Remove and return the tasks queued on the session."""
    pending: list[PendingTask] = session.info.pop(_PENDING_KEY, [])
    return pending


def pending_tasks(session: AsyncSession) -> list[PendingTask]:
    """The tasks queued so far, left in place."""
    return list(session.info.get(_PENDING_KEY, []))


async def send_tasks(tasks: list[PendingTask]) -> None:
    """Send committed tasks in order. Never raises.

    The change is already committed, so a broker failure cannot undo it. The
    work stays recoverable: a raw output left `pending` is parsed again with
    the reparse endpoint, and the scope recompute runs again on the next rule
    change.
    """
    for task in tasks:
        try:
            await _sender(task)
        except Exception as error:  # noqa: BLE001  # broker errors vary by transport
            log.warning("task_send_failed", task=task.name, error_type=type(error).__name__)
