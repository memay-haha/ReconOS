"""structlog setup shared by the API, dispatcher, background worker and Beat.

Format, levels, context fields and masking: .claude/rules/logging.md.
Writing records into the reconos_log database arrives with the log sink in a
later batch; for now every process writes JSON to stdout.
"""

import logging
import sys
from collections.abc import Mapping, MutableMapping
from typing import Any
from urllib.parse import urlsplit

import structlog

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
