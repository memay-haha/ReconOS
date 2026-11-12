"""Celery Beat schedule: docs/architecture/directory-structure.md.

Each entry only sends a task; the work runs in the background process. Batch 10
adds the Beat heartbeat that `GET /system/health` reads for the `beat` component.
"""

from typing import Any, Final

from app.core.tasks import BEAT_HEARTBEAT_TASK, SCHEDULE_QUEUE

BEAT_HEARTBEAT_SECONDS: Final = 30.0

BEAT_SCHEDULE: Final[dict[str, dict[str, Any]]] = {
    "beat-heartbeat": {
        "task": BEAT_HEARTBEAT_TASK,
        "schedule": BEAT_HEARTBEAT_SECONDS,
        # A heartbeat nobody ran in time is stale: drop it rather than queue it.
        "options": {"queue": SCHEDULE_QUEUE, "expires": BEAT_HEARTBEAT_SECONDS * 2},
    },
}
