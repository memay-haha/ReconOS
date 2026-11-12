"""File formats of `GET /<asset>/export`: docs/api/architecture.md, section Xuất dữ liệu.

Asset values come from targets and tools, so they are untrusted. A CSV cell
that a spreadsheet would read as a formula gets a leading `'`, and a Markdown
cell has its pipes and line breaks escaped: .claude/rules/security.md.
"""

import csv
import io
import json
from collections.abc import Iterable, Iterator, Mapping, Sequence
from typing import Any

from app.asset.schemas import ExportFormat

_FORMULA_START = ("=", "+", "-", "@", "\t", "\r")
MEDIA_TYPES: dict[str, str] = {
    "csv": "text/csv; charset=utf-8",
    "jsonl": "application/x-ndjson",
    "md": "text/markdown; charset=utf-8",
}


def _text(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return " ".join(_text(item) for item in value)
    if hasattr(value, "isoformat"):
        return str(value.isoformat())
    return str(value)


def _csv_cell(value: object) -> str:
    text = _text(value)
    return f"'{text}" if text.startswith(_FORMULA_START) else text


def _md_cell(value: object) -> str:
    return (
        _text(value).replace("\\", "\\\\").replace("|", "\\|").replace("\r", " ").replace("\n", " ")
    )


def _json_ready(value: object) -> object:
    if value is None or isinstance(value, str | int | float | bool):
        return value
    if isinstance(value, list):
        return [_json_ready(item) for item in value]
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def render(
    fmt: ExportFormat, columns: Sequence[str], rows: Iterable[Mapping[str, Any]]
) -> Iterator[str]:
    """Yield the file in pieces, one row at a time."""
    if fmt == "jsonl":
        for row in rows:
            yield json.dumps({name: _json_ready(row.get(name)) for name in columns}) + "\n"
        return
    if fmt == "md":
        yield "| " + " | ".join(columns) + " |\n"
        yield "|" + "---|" * len(columns) + "\n"
        for row in rows:
            yield "| " + " | ".join(_md_cell(row.get(name)) for name in columns) + " |\n"
        return
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(columns)
    for row in rows:
        writer.writerow([_csv_cell(row.get(name)) for name in columns])
        yield buffer.getvalue()
        buffer.seek(0)
        buffer.truncate()
    remaining = buffer.getvalue()
    if remaining:
        yield remaining


def filename(resource: str, fmt: ExportFormat) -> str:
    return f"{resource}.{fmt}"
