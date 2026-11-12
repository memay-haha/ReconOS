"""Celery app of the background process: queues `parse` and `schedule`.

Run: `celery -A app.background.celery_app worker -Q parse,schedule`. Roles and
queues: docs/architecture/system.md. Kept small on purpose: every batch adds
its tasks in a file of its own and lists it in TASK_MODULES, and the Beat
schedule of periodic scans lives with those tasks.
"""

from typing import Final

from celery import Celery
from celery.signals import worker_process_init

from app.background.beat import BEAT_SCHEDULE
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.core.tasks import PARSE_QUEUE, broker_url

TASK_MODULES: Final = (
    "app.background.parse_tasks",
    "app.background.asset_tasks",
    "app.background.program_tasks",
    "app.background.schedule_tasks",
)


def build_app() -> Celery:
    settings = get_settings()
    celery = Celery("reconos-background", broker=broker_url(settings), include=list(TASK_MODULES))
    celery.conf.update(
        # JSON only, never pickle: .claude/rules/security.md.
        task_serializer="json",
        accept_content=["json"],
        broker_connection_timeout=5,
        # No result backend: docs/architecture/tech-stack.md.
        task_ignore_result=True,
        task_default_queue=PARSE_QUEUE,
        # A task is acknowledged after it ran, so a crash mid-parse redelivers it.
        task_acks_late=True,
        worker_prefetch_multiplier=1,
        beat_schedule=BEAT_SCHEDULE,
        # Beat only ticks; the schedule table knows when each scan is due, so
        # two Beat processes cost a skipped duplicate tick, never a second job.
        timezone="UTC",
    )
    return celery


def _init_worker(**_: object) -> None:
    configure_logging(get_settings().log_level)


app = build_app()
worker_process_init.connect(_init_worker, weak=False)
