"""Worker heartbeat: CPU sampling, tool versions, failures do not stop the loop."""

from pathlib import Path

import pytest

from contracts.worker import ToolVersion, WorkerHeartbeat
from worker.heartbeat import CpuSampler, HeartbeatLoop, installed_tools, read_cpu_times
from worker.runners.nuclei import NucleiRunner


def test_read_cpu_times(tmp_path: Path) -> None:
    stat = tmp_path / "stat"
    stat.write_text("cpu  100 0 100 700 100 0 0 0 0 0\ncpu0 1 2 3 4\n")

    assert read_cpu_times(stat) == (800, 1000)
    assert read_cpu_times(tmp_path / "missing") is None


def test_cpu_sampler_averages_since_previous_sample() -> None:
    readings = iter([(800, 1000), (850, 1100), (850, 1100)])
    sampler = CpuSampler(lambda: next(readings))

    assert sampler.sample() == 50.0
    assert sampler.sample() is None  # no time passed


def test_cpu_sampler_without_proc() -> None:
    assert CpuSampler(lambda: None).sample() is None


def test_installed_tools_reads_each_version(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(NucleiRunner, "read_version", lambda self: "3.11.1")

    assert installed_tools(["nuclei", "unknown-module"]) == [
        ToolVersion(name="nuclei", version="3.11.1")
    ]


def test_heartbeat_failure_is_logged_and_the_loop_goes_on() -> None:
    sent: list[WorkerHeartbeat] = []

    def send(body: WorkerHeartbeat) -> None:
        sent.append(body)
        raise OSError

    loop = HeartbeatLoop(send, ["nuclei"], [], interval=3600, sampler=CpuSampler(lambda: None))
    loop.start()
    loop.stop()
    loop.join(timeout=5)

    assert sent == [WorkerHeartbeat(tool_modules=["nuclei"], tools=[], cpu_percent=None)]
