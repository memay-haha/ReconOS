"""Parser of the `dalfox` tool module: `dalfox.jsonl`, one JSON object per line.

dalfox v3 writes a `{"meta": ...}` line first, then one finding per line:
docs/integrations/external-services.md. The meta line and any line without the
finding fields are skipped. `stdout.txt` carries the same lines under
`--silence`, which the dedup key absorbs; `stderr.txt` lines are not JSON and
are dropped.

The finding sits on the URL of the PoC without its query, since the query
holds the payload. `dedup_key` is the tool module name, then the finding label
(`inject_type`), that URL and the parameter: docs/data/database.md.
"""

import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any, Final
from urllib.parse import urlsplit, urlunsplit

from app.asset.schemas import UrlRecord
from app.finding.models import Severity
from app.finding.schemas import (
    MAX_EVIDENCE,
    MAX_HTTP_MESSAGE,
    MAX_MATCHED_AT,
    MAX_TEXT,
    FindingBatch,
    FindingRecord,
    clip,
)
from app.parser.base import BATCH_RECORDS, Batch, Parser, ParseStats, dedup_key, read_lines

_SEVERITIES: Final = {severity.value: severity for severity in Severity}
# dalfox finding tiers: Vulnerable, AST-detected (DOM), Reflected, Informational.
_TIERS: Final = {"V": "Verified", "A": "DOM", "R": "Reflected", "I": "Informational"}
_DEFAULT_SEVERITY: Final = {
    "V": Severity.HIGH,
    "A": Severity.MEDIUM,
    "R": Severity.MEDIUM,
    "I": Severity.INFO,
}
MAX_LABEL: Final = 128
MAX_PARAM: Final = 255


class _BadLineError(ValueError):
    """A line that is not a dalfox finding: dropped and counted."""


class _MetaLineError(ValueError):
    """The scan envelope line: skipped, not a malformed line."""


def _text(value: object, limit: int) -> str | None:
    if not isinstance(value, str):
        return None
    value = value.strip()
    if not value or len(value) > limit:
        return None
    return value


def _long(value: object, limit: int) -> str | None:
    """Evidence text: cut to `limit` rather than dropped."""
    return clip(value, limit) if isinstance(value, str) else None


def finding_from_line(line: str, tool_module: str) -> FindingRecord:
    """One dalfox JSONL line as a finding. Raises ValueError or ValidationError to drop it."""
    entry = json.loads(line)
    if not isinstance(entry, dict):
        raise _BadLineError
    if "meta" in entry and "type" not in entry:
        raise _MetaLineError
    tier = _text(entry.get("type"), 1)
    label = _text(entry.get("inject_type"), MAX_LABEL)
    poc = _text(entry.get("data"), MAX_MATCHED_AT)
    if tier not in _TIERS or label is None or poc is None:
        raise _BadLineError
    parts = urlsplit(poc)
    if parts.scheme.lower() not in ("http", "https") or not parts.netloc:
        raise _BadLineError
    url = urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))
    # An informational finding (an outdated library) has no parameter.
    param = _text(entry.get("param"), MAX_PARAM) or ""
    severity = _SEVERITIES.get(
        (_text(entry.get("severity"), 16) or "").lower(), _DEFAULT_SEVERITY[tier]
    )
    cwe = _text(entry.get("cwe"), 32)
    detail: dict[str, Any] = {
        "matcher": _text(entry.get("detection_method"), 64),
        "description": _long(entry.get("message_str"), MAX_TEXT),
        "remediation": None,
        "request": _long(entry.get("request"), MAX_HTTP_MESSAGE),
        "response": _long(entry.get("response"), MAX_HTTP_MESSAGE),
        # dalfox's own keys, beside the five every parser writes.
        "type": tier,
        "inject_type": label,
        "method": _text(entry.get("method"), 16),
        "param": param or None,
        "location": _text(entry.get("location"), 32),
        "payload": _long(entry.get("payload"), MAX_TEXT),
        "confidence": _text(entry.get("confidence"), 16),
        "cwe": [cwe] if cwe else [],
    }
    subject = f"{param} " if param else ""
    return FindingRecord(
        dedup_key=dedup_key(tool_module, label, url, param),
        name=f"{_TIERS[tier]} XSS: {subject}({label})"
        if tier != "I"
        else f"Informational: {label}",
        template_id=None,
        severity=severity,
        matched_at=poc,
        evidence=_long(entry.get("evidence"), MAX_EVIDENCE),
        detail=detail,
        asset=UrlRecord(url=url),
    )


class DalfoxParser(Parser):
    tool_modules = ("dalfox",)

    def parse(self, path: Path, stats: ParseStats, tool_module: str) -> Iterator[Batch]:
        batch = FindingBatch()
        with path.open("rb") as stream:
            for line in read_lines(stream, stats):
                try:
                    batch.findings.append(finding_from_line(line, tool_module))
                except _MetaLineError:
                    stats.skip("meta")
                    continue
                except ValueError:
                    # pydantic's ValidationError is a ValueError too.
                    stats.dropped += 1
                    continue
                if len(batch) >= BATCH_RECORDS:
                    yield batch
                    batch = FindingBatch()
        if len(batch):
            yield batch
