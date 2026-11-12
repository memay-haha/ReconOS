"""Runner of the `vigolium` tool module: one native scan on the Vigolium engine.

The runner drives the engine over REST only (G1): it starts one scan for every
target of the job, polls it, then copies the findings of that scan into
`vigolium-findings.jsonl`, one finding object per line as the engine returns
it. It never interprets a finding: parsing happens in the backend (G8). Calls:
docs/integrations/external-services.md.
"""

import json
import math
import time
from collections.abc import Callable
from pathlib import Path
from typing import IO, Any, ClassVar, Final

import httpx
import structlog
from pydantic import BaseModel, ConfigDict, JsonValue

from contracts.job_status import FinishStatus, JobHeartbeatAction
from contracts.tasks import EngineSpec, JobSpec
from contracts.tool_modules import ToolParams, VigoliumParams
from contracts.tool_modules.vigolium import ENGINE, RAW_OUTPUT_FILENAME
from worker.runners.base import Runner, RunResult, register
from worker.runners.engine_client import EngineClient, EngineError

# Findings per page: the engine's own maximum.
PAGE_SIZE: Final = 500
# A scan reporting more findings than this is cut: the file stays parseable.
MAX_FINDINGS: Final = 100_000
# Size cap of the raw output file, under the parser's line and archive limits.
MAX_OUTPUT_BYTES: Final = 2 * 1024**3
# Seconds the engine gets to wind down a stopped scan before findings are read.
STOP_GRACE_SECONDS: Final = 30.0
# Scan states that are not an end. Any other state ends the poll; only
# `completed` counts as success, so an unknown state never passes as one.
ACTIVE_STATES: Final = frozenset(
    {"pending", "queued", "starting", "running", "paused", "cancelling"}
)
COMPLETED: Final = "completed"
# Host scope pinned by the runner: the scan never leaves the target host (G5).
SCOPE_ORIGIN: Final = "strict"

log = structlog.get_logger(__name__)


class _Info(BaseModel):
    model_config = ConfigDict(extra="ignore")

    version: str | None = None


class _ScanStarted(BaseModel):
    model_config = ConfigDict(extra="ignore")

    scan_uuid: str


class _ScanState(BaseModel):
    model_config = ConfigDict(extra="ignore")

    status: str | None = None


class _ScanDetail(_ScanState):
    # The docs show no body for GET /api/scans/:uuid: the state is read at the
    # top level, or inside `data` like the list endpoint. Tech debt 12.
    data: _ScanState | None = None

    def state(self) -> str:
        status = self.status or (self.data.status if self.data is not None else None)
        return (status or "").lower()


class _FindingPage(BaseModel):
    model_config = ConfigDict(extra="ignore")

    data: list[dict[str, JsonValue]] | None = None
    has_more: bool = False


