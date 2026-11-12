"""Runner of the `sqlmap` tool module: docs/integrations/external-services.md.

sqlmap writes a folder per target host, so the runner packs that folder and
the CSV results file into one `sqlmap.zip`. The runner never reads what sqlmap
wrote beyond copying it: the parser in the backend reads `results.csv` (G8).
"""

import time
import zipfile
from collections.abc import Callable
from pathlib import Path
from typing import Final

from contracts.job_status import FinishStatus, JobHeartbeatAction
from contracts.tasks import JobSpec
from contracts.tool_modules import SqlmapParams, ToolParams
from worker.runners.base import Runner, RunResult, register

PACKAGE_FILENAME: Final = "sqlmap.zip"
RESULTS_FILENAME: Final = "results.csv"
OUTPUT_DIRNAME: Final = "sqlmap-output"
PROXY_FILENAME: Final = ".proxy"
# Package member holding the sqlmap output folder.
PACKAGE_OUTPUT_PREFIX: Final = "output"
PACKAGE_MAX_BYTES: Final = 10 * 1024**3


class PackageTooLargeError(Exception):
    """The sqlmap output adds up to more than PACKAGE_MAX_BYTES."""


def build_package(workdir: Path, package: Path) -> None:
    """Zip `results.csv` and the output folder. Links and special files are skipped."""
    total = 0
    with zipfile.ZipFile(package, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        results = workdir / RESULTS_FILENAME
        if results.is_file() and not results.is_symlink():
            total += results.stat().st_size
            archive.write(results, RESULTS_FILENAME)
        output = workdir / OUTPUT_DIRNAME
        if not output.is_dir() or output.is_symlink():
            return
        for path in sorted(output.rglob("*")):
            if path.is_symlink() or not path.is_file():
                continue
            total += path.stat().st_size
            if total > PACKAGE_MAX_BYTES:
                raise PackageTooLargeError
            archive.write(path, f"{PACKAGE_OUTPUT_PREFIX}/{path.relative_to(output).as_posix()}")


@register
class SqlmapRunner(Runner):
    tool_module = "sqlmap"
    output_files = (PACKAGE_FILENAME,)
    secret_files = (PROXY_FILENAME,)

    def version_args(self) -> list[str]:
        return ["sqlmap", "--version"]

    def build_args(self, job: JobSpec, params: ToolParams, workdir: Path) -> list[str]:
        assert isinstance(params, SqlmapParams)  # noqa: S101  narrowed by check_params
        targets = self.write_targets(job, workdir)
        # --batch answers every prompt with its default, so sqlmap never waits
        # for input and never takes a takeover step on its own.
        args = [
            "sqlmap",
            "-m", str(targets),
            "--batch",
            "--disable-coloring",
            "--output-dir", str(workdir / OUTPUT_DIRNAME),
            "--results-file", str(workdir / RESULTS_FILENAME),
            "--level", str(params.level),
            "--risk", str(params.risk),
            "--threads", str(params.threads),
            "--timeout", str(params.timeout),
            "--retries", str(params.retries),
        ]  # fmt: skip
        if params.delay:
            args += ["--delay", str(params.delay)]
        if params.technique:
            args += ["--technique", "".join(params.technique)]
        if params.dbms is not None:
            args += ["--dbms", params.dbms]
        if job.proxy_url is not None:
            # A file keeps the proxy account out of the process list (G7).
            proxy_file = workdir / PROXY_FILENAME
            proxy_file.touch(mode=0o600)
            proxy_file.write_text(job.proxy_url.get_secret_value() + "\n", encoding="utf-8")
            proxy_file.chmod(0o600)
            args += ["--proxy-file", str(proxy_file)]
        return args

    def run(
        self,
        job: JobSpec,
        params: ToolParams,
        workdir: Path,
        heartbeat: Callable[[], JobHeartbeatAction],
        clock: Callable[[], float] = time.monotonic,
    ) -> RunResult:
        """Run sqlmap, then pack what it wrote, also after a failure or a cancel."""
        result = super().run(job, params, workdir, heartbeat, clock)
        try:
            build_package(workdir, workdir / PACKAGE_FILENAME)
        except PackageTooLargeError:
            (workdir / PACKAGE_FILENAME).unlink(missing_ok=True)
            return RunResult(FinishStatus.FAILED, "sqlmap output exceeds the package size limit")
        return result
