"""Task `parse` on queue `parse`: docs/architecture/system.md.

Retries up to 3 times with exponential backoff. Out of retries, the raw output
is marked `failed` with `parse_error`. A file that cannot be parsed at all
(ParseDataError) is marked `failed` at once: a retry would read the same bytes.
The work itself is in app/parser/service.py.
"""

import uuid
from typing import Final

import structlog
from celery import Task

from app.background.celery_app import app
from app.background.runtime import run_in_session
from app.core.tasks import PARSE_QUEUE, PARSE_RAW_OUTPUT_TASK
from app.parser import service as parser_service
from app.parser.base import ParseDataError

log = structlog.get_logger()

MAX_RETRIES: Final = 3
BACKOFF_BASE_SECONDS: Final = 10
FAILED_AFTER_RETRIES: Final = "parse failed after retries"


def backoff_seconds(retries: int) -> int:
    """10, 20, 40 seconds before the first, second and third retry."""
    return int(BACKOFF_BASE_SECONDS * 2**retries)


def _mark_failed(raw_output_id: uuid.UUID, reason: str) -> None:
    run_in_session(
        lambda session: parser_service.mark_failed(session, raw_output_id, reason),
        raw_output_id=str(raw_output_id),
    )


def _parse_raw_output(self: Task, raw_output_id: str) -> None:
    target = uuid.UUID(raw_output_id)
    try:
        run_in_session(
            lambda session: parser_service.parse_raw_output(session, target),
            raw_output_id=raw_output_id,
        )
    except ParseDataError as err:
        log.exception("parse_failed", raw_output_id=raw_output_id, reason=str(err), retryable=False)
        _mark_failed(target, str(err))
    except Exception as err:
        if self.request.retries >= MAX_RETRIES:
            log.exception(
                "parse_failed",
                raw_output_id=raw_output_id,
                error_type=type(err).__name__,
                retryable=True,
            )
            _mark_failed(target, FAILED_AFTER_RETRIES)
            return
        log.warning(
            "parse_retry",
            raw_output_id=raw_output_id,
            error_type=type(err).__name__,
            retry=self.request.retries + 1,
        )
        raise self.retry(exc=err, countdown=backoff_seconds(self.request.retries)) from err


parse_raw_output = app.task(
    name=PARSE_RAW_OUTPUT_TASK, bind=True, queue=PARSE_QUEUE, max_retries=MAX_RETRIES
)(_parse_raw_output)
