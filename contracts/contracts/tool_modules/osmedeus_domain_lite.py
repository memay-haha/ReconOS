"""osmedeus-domain-lite: subdomain discovery, DNS resolution and HTTP probing."""

from contracts.tool_modules.base import OutputType, ToolGroup
from contracts.tool_modules.osmedeus import osmedeus_spec

OSMEDEUS_DOMAIN_LITE = osmedeus_spec(
    flow="domain-lite",
    title="Osmedeus domain lite",
    description="Subdomain discovery, DNS resolution and HTTP fingerprinting.",
    group=ToolGroup.RECON,
    tools=("subfinder", "dnsx", "httpx"),
    output_types=(OutputType.DOMAIN, OutputType.IP, OutputType.URL),
)
