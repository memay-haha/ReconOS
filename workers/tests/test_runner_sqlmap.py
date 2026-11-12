"""sqlmap runner: argument list from checked parameters, packaging, tool process mocked.

.claude/rules/testing.md: no real tool, no real target.
"""

import stat
import zipfile
from pathlib import Path
from uuid import uuid4

import pytest
from pydantic import ValidationError

from contracts.job_status import FinishStatus, JobHeartbeatAction
from contracts.tasks import JobSpec
from contracts.tool_modules import SqlmapParams
from worker.runners import RUNNERS, base, sqlmap
from worker.runners.sqlmap import SqlmapRunner, build_package

PROXY = "http://user:pass@proxy.example.net:8080"


def _job(**overrides: object) -> JobSpec:
    data: dict[str, object] = {
        "job_id": str(uuid4()),
        "tool_module": "sqlmap",
        "target": ["https://app.example.com/item?id=1"],
        "timeout_minutes": 30,
        "heartbeat_seconds": 30,
    }
    data.update(overrides)
    return JobSpec.model_validate(data)


class _ExitingProcess:
    """Stands in for ToolProcess: writes what sqlmap would, then exits with `code`."""

    code = 0

    def __init__(self, args: list[str], workdir: Path) -> None:
        output = Path(args[args.index("--output-dir") + 1])
        (output / "app.example.com").mkdir(parents=True)
        (output / "app.example.com" / "log").write_text("sqlmap identified the injection\n")
        (output / "app.example.com" / "link").symlink_to("/etc/hostname")
        Path(args[args.index("--results-file") + 1]).write_text(
            "Target URL,Place,Parameter,Technique(s),Note(s)\n"
        )

    def wait(self, timeout: float) -> int | None:
        return self.code

    def stop(self) -> None:
        return None


def _continue() -> JobHeartbeatAction:
    return JobHeartbeatAction.CONTINUE


def test_runner_is_registered_under_its_tool_module() -> None:
    assert RUNNERS["sqlmap"] is SqlmapRunner


def test_default_arguments(tmp_path: Path) -> None:
    args = SqlmapRunner().build_args(_job(), SqlmapParams(), tmp_path)

    assert args == [
        "sqlmap",
        "-m", str(tmp_path / "targets.txt"),
        "--batch",
        "--disable-coloring",
        "--output-dir", str(tmp_path / "sqlmap-output"),
        "--results-file", str(tmp_path / "results.csv"),
        "--level", "1",
        "--risk", "1",
        "--threads", "1",
        "--timeout", "30",
        "--retries", "3",
    ]  # fmt: skip
    assert (tmp_path / "targets.txt").read_text() == "https://app.example.com/item?id=1\n"


def test_tuning_params_become_options(tmp_path: Path) -> None:
    params = SqlmapRunner.check_params(
        {"level": 3, "risk": 2, "technique": ["B", "T"], "dbms": "postgresql", "delay": 2}
    )

    args = SqlmapRunner().build_args(_job(), params, tmp_path)

    assert args[args.index("--level") + 1] == "3"
    assert args[args.index("--risk") + 1] == "2"
    assert args[args.index("--technique") + 1] == "BT"
    assert args[args.index("--dbms") + 1] == "postgresql"
    assert args[args.index("--delay") + 1] == "2"


@pytest.mark.parametrize(
    "params",
    [{"os_shell": True}, {"file_write": "/var/www/x.php"}, {"dump_all": True}, {"risk": 4}],
)
def test_runner_checks_params_again(params: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        SqlmapRunner.check_params(params)


def test_no_takeover_option_is_ever_built(tmp_path: Path) -> None:
    params = SqlmapRunner.check_params(
        {"level": 5, "risk": 3, "technique": ["B", "E", "U", "S", "T", "Q"], "dbms": "mysql"}
    )
    args = SqlmapRunner().build_args(_job(target=["--os-shell"]), params, tmp_path)

    forbidden = {"--os-shell", "--os-cmd", "--os-pwn", "--file-write", "--file-read", "--dump-all"}
    assert forbidden.isdisjoint(args)
    assert (tmp_path / "targets.txt").read_text() == "--os-shell\n"


def test_proxy_goes_through_a_private_file(tmp_path: Path) -> None:
    args = SqlmapRunner().build_args(_job(proxy_url=PROXY), SqlmapParams(), tmp_path)

    proxy_file = Path(args[args.index("--proxy-file") + 1])
    assert all("pass@" not in arg for arg in args)
    assert "--proxy" not in args
    assert proxy_file.read_text() == f"{PROXY}\n"
    assert stat.S_IMODE(proxy_file.stat().st_mode) == 0o600


@pytest.mark.parametrize(
    ("code", "status"), [(0, FinishStatus.COMPLETED), (1, FinishStatus.FAILED)]
)
def test_run_packs_results_and_output_folder(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path, code: int, status: FinishStatus
) -> None:
    monkeypatch.setattr(_ExitingProcess, "code", code)
    monkeypatch.setattr(base, "ToolProcess", _ExitingProcess)
    job = _job(proxy_url=PROXY)

    result = SqlmapRunner().run(job, SqlmapParams(), tmp_path, _continue)

    assert result.status is status
    package = tmp_path / "sqlmap.zip"
    with zipfile.ZipFile(package) as archive:
        assert sorted(archive.namelist()) == ["output/app.example.com/log", "results.csv"]
    assert not (tmp_path / ".proxy").exists()
    assert package in SqlmapRunner().raw_output_paths(tmp_path)


def test_package_over_the_limit_fails_the_job(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(base, "ToolProcess", _ExitingProcess)
    monkeypatch.setattr(sqlmap, "PACKAGE_MAX_BYTES", 10)

    result = SqlmapRunner().run(_job(), SqlmapParams(), tmp_path, _continue)

    assert result.status is FinishStatus.FAILED
    assert result.reason == "sqlmap output exceeds the package size limit"
    assert not (tmp_path / "sqlmap.zip").exists()


def test_package_without_output_holds_nothing(tmp_path: Path) -> None:
    build_package(tmp_path, tmp_path / "sqlmap.zip")

    with zipfile.ZipFile(tmp_path / "sqlmap.zip") as archive:
        assert archive.namelist() == []


def test_version_command() -> None:
    assert SqlmapRunner().version_args() == ["sqlmap", "--version"]
