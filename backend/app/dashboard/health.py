"""Component checks behind `GET /system/health` and Run Diagnostics on S15.

One check per component of docs/architecture/system.md. Each one calls out
with a timeout (.claude/rules/error-handling.md) and reports `ok`, `degraded`
or `down` with a short English reason. No check returns a PID, a path, an
internal address or a credential: docs/api/architecture.md.

`CHECKS` maps a component name to its check, so a test replaces one entry
instead of standing up the real process.
"""

import asyncio
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from importlib import metadata
from typing import Final, Literal

import redis.asyncio as redis
import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import realtime
from app.core.db import get_log_engine
from app.core.storage import object_storage
from app.core.system_setting import get_int_setting
from app.core.tasks import PARSE_QUEUE, build_producer
from app.dispatcher import service as dispatcher_service
from app.engine import service as engine_service

log = structlog.get_logger()

Status = Literal["ok", "degraded", "down"]

COMPONENTS: Final = (
    "api",
    "dispatcher",
    "background",
    "beat",
    "postgres",
    "reconos_log",
    "redis",
    "minio",
    "osmedeus",
    "vigolium",
)
CHECK_TIMEOUT_SECONDS: Final = 3.0
# A store that answers slower than this still works but is reported degraded.
SLOW_MS: Final = 1000
# Celery Beat sends `reconos.beat_heartbeat` every BEAT_HEARTBEAT_SECONDS; the
# background process runs it and stamps this key: app/background/system_tasks.py.
BEAT_HEARTBEAT_KEY: Final = "reconos:beat:heartbeat"
BEAT_HEARTBEAT_SECONDS: Final = 30


@dataclass(frozen=True)
class ComponentHealth:
    name: str
    status: Status
    latency_ms: int | None
    checked_at: datetime
    version: str | None = None
    # postgres: connections used/max. redis: used_memory/maxmemory. Others None.
    detail: str | None = None
    message: str | None = None


Check = Callable[[AsyncSession, str], Awaitable[ComponentHealth]]


def _now() -> datetime:
    return datetime.now(UTC)


def _by_latency(started: float) -> tuple[Status, int]:
    latency = int((time.monotonic() - started) * 1000)
    return ("degraded" if latency > SLOW_MS else "ok"), latency


def _down(name: str, message: str) -> ComponentHealth:
    return ComponentHealth(name, "down", None, _now(), message=message)


def _mebibytes(value: int) -> str:
    return f"{value / 1024**2:.1f} MiB"


def backend_version() -> str | None:
    try:
        return metadata.version("reconos-backend")
    except metadata.PackageNotFoundError:
        return None


async def _api(_: AsyncSession, name: str) -> ComponentHealth:
    # The request is being answered, so the API process is up.
    return ComponentHealth(name, "ok", 0, _now(), version=backend_version())


async def _postgres(session: AsyncSession, name: str) -> ComponentHealth:
    started = time.monotonic()
    try:
        version = await session.scalar(text("SHOW server_version"))
        used = await session.scalar(text("SELECT count(*) FROM pg_stat_activity"))
        most = await session.scalar(text("SHOW max_connections"))
    except Exception as error:  # noqa: BLE001  any driver failure means the store is down
        log.warning("health_check_failed", component=name, error_type=type(error).__name__)
        return _down(name, "PostgreSQL did not answer.")
    status, latency = _by_latency(started)
    return ComponentHealth(
        name,
        status,
        latency,
        _now(),
        version=str(version).split(" ")[0] if version else None,
        detail=f"{used}/{most} connections",
    )


async def _reconos_log(_: AsyncSession, name: str) -> ComponentHealth:
    started = time.monotonic()
    try:
        async with asyncio.timeout(CHECK_TIMEOUT_SECONDS):
            async with get_log_engine().connect() as connection:
                version = await connection.scalar(text("SHOW server_version"))
    except Exception as error:  # noqa: BLE001  any driver failure means the store is down
        log.warning("health_check_failed", component=name, error_type=type(error).__name__)
        return _down(name, "Log database did not answer.")
    status, latency = _by_latency(started)
    return ComponentHealth(
        name, status, latency, _now(), version=str(version).split(" ")[0] if version else None
    )


async def _redis(_: AsyncSession, name: str) -> ComponentHealth:
    started = time.monotonic()
    client = realtime.build_client()
    try:
        await client.ping()
        server = await client.info("server")
        memory = await client.info("memory")
    except (redis.RedisError, OSError) as error:
        log.warning("health_check_failed", component=name, error_type=type(error).__name__)
        return _down(name, "Redis did not answer.")
    finally:
        await client.aclose()
    status, latency = _by_latency(started)
    used = memory.get("used_memory")
    most = memory.get("maxmemory")
    detail = None
    if isinstance(used, int):
        limit = _mebibytes(most) if isinstance(most, int) and most > 0 else "no limit"
        detail = f"{_mebibytes(used)} / {limit}"
    version = server.get("redis_version")
    return ComponentHealth(
        name, status, latency, _now(), version=str(version) if version else None, detail=detail
    )


