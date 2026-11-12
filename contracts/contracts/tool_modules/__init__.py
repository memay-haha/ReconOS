"""Tool module declarations: parameter schema and group, one file per tool module.

Adding a tool module: add its file here and one line in TOOL_MODULES.
docs/architecture/modules.md
"""

from typing import Final

from contracts.tool_modules.base import OutputType, ToolGroup, ToolModuleSpec, ToolParams
from contracts.tool_modules.nuclei import NUCLEI, NucleiParams

TOOL_MODULES: Final[dict[str, ToolModuleSpec]] = {spec.name: spec for spec in (NUCLEI,)}

__all__ = [
    "TOOL_MODULES",
    "NucleiParams",
    "OutputType",
    "ToolGroup",
    "ToolModuleSpec",
    "ToolParams",
]
