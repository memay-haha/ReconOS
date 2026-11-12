"""HTTP client of the worker contract: docs/integrations/external-services.md.

Every call carries the worker token as a Bearer header. Network errors and 5xx
are retried with exponential backoff; 429 waits for Retry-After; any other 4xx
is final. Retry counts: the Retry table of external-services.md.
"""

import time
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Final
from uuid import UUID

import httpx
import structlog
from pydantic import SecretStr

from contracts.job_status import JobFinish, JobHeartbeatResponse
from contracts.raw_output import CONTENT_TYPES, DEFAULT_CONTENT_TYPE, RawOutputFile
from contracts.tasks import JobSpec
from contracts.worker import WorkerHeartbeat, WorkerLogBatch

API_PREFIX: Final = "/api/v1/worker"
MAX_RETRIES: Final = 5
BACKOFF_BASE_SECONDS: Final = 1.0
BACKOFF_MAX_SECONDS: Final = 30.0
RETRY_AFTER_MAX_SECONDS: Final = 300.0
# Read and write apply per chunk, so a large upload is not cut short.
TIMEOUT: Final = httpx.Timeout(connect=10.0, read=60.0, write=60.0, pool=10.0)
UPLOAD_CHUNK_BYTES: Final = 1024 * 1024
CONFLICT_MESSAGE: Final = "job state conflict"

log = structlog.get_logger(__name__)


class BackendError(Exception):
    """The Backend API refused the call or stayed unreachable after retries."""

    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class JobConflictError(BackendError):
    """409: the job is not in a state this worker may act on."""


def _retry_after_seconds(response: httpx.Response) -> float | None:
    value = response.headers.get("Retry-After")
    if value is None or not value.strip().isdigit():
        return None
    return min(float(value), RETRY_AFTER_MAX_SECONDS)


def _backoff(attempt: int) -> float:
    return float(min(BACKOFF_BASE_SECONDS * 2**attempt, BACKOFF_MAX_SECONDS))


def _read_chunks(path: Path) -> Iterator[bytes]:
    with path.open("rb") as handle:
        while chunk := handle.read(UPLOAD_CHUNK_BYTES):
            yield chunk


class BackendClient:
    def __init__(
        self,
        api_url: str,
        token: SecretStr,
        *,
        transport: httpx.BaseTransport | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._http = httpx.Client(
            base_url=api_url.rstrip("/") + API_PREFIX,
            headers={"Authorization": f"Bearer {token.get_secret_value()}"},
            timeout=TIMEOUT,
            transport=transport,
            # TLS verification stays on: .claude/rules/security.md
            verify=True,
        )
        self._sleep = sleep

    def close(self) -> None:
        self._http.close()

    def _request(
        self,
        method: str,
        path: str,
        *,
        json: object | None = None,
        content_factory: Callable[[], Iterator[bytes]] | None = None,
        headers: dict[str, str] | None = None,
        retries: int = MAX_RETRIES,
        stdout_only: bool = False,
    ) -> httpx.Response:
        # Log shipping must not feed its own retries back into the log buffer.
        extra = {"_stdout_only": True} if stdout_only else {}
        for attempt in range(retries + 1):
            last_try = attempt == retries
            try:
                response = self._http.request(
                    method,
                    path,
                    json=json,
                    content=content_factory() if content_factory else None,
                    headers=headers,
                )
            except httpx.TransportError as exc:
                if last_try:
                    message = f"backend unreachable: {type(exc).__name__}"
                    raise BackendError(message) from exc
                delay = _backoff(attempt)
                log.warning("backend_call_retry", path=path, error=type(exc).__name__, **extra)
                self._sleep(delay)
                continue
            if response.status_code < 400:
                return response
            if response.status_code == 409:
                raise JobConflictError(CONFLICT_MESSAGE, 409)
            retry_after = _retry_after_seconds(response) if response.status_code == 429 else None
            retryable = response.status_code >= 500 or response.status_code == 429
            if not retryable or last_try:
                message = f"backend returned {response.status_code}"
                raise BackendError(message, response.status_code)
            log.warning("backend_call_retry", path=path, status=response.status_code, **extra)
            self._sleep(retry_after if retry_after is not None else _backoff(attempt))
        raise AssertionError("unreachable")  # pragma: no cover

    def worker_heartbeat(self, beat: WorkerHeartbeat) -> None:
        self._request("POST", "/heartbeat", json=beat.model_dump(mode="json"))

    def claim(self, job_id: UUID) -> JobSpec:
        response = self._request("POST", f"/jobs/{job_id}/claim")
        return JobSpec.model_validate(response.json())

    def job_heartbeat(self, job_id: UUID) -> JobHeartbeatResponse:
        response = self._request("POST", f"/jobs/{job_id}/heartbeat")
        return JobHeartbeatResponse.model_validate(response.json())

    def upload_raw_output(self, job_id: UUID, path: Path) -> None:
        """Stream one file. Re-sending the same name after a network error is safe."""
        filename = RawOutputFile(filename=path.name).filename
        content_type = CONTENT_TYPES.get(path.suffix.lower(), DEFAULT_CONTENT_TYPE)
        self._request(
            "PUT",
            f"/jobs/{job_id}/raw-outputs/{filename}",
            content_factory=lambda: _read_chunks(path),
            headers={"Content-Type": content_type},
        )

    def finish(self, job_id: UUID, body: JobFinish) -> None:
        self._request("POST", f"/jobs/{job_id}/finish", json=body.model_dump(mode="json"))

    def send_logs(self, batch: WorkerLogBatch, *, retry: bool = True) -> None:
        """Send one log batch. `retry=False` for the last flush at shutdown."""
        self._request(
            "POST",
            "/logs",
            json=batch.model_dump(mode="json"),
            retries=MAX_RETRIES if retry else 0,
            stdout_only=True,
        )
