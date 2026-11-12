"""Parser of one Osmedeus workflow tool module: shared reader in app/parser/osmedeus.py."""

from app.parser.osmedeus import OsmedeusParser


class OsmedeusDomainExtensiveParser(OsmedeusParser):
    tool_modules = ("osmedeus-domain-extensive",)
