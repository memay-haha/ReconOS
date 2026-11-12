"""Shared declaration of the Osmedeus workflow tool modules.

Each workflow of the engine is its own tool module, declared in its own file
(`osmedeus_<workflow>.py`) through `osmedeus_spec`. The workflow decides the
tools; ReconOS only allows the thread count. Not allowed, listed only to explain
the choice: `target_file`, `targets` (targets come from the job only, G5),
`space_name` (the runner isolates the workspace per job), `runner_type`,
`docker_image`, `ssh_host`, `run_mode`, cloud options (they move the run off
the engine server), `schedule`, `repeat` (a job runs once), `skip_validation`.
Engine runs: docs/integrations/external-services.md.
"""

from enum import StrEnum
from typing import Annotated, Final
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from contracts.tool_modules.base import OutputType, ToolGroup, ToolModuleSpec, ToolParams

ENGINE: Final = "osmedeus"
TOOL_MODULE_PREFIX: Final = f"{ENGINE}-"


class OsmedeusParams(ToolParams):
    threads: Annotated[
        int,
        Field(
            title="Threads",
            description="Thread count of every tool in the workflow. 0 keeps the scan preset.",
            ge=0,
            le=100,
        ),
    ] = 0


def osmedeus_spec(
    *,
    flow: str,
    title: str,
    description: str,
    group: ToolGroup,
    tools: tuple[str, ...],
    output_types: tuple[OutputType, ...],
) -> ToolModuleSpec:
    """A tool module named `osmedeus-<flow>` that runs one Osmedeus flow."""
    return ToolModuleSpec(
        name=f"{TOOL_MODULE_PREFIX}{flow}",
        title=title,
        description=description,
        group=group,
        runs_on=ENGINE,
        tools=tools,
        output_types=output_types,
        params=OsmedeusParams,
    )


def flow_of(tool_module: str) -> str:
    """Osmedeus flow name of an `osmedeus-<flow>` tool module."""
    if not tool_module.startswith(TOOL_MODULE_PREFIX):
        message = f"not an Osmedeus tool module: {tool_module}"
        raise ValueError(message)
    return tool_module.removeprefix(TOOL_MODULE_PREFIX)


# ---------------------------------------------------------------- raw output
# One package per job, whatever the number of targets. Layout:
#
#   osmedeus.zip
#   ├── manifest.json        OsmedeusManifest
#   ├── 1/                   workspace of the first target, as the engine zips it
#   │   ├── subdomain/final-<workspace>.txt
#   │   ├── probing/dns-<workspace>.txt ...
#   └── 2/ ...
#
# `<workspace>` inside file names is the workspace name of that run, never the
# target: read it from the manifest. Layout of a workspace:
# docs/integrations/external-services.md.

RAW_OUTPUT_FILENAME: Final = "osmedeus.zip"
MANIFEST_FILENAME: Final = "manifest.json"


class OsmedeusRunStatus(StrEnum):
    """Run status as Osmedeus reports it, plus `missing` when no run was created."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    MISSING = "missing"


class OsmedeusRun(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    # Folder of this run inside the package: str(index).
    index: Annotated[int, Field(ge=1)]
    target: Annotated[str, Field(min_length=1, max_length=2048)]
    workspace: Annotated[str, Field(pattern=r"^[A-Za-z0-9._-]{1,255}$")]
    run_uuid: str | None = None
    status: OsmedeusRunStatus
    # False when the workspace could not be downloaded: the folder is absent.
    has_output: bool


class OsmedeusManifest(BaseModel):
    """`manifest.json` at the root of `osmedeus.zip`."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    tool_module: Annotated[str, Field(min_length=1, max_length=100)]
    flow: Annotated[str, Field(min_length=1, max_length=100)]
    engine_version: str | None = None
    runs: list[OsmedeusRun]


def workspace_name(job_id: UUID, index: int) -> str:
    """Workspace of the run of the `index`-th target (from 1): unique per job (G8)."""
    return f"reconos-{job_id}-{index}"
