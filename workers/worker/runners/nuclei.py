"""Runner of the `nuclei` tool module: docs/integrations/external-services.md."""

from pathlib import Path
from typing import Final

from contracts.tasks import JobSpec
from contracts.tool_modules import NucleiParams, ToolParams
from worker.runners.base import Runner, register

OUTPUT_FILENAME: Final = "nuclei.jsonl"
PROXY_FILENAME: Final = ".proxy"


@register
class NucleiRunner(Runner):
    tool_module = "nuclei"
    output_files = (OUTPUT_FILENAME,)
    secret_files = (PROXY_FILENAME,)

    def version_args(self) -> list[str]:
        return ["nuclei", "-version", "-disable-update-check"]

    def build_args(self, job: JobSpec, params: ToolParams, workdir: Path) -> list[str]:
        assert isinstance(params, NucleiParams)  # noqa: S101  narrowed by check_params
        targets = self.write_targets(job, workdir)
        args = [
            "nuclei",
            "-list", str(targets),
            "-jsonl",
            "-output", str(workdir / OUTPUT_FILENAME),
            "-silent",
            "-no-color",
            "-disable-update-check",
            "-rate-limit", str(params.rate),
            "-concurrency", str(params.threads),
            "-timeout", str(params.timeout),
            "-retries", str(params.retries),
        ]  # fmt: skip
        if params.severity:
            args += ["-severity", ",".join(params.severity)]
        if params.tags:
            args += ["-tags", ",".join(params.tags)]
        if params.exclude_tags:
            args += ["-exclude-tags", ",".join(params.exclude_tags)]
        if job.proxy_url is not None:
            # A file keeps the proxy account out of the process list (G7).
            proxy_file = workdir / PROXY_FILENAME
            proxy_file.touch(mode=0o600)
            proxy_file.write_text(job.proxy_url.get_secret_value() + "\n", encoding="utf-8")
            proxy_file.chmod(0o600)
            args += ["-proxy", str(proxy_file)]
        return args
