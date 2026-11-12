"""Parser of the `nuclei` tool module: one JSONL result per line.

The same line reader serves the nuclei results inside an Osmedeus package:
app/parser/osmedeus.py. Fields read: docs/data/schema.md, section Cột jsonb có
cấu trúc. Every field is checked for type, identifying fields for length, and
long evidence is cut: a line that does not fit is dropped and counted.

The finding sits on the asset `matched-at` names: an http(s) URL without its
query (a payload in the query must not become an asset), a `host:port`
service, an IP or a domain. `dedup_key` is the tool module name, then
`template-id` and `matched-at`: docs/data/database.md.
"""

import ipaddress
import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any, Final
from urllib.parse import urlsplit, urlunsplit

from app.asset.schemas import DomainRecord, IpRecord, ServiceRecord, UrlRecord
from app.finding.models import Severity
from app.finding.schemas import (
    MAX_EVIDENCE,
    MAX_HTTP_MESSAGE,
    MAX_TEXT,
    AssetRecord,
    FindingBatch,
    FindingRecord,
    clip,
    clip_list,
)
from app.parser.base import BATCH_RECORDS, Batch, Parser, ParseStats, dedup_key, read_lines

# nuclei reports `unknown` too; it has no column value, so it reads as info.
_SEVERITIES: Final = {severity.value: severity for severity in Severity}


class BadNucleiLineError(ValueError):
    """A line that is not a nuclei result: dropped and counted."""


def _text(value: object) -> str | None:
    return value.strip() or None if isinstance(value, str) else None


def _texts(value: object) -> list[str]:
    if isinstance(value, str):
        value = [value]
    if not isinstance(value, list):
        return []
    return [item.strip() for item in value if isinstance(item, str) and item.strip()]


def _object(value: object) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _is_ip(value: str) -> bool:
    try:
        ipaddress.ip_address(value.strip("[]"))
    except ValueError:
        return False
    return True


def _asset(matched_at: str, ip: str | None) -> AssetRecord:
    """The asset `matched-at` names. Raises ValueError when it names none."""
    if "://" in matched_at:
        parts = urlsplit(matched_at)
        if parts.scheme.lower() not in ("http", "https"):
            raise BadNucleiLineError
        return UrlRecord(url=urlunsplit((parts.scheme, parts.netloc, parts.path, "", "")))
    host, colon, port = matched_at.rpartition(":")
    if colon and port.isdigit() and host and not host.endswith(":"):
        host = host.strip("[]")
        address = host if _is_ip(host) else ip
        if address is not None and _is_ip(address):
            return ServiceRecord(address=address.strip("[]"), port=int(port))
        return DomainRecord(name=host)
    if _is_ip(matched_at):
        return IpRecord(address=matched_at.strip("[]"))
    return DomainRecord(name=matched_at)


def finding_from_line(line: str, tool_module: str) -> FindingRecord:
    """One nuclei JSONL line as a finding. Raises ValueError or ValidationError to drop it."""
    entry = json.loads(line)
    if not isinstance(entry, dict):
        raise BadNucleiLineError
    template_id = _text(entry.get("template-id"))
    matched_at = _text(entry.get("matched-at")) or _text(entry.get("host"))
    if template_id is None or matched_at is None:
        raise BadNucleiLineError
    info = _object(entry.get("info"))
    classification = _object(info.get("classification"))
    severity = _SEVERITIES.get((_text(info.get("severity")) or "").lower(), Severity.INFO)
    extracted = clip_list(_texts(entry.get("extracted-results")))
    cvss = classification.get("cvss-score")
    detail: dict[str, Any] = {
        "matcher": clip(_text(entry.get("matcher-name")), MAX_TEXT),
        "description": clip(_text(info.get("description")), MAX_TEXT),
        "remediation": clip(_text(info.get("remediation")), MAX_TEXT),
        "request": clip(_text(entry.get("request")), MAX_HTTP_MESSAGE),
        "response": clip(_text(entry.get("response")), MAX_HTTP_MESSAGE),
        # nuclei's own keys, beside the five every parser writes.
        "type": clip(_text(entry.get("type")), 64),
        "reference": clip_list(_texts(info.get("reference"))),
        "tags": clip_list(_texts(info.get("tags"))),
        "cwe": clip_list(_texts(classification.get("cwe-id"))),
        "cvss_score": cvss
        if isinstance(cvss, int | float) and not isinstance(cvss, bool)
        else None,
        "extracted_results": extracted,
    }
    cve = sorted({item.upper() for item in _texts(classification.get("cve-id")) if len(item) <= 32})
    return FindingRecord(
        dedup_key=dedup_key(tool_module, template_id, matched_at),
        name=_text(info.get("name")) or template_id,
        template_id=template_id,
        severity=severity,
        matched_at=matched_at,
        evidence=clip("\n".join(extracted), MAX_EVIDENCE),
        cve=cve[:20],
        detail=detail,
        asset=_asset(matched_at, _text(entry.get("ip"))),
    )


class NucleiParser(Parser):
    """`nuclei.jsonl`, and the `stdout.txt` / `stderr.txt` of the same job.

    stdout carries the same JSONL, which the dedup key absorbs; stderr lines
    are not JSON and are dropped.
    """

    tool_modules = ("nuclei",)

    def parse(self, path: Path, stats: ParseStats, tool_module: str) -> Iterator[Batch]:
        batch = FindingBatch()
        with path.open("rb") as stream:
            for line in read_lines(stream, stats):
                try:
                    batch.findings.append(finding_from_line(line, tool_module))
                except ValueError:
                    # pydantic's ValidationError is a ValueError too.
                    stats.dropped += 1
                    continue
                if len(batch) >= BATCH_RECORDS:
                    yield batch
                    batch = FindingBatch()
        if len(batch):
            yield batch
