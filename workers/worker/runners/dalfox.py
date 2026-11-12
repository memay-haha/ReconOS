"""Runner of the `dalfox` tool module: docs/integrations/external-services.md.

dalfox v3 takes the proxy from `--proxy` or from its config file only, and it
ignores the proxy environment variables, so the program proxy goes through a
private config file (G7). The same file stops dalfox from reading a config
left in the worker's home folder, which could turn on a blind callback.
"""

import json
from pathlib import Path
from typing import Final

from contracts.tasks import JobSpec
from contracts.tool_modules import DalfoxParams, ToolParams
from worker.runners.base import Runner, register

OUTPUT_FILENAME: Final = "dalfox.jsonl"
CONFIG_FILENAME: Final = ".dalfox.json"


@register
class DalfoxRunner(Runner):
    tool_module = "dalfox"
    output_files = (OUTPUT_FILENAME,)
    secret_files = (CONFIG_FILENAME,)
    # dalfox exits 1 when it reports findings, 2 on an input or runtime error.
    success_exit_codes = frozenset({0, 1})

    def version_args(self) -> list[str]:
        return ["dalfox", "--version"]

    def write_config(self, job: JobSpec, workdir: Path) -> Path:
        scan: dict[str, str] = {}
        if job.proxy_url is not None:
            scan["proxy"] = job.proxy_url.get_secret_value()
        path = workdir / CONFIG_FILENAME
        path.touch(mode=0o600)
        path.write_text(json.dumps({"scan": scan}), encoding="utf-8")
        path.chmod(0o600)
        return path

    def build_args(self, job: JobSpec, params: ToolParams, workdir: Path) -> list[str]:
        assert isinstance(params, DalfoxParams)  # noqa: S101  narrowed by check_params
        targets = self.write_targets(job, workdir)
        config = self.write_config(job, workdir)
        args = [
            "dalfox", "scan",
            "--input-type", "file", str(targets),
            "--config", str(config),
            "--format", "jsonl",
            "--output", str(workdir / OUTPUT_FILENAME),
            "--silence",
            "--no-color",
            "--workers", str(params.workers),
            "--delay", str(params.delay),
            "--timeout", str(params.timeout),
            "--rate-limit", str(params.rate),
            "--retries", str(params.retries),
        ]  # fmt: skip
        if params.follow_redirects:
            args.append("--follow-redirects")
        if params.skip_mining:
            args.append("--skip-mining")
        if params.skip_discovery:
            args.append("--skip-discovery")
        if params.deep_scan:
            args.append("--deep-scan")
        if params.only_poc:
            args += ["--only-poc", ",".join(params.only_poc)]
        return args
