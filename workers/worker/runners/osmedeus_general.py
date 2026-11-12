"""Runner of the `osmedeus-general` tool module: docs/integrations/external-services.md."""

from worker.runners.base import register
from worker.runners.osmedeus import OsmedeusRunner


@register
class OsmedeusGeneralRunner(OsmedeusRunner):
    tool_module = "osmedeus-general"
