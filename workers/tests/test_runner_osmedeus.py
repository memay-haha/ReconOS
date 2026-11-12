"""Osmedeus runners: REST calls against a mock engine, package layout.

.claude/rules/testing.md: no real engine, no real target.
"""

import io
import json
import zipfile
from pathlib import Path
from uuid import uuid4

import httpx
import pytest

from contracts.job_status import FinishStatus, JobHeartbeatAction
from contracts.tasks import JobSpec
from contracts.tool_modules import TOOL_MODULES, OsmedeusParams
from contracts.tool_modules.osmedeus import (
    MANIFEST_FILENAME,
    RAW_OUTPUT_FILENAME,
    OsmedeusManifest,
    flow_of,
    workspace_name,
)
from worker.runners import RUNNERS
from worker.runners import osmedeus as osmedeus_module
from worker.runners.osmedeus import OsmedeusRunner, build_package
from worker.runners.osmedeus_domain_lite import OsmedeusDomainLiteRunner

API_KEY = "test-engine-key"
SECRET_VARIABLE = "variable-secret-value"


def _job(**overrides: object) -> JobSpec:
    data: dict[str, object] = {
        "job_id": str(uuid4()),
        "tool_module": "osmedeus-domain-lite",
        "target": ["example.com"],
        "timeout_minutes": 60,
        "heartbeat_seconds": 30,
        "engine": {
            "name": "osmedeus",
            "base_url": "http://engine.test:8002/",
            "api_key": API_KEY,
            "variables": {"slack_token": SECRET_VARIABLE, "space_name": "hijack"},
            "settings": {"scan_preset": "quick"},
        },
    }
    data.update(overrides)
    return JobSpec.model_validate(data)


