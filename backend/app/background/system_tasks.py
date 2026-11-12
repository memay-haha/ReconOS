"""Tasks of the dashboard module: Run Diagnostics on S15 and the Celery Beat heartbeat.

`reconos.run_diagnostics` does its work in app/dashboard/service.py, one
transaction. `reconos.beat_heartbeat` is sent by Celery Beat every
BEAT_HEARTBEAT_SECONDS; running it stamps the Redis key `GET /system/health`
reads for the `beat` component: app/dashboard/health.py.
"""

import asyncio
import uuid
from datetime import UTC, datetime

import redis.asyncio as redis
import structlog

from app.background.celery_app import app
from app.background.runtime import run_in_session
from app.core import realtime
from app.core.tasks import BEAT_HEARTBEAT_TASK, PARSE_QUEUE, RUN_DIAGNOSTICS_TASK, SCHEDULE_QUEUE
from app.dashboard import health
from app.dashboard import service as dashboard_service

log = structlog.get_logger()


def _run_diagnostics(diagnostic_run_id: str) -> None:
    target = uuid.UUID(diagnostic_run_id)
    run_in_session(
        lambda session: dashboard_service.run_diagnostic(session, target),
        diagnostic_run_id=diagnostic_run_id,
    )
    log.info("diagnostic_run_finished", diagnostic_run_id=diagnostic_run_id)


async def stamp_beat_heartbeat() -> None:
    client = realtime.build_client()
    try:
        await client.set(
            health.BEAT_HEARTBEAT_KEY,
            datetime.now(UTC).isoformat(),
            ex=health.BEAT_HEARTBEAT_SECONDS * 10,
        )
    except (redis.RedisError, OSError) as error:
        log.warning("beat_heartbeat_failed", error_type=type(error).__name__)
    finally:
        await client.aclose()


def _beat_heartbeat() -> None:
    asyncio.run(stamp_beat_heartbeat())


run_diagnostics = app.task(name=RUN_DIAGNOSTICS_TASK, queue=PARSE_QUEUE)(_run_diagnostics)
beat_heartbeat = app.task(name=BEAT_HEARTBEAT_TASK, queue=SCHEDULE_QUEUE, ignore_result=True)(
    _beat_heartbeat
)
