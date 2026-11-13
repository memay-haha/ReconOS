"""Dispatcher: hand queued jobs to workers, one active instance at a time.

Mechanism: docs/architecture/system.md, section Cơ chế dispatcher.

- The instance holding a PostgreSQL advisory lock dispatches; the others wait.
  The lock lives on the LISTEN connection, so a crashed instance frees it.
- A NOTIFY wakes the loop at once; a periodic pass catches anything missed.
- One round runs in one transaction: pick queued jobs by priority, check the
  tool module's concurrency and rate limits, check scope again (G5), mark them
  `dispatched`. The Celery tasks go out only after that commit, and a task
  that cannot be sent puts its job back to `queued`.
"""

import asyncio
import contextlib
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Final
from urllib.parse import urlsplit, urlunsplit

import asyncpg
import redis.asyncio as redis
import structlog
from celery import Celery
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.core import realtime
from app.core.config import Settings, get_settings
from app.core.db import DISPATCHER_CHANNEL, get_engine, session_scope
from app.core.errors import TargetOutOfScopeError, ValidationFailedError
from app.core.identity import User
from app.core.security import program_visible_to
from app.core.system_setting import get_int_setting
from app.dispatcher.schemas import DispatcherHealth, DispatcherStatusResponse
from app.job import service as job_service
from app.job.models import Job
from app.scope import service as scope_service
from app.tool_module.models import ToolModule
from app.user import service as user_service
from contracts.job_status import JobStatus as S
from contracts.tasks import JOB_QUEUE_PREFIX, RUN_JOB_TASK, RunJobTask
from contracts.tool_modules import TOOL_MODULES

log = structlog.get_logger()

# Any constant both instances agree on; "RECONDSP" in ASCII.
ADVISORY_LOCK_KEY: Final = 0x5245434F4E445350
HEARTBEAT_KEY: Final = "reconos:dispatcher:heartbeat"
# Jobs considered per round. Limits usually stop a round well before this.
ROUND_SIZE: Final = 100
# Heartbeat age, in dispatcher_poll_seconds, before the status degrades or drops.
DEGRADED_AFTER_POLLS: Final = 2
DOWN_AFTER_POLLS: Final = 5
RECONNECT_SECONDS: Final = 5.0

SendTask = Callable[[str, uuid.UUID], Awaitable[None]]


@dataclass(frozen=True)
class Dispatch:
    job_id: uuid.UUID
    queue: str


@dataclass
class RoundState:
    """What one dispatcher process remembers between rounds."""

    online_workers: set[uuid.UUID] = field(default_factory=set)


def job_queue(tool_module_name: str) -> str:
    return f"{JOB_QUEUE_PREFIX}{tool_module_name}"


async def _publish_worker_changes(session: AsyncSession, state: RoundState) -> None:
    """Emit worker.status_changed for workers whose heartbeat went stale.

    A worker coming back online is announced by its own heartbeat request.
    """
    online = {worker.id for worker in await user_service.online_workers(session)}
    for worker_id in state.online_workers - online:
        realtime.queue_worker_event(session, worker_id=worker_id, is_online=False)
    state.online_workers = online


async def dispatch_round(session: AsyncSession, state: RoundState | None = None) -> list[Dispatch]:
    """Pick and mark jobs inside the caller's transaction. Returns the tasks to send.

    Counting running jobs and marking new ones happen in this one transaction,
    and only the lock holder runs it, so a burst of events cannot push a tool
    module past its limit.
    """
    await job_service.cancel_jobs_of_archived_programs(session)
    await job_service.fail_stale_jobs(session)
    if state is not None:
        await _publish_worker_changes(session, state)
    active = await job_service.active_counts(session)
    recent = await job_service.recent_dispatch_counts(session)
    planned: list[Dispatch] = []
    for job, tool_module in await job_service.dispatch_candidates(session, limit=ROUND_SIZE):
        if active.get(tool_module.id, 0) >= tool_module.max_concurrency:
            continue
        limit = tool_module.rate_limit_per_minute
        if limit is not None and recent.get(tool_module.id, 0) >= limit:
            continue
        spec = TOOL_MODULES.get(tool_module.name)
        try:
            await scope_service.require_in_scope(
                session,
                job.program_id,
                job.target,
                accepts_wildcard=spec is not None and spec.accepts_wildcard,
            )
        except TargetOutOfScopeError, ValidationFailedError:
            await job_service.cancel_out_of_scope(session, job.id)
            log.warning("job_cancelled_out_of_scope", job_id=str(job.id))
            continue
        if await job_service.mark_dispatched(session, job.id) is None:
            continue
        active[tool_module.id] = active.get(tool_module.id, 0) + 1
        recent[tool_module.id] = recent.get(tool_module.id, 0) + 1
        planned.append(Dispatch(job_id=job.id, queue=job_queue(tool_module.name)))
    return planned


