"""Task of the program module: remove the MinIO objects of a hard-deleted program.

The rows are already gone when this runs: docs/data/database.md, section Lưu
trữ và xóa. A failure retries with exponential backoff and never brings the rows
back. Deleting by prefix is idempotent, so a retry or a duplicate is harmless.
"""

import asyncio
import uuid
from typing import Final

import structlog
from celery import Task

from app.background.celery_app import app
from app.core.storage import delete_prefix
from app.core.tasks import PARSE_QUEUE, PURGE_PROGRAM_OBJECTS_TASK

log = structlog.get_logger()

MAX_RETRIES: Final = 5
BACKOFF_BASE_SECONDS: Final = 30


def _purge_program_objects(self: Task, program_id: str) -> None:
    prefix = f"{uuid.UUID(program_id)}/"
    try:
        removed = asyncio.run(delete_prefix(prefix))
    except Exception as err:
        if self.request.retries >= MAX_RETRIES:
            log.exception("program_objects_purge_failed", program_id=program_id)
            return
        raise self.retry(exc=err, countdown=BACKOFF_BASE_SECONDS * 2**self.request.retries) from err
    log.info("program_objects_purged", program_id=program_id, objects=removed)


purge_program_objects = app.task(
    name=PURGE_PROGRAM_OBJECTS_TASK, bind=True, queue=PARSE_QUEUE, max_retries=MAX_RETRIES
)(_purge_program_objects)
