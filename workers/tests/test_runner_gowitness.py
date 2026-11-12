"""gowitness runner: argument list, upload order, proxy refusal. No real tool.

.claude/rules/testing.md: no real tool, no real target.
"""

from pathlib import Path
from uuid import uuid4

import pytest
from pydantic import ValidationError

from contracts.job_status import FinishStatus, JobHeartbeatAction
from contracts.tasks import JobSpec
from contracts.tool_modules import GowitnessParams
from worker.runners import RUNNERS
from worker.runners.gowitness import GowitnessRunner


def _job(**overrides: object) -> JobSpec:
    data: dict[str, object] = {
        "job_id": str(uuid4()),
        "tool_module": "gowitness",
        "target": ["https://app.example.com", "http://api.example.com:8080"],
        "timeout_minutes": 30,
        "heartbeat_seconds": 30,
    }
    data.update(overrides)
    return JobSpec.model_validate(data)


def test_runner_is_registered_under_its_tool_module() -> None:
    assert RUNNERS["gowitness"] is GowitnessRunner


def test_default_arguments(tmp_path: Path) -> None:
    args = GowitnessRunner().build_args(_job(), GowitnessParams(), tmp_path)

    assert args == [
        "gowitness", "scan", "file",
        "--file", str(tmp_path / "targets.txt"),
        "--chrome-path", "/usr/bin/chromium",
        "--threads", "4",
        "--timeout", "30",
        "--delay", "3",
        "--chrome-window-x", "1440",
        "--chrome-window-y", "900",
        "--screenshot-path", str(tmp_path / "screenshots"),
        "--screenshot-format", "png",
        "--write-jsonl",
        "--write-jsonl-file", str(tmp_path / "gowitness.jsonl"),
        "--log-scan-errors",
    ]  # fmt: skip
    assert (tmp_path / "screenshots").is_dir()
    assert "--write-db" not in args


def test_params_reach_their_flags(tmp_path: Path) -> None:
    params = GowitnessRunner.check_params(
        {"threads": 2, "timeout": 10, "delay": 0, "window_width": 1920, "window_height": 1080}
    )

    args = GowitnessRunner().build_args(_job(), params, tmp_path)

    assert args[args.index("--threads") + 1] == "2"
    assert args[args.index("--chrome-window-x") + 1] == "1920"
    assert args[args.index("--chrome-window-y") + 1] == "1080"


@pytest.mark.parametrize(
    "params",
    [
        {"write_db": True},
        {"javascript": "() => 1"},
        {"chrome_header": ["Cookie: a=b"]},
        {"threads": 0},
        {"window_width": 10_000},
    ],
)
def test_rejects_params_outside_the_allowlist(params: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        GowitnessRunner.check_params(params)


def test_target_never_becomes_an_option(tmp_path: Path) -> None:
    hostile = "--write-db"
    args = GowitnessRunner().build_args(_job(target=[hostile]), GowitnessParams(), tmp_path)

    assert args.count(hostile) == 0


def test_a_proxy_fails_the_job_before_the_tool_runs(tmp_path: Path) -> None:
    job = _job(proxy_url="http://user:pass@proxy.example.net:8080")

    result = GowitnessRunner().run(
        job, GowitnessParams(), tmp_path, lambda: JobHeartbeatAction.CONTINUE
    )

    assert result.status is FinishStatus.FAILED
    assert result.reason is not None
    assert "pass" not in result.reason
    assert not (tmp_path / "targets.txt").exists()


def test_images_upload_before_the_jsonl(tmp_path: Path) -> None:
    folder = tmp_path / "screenshots"
    folder.mkdir()
    for name in ("https---b.example.com.png", "https---a.example.com.png", "notes.txt"):
        (folder / name).write_bytes(b"x")
    (folder / "https---été.example.com.png").write_bytes(b"x")
    (tmp_path / "gowitness.jsonl").write_text("{}\n")
    (tmp_path / "stdout.txt").write_text("")

    names = [path.name for path in GowitnessRunner().raw_output_paths(tmp_path)]

    assert names == [
        "stdout.txt",
        "https---a.example.com.png",
        "https---b.example.com.png",
        "gowitness.jsonl",
    ]