async def run_round(engine: AsyncEngine, send: SendTask, state: RoundState) -> int:
    """One full round: decide and commit, then send. Returns the tasks sent."""
    async with session_scope(engine) as session:
        planned = await dispatch_round(session, state)
    sent = 0
    for item in planned:
        try:
            await send(item.queue, item.job_id)
        except Exception as error:
            log.exception(
                "job_dispatch_send_failed",
                job_id=str(item.job_id),
                error_type=type(error).__name__,
            )
            async with session_scope(engine) as session:
                await job_service.revert_dispatch(session, item.job_id)
            continue
        sent += 1
        log.info("job_dispatched", job_id=str(item.job_id), queue=item.queue)
    return sent


# ---------------------------------------------------------------- Celery and Redis


def _broker_url(settings: Settings) -> str:
    """REDIS_URL with the password put in. The result is never logged."""
    parts = urlsplit(settings.redis_url)
    password = settings.redis_password.get_secret_value() if settings.redis_password else ""
    if not password:
        return settings.redis_url
    host = parts.netloc.rsplit("@", 1)[-1]
    user = parts.username or ""
    netloc = f"{user}:{password}@{host}"
    return urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment))


def build_celery(settings: Settings | None = None) -> Celery:
    """Producer only: the dispatcher sends tasks and never runs one."""
    settings = settings or get_settings()
    app = Celery("reconos-dispatcher", broker=_broker_url(settings))
    # JSON only, never pickle: docs/integrations/external-services.md.
    app.conf.update(task_serializer="json", accept_content=["json"], broker_connection_timeout=5)
    return app


def celery_sender(app: Celery) -> SendTask:
    async def send(queue: str, job_id: uuid.UUID) -> None:
        payload = RunJobTask(job_id=job_id).model_dump(mode="json")
        # send_task blocks on the broker socket, so it runs off the event loop.
        await asyncio.to_thread(app.send_task, RUN_JOB_TASK, kwargs=payload, queue=queue)

    return send


async def write_heartbeat(settings: Settings, poll_seconds: int) -> None:
    client = realtime.build_client(settings)
    try:
        await client.set(
            HEARTBEAT_KEY,
            datetime.now(UTC).isoformat(),
            ex=poll_seconds * DOWN_AFTER_POLLS * 2,
        )
    except (redis.RedisError, OSError) as error:
        log.warning("dispatcher_heartbeat_failed", error_type=type(error).__name__)
    finally:
        await client.aclose()


# ---------------------------------------------------------------- main loop


def _asyncpg_dsn(settings: Settings) -> str:
    parts = urlsplit(settings.database_url)
    return urlunsplit(("postgresql", parts.netloc, parts.path, parts.query, parts.fragment))


async def _listen(settings: Settings, wake: asyncio.Event) -> asyncpg.Connection:
    connection: asyncpg.Connection = await asyncpg.connect(
        _asyncpg_dsn(settings), password=settings.db_password.get_secret_value(), timeout=10
    )

    def on_notify(*_: object) -> None:
        wake.set()

    await connection.add_listener(DISPATCHER_CHANNEL, on_notify)
    return connection


async def _poll_seconds(engine: AsyncEngine) -> int:
    async with session_scope(engine) as session:
        return await get_int_setting(session, "dispatcher_poll_seconds")


async def run_forever(
    *,
    send: SendTask | None = None,
    settings: Settings | None = None,
    stop: asyncio.Event | None = None,
) -> None:
    """The dispatcher process: `python -m app.dispatcher`."""
    settings = settings or get_settings()
    engine = get_engine()
    send = send or celery_sender(build_celery(settings))
    stop = stop or asyncio.Event()
    state = RoundState()
    while not stop.is_set():
        wake = asyncio.Event()
        try:
            connection = await _listen(settings, wake)
        except (OSError, asyncpg.PostgresError) as error:
            log.exception("dispatcher_connect_failed", error_type=type(error).__name__)
            await _sleep_or_stop(stop, RECONNECT_SECONDS)
            continue
        try:
            await _lead(connection, engine, send, settings, wake, stop, state)
        except (OSError, asyncpg.PostgresError, asyncpg.InterfaceError) as error:
            log.exception("dispatcher_connection_lost", error_type=type(error).__name__)
            await _sleep_or_stop(stop, RECONNECT_SECONDS)
        finally:
            with contextlib.suppress(Exception):
                await connection.close()


