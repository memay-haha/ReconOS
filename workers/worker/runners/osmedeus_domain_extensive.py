"""Runner of the `osmedeus-domain-extensive` tool module: docs/integrations/external-services.md."""

from worker.runners.base import register
from worker.runners.osmedeus import OsmedeusRunner


@register
class OsmedeusDomainExtensiveRunner(OsmedeusRunner):
    tool_module = "osmedeus-domain-extensive"
