"""Job flow on the worker: claim, run, upload, finish. Client and tool mocked."""

from collections.abc import Callable
from pathlib import Path
from uuid import UUID, uuid4

import pytest

from contracts.job_status import FinishStatus, JobFinish, JobHeartbeatAction, JobHeartbeatResponse
from contracts.tasks import RUN_JOB_TASK, JobSpec
from contracts.worker import ToolVersion
from worker import tasks
from worker.celery_app import runtime
from worker.client import BackendError, JobConflictError
from worker.config import WorkerSettings
from worker.runners import RunResult
from worker.runners.nuclei import NucleiRunner

TOOLS = [ToolVersion(name="nuclei", version="3.11.1")]


class FakeClient:
    def __init__(self, spec: JobSpec | Exception, action: JobHeartbeatAction) -> None:
        self.spec = spec
        self.action = action
        self.uploads: list[str] = []
        self.finished: list[JobFinish] = []
        self.upload_error: Exception | None = None

    def claim(self, job_id: UUID) -> JobSpec:
        if isinstance(self.spec, Exception):
            raise self.spec
        return self.spec

    def job_heartbeat(self, job_id: UUID) -> JobHeartbeatResponse:
        return JobHeartbeatResponse(action=self.action)

    def upload_raw_output(self, job_id: UUID, path: Path) -> None:
        if self.upload_error:
            raise self.upload_error
        self.uploads.append(path.name)

    def finish(self, job_id: UUID, body: JobFinish) -> None:
        self.finished.append(body)


def _spec(job_id: UUID, **overrides: object) -> JobSpec:
    data: dict[str, object] = {
        "job_id": str(job_id),
        "tool_module": "nuclei",
        "target": ["app.example.com"],
        "params": {"rate": 10},
        "timeout_minutes": 5,
        "heartbeat_seconds": 30,
    }
    data.update(overrides)
    return JobSpec.model_validate(data)


def _fake_run(
    result: RunResult, files: tuple[str, ...] = ("stdout.txt", "nuclei.jsonl")
) -> Callable[..., RunResult]:
    def run(
        self: NucleiRunner,
        job: JobSpec,
        params: object,
        workdir: Path,
        heartbeat: Callable[[], JobHeartbeatAction],
    ) -> RunResult:
        for name in files:
            (workdir / name).write_text("x")
        heartbeat()
        return result

    return run


def _execute(client: FakeClient, job_id: UUID, tmp_path: Path) -> None:
    tasks.execute_job(job_id, client, tmp_path, TOOLS)  # type: ignore[arg-type]  # duck-typed fake


@pytest.fixture(autouse=True)
def _worker_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    # The Celery config is built from settings on first use of the app.
    monkeypatch.setattr(
        runtime,
        "_settings",
        WorkerSettings.model_validate(
            {
                "api_url": "https://api.example.net",
                "worker_token": "t",
                "redis_url": "redis://worker@127.0.0.1:6379/0",
                "worker_tool_modules": "nuclei",
            }
        ),
    )


def test_task_name_matches_the_contract() -> None:
    assert tasks.run_job.name == RUN_JOB_TASK


def test_completed_job_uploads_then_finishes(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    job_id = uuid4()
    client = FakeClient(_spec(job_id), JobHeartbeatAction.CONTINUE)
    monkeypatch.setattr(NucleiRunner, "run", _fake_run(RunResult(FinishStatus.COMPLETED)))

    _execute(client, job_id, tmp_path)

    assert client.uploads == ["stdout.txt", "nuclei.jsonl"]
    assert client.finished == [JobFinish(status=FinishStatus.COMPLETED, tool_version="3.11.1")]
    assert not (tmp_path / str(job_id)).exists()


def test_cancelled_job_uploads_partial_output(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    job_id = uuid4()
    client = FakeClient(_spec(job_id), JobHeartbeatAction.CANCEL)
    monkeypatch.setattr(
        NucleiRunner, "run", _fake_run(RunResult(FinishStatus.CANCELLED, "job cancelled"))
    )

    _execute(client, job_id, tmp_path)

    assert client.uploads == ["stdout.txt", "nuclei.jsonl"]
    assert client.finished[0].status is FinishStatus.CANCELLED


def test_claim_conflict_drops_the_task(tmp_path: Path) -> None:
    job_id = uuid4()
    client = FakeClient(JobConflictError("conflict", 409), JobHeartbeatAction.CONTINUE)

    _execute(client, job_id, tmp_path)

    assert client.finished == []
    assert not (tmp_path / str(job_id)).exists()


def test_backend_down_at_claim_is_logged_not_raised(tmp_path: Path) -> None:
    client = FakeClient(BackendError("down"), JobHeartbeatAction.CONTINUE)

    _execute(client, uuid4(), tmp_path)

    assert client.finished == []


def test_params_outside_schema_fail_the_job_without_running(tmp_path: Path) -> None:
    job_id = uuid4()
    client = FakeClient(_spec(job_id, params={"code": True}), JobHeartbeatAction.CONTINUE)

    _execute(client, job_id, tmp_path)

    assert client.uploads == []
    assert client.finished[0].status is FinishStatus.FAILED
    assert client.finished[0].status_reason == (
        "job parameters do not match the tool module schema"
    )


def test_unknown_tool_module_fails_the_job(tmp_path: Path) -> None:
    job_id = uuid4()
    client = FakeClient(_spec(job_id, tool_module="not-installed"), JobHeartbeatAction.CONTINUE)

    _execute(client, job_id, tmp_path)

    assert client.finished == [
        JobFinish(
            status=FinishStatus.FAILED,
            status_reason="tool module is not installed on this worker",
        )
    ]


def test_runner_error_fails_the_job(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    job_id = uuid4()
    client = FakeClient(_spec(job_id), JobHeartbeatAction.CONTINUE)

    def boom(*_: object) -> RunResult:
        raise OSError("/usr/bin/nuclei missing")

    monkeypatch.setattr(NucleiRunner, "run", boom)

    _execute(client, job_id, tmp_path)

    assert client.finished[0].status is FinishStatus.FAILED
    # The reason sent to the backend carries no system path.
    assert client.finished[0].status_reason == "runner error"


def test_upload_failure_after_retries_skips_finish(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    job_id = uuid4()
    client = FakeClient(_spec(job_id), JobHeartbeatAction.CONTINUE)
    client.upload_error = BackendError("down")
    monkeypatch.setattr(NucleiRunner, "run", _fake_run(RunResult(FinishStatus.COMPLETED)))

    _execute(client, job_id, tmp_path)

    assert client.finished == []


def test_lost_ownership_stops_without_finish(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    job_id = uuid4()
    client = FakeClient(_spec(job_id), JobHeartbeatAction.CONTINUE)
    client.upload_error = JobConflictError("conflict", 409)
    monkeypatch.setattr(NucleiRunner, "run", _fake_run(RunResult(FinishStatus.COMPLETED)))

    _execute(client, job_id, tmp_path)

    assert client.finished == []


def test_run_job_rejects_a_malformed_job_id() -> None:
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        tasks.run_job.run("not-a-uuid")
