"""Task `run_due_schedules` on queue `schedule`: docs/architecture/system.md.

Celery Beat sends it every minute (app/background/beat.py). The work is in
app/schedule/service.py: every job goes through the job module (G5). No retry:
a failed tick leaves `next_run_at` untouched, so the next tick runs the same
schedules again.
"""

import structlog

from app.background.celery_app import app
from app.background.runtime import run_in_session
from app.core.tasks import RUN_DUE_SCHEDULES_TASK, SCHEDULE_QUEUE
from app.schedule import service as schedule_service

log = structlog.get_logger()


def _run_due_schedules() -> int:
    created = run_in_session(schedule_service.run_due_schedules)
    if created:
        log.info("due_schedules_run", jobs_created=created)
    return created


run_due_schedules = app.task(name=RUN_DUE_SCHEDULES_TASK, queue=SCHEDULE_QUEUE)(_run_due_schedules)
