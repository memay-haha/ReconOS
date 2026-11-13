"""Vigolium runner: REST calls against a mock engine, findings file.

.claude/rules/testing.md: no real engine, no real target.
"""

import json
from pathlib import Path
from uuid import uuid4

import httpx
import pytest

from contracts.job_status import FinishStatus, JobHeartbeatAction
from contracts.tasks import JobSpec
from contracts.tool_modules import VigoliumParams
from contracts.tool_modules.vigolium import RAW_OUTPUT_FILENAME
from worker.runners import RUNNERS, RunResult
from worker.runners import vigolium as vigolium_module
from worker.runners.vigolium import VigoliumRunner

API_KEY = "test-vigolium-key"
SCAN = "scan-0001"


def _job(**overrides: object) -> JobSpec:
    data: dict[str, object] = {
        "job_id": str(uuid4()),
        "tool_module": "vigolium",
        "target": ["https://app.example.com", "api.example.com"],
        "timeout_minutes": 60,
        "heartbeat_seconds": 30,
        "engine": {
            "name": "vigolium",
            "base_url": "http://engine.test:9002/",
            "api_key": API_KEY,
            "variables": {"ignored": "variable-secret-value"},
            "settings": {"llm_provider": "openai-compatible"},
        },
    }
    data.update(overrides)
    return JobSpec.model_validate(data)


def _finding(index: int, scan: str = SCAN) -> dict[str, object]:
    return {
        "id": index,
        "scan_uuid": scan,
        "module_id": "xss-light",
        "severity": "high",
        "matched_at": [f"https://app.example.com/search?q={index}"],
        "finding_hash": f"hash{index:012d}",
    }


class FakeEngine:
    """Answers like the Vigolium REST docs for the calls the runner makes."""

    def __init__(self, states: list[str] | None = None) -> None:
        self.states = states or ["running", "completed"]
        self.requests: list[httpx.Request] = []
        self.scan_bodies: list[dict[str, object]] = []
        self.stopped: list[str] = []
        self.findings: list[dict[str, object]] = [_finding(1), _finding(2)]
        self.start_status = 202
        # 409 answers before the engine accepts a scan: another scan holds it.
        self.busy_starts = 0
        self.page_status = 200
        self.wrap_state = False

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        assert request.headers["authorization"] == f"Bearer {API_KEY}"
        path = request.url.path
        if path == "/api/info":
            return httpx.Response(200, json={"name": "vigolium", "version": "v0.5.3"})
        if path == "/api/scans/run":
            self.scan_bodies.append(json.loads(request.content))
            if self.busy_starts:
                self.busy_starts -= 1
                return httpx.Response(409, json={"error": "scan already running"})
            if self.start_status != 202:
                return httpx.Response(self.start_status, json={"error": "scan already running"})
            return httpx.Response(202, json={"scan_uuid": SCAN, "status": "running"})
        if path == f"/api/scans/{SCAN}/stop":
            self.stopped.append(SCAN)
            return httpx.Response(200, json={"status": "cancelling"})
        if path == f"/api/scans/{SCAN}":
            state = self.states.pop(0) if len(self.states) > 1 else self.states[0]
            body = {"data": {"status": state}} if self.wrap_state else {"status": state}
            return httpx.Response(200, json=body)
        if path == "/api/findings":
            if self.page_status != 200:
                return httpx.Response(self.page_status, json={"error": "db"})
            offset = int(request.url.params["offset"])
            limit = int(request.url.params["limit"])
            page = self.findings[offset : offset + limit]
            return httpx.Response(
                200,
                json={
                    "data": page,
                    "total": len(self.findings),
                    "has_more": offset + limit < len(self.findings),
                },
            )
        return httpx.Response(404, json={"error": "not found"})


def _runner(engine: FakeEngine) -> VigoliumRunner:
    return VigoliumRunner(transport=httpx.MockTransport(engine.handler), sleep=lambda _: None)


