"""osmedeus-general: recon, port scan and vulnerability scan of a domain."""

from contracts.tool_modules.base import OutputType, ToolGroup
from contracts.tool_modules.osmedeus import osmedeus_spec

OSMEDEUS_GENERAL = osmedeus_spec(
    flow="general",
    title="Osmedeus general",
    description="Subdomains, DNS, HTTP probing, port scan and nuclei vulnerability scan.",
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