async def _lead(
    connection: asyncpg.Connection,
    engine: AsyncEngine,
    send: SendTask,
    settings: Settings,
    wake: asyncio.Event,
    stop: asyncio.Event,
    state: RoundState,
) -> None:
    leader = False
    while not stop.is_set():
        poll = await _poll_seconds(engine)
        if not leader:
            leader = bool(
                await connection.fetchval("SELECT pg_try_advisory_lock($1)", ADVISORY_LOCK_KEY)
            )
            if not leader:
                await _sleep_or_stop(stop, poll)
                continue
            log.info("dispatcher_lock_acquired")
        wake.clear()
        await run_round(engine, send, state)
        await write_heartbeat(settings, poll)
        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(_first(wake, stop), timeout=poll)


async def _first(*events: asyncio.Event) -> None:
    waiters = [asyncio.create_task(event.wait()) for event in events]
    try:
        await asyncio.wait(waiters, return_when=asyncio.FIRST_COMPLETED)
    finally:
        for waiter in waiters:
            waiter.cancel()


async def _sleep_or_stop(stop: asyncio.Event, seconds: float) -> None:
    with contextlib.suppress(TimeoutError):
        await asyncio.wait_for(stop.wait(), timeout=seconds)


# ---------------------------------------------------------------- status for S10, S15


async def read_heartbeat(settings: Settings | None = None) -> tuple[datetime | None, int | None]:
    """Last dispatcher heartbeat and Redis memory use. (None, None) when Redis is unreachable."""
    client = realtime.build_client(settings)
    try:
        raw = await client.get(HEARTBEAT_KEY)
        memory = await client.info("memory")
    except (redis.RedisError, OSError) as error:
        log.warning("dispatcher_status_redis_failed", error_type=type(error).__name__)
        return None, None
    finally:
        await client.aclose()
    beat = datetime.fromisoformat(raw) if isinstance(raw, str) else None
    used = memory.get("used_memory") if isinstance(memory, dict) else None
    return beat, int(used) if isinstance(used, int) else None


def health_of(beat: datetime | None, poll_seconds: int, now: datetime) -> DispatcherHealth:
    if beat is None:
        return "down"
    age = (now - beat).total_seconds()
    if age <= poll_seconds * DEGRADED_AFTER_POLLS:
        return "ok"
    if age <= poll_seconds * DOWN_AFTER_POLLS:
        return "degraded"
    return "down"


async def dispatcher_status(session: AsyncSession, *, viewer: User) -> DispatcherStatusResponse:
    """S10 header and S15: a User sees only the counts of its assigned programs."""
    now = datetime.now(UTC)
    visible = program_visible_to(viewer, Job.program_id)
    queued = (Job.status == S.QUEUED.value, visible)
    by_tool = {
        row[0]: int(row[1])
        for row in await session.execute(
            select(Job.tool_module_id, func.count()).where(*queued).group_by(Job.tool_module_id)
        )
    }
    by_program = {
        row[0]: int(row[1])
        for row in await session.execute(
            select(Job.program_id, func.count()).where(*queued).group_by(Job.program_id)
        )
    }
    running_total = await session.scalar(
        select(func.count()).select_from(Job).where(Job.status == S.RUNNING.value, visible)
    )
    slot_capacity = await session.scalar(
        select(func.coalesce(func.sum(ToolModule.max_concurrency), 0)).where(
            ToolModule.is_enabled.is_(True)
        )
    )
    hour_ago = now - timedelta(hours=1)
    completed = await session.scalar(
        select(func.count())
        .select_from(Job)
        .where(Job.status == S.COMPLETED.value, Job.finished_at >= hour_ago, visible)
    )
    avg_wait = await session.scalar(
        select(
            func.avg(
                func.extract(
                    "epoch", Job.started_at - func.coalesce(Job.approved_at, Job.created_at)
                )
            )
        ).where(Job.started_at >= hour_ago, visible)
    )
    last = (
        await session.execute(
            select(Job.dispatched_at, ToolModule.name)
            .join(ToolModule, ToolModule.id == Job.tool_module_id)
            .where(Job.dispatched_at.is_not(None), visible)
            .order_by(Job.dispatched_at.desc())
            .limit(1)
        )
    ).first()
    poll = await get_int_setting(session, "dispatcher_poll_seconds")
    beat, redis_used = await read_heartbeat()
    return DispatcherStatusResponse(
        status=health_of(beat, poll, now),
        last_heartbeat_at=beat,
        queued_total=sum(by_program.values()),
        queued_by_tool_module=by_tool,
        queued_by_program=by_program,
        queue_capacity=await get_int_setting(session, "queue_capacity"),
        workers_online=len(await user_service.online_workers(session)),
        running_total=running_total or 0,
        slot_capacity=int(slot_capacity or 0),
        jobs_per_minute=(completed or 0) / 60,
        avg_wait_seconds=float(avg_wait) if avg_wait is not None else None,
        redis_used_bytes=redis_used,
        last_dispatched_at=last[0] if last else None,
        last_dispatched_tool_module=last[1] if last else None,
    )
