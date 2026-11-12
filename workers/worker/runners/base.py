"""Runner base class and registry: one runner per tool module.

A runner builds an argument list from checked parameters, runs the tool in its
own process group and leaves raw output files in the job folder. It never reads
those files: parsing happens in the backend (G8).
"""

import os
import re
import signal
import subprocess
import time
from abc import ABC, abstractmethod
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import ClassVar, Final

import structlog

from contracts.job_status import FinishStatus, JobHeartbeatAction
from contracts.raw_output import STDERR_FILENAME, STDOUT_FILENAME
from contracts.tasks import JobSpec
from contracts.tool_modules import TOOL_MODULES, ToolModuleSpec, ToolParams

STOP_GRACE_SECONDS: Final = 10.0
VERSION_TIMEOUT_SECONDS: Final = 30.0
TARGETS_FILENAME: Final = "targets.txt"
# Environment handed to a tool. Worker credentials never reach the tool process.
TOOL_ENV_ALLOWLIST: Final = ("PATH", "HOME", "LANG", "LC_ALL", "TZ")
_VERSION_PATTERN: Final = re.compile(r"v?(\d+\.\d+(?:\.\d+)?)")

log = structlog.get_logger(__name__)


@dataclass(frozen=True, slots=True)
class RunResult:
    status: FinishStatus
    reason: str | None = None
    # Version the tool reported during the job; engines report it per job.
    tool_version: str | None = None


def tool_env() -> dict[str, str]:
    return {name: os.environ[name] for name in TOOL_ENV_ALLOWLIST if name in os.environ}


class ToolProcess:
    """A tool running in its own session, so a stop reaches every child."""

    def __init__(self, args: list[str], workdir: Path) -> None:
        with (
            (workdir / STDOUT_FILENAME).open("wb") as stdout,
            (workdir / STDERR_FILENAME).open("wb") as stderr,
        ):
            self._process = subprocess.Popen(  # noqa: S603  argument list, no shell
                args,
                cwd=workdir,
                stdin=subprocess.DEVNULL,
                stdout=stdout,
                stderr=stderr,
                env=tool_env(),
                start_new_session=True,
                shell=False,
            )

    def wait(self, timeout: float) -> int | None:
        try:
            return self._process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            return None

    def stop(self) -> None:
        """SIGTERM to the process group, SIGKILL after the grace period."""
        if self._process.poll() is not None:
            return
        try:
            os.killpg(self._process.pid, signal.SIGTERM)
            self._process.wait(timeout=STOP_GRACE_SECONDS)
        except subprocess.TimeoutExpired:
            os.killpg(self._process.pid, signal.SIGKILL)
            self._process.wait()
        except ProcessLookupError:
            # The tool exited between poll() and killpg().
            pass


class Runner(ABC):
    """Base of every runner. Subclasses set `tool_module` and build arguments."""

    tool_module: ClassVar[str]
    # Raw output files the tool writes besides stdout.txt and stderr.txt.
    output_files: ClassVar[tuple[str, ...]] = ()
    # Files holding credentials, removed as soon as the tool stops (G7).
    secret_files: ClassVar[tuple[str, ...]] = ()
    # Exit codes that mean the tool ran to the end. Some tools exit 1 to say
    # "findings reported", which is a success for the job.
    success_exit_codes: ClassVar[frozenset[int]] = frozenset({0})

    @classmethod
    def spec(cls) -> ToolModuleSpec:
        return TOOL_MODULES[cls.tool_module]

    @classmethod
    def check_params(cls, params: dict[str, object]) -> ToolParams:
        """Check again with the contract schema before building the command."""
        return cls.spec().params.model_validate(params)

    @abstractmethod
    def build_args(self, job: JobSpec, params: ToolParams, workdir: Path) -> list[str]:
        """Argument list of the tool. Targets and secrets go through files."""

    @abstractmethod
    def version_args(self) -> list[str]:
        """Command that prints the tool version."""

    def read_version(self) -> str | None:
        """Run the version command once at worker start. None when unknown."""
        try:
            result = subprocess.run(  # noqa: S603  argument list, no shell
                self.version_args(),
                capture_output=True,
                text=True,
                timeout=VERSION_TIMEOUT_SECONDS,
                env=tool_env(),
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            log.warning(
                "tool_version_unavailable", tool=self.spec().tools[0], error=type(exc).__name__
            )
            return None
        match = _VERSION_PATTERN.search(result.stdout + result.stderr)
        return match.group(1) if match else None

    def write_targets(self, job: JobSpec, workdir: Path) -> Path:
        path = workdir / TARGETS_FILENAME
        path.write_text("\n".join(job.target) + "\n", encoding="utf-8")
        return path

    def raw_output_paths(self, workdir: Path) -> list[Path]:
        """Files to upload, in order. Missing files are skipped."""
        names = (STDOUT_FILENAME, STDERR_FILENAME, *self.output_files)
        return [workdir / name for name in names if (workdir / name).is_file()]

    def run(
        self,
        job: JobSpec,
        params: ToolParams,
        workdir: Path,
        heartbeat: Callable[[], JobHeartbeatAction],
        clock: Callable[[], float] = time.monotonic,
    ) -> RunResult:
        """Run the tool until it exits, is cancelled or passes its deadline."""
        args = self.build_args(job, params, workdir)
        deadline = clock() + job.timeout_minutes * 60
        process = ToolProcess(args, workdir)
        try:
            while True:
                remaining = deadline - clock()
                if remaining <= 0:
                    process.stop()
                    return RunResult(FinishStatus.FAILED, "tool exceeded the job time limit")
                code = process.wait(timeout=min(job.heartbeat_seconds, remaining))
                if code is not None:
                    if code in self.success_exit_codes:
                        return RunResult(FinishStatus.COMPLETED)
                    return RunResult(FinishStatus.FAILED, f"tool exited with code {code}")
                if heartbeat() is JobHeartbeatAction.CANCEL:
                    process.stop()
                    return RunResult(FinishStatus.CANCELLED, "job cancelled")
        except BaseException:
            process.stop()
            raise
        finally:
            for name in self.secret_files:
                (workdir / name).unlink(missing_ok=True)


RUNNERS: dict[str, type[Runner]] = {}


def register[R: type[Runner]](runner: R) -> R:
    """Class decorator: register a runner under its tool module name."""
    if runner.tool_module not in TOOL_MODULES:
        message = f"no contract for tool module {runner.tool_module}"
        raise ValueError(message)
    RUNNERS[runner.tool_module] = runner
    return runner
