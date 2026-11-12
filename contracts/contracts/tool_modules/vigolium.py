"""vigolium: native scan of the Vigolium engine, findings only.

Allowed: strategy, threads (Vigolium `concurrency`), rate (Vigolium `rate_limit`).
Not allowed, listed only to explain the choice: `targets`/`urls` (targets come
from the job only, G5), `scope_origin` (the runner pins `strict` so the scan
never leaves the target host, G5), `scanning_max_duration` (the runner derives
it from the job time limit), `headers` (they may carry credentials, G7),
`modules`/`module_tags`/`only`/`skip` (native modules are switched on S17),
`dry_run`, `scanning_profile` (a path on the engine server), agent and source
upload endpoints (G1). Engine calls: docs/integrations/external-services.md.
"""

from typing import Annotated, Final, Literal

from pydantic import Field

from contracts.tool_modules.base import OutputType, ToolGroup, ToolModuleSpec, ToolParams

ENGINE: Final = "vigolium"
# One JSON finding object per line, as `GET /api/findings` returns it.
RAW_OUTPUT_FILENAME: Final = "vigolium-findings.jsonl"


class VigoliumParams(ToolParams):
    strategy: Annotated[
        Literal["lite", "balanced", "deep"],
        Field(title="Strategy", description="Vigolium scan strategy preset."),
    ] = "balanced"
    threads: Annotated[
        int,
        Field(title="Threads", description="Parallel scan workers on the engine.", ge=1, le=100),
    ] = 25
    rate: Annotated[
        int, Field(title="Rate", description="Maximum requests per second.", ge=1, le=1000)
    ] = 100


VIGOLIUM = ToolModuleSpec(
    name=ENGINE,
    title="Vigolium",
    description="Native web vulnerability scan on the Vigolium engine.",
    group=ToolGroup.SCAN,
    runs_on=ENGINE,
    tools=("vigolium",),
    output_types=(OutputType.FINDING,),
    params=VigoliumParams,
)
