"""Celery Beat schedule: docs/architecture/system.md.

Beat only sends the task to queue `schedule`, it creates no job: the task
asks the schedule module which schedules are due. Run:
`celery -A app.background.celery_app beat`.
"""

from typing import Any, Final

from app.core.tasks import RUN_DUE_SCHEDULES_TASK, SCHEDULE_QUEUE

# Seconds between two looks at the due schedules. A schedule runs at most this
# late; its interval is at least 15 minutes (docs/data/schema.md).
DUE_SCHEDULES_EVERY_SECONDS: Final = 60

BEAT_SCHEDULE: Final[dict[str, dict[str, Any]]] = {
    "run-due-schedules": {
        "task": RUN_DUE_SCHEDULES_TASK,
        "schedule": float(DUE_SCHEDULES_EVERY_SECONDS),
        # A tick older than the next one is dropped: the next tick does its work.
        "options": {"queue": SCHEDULE_QUEUE, "expires": DUE_SCHEDULES_EVERY_SECONDS},
    },
}
