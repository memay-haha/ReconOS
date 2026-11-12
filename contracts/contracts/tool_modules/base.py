"""Shape of a tool module declaration: docs/architecture/modules.md.

The code decides what a tool module may do; the database only picks values
inside that range (S18).
"""

from dataclasses import dataclass
from enum import StrEnum

from pydantic import BaseModel, ConfigDict


class ToolGroup(StrEnum):
    """Impact level. `exploit` jobs need approval before they run (G5)."""

    RECON = "recon"
    SCAN = "scan"
    EXPLOIT = "exploit"


class OutputType(StrEnum):
    DOMAIN = "domain"
    IP = "ip"
    URL = "url"
    SERVICE = "service"
    SCREENSHOT = "screenshot"
    FINDING = "finding"


class ToolParams(BaseModel):
    """Base of every parameter schema: an allowlist, unknown keys are rejected."""

    model_config = ConfigDict(extra="forbid", frozen=True)


@dataclass(frozen=True, slots=True)
class ToolModuleSpec:
    name: str
    title: str
    description: str
    group: ToolGroup
    # Engine name, None when the worker runs the tool directly.
    runs_on: str | None
    tools: tuple[str, ...]
    output_types: tuple[OutputType, ...]
    # `param_schema` of GET /tool-modules is params.model_json_schema().
    params: type[ToolParams]