async def _minio(_: AsyncSession, name: str) -> ComponentHealth:
    started = time.monotonic()
    try:
        async with asyncio.timeout(CHECK_TIMEOUT_SECONDS):
            async with object_storage() as (client, bucket):
                await client.head_bucket(Bucket=bucket)
    except Exception as error:  # noqa: BLE001  botocore raises many types for one outage
        log.warning("health_check_failed", component=name, error_type=type(error).__name__)
        return _down(name, "Object storage did not answer or the bucket is missing.")
    status, latency = _by_latency(started)
    return ComponentHealth(name, status, latency, _now())


async def _dispatcher(session: AsyncSession, name: str) -> ComponentHealth:
    poll = await get_int_setting(session, "dispatcher_poll_seconds")
    beat, _ = await dispatcher_service.read_heartbeat()
    status = dispatcher_service.health_of(beat, poll, _now())
    message = None if status == "ok" else "Dispatcher heartbeat is late or missing."
    return ComponentHealth(name, status, None, _now(), version=backend_version(), message=message)


def _parse_consumers() -> int:
    """Background processes consuming `parse`, asked over the broker. Blocking."""
    inspector = build_producer().control.inspect(timeout=1.0)
    replies = inspector.active_queues() or {}
    return sum(
        1
        for queues in replies.values()
        if any(queue.get("name") == PARSE_QUEUE for queue in queues or [])
    )


async def _background(_: AsyncSession, name: str) -> ComponentHealth:
    started = time.monotonic()
    try:
        async with asyncio.timeout(CHECK_TIMEOUT_SECONDS):
            consumers = await asyncio.to_thread(_parse_consumers)
    except Exception as error:  # noqa: BLE001  kombu raises many types for one outage
        log.warning("health_check_failed", component=name, error_type=type(error).__name__)
        return _down(name, "Could not ask the broker for background processes.")
    if consumers == 0:
        return _down(name, "No background process consumes the parse queue.")
    status, latency = _by_latency(started)
    return ComponentHealth(name, status, latency, _now(), detail=f"{consumers} process(es)")


async def _beat(_: AsyncSession, name: str) -> ComponentHealth:
    client = realtime.build_client()
    try:
        raw = await client.get(BEAT_HEARTBEAT_KEY)
    except (redis.RedisError, OSError) as error:
        log.warning("health_check_failed", component=name, error_type=type(error).__name__)
        return _down(name, "Redis did not answer.")
    finally:
        await client.aclose()
    if not isinstance(raw, str):
        return _down(name, "No heartbeat from Celery Beat.")
    try:
        beat = datetime.fromisoformat(raw)
    except ValueError:
        return _down(name, "No heartbeat from Celery Beat.")
    age = (_now() - beat).total_seconds()
    if age <= BEAT_HEARTBEAT_SECONDS * 2:
        return ComponentHealth(name, "ok", None, _now())
    status: Status = "degraded" if age <= BEAT_HEARTBEAT_SECONDS * 5 else "down"
    return ComponentHealth(name, status, None, _now(), message="Celery Beat heartbeat is late.")


async def _engine(session: AsyncSession, name: str) -> ComponentHealth:
    result = await engine_service.health_check(session, name)
    return ComponentHealth(
        name,
        result.status,
        result.latency_ms,
        _now(),
        version=result.version,
        message=result.message,
    )


CHECKS: dict[str, Check] = {
    "api": _api,
    "dispatcher": _dispatcher,
    "background": _background,
    "beat": _beat,
    "postgres": _postgres,
    "reconos_log": _reconos_log,
    "redis": _redis,
    "minio": _minio,
    "osmedeus": _engine,
    "vigolium": _engine,
}


async def check(session: AsyncSession, name: str) -> ComponentHealth:
    """Run one check. A check that overruns its budget reports `down`, never raises."""
    try:
        async with asyncio.timeout(CHECK_TIMEOUT_SECONDS * 2):
            return await CHECKS[name](session, name)
    except TimeoutError:
        log.warning("health_check_timed_out", component=name)
        return _down(name, "Check timed out.")


async def check_all(
    session: AsyncSession, names: tuple[str, ...] = COMPONENTS
) -> list[ComponentHealth]:
    """Checks on the request session run one after the other: a session is not shared
    across tasks. The rest are independent calls out, so they run together."""
    on_session = {"api", "dispatcher", "postgres", "osmedeus", "vigolium"}
    results: dict[str, ComponentHealth] = {}
    for name in names:
        if name in on_session:
            results[name] = await check(session, name)
    detached = [name for name in names if name not in on_session]
    for name, result in zip(
        detached, await asyncio.gather(*(check(session, n) for n in detached)), strict=True
    ):
        results[name] = result
    return [results[name] for name in names]


__all__ = [
    "BEAT_HEARTBEAT_KEY",
    "BEAT_HEARTBEAT_SECONDS",
    "CHECKS",
    "COMPONENTS",
    "ComponentHealth",
    "check",
    "check_all",
]
