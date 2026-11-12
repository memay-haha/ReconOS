"""Parsers by tool module name: backend/CLAUDE.md, section Parser.

Adding a parser: add its file in app/parser/, named after the tool module, and
one line in PARSERS. Importing
this module registers every parser with raw_output, so an upload of a tool
module with a parser is stored `pending` and queues the parse task. The Backend
API and the background process import it at start: app/main.py,
app/background/celery_app.py.
"""

from typing import Final

from app.parser.base import Parser
from app.parser.gowitness import GowitnessParser
from app.parser.nuclei import NucleiParser
from app.parser.osmedeus_domain_extensive import OsmedeusDomainExtensiveParser
from app.parser.osmedeus_domain_lite import OsmedeusDomainLiteParser
from app.parser.osmedeus_general import OsmedeusGeneralParser
from app.raw_output import service as raw_output_service

PARSERS: Final[tuple[Parser, ...]] = (
    NucleiParser(),
    OsmedeusDomainLiteParser(),
    OsmedeusGeneralParser(),
    OsmedeusDomainExtensiveParser(),
    GowitnessParser(),
)

_BY_TOOL_MODULE: dict[str, Parser] = {}


def register(parser: Parser) -> None:
    for name in parser.tool_modules:
        if name in _BY_TOOL_MODULE:
            message = f"two parsers claim tool module {name}"
            raise RuntimeError(message)
        _BY_TOOL_MODULE[name] = parser
        raw_output_service.register_parser(name)


def parser_for(tool_module: str) -> Parser | None:
    return _BY_TOOL_MODULE.get(tool_module)


for _parser in PARSERS:
    register(_parser)