def _run(
    engine: FakeEngine,
    tmp_path: Path,
    job: JobSpec | None = None,
    heartbeat: JobHeartbeatAction = JobHeartbeatAction.CONTINUE,
    clock: list[float] | None = None,
) -> RunResult:
    job = job or _job()
    ticks = iter(clock) if clock is not None else None
    return _runner(engine).run(
        job,
        VigoliumRunner.check_params(job.params),
        tmp_path,
        lambda: heartbeat,
        clock=(lambda: next(ticks)) if ticks is not None else (lambda: 0.0),
    )


def _lines(tmp_path: Path) -> list[dict[str, object]]:
    text = (tmp_path / RAW_OUTPUT_FILENAME).read_text(encoding="utf-8")
    return [json.loads(line) for line in text.splitlines()]


def test_registered_under_its_tool_module() -> None:
    assert RUNNERS["vigolium"] is VigoliumRunner
    assert VigoliumRunner().read_version() is None
    assert VigoliumRunner().version_args() == []
    with pytest.raises(NotImplementedError):
        VigoliumRunner().build_args(_job(), VigoliumParams(), Path())


def test_scan_body_comes_from_the_job_and_pins_strict_scope() -> None:
    job = _job()
    body = VigoliumRunner.scan_body(job, VigoliumParams(strategy="deep", threads=5, rate=20), 3601)
    assert body == {
        "targets": ["https://app.example.com", "api.example.com"],
        "strategy": "deep",
        "concurrency": 5,
        "rate_limit": 20,
        "scope_origin": "strict",
        "scanning_max_duration": "61m",
    }


def test_completed_scan_writes_its_findings(tmp_path: Path) -> None:
    engine = FakeEngine()
    result = _run(engine, tmp_path)
    assert result.status is FinishStatus.COMPLETED
    assert result.tool_version == "v0.5.3"
    assert [line["id"] for line in _lines(tmp_path)] == [1, 2]
    finding_calls = [r for r in engine.requests if r.url.path == "/api/findings"]
    assert finding_calls[0].url.params["scan_id"] == SCAN
    assert engine.stopped == []
    # Engine variables are an Osmedeus run concept: nothing of them reaches Vigolium.
    assert all(b"variable-secret-value" not in r.content for r in engine.requests)


def test_state_inside_data_is_read_too(tmp_path: Path) -> None:
    engine = FakeEngine(["completed"])
    engine.wrap_state = True
    assert _run(engine, tmp_path).status is FinishStatus.COMPLETED


