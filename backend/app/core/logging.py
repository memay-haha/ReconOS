"""structlog setup shared by the API, dispatcher, background worker and Beat.

Format, levels, context fields and masking: .claude/rules/logging.md.
Every process writes JSON to stdout. Log batches sent by workers are written
to reconos_log through `write_app_log_rows`; the sink for the core processes'
own records arrives in a later batch.
"""

import logging
import sys
from collections.abc import Mapping, MutableMapping
from typing import Any
from urllib.parse import urlsplit

import sqlalchemy as sa
import structlog
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

# A field whose name contains one of these never reaches an output.
MASKED_SUBSTRINGS = [
    "password",
    "token",
    "secret",
    "api_key",
    "authorization",
    "cookie",
    "session",
    "_encrypted",
]

MASK = "***"


def _should_mask(name: str) -> bool:
    lowered = name.lower()
    return any(part in lowered for part in MASKED_SUBSTRINGS)


def _mask_value(value: object) -> object:
    if isinstance(value, dict):
        return {k: (MASK if _should_mask(str(k)) else _mask_value(v)) for k, v in value.items()}
    # Arrays are walked too: .claude/rules/logging.md.
    if isinstance(value, list | tuple):
        return [_mask_value(item) for item in value]
    return value


def mask_credentials(
    _logger: Any,  # noqa: ANN401  structlog types the logger argument as Any
    _method: str,
    event_dict: MutableMapping[str, Any],
) -> Mapping[str, Any]:
    """structlog processor: replace credential-looking fields with `***`."""
    return {
        key: (MASK if _should_mask(str(key)) else _mask_value(value))
        for key, value in event_dict.items()
    }


def mask_proxy_url(url: str) -> str:
    """Keep only the host of a proxy URL: the rest may carry an account."""
    host = urlsplit(url).hostname
    return host if host else MASK


def configure_logging(level: str = "info") -> None:
    """Install the shared configuration. Call once per process at startup."""
    logging.basicConfig(format="%(message)s", stream=sys.stdout, level=level.upper())
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True, key="logged_at"),
            mask_credentials,
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.getLevelNamesMapping()[level.upper()]
        ),
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )


# reconos_log has its own migrations and no ORM model: docs/data/schema.md.
_app_log = sa.table(
    "app_log",
    sa.column("logged_at", sa.DateTime(timezone=True)),
    sa.column("level", sa.Text),
    sa.column("service", sa.Text),
    sa.column("event", sa.Text),
    sa.column("request_id", PG_UUID(as_uuid=True)),
    sa.column("job_id", PG_UUID(as_uuid=True)),
    sa.column("program_id", PG_UUID(as_uuid=True)),
    sa.column("worker_id", PG_UUID(as_uuid=True)),
    sa.column("context", JSONB),
)


async def write_app_log_rows(rows: list[dict[str, Any]]) -> None:
    """Insert already masked rows into reconos_log in one statement.

    Used for the log batches workers send: docs/data/database.md, section CSDL
    log. It commits on its own connection, so the rows stay even when the
    calling request later fails.
    """
    if not rows:
        return
    # Imported here: app.core.db imports modules that log at import time.
    from app.core.db import get_log_engine

    async with get_log_engine().begin() as connection:
        await connection.execute(sa.insert(_app_log), rows)