def _zip(files: dict[str, bytes]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for name, content in files.items():
            archive.writestr(name, content)
    return buffer.getvalue()


class FakeEngine:
    """Answers like Osmedeus v5.1.2 for the calls the runner makes."""

    def __init__(self, statuses: list[str] | None = None) -> None:
        self.statuses = statuses or ["running", "completed"]
        self.requests: list[httpx.Request] = []
        self.created: list[dict[str, object]] = []
        self.cancelled: list[str] = []
        self.workspace_files: dict[str, bytes] = {
            "subdomain/final-WS.txt": b"a.example.com\n",
            "probing/dns-WS.txt": b"a.example.com [A] [192.0.2.1]\n",
        }
        self.missing_workspace = False

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        assert request.headers["x-osm-api-key"] == API_KEY
        path = request.url.path
        if path == "/server-info":
            return httpx.Response(200, json={"version": "v5.1.2"})
        if path == "/osm/api/runs" and request.method == "POST":
            body = json.loads(request.content)
            self.created.append(body)
            return httpx.Response(202, json={"run_uuid": f"run-{len(self.created)}"})
        if path.startswith("/osm/api/runs/") and request.method == "GET":
            status = self.statuses.pop(0) if len(self.statuses) > 1 else self.statuses[0]
            return httpx.Response(200, json={"data": {"status": status}})
        if path.startswith("/osm/api/runs/") and request.method == "DELETE":
            self.cancelled.append(path.rsplit("/", 1)[1])
            return httpx.Response(200, json={"message": "Run cancelled successfully"})
        if path.startswith("/osm/api/snapshot-download/"):
            if self.missing_workspace:
                return httpx.Response(404, json={"error": True})
            workspace = path.rsplit("/", 1)[1]
            files = {
                name.replace("WS", workspace): content
                for name, content in self.workspace_files.items()
            }
            return httpx.Response(200, content=_zip(files))
        return httpx.Response(404)


def _runner(engine: FakeEngine) -> OsmedeusDomainLiteRunner:
    return OsmedeusDomainLiteRunner(
        transport=httpx.MockTransport(engine.handler), sleep=lambda _: None
    )


def _continue() -> JobHeartbeatAction:
    return JobHeartbeatAction.CONTINUE


def _manifest(workdir: Path) -> tuple[OsmedeusManifest, list[str]]:
    with zipfile.ZipFile(workdir / RAW_OUTPUT_FILENAME) as package:
        manifest = OsmedeusManifest.model_validate_json(package.read(MANIFEST_FILENAME))
        return manifest, package.namelist()


@pytest.mark.parametrize(
    "name", ["osmedeus-domain-lite", "osmedeus-general", "osmedeus-domain-extensive"]
)
def test_every_workflow_has_a_registered_runner(name: str) -> None:
    runner = RUNNERS[name]
    assert issubclass(runner, OsmedeusRunner)
    assert TOOL_MODULES[name].runs_on == "osmedeus"
    assert runner().read_version() is None
    assert flow_of(name) == name.removeprefix("osmedeus-")


def test_completed_run_packs_the_workspace(tmp_path: Path) -> None:
    engine = FakeEngine()
    job = _job()

    result = _runner(engine).run(job, OsmedeusParams(threads=20), tmp_path, _continue)

    assert result.status is FinishStatus.COMPLETED
    assert result.tool_version == "v5.1.2"
    body = engine.created[0]
    workspace = workspace_name(job.job_id, 1)
    assert body["flow"] == "domain-lite"
    assert body["target"] == "example.com"
    assert body["timeout"] == 60
    # The runner owns space_name: a variable of the same name cannot move the workspace.
    assert body["params"] == {
        "slack_token": SECRET_VARIABLE,
        "space_name": workspace,
        "tactic": "aggressive",
        "threads_hold": "20",
    }
    manifest, names = _manifest(tmp_path)
    assert manifest.flow == "domain-lite"
    assert manifest.engine_version == "v5.1.2"
    assert [
        (run.index, run.workspace, run.status.value, run.has_output) for run in manifest.runs
    ] == [(1, workspace, "completed", True)]
    assert f"1/subdomain/final-{workspace}.txt" in names
    assert f"1/probing/dns-{workspace}.txt" in names
    # Only the package stays in the job folder.
    assert sorted(path.name for path in tmp_path.iterdir()) == [RAW_OUTPUT_FILENAME]


def test_credentials_never_reach_the_package_or_the_log(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    _runner(FakeEngine()).run(_job(), OsmedeusParams(), tmp_path, _continue)

    content = (tmp_path / RAW_OUTPUT_FILENAME).read_bytes()
    assert API_KEY.encode() not in content
    assert SECRET_VARIABLE.encode() not in content
    out = capsys.readouterr()
    assert API_KEY not in out.out + out.err
    assert SECRET_VARIABLE not in out.out + out.err


def test_each_target_runs_in_its_own_workspace(tmp_path: Path) -> None:
    engine = FakeEngine(statuses=["completed"])
    job = _job(target=["example.com", "example.org"])

    result = _runner(engine).run(job, OsmedeusParams(), tmp_path, _continue)

    assert result.status is FinishStatus.COMPLETED
    spaces = [body["params"]["space_name"] for body in engine.created]  # type: ignore[index]
    assert spaces == [workspace_name(job.job_id, 1), workspace_name(job.job_id, 2)]
    assert "threads_hold" not in engine.created[0]["params"]  # type: ignore[operator]
    manifest, names = _manifest(tmp_path)
    assert [run.target for run in manifest.runs] == ["example.com", "example.org"]
    assert any(name.startswith("2/") for name in names)


def test_failed_run_fails_the_job_but_keeps_the_output(tmp_path: Path) -> None:
    result = _runner(FakeEngine(statuses=["failed"])).run(
        _job(), OsmedeusParams(), tmp_path, _continue
    )

    assert result.status is FinishStatus.FAILED
    assert result.reason == "engine run failed"
    manifest, _ = _manifest(tmp_path)
    assert manifest.runs[0].has_output is True


def test_cancel_stops_the_run_and_uploads_what_exists(tmp_path: Path) -> None:
    engine = FakeEngine(statuses=["running"])
    job = _job(target=["example.com", "example.org"])

    result = _runner(engine).run(job, OsmedeusParams(), tmp_path, lambda: JobHeartbeatAction.CANCEL)

    assert result.status is FinishStatus.CANCELLED
    assert engine.cancelled == ["run-1"]
    # The second target never starts.
    assert len(engine.created) == 1
    manifest, _ = _manifest(tmp_path)
    assert manifest.runs[0].status.value == "cancelled"


def test_deadline_cancels_the_run(tmp_path: Path) -> None:
    engine = FakeEngine(statuses=["running"])
    ticks = iter([0.0, 0.0, 0.0, 10_000.0, 10_000.0])

    def clock() -> float:
        return next(ticks, 10_000.0)

    result = _runner(engine).run(_job(), OsmedeusParams(), tmp_path, _continue, clock)

    assert result.status is FinishStatus.FAILED
    assert result.reason == "engine run exceeded the job time limit"
    assert engine.cancelled == ["run-1"]


def test_missing_workspace_is_recorded(tmp_path: Path) -> None:
    engine = FakeEngine()
    engine.missing_workspace = True

    result = _runner(engine).run(_job(), OsmedeusParams(), tmp_path, _continue)

    assert result.status is FinishStatus.COMPLETED
    manifest, names = _manifest(tmp_path)
    assert manifest.runs[0].has_output is False
    assert names == [MANIFEST_FILENAME]


def test_missing_engine_fails_without_calls(tmp_path: Path) -> None:
    result = OsmedeusDomainLiteRunner().run(
        _job(engine=None), OsmedeusParams(), tmp_path, _continue
    )

    assert result.status is FinishStatus.FAILED
    assert result.reason == "engine is not configured"


def test_unreachable_engine_retries_then_fails(tmp_path: Path) -> None:
    calls: list[httpx.Request] = []
    sleeps: list[float] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        raise httpx.ConnectError("refused", request=request)

    runner = OsmedeusDomainLiteRunner(transport=httpx.MockTransport(handler), sleep=sleeps.append)
    result = runner.run(_job(), OsmedeusParams(), tmp_path, _continue)

    assert result.status is FinishStatus.FAILED
    assert result.reason == "engine is unreachable"
    assert len(calls) == 6
    assert sleeps == [1.0, 2.0, 4.0, 8.0, 16.0]


def test_client_error_is_not_retried(tmp_path: Path) -> None:
    engine = FakeEngine()
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        if request.url.path == "/osm/api/runs":
            return httpx.Response(400, json={"error": True, "message": "Workflow not found"})
        return engine.handler(request)

    runner = OsmedeusDomainLiteRunner(transport=httpx.MockTransport(handler), sleep=lambda _: None)
    result = runner.run(_job(), OsmedeusParams(), tmp_path, _continue)

    assert result.status is FinishStatus.FAILED
    assert result.reason == "engine refused the run"
    assert calls.count("/osm/api/runs") == 1
    manifest, _ = _manifest(tmp_path)
    assert manifest.runs[0].status.value == "missing"


def test_package_skips_entries_that_leave_their_folder(tmp_path: Path) -> None:
    source = tmp_path / "engine-1.zip"
    source.write_bytes(
        _zip({"ok/a.txt": b"a", "../escape.txt": b"x", "/abs.txt": b"x", "a\\b.txt": b"x"})
    )
    manifest = OsmedeusManifest(tool_module="osmedeus-domain-lite", flow="domain-lite", runs=[])

    build_package(tmp_path / "out.zip", manifest, {1: source})

    with zipfile.ZipFile(tmp_path / "out.zip") as package:
        assert package.namelist() == [MANIFEST_FILENAME, "1/ok/a.txt"]


def test_package_stops_past_the_size_limit(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(osmedeus_module, "PACKAGE_MAX_BYTES", 4)
    engine = FakeEngine()

    result = _runner(engine).run(_job(), OsmedeusParams(), tmp_path, _continue)

    assert result.status is FinishStatus.FAILED
    assert result.reason == "engine output exceeds the size limit"
    assert not (tmp_path / RAW_OUTPUT_FILENAME).exists()


def test_scan_preset_maps_to_a_tactic() -> None:
    def params(preset: object) -> dict[str, str]:
        engine = _job().engine
        assert engine is not None
        engine = engine.model_copy(update={"settings": {"scan_preset": preset}})
        return OsmedeusRunner.run_params(engine, OsmedeusParams(), "ws")

    assert params("balanced")["tactic"] == "default"
    assert params("deep")["tactic"] == "gently"
    assert "tactic" not in params("unknown")
