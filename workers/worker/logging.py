"""structlog setup of the worker: JSON to stdout, batches to the Backend API.

Format, levels, masking and the log buffer: .claude/rules/logging.md.
"""

import logging
import sys
import threading
from collections import deque
from collections.abc import Callable, Mapping, MutableMapping
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import structlog

from contracts.worker import LOG_BATCH_MAX_RECORDS, WorkerLogBatch, WorkerLogLevel, WorkerLogRecord

SERVICE = "worker"

# A field whose name contains one of these never reaches an output.
MASKED_SUBSTRINGS = (
    "password",
    "token",
    "secret",
    "api_key",
    "authorization",
    "cookie",
    "session",
    "_encrypted",
    # A proxy URL may carry an account: only its host may be logged.
    "proxy_url",
)
MASK = "***"

LOG_BUFFER_MAX_RECORDS = 10_000
LOG_FLUSH_SECONDS = 5.0
# Fields that become columns of app_log; the rest goes to `context`.
_RECORD_FIELDS = frozenset({"event", "level", "logged_at", "job_id", "service", "worker_id"})


def _should_mask(name: str) -> bool:
    lowered = name.lower()
    return any(part in lowered for part in MASKED_SUBSTRINGS)


def _mask_value(value: object) -> object:
    if isinstance(value, Mapping):
        return {k: (MASK if _should_mask(str(k)) else _mask_value(v)) for k, v in value.items()}
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


def _add_service(
    _logger: Any,  # noqa: ANN401
    _method: str,
    event_dict: MutableMapping[str, Any],
) -> MutableMapping[str, Any]:
    event_dict.setdefault("service", SERVICE)
    return event_dict


def _to_record(event_dict: Mapping[str, Any]) -> WorkerLogRecord | None:
    level = str(event_dict.get("level", "info"))
    if level not in WorkerLogLevel.__members__.values():
        return None  # debug stays on stdout only
    job_id = event_dict.get("job_id")
    context = {
        key: value if isinstance(value, bool | int | float | str | None) else str(value)
        for key, value in event_dict.items()
        if key not in _RECORD_FIELDS
    }
    try:
        return WorkerLogRecord(
            logged_at=event_dict.get("logged_at") or datetime.now(UTC),
            level=WorkerLogLevel(level),
            event=str(event_dict.get("event", "")),
            job_id=UUID(str(job_id)) if job_id else None,
            context=context,
        )
    except ValueError:
        # An event name outside the contract still reached stdout.
        return None


class LogBuffer:
    """Records waiting to be sent. Full: drop the oldest and count the drops."""

    def __init__(self, max_records: int = LOG_BUFFER_MAX_RECORDS) -> None:
        self._records: deque[WorkerLogRecord] = deque()
        self._max_records = max_records
        self._lock = threading.Lock()
        self.dropped = 0

    def __len__(self) -> int:
        return len(self._records)

    def add(self, record: WorkerLogRecord) -> None:
        with self._lock:
            if len(self._records) >= self._max_records:
                self._records.popleft()
                self.dropped += 1
            self._records.append(record)

    def take(self, limit: int = LOG_BATCH_MAX_RECORDS) -> list[WorkerLogRecord]:
        with self._lock:
            count = min(limit, len(self._records))
            return [self._records.popleft() for _ in range(count)]

    def put_back(self, records: list[WorkerLogRecord]) -> None:
        """Return an unsent batch to the front, keeping the newest when full."""
        with self._lock:
            for record in reversed(records):
                if len(self._records) >= self._max_records:
                    self.dropped += 1
                    continue
                self._records.appendleft(record)

    def take_dropped(self) -> int:
        with self._lock:
            dropped, self.dropped = self.dropped, 0
            return dropped


BUFFER = LogBuffer()


def buffer_processor(
    _logger: Any,  # noqa: ANN401
    _method: str,
    event_dict: MutableMapping[str, Any],
) -> MutableMapping[str, Any]:
    """structlog processor: copy the masked record into the send buffer."""
    record = _to_record(event_dict)
    if record is not None:
        BUFFER.add(record)
    return event_dict


def flush_logs(send: Callable[[WorkerLogBatch], None], buffer: LogBuffer = BUFFER) -> bool:
    """Send one batch. On failure the batch goes back for the next round."""
    records = buffer.take()
    if not records:
        return True
    try:
        send(WorkerLogBatch(records=records))
    except Exception as exc:  # noqa: BLE001  any send failure keeps the batch
        buffer.put_back(records)
        # stdout only: logging through structlog here would feed the buffer again.
        _stdout_warning("log_batch_send_failed", error=type(exc).__name__, pending=len(buffer))
        return False
    dropped = buffer.take_dropped()
    if dropped:
        _stdout_warning("log_buffer_overflow", dropped=dropped)
    return True


def _stdout_warning(event: str, **fields: object) -> None:
    structlog.get_logger("worker.logging").warning(event, _stdout_only=True, **fields)


def _skip_buffer_for_internal(
    _logger: Any,  # noqa: ANN401
    _method: str,
    event_dict: MutableMapping[str, Any],
) -> MutableMapping[str, Any]:
    if event_dict.pop("_stdout_only", False):
        return event_dict
    return buffer_processor(_logger, _method, event_dict)


class LogShipper(threading.Thread):
    """Background thread that sends the buffer every few seconds."""

    def __init__(
        self,
        send: Callable[[WorkerLogBatch], None],
        final_send: Callable[[WorkerLogBatch], None] | None = None,
        interval: float = LOG_FLUSH_SECONDS,
    ) -> None:
        super().__init__(name="log-shipper", daemon=True)
        self._send = send
        # The last flush at shutdown tries once: a stop must not wait on retries.
        self._final_send = final_send or send
        self._interval = interval
        self._stop_event = threading.Event()

    def run(self) -> None:
        while not self._stop_event.wait(self._interval):
            while len(BUFFER) and flush_logs(self._send):
                pass

    def stop(self) -> None:
        self._stop_event.set()
        flush_logs(self._final_send)


def configure_logging(level: str = "info") -> None:
    """Install the worker configuration. Call once per process at startup."""
    logging.basicConfig(format="%(message)s", stream=sys.stdout, level=level.upper())
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True, key="logged_at"),
            _add_service,
            mask_credentials,
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            _skip_buffer_for_internal,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.getLevelNamesMapping()[level.upper()]
        ),
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )
