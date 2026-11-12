"""Tool module declarations: parameter schema and group, one file per tool module.

Adding a tool module: add its file here and one line in TOOL_MODULES.
docs/architecture/modules.md
"""

from typing import Final

from contracts.tool_modules.base import OutputType, ToolGroup, ToolModuleSpec, ToolParams
from contracts.tool_modules.nuclei import NUCLEI, NucleiParams
from contracts.tool_modules.osmedeus import OsmedeusParams
from contracts.tool_modules.osmedeus_domain_extensive import OSMEDEUS_DOMAIN_EXTENSIVE
from contracts.tool_modules.osmedeus_domain_lite import OSMEDEUS_DOMAIN_LITE
from contracts.tool_modules.osmedeus_general import OSMEDEUS_GENERAL

TOOL_MODULES: Final[dict[str, ToolModuleSpec]] = {
    spec.name: spec
    for spec in (
        NUCLEI,
        OSMEDEUS_DOMAIN_LITE,
        OSMEDEUS_GENERAL,
        OSMEDEUS_DOMAIN_EXTENSIVE,
    )
}

__all__ = [
    "TOOL_MODULES",
    "NucleiParams",
    "OsmedeusParams",
    "OutputType",
    "ToolGroup",
    "ToolModuleSpec",
    "ToolParams",
]
