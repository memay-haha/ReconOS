"""osmedeus-domain-extensive: general plus DNS brute force and a full port range."""

from contracts.tool_modules.base import OutputType, ToolGroup
from contracts.tool_modules.osmedeus import osmedeus_spec

OSMEDEUS_DOMAIN_EXTENSIVE = osmedeus_spec(
    flow="domain-extensive",
    title="Osmedeus domain extensive",
    description="Like general, with DNS brute force and a scan of every port.",
    group=ToolGroup.SCAN,
    tools=("subfinder", "dnsx", "httpx", "rustscan", "nmap", "nuclei"),
    output_types=(
        OutputType.DOMAIN,
        OutputType.IP,
        OutputType.URL,
        OutputType.SERVICE,
        OutputType.FINDING,
    ),
)
