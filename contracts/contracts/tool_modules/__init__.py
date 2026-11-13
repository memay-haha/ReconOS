"""Tool module declarations: parameter schema and group, one file per tool module.

Adding a tool module: add its file here and one line in TOOL_MODULES.
docs/architecture/modules.md
"""

from typing import Final

from contracts.tool_modules.base import (
    WILDCARD_PREFIX,
    OutputType,
    ToolGroup,
    ToolModuleSpec,
    ToolParams,
    base_domain,
    is_wildcard_target,
)
from contracts.tool_modules.dalfox import DALFOX, DalfoxParams
from contracts.tool_modules.gowitness import GOWITNESS, GowitnessParams
from contracts.tool_modules.nuclei import NUCLEI, NucleiParams
from contracts.tool_modules.osmedeus import OsmedeusParams
from contracts.tool_modules.osmedeus_domain_extensive import OSMEDEUS_DOMAIN_EXTENSIVE
from contracts.tool_modules.osmedeus_domain_lite import OSMEDEUS_DOMAIN_LITE
from contracts.tool_modules.osmedeus_general import OSMEDEUS_GENERAL
from contracts.tool_modules.sqlmap import SQLMAP, SqlmapParams
from contracts.tool_modules.vigolium import VIGOLIUM, VigoliumParams

TOOL_MODULES: Final[dict[str, ToolModuleSpec]] = {
    spec.name: spec
    for spec in (
        NUCLEI,
        OSMEDEUS_DOMAIN_LITE,
        OSMEDEUS_GENERAL,
        OSMEDEUS_DOMAIN_EXTENSIVE,
        VIGOLIUM,
        SQLMAP,
        DALFOX,
        GOWITNESS,
    )
}

__all__ = [
    "TOOL_MODULES",
    "WILDCARD_PREFIX",
    "DalfoxParams",
    "GowitnessParams",
    "NucleiParams",
    "OsmedeusParams",
    "OutputType",
    "SqlmapParams",
    "ToolGroup",
    "ToolModuleSpec",
    "ToolParams",
    "VigoliumParams",
    "base_domain",
    "is_wildcard_target",
]
