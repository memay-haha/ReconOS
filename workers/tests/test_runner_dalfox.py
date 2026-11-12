"""dalfox runner: argument list from checked parameters, tool process mocked.

.claude/rules/testing.md: no real tool, no real target.
"""

import json
import stat
from pathlib import Path
from uuid import uuid4

import pytest
from pydantic import ValidationError

from contracts.job_status import FinishStatus, JobHeartbeatAction
from contracts.tasks import JobSpec
from contracts.tool_modules import DalfoxParams
from worker.runners import RUNNERS, base
from worker.runners.dalfox import DalfoxRunner

PROXY = "http://user:pass@proxy.example.net:8080"


def _job(**overrides: object) -> JobSpec:
    data: dict[str, object] = {
        "job_id": str(uuid4()),
        "tool_module": "dalfox",
        "target": ["https://app.example.com/search?q=a"],
        "timeout_minutes": 30,
        "heartbeat_seconds": 30,
    }
    data.update(overrides)
    return JobSpec.model_validate(data)


def test_runner_is_registered_under_its_tool_module() -> None:
    assert RUNNERS["dalfox"] is DalfoxRunner


def test_default_arguments(tmp_path: Path) -> None:
    args = DalfoxRunner().build_args(_job(), DalfoxParams(), tmp_path)

    assert args == [
        "dalfox", "scan",
        "--input-type", "file", str(tmp_path / "targets.txt"),
        "--config", str(tmp_path / ".dalfox.json"),
        "--format", "jsonl",
        "--output", str(tmp_path / "dalfox.jsonl"),
        "--silence",
        "--no-color",
        "--workers", "10",
        "--delay", "0",
        "--timeout", "10",
        "--rate-limit", "0",
        "--retries", "0",
    ]  # fmt: skip
    assert json.loads((tmp_path / ".dalfox.json").read_text()) == {"scan": {}}


def test_switches_and_filters(tmp_path: Path) -> None:
    params = DalfoxRunner.check_params(
        {
            "follow_redirects": True,
            "skip_mining": True,
            "skip_discovery": True,
            "deep_scan": True,
            "only_poc": ["v", "a"],
            "workers": 5,
        }
    )

    args = DalfoxRunner().build_args(_job(), params, tmp_path)

    for flag in ("--follow-redirects", "--skip-mining", "--skip-discovery", "--deep-scan"):
        assert flag in args
    assert args[args.index("--only-poc") + 1] == "v,a"
    assert args[args.index("--workers") + 1] == "5"


@pytest.mark.parametrize(
    "params", [{"blind": "https://x.example.org"}, {"remote_payloads": "portswigger"}]
)
def test_runner_checks_params_again(params: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        DalfoxRunner.check_params(params)


def test_no_callback_or_remote_option_is_ever_built(tmp_path: Path) -> None:
    args = DalfoxRunner().build_args(_job(target=["--blind"]), DalfoxParams(), tmp_path)

    forbidden = {"--blind", "-b", "--blind-oob", "--remote-payloads", "--remote-wordlists", "-H"}
    assert forbidden.isdisjoint(args)


def test_proxy_goes_through_a_private_config_file(tmp_path: Path) -> None:
    args = DalfoxRunner().build_args(_job(proxy_url=PROXY), DalfoxParams(), tmp_path)

    config = Path(args[args.index("--config") + 1])
    assert all("pass@" not in arg for arg in args)
    assert "--proxy" not in args
    assert json.loads(config.read_text()) == {"scan": {"proxy": PROXY}}
    assert stat.S_IMODE(config.stat().st_mode) == 0o600
    assert config not in DalfoxRunner().raw_output_paths(tmp_path)


class _Exit:
    code = 1

    def __init__(self, args: list[str], workdir: Path) -> None:
        return None

    def wait(self, timeout: float) -> int | None:
        return self.code

    def stop(self) -> None:
        return None


@pytest.mark.parametrize(
    ("code", "status"),
    [(0, FinishStatus.COMPLETED), (1, FinishStatus.COMPLETED), (2, FinishStatus.FAILED)],
)
def test_exit_one_means_findings_not_failure(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, code: int, status: FinishStatus
) -> None:
    monkeypatch.setattr(_Exit, "code", code)
    monkeypatch.setattr(base, "ToolProcess", _Exit)

    result = DalfoxRunner().run(
        _job(proxy_url=PROXY), DalfoxParams(), tmp_path, lambda: JobHeartbeatAction.CONTINUE
    )

    assert result.status is status
    assert not (tmp_path / ".dalfox.json").exists()


def test_version_command() -> None:
    assert DalfoxRunner().version_args() == ["dalfox", "--version"]