class VigoliumClient(EngineClient):
    """REST client of one Vigolium server."""

    engine = ENGINE

    def auth_headers(self, api_key: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {api_key}"}

    def version(self) -> str | None:
        response = self._send(lambda: self._http.get("/api/info"), "info")
        return self._json(response, _Info, "info").version

    def start_scan(self, body: dict[str, Any]) -> str:
        response = self._send(lambda: self._http.post("/api/scans/run", json=body), "start_scan")
        if response.status_code == 409:
            raise EngineError("start_scan", "is busy with another scan")
        return self._json(response, _ScanStarted, "start_scan").scan_uuid

    def scan_state(self, scan_uuid: str) -> str:
        response = self._send(lambda: self._http.get(f"/api/scans/{scan_uuid}"), "get_scan")
        return self._json(response, _ScanDetail, "get_scan").state()

    def stop_scan(self, scan_uuid: str) -> None:
        # 409 means the scan is no longer running: nothing left to stop.
        response = self._send(lambda: self._http.post(f"/api/scans/{scan_uuid}/stop"), "stop_scan")
        if response.status_code >= 400 and response.status_code != 409:
            raise EngineError("stop_scan", f"status {response.status_code}")

    def findings_page(self, scan_uuid: str, offset: int) -> _FindingPage:
        params = {
            "scan_id": scan_uuid,
            "limit": str(PAGE_SIZE),
            "offset": str(offset),
            "sort": "created_at",
            "order": "asc",
        }
        response = self._send(
            lambda: self._http.get("/api/findings", params=params), "list_findings"
        )
        return self._json(response, _FindingPage, "list_findings")


def write_findings(api: VigoliumClient, scan_uuid: str, out: IO[bytes]) -> tuple[int, int]:
    """Copy the findings of one scan as JSONL. Returns (written, foreign).

    A finding of another scan is never written: an engine that ignores the
    `scan_id` filter must not carry another program's findings into this job.
    """
    written = foreign = offset = size = 0
    while written < MAX_FINDINGS:
        page = api.findings_page(scan_uuid, offset)
        items = page.data or []
        for item in items:
            if item.get("scan_uuid") != scan_uuid:
                foreign += 1
                continue
            line = json.dumps(item, ensure_ascii=False, separators=(",", ":")).encode() + b"\n"
            size += len(line)
            if size > MAX_OUTPUT_BYTES or written >= MAX_FINDINGS:
                log.warning("engine_findings_truncated", engine=ENGINE, written=written)
                return written, foreign
            out.write(line)
            written += 1
        if not page.has_more or len(items) < PAGE_SIZE:
            break
        offset += len(items)
    return written, foreign


@register
class VigoliumRunner(Runner):
    tool_module = "vigolium"
    output_files: ClassVar[tuple[str, ...]] = (RAW_OUTPUT_FILENAME,)

    def __init__(
        self,
        *,
        transport: httpx.BaseTransport | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._transport = transport
        self._sleep = sleep

    def version_args(self) -> list[str]:
        # No local binary: the engine reports its version per job.
        return []

    def read_version(self) -> str | None:
        return None

    def build_args(self, job: JobSpec, params: ToolParams, workdir: Path) -> list[str]:
        message = "an engine runner calls REST, it starts no process"
        raise NotImplementedError(message)

    @staticmethod
    def scan_body(job: JobSpec, params: VigoliumParams, remaining_seconds: float) -> dict[str, Any]:
        """Body of `POST /api/scans/run`. Targets come from the job only (G5)."""
        return {
            "targets": list(job.target),
            "strategy": params.strategy,
            "concurrency": params.threads,
            "rate_limit": params.rate,
            "scope_origin": SCOPE_ORIGIN,
            # The engine winds the scan down by itself if the worker goes away.
            "scanning_max_duration": f"{max(1, math.ceil(remaining_seconds / 60))}m",
        }

    def run(
        self,
        job: JobSpec,
        params: ToolParams,
        workdir: Path,
        heartbeat: Callable[[], JobHeartbeatAction],
        clock: Callable[[], float] = time.monotonic,
    ) -> RunResult:
        assert isinstance(params, VigoliumParams)  # noqa: S101  narrowed by check_params
        engine = job.engine
        if engine is None or not engine.base_url:
            return RunResult(FinishStatus.FAILED, "engine is not configured")
        structlog.contextvars.bind_contextvars(engine=ENGINE)
        try:
            return self._run(job, params, engine, workdir, heartbeat, clock)
        finally:
            structlog.contextvars.unbind_contextvars("engine")

    def _wait(
        self,
        api: VigoliumClient,
        scan_uuid: str,
        job: JobSpec,
        deadline: float,
        heartbeat: Callable[[], JobHeartbeatAction],
        clock: Callable[[], float],
    ) -> tuple[str, str | None]:
        """Poll the scan until it ends. The reason is set when the runner stops it."""
        while True:
            remaining = deadline - clock()
            if remaining <= 0:
                return "", "timeout"
            self._sleep(min(job.heartbeat_seconds, remaining))
            if heartbeat() is JobHeartbeatAction.CANCEL:
                return "", "cancel"
            state = api.scan_state(scan_uuid)
            if state not in ACTIVE_STATES:
                return state, None

    def _run(
        self,
        job: JobSpec,
        params: VigoliumParams,
        engine: EngineSpec,
        workdir: Path,
        heartbeat: Callable[[], JobHeartbeatAction],
        clock: Callable[[], float],
    ) -> RunResult:
        deadline = clock() + job.timeout_minutes * 60
        output = workdir / RAW_OUTPUT_FILENAME
        with VigoliumClient(engine, transport=self._transport, sleep=self._sleep) as api:
            try:
                version = api.version()
            except EngineError as exc:
                log.warning("engine_unavailable", error=str(exc))
                return RunResult(FinishStatus.FAILED, "engine is unreachable")
            try:
                scan_uuid = api.start_scan(self.scan_body(job, params, deadline - clock()))
            except EngineError as exc:
                log.warning("engine_scan_not_created", error=str(exc))
                output.touch()
                return RunResult(FinishStatus.FAILED, "engine refused the scan", version)
            log.info("engine_scan_created", scan_uuid=scan_uuid)
            try:
                state, stopped = self._wait(api, scan_uuid, job, deadline, heartbeat, clock)
            except EngineError as exc:
                log.warning("engine_scan_lost", error=str(exc))
                state, stopped = "", "lost"
            if stopped in ("cancel", "timeout"):
                self._stop(api, scan_uuid)
            result = self._outcome(state, stopped, version)
            try:
                with output.open("wb") as out:
                    written, foreign = write_findings(api, scan_uuid, out)
            except EngineError as exc:
                log.warning("engine_findings_unavailable", error=str(exc))
                if result.status is FinishStatus.COMPLETED:
                    return RunResult(
                        FinishStatus.FAILED, "engine findings are unavailable", version
                    )
                return result
            if foreign:
                log.warning("engine_findings_foreign", scan_uuid=scan_uuid, foreign=foreign)
            log.info("engine_scan_finished", scan_uuid=scan_uuid, state=state, findings=written)
        return result

    def _stop(self, api: VigoliumClient, scan_uuid: str) -> None:
        try:
            api.stop_scan(scan_uuid)
        except EngineError as exc:
            # The engine stops the scan by itself at scanning_max_duration.
            log.warning("engine_scan_stop_failed", scan_uuid=scan_uuid, error=str(exc))
            return
        # Workers finish their current item before the scan ends.
        self._sleep(STOP_GRACE_SECONDS)

    @staticmethod
    def _outcome(state: str, stopped: str | None, version: str | None) -> RunResult:
        if stopped == "cancel":
            return RunResult(FinishStatus.CANCELLED, "job cancelled", version)
        if stopped == "timeout":
            return RunResult(
                FinishStatus.FAILED, "engine scan exceeded the job time limit", version
            )
        if stopped == "lost":
            return RunResult(FinishStatus.FAILED, "engine is unreachable", version)
        if state != COMPLETED:
            return RunResult(FinishStatus.FAILED, "engine scan failed", version)
        return RunResult(FinishStatus.COMPLETED, None, version)
