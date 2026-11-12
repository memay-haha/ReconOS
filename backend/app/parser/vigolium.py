"""Parser of the `vigolium` tool module: one finding object per JSONL line.

The runner copies each object of `GET /api/findings` for its scan as one line
of `vigolium-findings.jsonl`: docs/integrations/external-services.md. Fields
read: docs/data/schema.md, section Cột jsonb có cấu trúc. Every field is checked
for type, identifying fields for length, and long evidence is cut: a line that
does not fit is dropped and counted.

The finding sits on the asset its first `matched_at` names, the same way as a
nuclei finding (`asset_of`). `dedup_key` is the tool module name, then
Vigolium's `finding_hash`; a line without one falls back to the fields Vigolium
merges duplicates on: `module_id`, `severity` and the matched URL.
"""

import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any, Final

from app.finding.models import Severity
from app.finding.schemas import (
    MAX_EVIDENCE,
    MAX_HTTP_MESSAGE,
    MAX_TEXT,
    FindingBatch,
    FindingRecord,
    clip,
    clip_list,
)
from app.parser.base import BATCH_RECORDS, Batch, Parser, ParseStats, dedup_key, read_lines
from app.parser.nuclei import asset_of

_SEVERITIES: Final = {severity.value: severity for severity in Severity}
# Vigolium tags a CVE check with its id, lower case.
_CVE_PREFIX: Final = "cve-"
_CVE_MAX: Final = 32
_HASH_MAX: Final = 128


class BadVigoliumLineError(ValueError):
    """A line that is not a Vigolium finding: dropped and counted."""


def _text(value: object) -> str | None:
    return value.strip() or None if isinstance(value, str) else None


def _texts(value: object) -> list[str]:
    if isinstance(value, str):
        value = [value]
    if not isinstance(value, list):
        return []
    return [item.strip() for item in value if isinstance(item, str) and item.strip()]


def finding_from_line(line: str, tool_module: str) -> FindingRecord:
    """One Vigolium finding as a finding. Raises ValueError or ValidationError to drop it."""
    entry = json.loads(line)
    if not isinstance(entry, dict):
        raise BadVigoliumLineError
    module_id = _text(entry.get("module_id"))
    matched = _texts(entry.get("matched_at"))
    if module_id is None or not matched:
        raise BadVigoliumLineError
    matched_at = matched[0]
    severity_text = (_text(entry.get("severity")) or "").lower()
    severity = _SEVERITIES.get(severity_text, Severity.INFO)
    finding_hash = _text(entry.get("finding_hash"))
    if finding_hash is not None and len(finding_hash) > _HASH_MAX:
        raise BadVigoliumLineError
    key = (
        dedup_key(tool_module, finding_hash)
        if finding_hash is not None
        else dedup_key(tool_module, module_id, severity_text, matched_at)
    )
    tags = _texts(entry.get("tags"))
    extracted = clip_list(_texts(entry.get("extracted_results")))
    detail: dict[str, Any] = {
        "matcher": None,
        "description": clip(_text(entry.get("description")), MAX_TEXT),
        "remediation": None,
        "request": clip(_text(entry.get("request")), MAX_HTTP_MESSAGE),
        "response": clip(_text(entry.get("response")), MAX_HTTP_MESSAGE),
        # Vigolium's own keys, beside the five every parser writes.
        "module_type": clip(_text(entry.get("module_type")), 32),
        "module_short": clip(_text(entry.get("module_short")), MAX_TEXT),
        "finding_source": clip(_text(entry.get("finding_source")), 64),
        "confidence": clip(_text(entry.get("confidence")), 32),
        "finding_hash": finding_hash,
        "matched_at": clip_list(matched),
        "tags": clip_list(tags),
        "extracted_results": extracted,
        "additional_evidence": [
            clip(item, MAX_HTTP_MESSAGE) for item in _texts(entry.get("additional_evidence"))[:5]
        ],
    }
    cve = sorted(
        {
            tag.upper()
            for tag in tags
            if tag.lower().startswith(_CVE_PREFIX) and len(tag) <= _CVE_MAX
        }
    )
    return FindingRecord(
        dedup_key=key,
        name=_text(entry.get("module_name")) or module_id,
        template_id=module_id,
        severity=severity,
        matched_at=matched_at,
        evidence=clip("\n".join(extracted), MAX_EVIDENCE),
        cve=cve[:20],
        detail=detail,
        asset=asset_of(matched_at, None),
    )


class VigoliumParser(Parser):
    """`vigolium-findings.jsonl`; any other line of the job's files is dropped."""

    tool_modules = ("vigolium",)

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
