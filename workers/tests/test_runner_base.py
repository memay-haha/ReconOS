"""Runner loop: heartbeat, cancel, time limit, exit code. Tool process mocked."""

import subprocess
import sys
import time
from pathlib import Path
from typing import Any, ClassVar
from uuid import uuid4

import pytest
from pydantic import SecretStr

from contracts.job_status import FinishStatus, JobHeartbeatAction
from contracts.tasks import JobSpec
from contracts.tool_modules import NucleiParams
from worker.runners import base
from worker.runners.base import ToolProcess, register, tool_env
from worker.runners.nuclei import NucleiRunner


class FakeProcess:
    """Stands in for ToolProcess: exits with `code` after `polls` waits."""

    instances: ClassVar[list[FakeProcess]] = []

    def __init__(self, args: list[str], workdir: Path, *, code: int | None, polls: int) -> None:
        self.args = args
        self.workdir = workdir
        self.code = code
        self.polls = polls
        self.waits: list[float] = []
        self.stopped = False
        FakeProcess.instances.append(self)

    def wait(self, timeout: float) -> int | None:
        self.waits.append(timeout)
        if self.code is not None and len(self.waits) > self.polls:
            return self.code
        return None

    def stop(self) -> None:
        self.stopped = True


def _patch_process(monkeypatch: pytest.MonkeyPatch, code: int | None, polls: int = 0) -> None:
    FakeProcess.instances = []

    def factory(args: list[str], workdir: Path) -> FakeProcess:
        return FakeProcess(args, workdir, code=code, polls=polls)

    monkeypatch.setattr(base, "ToolProcess", factory)


def _job(timeout_minutes: int = 30) -> JobSpec:
    return JobSpec(
        job_id=uuid4(),
        tool_module="nuclei",
        target=["app.example.com"],
        timeout_minutes=timeout_minutes,
        heartbeat_seconds=30,
    )


def _continue() -> JobHeartbeatAction:
    return JobHeartbeatAction.CONTINUE


def test_exit_zero_completes(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    _patch_process(monkeypatch, code=0, polls=2)
    beats: list[int] = []

    def heartbeat() -> JobHeartbeatAction:
        beats.append(1)
        return JobHeartbeatAction.CONTINUE

    result = NucleiRunner().run(_job(), NucleiParams(), tmp_path, heartbeat)

    assert result.status is FinishStatus.COMPLETED
    assert len(beats) == 2
    assert FakeProcess.instances[0].waits == [30, 30, 30]
    assert FakeProcess.instances[0].args[0] == "nuclei"


def test_secret_files_are_removed_when_the_tool_stops(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _patch_process(monkeypatch, code=0)
    job = _job().model_copy(update={"proxy_url": SecretStr("http://u:p@proxy.example.net:1")})

    NucleiRunner().run(job, NucleiParams(), tmp_path, _continue)

    assert "-proxy" in FakeProcess.instances[0].args
    assert not (tmp_path / ".proxy").exists()


def test_non_zero_exit_fails(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    _patch_process(monkeypatch, code=2)

    result = NucleiRunner().run(_job(), NucleiParams(), tmp_path, _continue)

    assert result.status is FinishStatus.FAILED
    assert result.reason == "tool exited with code 2"


def test_cancel_stops_the_tool(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    _patch_process(monkeypatch, code=None)

    result = NucleiRunner().run(_job(), NucleiParams(), tmp_path, lambda: JobHeartbeatAction.CANCEL)

    assert result.status is FinishStatus.CANCELLED
    assert FakeProcess.instances[0].stopped


def test_time_limit_stops_the_tool(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    _patch_process(monkeypatch, code=None)
    now = [0.0]

    def clock() -> float:
        now[0] += 30
        return now[0]

    result = NucleiRunner().run(_job(timeout_minutes=1), NucleiParams(), tmp_path, _continue, clock)

    assert result.status is FinishStatus.FAILED
    assert result.reason == "tool exceeded the job time limit"
    assert FakeProcess.instances[0].stopped


def test_heartbeat_error_stops_the_tool(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    _patch_process(monkeypatch, code=None)

    def broken() -> JobHeartbeatAction:
        raise RuntimeError

    with pytest.raises(RuntimeError):
        NucleiRunner().run(_job(), NucleiParams(), tmp_path, broken)

    assert FakeProcess.instances[0].stopped


def test_tool_env_drops_worker_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RECONOS_WORKER_TOKEN", "secret-token")
    monkeypatch.setenv("RECONOS_REDIS_PASSWORD", "secret-password")

    env = tool_env()

    assert "RECONOS_WORKER_TOKEN" not in env
    assert "RECONOS_REDIS_PASSWORD" not in env
    assert env.get("PATH")


def test_read_version_parses_tool_banner(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_run(args: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:  # noqa: ANN401
        assert kwargs["timeout"] > 0
        return subprocess.CompletedProcess(args, 0, "", "[INF] Nuclei Engine Version: v3.11.1\n")

    monkeypatch.setattr("worker.runners.base.subprocess.run", fake_run)

    assert NucleiRunner().read_version() == "3.11.1"


def test_read_version_is_none_when_tool_is_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    def missing(args: list[str], **_: Any) -> subprocess.CompletedProcess[str]:  # noqa: ANN401
        raise FileNotFoundError(args[0])

    monkeypatch.setattr("worker.runners.base.subprocess.run", missing)

    assert NucleiRunner().read_version() is None


def test_read_version_is_none_without_a_version(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "worker.runners.base.subprocess.run",
        lambda args, **_: subprocess.CompletedProcess(args, 0, "", ""),
    )

    assert NucleiRunner().read_version() is None


def test_register_refuses_a_runner_without_contract() -> None:
    class Unknown(NucleiRunner):
        tool_module = "not-a-tool-module"

    with pytest.raises(ValueError, match="no contract"):
        register(Unknown)


# A local Python child stands in for a tool: no tool binary, no network.
def test_tool_process_writes_stdout_and_stderr_files(tmp_path: Path) -> None:
    code = "import sys; print('out'); print('err', file=sys.stderr)"
    process = ToolProcess([sys.executable, "-I", "-c", code], tmp_path)

    assert process.wait(timeout=30) == 0
    assert (tmp_path / "stdout.txt").read_text() == "out\n"
    assert (tmp_path / "stderr.txt").read_text() == "err\n"
    process.stop()  # already exited: no signal sent


def test_tool_process_stop_ends_the_process_group(tmp_path: Path) -> None:
    code = (
        "import subprocess, sys, time; "
        "subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)']); "
        "time.sleep(60)"
    )
    process = ToolProcess([sys.executable, "-I", "-c", code], tmp_path)
    assert process.wait(timeout=0.2) is None

    started = time.monotonic()
    process.stop()

    assert process.wait(timeout=1) is not None
    assert time.monotonic() - started < base.STOP_GRACE_SECONDS


def test_tool_process_kills_after_grace(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(base, "STOP_GRACE_SECONDS", 0.5)
    code = (
        "import signal, time; signal.signal(signal.SIGTERM, signal.SIG_IGN); "
        "print('ready', flush=True); time.sleep(60)"
    )
    process = ToolProcess([sys.executable, "-I", "-c", code], tmp_path)
    deadline = time.monotonic() + 10
    while "ready" not in (tmp_path / "stdout.txt").read_text() and time.monotonic() < deadline:
        time.sleep(0.05)

    process.stop()

    assert process.wait(timeout=1) == -9
