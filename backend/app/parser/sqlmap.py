"""Parser of the `sqlmap` tool module: the `results.csv` inside `sqlmap.zip`.

The runner packs sqlmap's CSV results file at the package root and the output
folder under `output/`: docs/integrations/external-services.md. The parser opens
only the member named exactly `results.csv`, never extracts to disk, and reads
it line by line under the archive byte budget. One CSV row is one injectable
parameter: `Target URL,Place,Parameter,Technique(s),Note(s)`.

`stdout.txt` and `stderr.txt` of the same job are logs, not results: a file
that is not a zip yields nothing. `dedup_key` is the tool module name, then
the URL, the place with the parameter, and the techniques: docs/data/database.md.
"""

import csv
import zipfile
from collections.abc import Iterator
from pathlib import Path
from typing import Any, Final
from urllib.parse import urlsplit, urlunsplit

from app.asset.schemas import UrlRecord
from app.finding.models import Severity
from app.finding.schemas import MAX_MATCHED_AT, MAX_TEXT, FindingBatch, FindingRecord, clip
from app.parser.base import (
    BATCH_RECORDS,
    MAX_ARCHIVE_MEMBERS,
    MAX_UNPACKED_BYTES,
    Batch,
    ParseDataError,
    Parser,
    ParseStats,
    dedup_key,
    read_lines,
)

RESULTS_MEMBER: Final = "results.csv"
HEADER: Final = ("Target URL", "Place", "Parameter", "Technique(s)", "Note(s)")
TOO_MANY_MEMBERS: Final = "package has too many members"
TOO_LARGE: Final = "package unpacks past the size limit"
NOT_ZIP: Final = "package is not a valid zip"
ZIP_MAGIC: Final = b"PK\x03\x04"
# Places sqlmap tests a parameter in.
_PLACES: Final = frozenset({"GET", "POST", "URI", "Cookie", "User-Agent", "Referer", "Host"})
_TECHNIQUES: Final = frozenset("BEUSTQ")
_TECHNIQUE_NAMES: Final = {
    "B": "boolean-based blind",
    "E": "error-based",
    "U": "UNION query",
    "S": "stacked queries",
    "T": "time-based blind",
    "Q": "inline query",
}
MAX_PARAMETER: Final = 255


class _BadRowError(ValueError):
    """A CSV row that is not a sqlmap result: dropped and counted."""


class _Budget:
    """Reads `results.csv` and charges every byte to the archive budget."""

    def __init__(self, stream: Any, limit: int) -> None:  # noqa: ANN401  a zip member stream
        self._stream = stream
        self.left = limit

    def readline(self, size: int = -1, /) -> bytes:
        line: bytes = self._stream.readline(size)
        self.left -= len(line)
        if self.left < 0:
            raise ParseDataError(TOO_LARGE)
        return line


def _url_asset(url: str) -> UrlRecord:
    parts = urlsplit(url)
    if parts.scheme.lower() not in ("http", "https") or not parts.netloc:
        raise _BadRowError
    # The query carries the tested value, sometimes a payload: never an asset.
    return UrlRecord(url=urlunsplit((parts.scheme, parts.netloc, parts.path, "", "")))


def finding_from_row(row: list[str], tool_module: str) -> FindingRecord:
    """One CSV row as a finding. Raises ValueError or ValidationError to drop it."""
    if len(row) != len(HEADER):
        raise _BadRowError
    url, place, parameter, techniques, notes = (cell.strip() for cell in row)
    if (
        not url
        or len(url) > MAX_MATCHED_AT
        or place not in _PLACES
        or not parameter
        or len(parameter) > MAX_PARAMETER
        or not techniques
        or not set(techniques) <= _TECHNIQUES
    ):
        raise _BadRowError
    unexploitable = "false positive" in notes.lower() or "unexploitable" in notes.lower()
    names = [_TECHNIQUE_NAMES[letter] for letter in techniques]
    detail: dict[str, Any] = {
        "matcher": None,
        "description": clip(
            f"{place} parameter '{parameter}' is injectable: {', '.join(names)}.", MAX_TEXT
        ),
        "remediation": None,
        "request": None,
        "response": None,
        # sqlmap's own keys, beside the five every parser writes.
        "place": place,
        "parameter": parameter,
        "techniques": list(techniques),
        "notes": clip(notes, MAX_TEXT),
    }
    return FindingRecord(
        dedup_key=dedup_key(tool_module, url, f"{place}:{parameter}", techniques),
        name=f"SQL injection: {place} parameter {parameter}",
        template_id=None,
        # sqlmap marks a result it could not exploit; it stays for triage, lower.
        severity=Severity.LOW if unexploitable else Severity.HIGH,
        matched_at=url,
        evidence=clip(", ".join(names), 4096),
        detail=detail,
        asset=_url_asset(url),
    )


class SqlmapParser(Parser):
    tool_modules = ("sqlmap",)

    def parse(self, path: Path, stats: ParseStats, tool_module: str) -> Iterator[Batch]:
        with path.open("rb") as handle:
            if handle.read(len(ZIP_MAGIC)) != ZIP_MAGIC:
                # stdout.txt, stderr.txt: sqlmap's log, the results live in the package.
                return
        try:
            archive = zipfile.ZipFile(path)
        except (zipfile.BadZipFile, OSError) as err:
            raise ParseDataError(NOT_ZIP) from err
        with archive:
            names = archive.namelist()
            if len(names) > MAX_ARCHIVE_MEMBERS:
                raise ParseDataError(TOO_MANY_MEMBERS)
            if RESULTS_MEMBER not in names:
                return
            batch = FindingBatch()
            with archive.open(RESULTS_MEMBER) as member:
                for line in read_lines(_Budget(member, MAX_UNPACKED_BYTES), stats):
                    try:
                        row = next(csv.reader([line]))
                        if tuple(cell.strip() for cell in row) == HEADER:
                            continue
                        batch.findings.append(finding_from_row(row, tool_module))
                    except ValueError, csv.Error:
                        # pydantic's ValidationError is a ValueError too.
                        stats.dropped += 1
                        continue
                    if len(batch) >= BATCH_RECORDS:
                        yield batch
                        batch = FindingBatch()
            if len(batch):
                yield batch
