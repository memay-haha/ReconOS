"""Runner of the `osmedeus-domain-lite` tool module: docs/integrations/external-services.md."""

from worker.runners.base import register
from worker.runners.osmedeus import OsmedeusRunner


@register
class OsmedeusDomainLiteRunner(OsmedeusRunner):
    tool_module = "osmedeus-domain-lite"
