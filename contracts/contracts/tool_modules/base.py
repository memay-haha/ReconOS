"""Shape of a tool module declaration: docs/architecture/modules.md.

The code decides what a tool module may do; the database only picks values
inside that range (S18).
"""

from dataclasses import dataclass
from enum import StrEnum
from typing import Final

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
    # Takes a wildcard job target `*.<domain>`: only flows that start from
    # subdomain enumeration, which read the base domain and never probe the
    # wildcard itself. docs/architecture/business-flow.md, scope check.
    accepts_wildcard: bool = False


WILDCARD_PREFIX: Final = "*."


def is_wildcard_target(target: str) -> bool:
    """A wildcard job target, `*.<domain>`, as the backend stores it after the scope check."""
    return target.startswith(WILDCARD_PREFIX)


def base_domain(target: str) -> str:
    """The domain a tool receives for a target: `*.example.com` gives `example.com`.

    Any other target is returned unchanged.
    """
    return target.removeprefix(WILDCARD_PREFIX)
