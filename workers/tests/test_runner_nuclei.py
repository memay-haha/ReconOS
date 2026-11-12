"""nuclei runner: argument list from checked parameters, tool process mocked.

.claude/rules/testing.md: no real tool, no real target.
"""

import stat
from pathlib import Path
from uuid import uuid4

import pytest
from pydantic import ValidationError

from contracts.tasks import JobSpec
from contracts.tool_modules import NucleiParams
from worker.runners import RUNNERS
from worker.runners.nuclei import NucleiRunner

PROXY = "http://user:pass@proxy.example.net:8080"


def _job(**overrides: object) -> JobSpec:
    data: dict[str, object] = {
        "job_id": str(uuid4()),
        "tool_module": "nuclei",
        "target": ["app.example.com", "https://api.example.com"],
        "timeout_minutes": 30,
        "heartbeat_seconds": 30,
    }
    data.update(overrides)
    return JobSpec.model_validate(data)


def test_runner_is_registered_under_its_tool_module() -> None:
    assert RUNNERS["nuclei"] is NucleiRunner


def test_default_arguments(tmp_path: Path) -> None:
    args = NucleiRunner().build_args(_job(), NucleiParams(), tmp_path)

    assert args == [
        "nuclei",
        "-list", str(tmp_path / "targets.txt"),
        "-jsonl",
        "-output", str(tmp_path / "nuclei.jsonl"),
        "-silent",
        "-no-color",
        "-disable-update-check",
        "-rate-limit", "150",
        "-concurrency", "25",
        "-timeout", "10",
        "-retries", "1",
    ]  # fmt: skip
    assert (tmp_path / "targets.txt").read_text() == "app.example.com\nhttps://api.example.com\n"


def test_filters_become_comma_lists(tmp_path: Path) -> None:
    params = NucleiRunner.check_params(
        {
            "severity": ["high", "critical"],
            "tags": ["cve", "rce"],
            "exclude_tags": ["dos"],
            "rate": 20,
            "threads": 5,
        }
    )

    args = NucleiRunner().build_args(_job(), params, tmp_path)

    assert args[args.index("-severity") + 1] == "high,critical"
    assert args[args.index("-tags") + 1] == "cve,rce"
    assert args[args.index("-exclude-tags") + 1] == "dos"
    assert args[args.index("-rate-limit") + 1] == "20"
    assert args[args.index("-concurrency") + 1] == "5"


def test_target_never_becomes_an_option(tmp_path: Path) -> None:
    hostile = "-code"
    args = NucleiRunner().build_args(_job(target=[hostile]), NucleiParams(), tmp_path)

    assert hostile not in args
    assert (tmp_path / "targets.txt").read_text() == f"{hostile}\n"


def test_proxy_goes_through_a_private_file(tmp_path: Path) -> None:
    args = NucleiRunner().build_args(_job(proxy_url=PROXY), NucleiParams(), tmp_path)

    proxy_file = Path(args[args.index("-proxy") + 1])
    assert all("pass@" not in arg for arg in args)
    assert proxy_file.read_text() == f"{PROXY}\n"
    assert stat.S_IMODE(proxy_file.stat().st_mode) == 0o600
    # The proxy file is never uploaded as raw output.
    assert proxy_file not in NucleiRunner().raw_output_paths(tmp_path)


@pytest.mark.parametrize("params", [{"code": True}, {"rate": 0}, {"tags": ["a b"]}])
def test_runner_checks_params_again(params: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        NucleiRunner.check_params(params)


def test_raw_output_paths_skip_missing_files(tmp_path: Path) -> None:
    (tmp_path / "stdout.txt").write_text("")
    (tmp_path / "nuclei.jsonl").write_text("{}\n")

    assert NucleiRunner().raw_output_paths(tmp_path) == [
        tmp_path / "stdout.txt",
        tmp_path / "nuclei.jsonl",
    ]


def test_version_command() -> None:
    assert NucleiRunner().version_args() == ["nuclei", "-version", "-disable-update-check"]
