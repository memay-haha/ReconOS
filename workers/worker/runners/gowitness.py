"""Runner of the `gowitness` tool module: docs/integrations/external-services.md.

gowitness writes one JSONL line per captured page, HTML included, and one PNG
per screenshot. It never writes to a database here: no `--write-db` (G1). The
runner uploads every PNG before `gowitness.jsonl`, so when the parser reads the
JSONL the image rows it links already exist.
"""

import re
import time
from collections.abc import Callable
from pathlib import Path
from typing import Final

import structlog

from contracts.job_status import FinishStatus, JobHeartbeatAction
from contracts.raw_output import RAW_OUTPUT_FILENAME_PATTERN
from contracts.tasks import JobSpec
from contracts.tool_modules import GowitnessParams, ToolParams
from worker.runners.base import Runner, RunResult, register

OUTPUT_FILENAME: Final = "gowitness.jsonl"
SCREENSHOT_DIRNAME: Final = "screenshots"
# Chromium from the image's package manager: infras/docker/worker.Dockerfile.
CHROME_PATH: Final = "/usr/bin/chromium"
_UPLOADABLE: Final = re.compile(RAW_OUTPUT_FILENAME_PATTERN)

log = structlog.get_logger(__name__)


@register
class GowitnessRunner(Runner):
    tool_module = "gowitness"

    def version_args(self) -> list[str]:
        return ["gowitness", "version"]

    def build_args(self, job: JobSpec, params: ToolParams, workdir: Path) -> list[str]:
        assert isinstance(params, GowitnessParams)  # noqa: S101  narrowed by check_params
        targets = self.write_targets(job, workdir)
        screenshots = workdir / SCREENSHOT_DIRNAME
        screenshots.mkdir(mode=0o700, exist_ok=True)
        return [
            "gowitness", "scan", "file",
            "--file", str(targets),
            "--chrome-path", CHROME_PATH,
            "--threads", str(params.threads),
            "--timeout", str(params.timeout),
            "--delay", str(params.delay),
            "--chrome-window-x", str(params.window_width),
            "--chrome-window-y", str(params.window_height),
            "--screenshot-path", str(screenshots),
            "--screenshot-format", "png",
            "--write-jsonl",
            "--write-jsonl-file", str(workdir / OUTPUT_FILENAME),
            # Navigation errors go to stderr.txt; gowitness writes no JSONL line for them.
            "--log-scan-errors",
        ]  # fmt: skip

    def run(
        self,
        job: JobSpec,
        params: ToolParams,
        workdir: Path,
        heartbeat: Callable[[], JobHeartbeatAction],
        clock: Callable[[], float] = time.monotonic,
    ) -> RunResult:
        if job.proxy_url is not None:
            # gowitness takes a proxy only as `--chrome-proxy` on the command
            # line, where any user could read it (G7): tech-debt.md, debt 66.
            return RunResult(FinishStatus.FAILED, "gowitness cannot use a program proxy")
        return super().run(job, params, workdir, heartbeat, clock)

    def raw_output_paths(self, workdir: Path) -> list[Path]:
        """stdout, stderr, every screenshot, then the JSONL that names them."""
        first = super().raw_output_paths(workdir)
        folder = workdir / SCREENSHOT_DIRNAME
        images: list[Path] = []
        if folder.is_dir():
            for path in sorted(folder.iterdir()):
                if not path.is_file() or path.suffix.lower() != ".png":
                    continue
                if not _UPLOADABLE.fullmatch(path.name) or ".." in path.name:
                    # gowitness keeps any Unicode letter of the target in the
                    # name; the upload contract takes ASCII only.
                    log.warning("screenshot_name_not_uploadable")
                    continue
                images.append(path)
        jsonl = workdir / OUTPUT_FILENAME
        return [*first, *images, *([jsonl] if jsonl.is_file() else [])]