def test_findings_are_paged(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(vigolium_module, "PAGE_SIZE", 2)
    engine = FakeEngine()
    engine.findings = [_finding(index) for index in range(1, 6)]
    _run(engine, tmp_path)
    assert [line["id"] for line in _lines(tmp_path)] == [1, 2, 3, 4, 5]


def test_findings_of_another_scan_are_never_written(tmp_path: Path) -> None:
    engine = FakeEngine()
    engine.findings = [_finding(1), _finding(2, scan="scan-of-another-program")]
    assert _run(engine, tmp_path).status is FinishStatus.COMPLETED
    assert [line["id"] for line in _lines(tmp_path)] == [1]


def test_findings_stop_at_the_cap(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(vigolium_module, "MAX_FINDINGS", 2)
    engine = FakeEngine()
    engine.findings = [_finding(index) for index in range(1, 5)]
    _run(engine, tmp_path)
    assert len(_lines(tmp_path)) == 2


def test_failed_scan_fails_the_job_and_keeps_findings(tmp_path: Path) -> None:
    result = _run(FakeEngine(["running", "failed"]), tmp_path)
    assert result.status is FinishStatus.FAILED
    assert result.reason == "engine scan failed"
    assert len(_lines(tmp_path)) == 2


def test_cancel_stops_the_scan_and_keeps_findings(tmp_path: Path) -> None:
    engine = FakeEngine(["running"])
    result = _run(engine, tmp_path, heartbeat=JobHeartbeatAction.CANCEL)
    assert result.status is FinishStatus.CANCELLED
    assert engine.stopped == [SCAN]
    assert len(_lines(tmp_path)) == 2


def test_time_limit_stops_the_scan(tmp_path: Path) -> None:
    engine = FakeEngine(["running"])
    result = _run(engine, tmp_path, clock=[0.0, 0.0, 3600.0])
    assert result.status is FinishStatus.FAILED
    assert result.reason == "engine scan exceeded the job time limit"
    assert engine.stopped == [SCAN]


def test_busy_engine_is_waited_for(tmp_path: Path) -> None:
    engine = FakeEngine()
    engine.busy_starts = 2
    result = _run(engine, tmp_path)
    assert result.status is FinishStatus.COMPLETED
    assert len(engine.scan_bodies) == 3
    assert len(_lines(tmp_path)) == 2


def test_cancel_while_the_engine_is_busy(tmp_path: Path) -> None:
    engine = FakeEngine()
    engine.busy_starts = 5
    result = _run(engine, tmp_path, heartbeat=JobHeartbeatAction.CANCEL)
    assert result.status is FinishStatus.CANCELLED
    assert len(engine.scan_bodies) == 1
    assert (tmp_path / RAW_OUTPUT_FILENAME).read_bytes() == b""


def test_engine_busy_past_the_deadline_fails(tmp_path: Path) -> None:
    engine = FakeEngine()
    engine.busy_starts = 5
    result = _run(engine, tmp_path, clock=[0.0, 0.0, 0.0, 3600.0])
    assert result.status is FinishStatus.FAILED
    assert result.reason == "engine stayed busy with another scan"
    assert result.tool_version is not None
    assert engine.scan_bodies


def test_refused_scan_fails_without_retry(tmp_path: Path) -> None:
    engine = FakeEngine()
    engine.start_status = 400
    result = _run(engine, tmp_path)
    assert result.status is FinishStatus.FAILED
    assert result.reason == "engine refused the scan"
    assert len(engine.scan_bodies) == 1
    assert (tmp_path / RAW_OUTPUT_FILENAME).read_bytes() == b""


def test_unreachable_engine_fails_the_job(tmp_path: Path) -> None:
    def down(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=request)

    runner = VigoliumRunner(transport=httpx.MockTransport(down), sleep=lambda _: None)
    job = _job()
    result = runner.run(job, VigoliumParams(), tmp_path, lambda: JobHeartbeatAction.CONTINUE)
    assert result.status is FinishStatus.FAILED
    assert result.reason == "engine is unreachable"


def test_lost_scan_fails_the_job(tmp_path: Path) -> None:
    engine = FakeEngine()
    original = engine.handler

    def lose_scan(request: httpx.Request) -> httpx.Response:
        if request.url.path == f"/api/scans/{SCAN}":
            return httpx.Response(404, json={"error": "scan not found"})
        return original(request)

    runner = VigoliumRunner(transport=httpx.MockTransport(lose_scan), sleep=lambda _: None)
    job = _job()
    result = runner.run(job, VigoliumParams(), tmp_path, lambda: JobHeartbeatAction.CONTINUE)
    assert result.status is FinishStatus.FAILED
    assert result.reason == "engine is unreachable"


def test_findings_failure_fails_a_completed_scan(tmp_path: Path) -> None:
    engine = FakeEngine()
    engine.page_status = 400
    result = _run(engine, tmp_path)
    assert result.status is FinishStatus.FAILED
    assert result.reason == "engine findings are unavailable"


def test_findings_failure_keeps_the_cancel_reason(tmp_path: Path) -> None:
    engine = FakeEngine(["running"])
    engine.page_status = 400
    result = _run(engine, tmp_path, heartbeat=JobHeartbeatAction.CANCEL)
    assert result.status is FinishStatus.CANCELLED


def test_unconfigured_engine_fails(tmp_path: Path) -> None:
    job = _job(engine=None)
    result = VigoliumRunner().run(
        job, VigoliumParams(), tmp_path, lambda: JobHeartbeatAction.CONTINUE
    )
    assert result.status is FinishStatus.FAILED
    assert result.reason == "engine is not configured"
