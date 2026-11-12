"""Base class of every parser: backend/CLAUDE.md, section Parser.

A parser turns one stored raw output into batches of records: assets for the
asset service, findings for the finding service. It never sees
the database or MinIO: the parser service downloads the file to a private
temporary copy, hands the parser that path, and writes what it yields. So a
parser cannot change the stored object (G8).

Raw output is untrusted: a parser checks types and lengths through the ingest
records of app/asset/schemas.py and app/finding/schemas.py and drops a line
that does not fit, reads line
by line, and stops at the limits below: .claude/rules/security.md.
"""

import hashlib
from abc import ABC, abstractmethod
from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import ClassVar, Protocol

from app.asset.schemas import IngestBatch
from app.finding.schemas import FindingBatch

# Records per yielded batch: the asset service upserts each batch in bulk.
BATCH_RECORDS = 1000
# One line of JSONL or text longer than this is dropped, not read into memory.
MAX_LINE_BYTES = 1024 * 1024
# Bytes read out of one archive, whatever its headers claim.
MAX_UNPACKED_BYTES = 2 * 1024 * 1024 * 1024
# Members of one archive.
MAX_ARCHIVE_MEMBERS = 100_000

# What a parser yields: assets, or findings with the asset each sits on.
Batch = IngestBatch | FindingBatch


class ParseDataError(Exception):
    """The file itself cannot be parsed: a retry would give the same result.

    The message is a short English reason with no path and no value from the
    file, because it is stored in `raw_output.parse_error` and shown on S10.
    """


@dataclass
class ParseStats:
    """Counters for the parse log. Never the content: .claude/rules/logging.md."""

    lines: int = 0
    dropped: int = 0
    skipped_kinds: dict[str, int] = field(default_factory=dict)

    def skip(self, kind: str) -> None:
        self.skipped_kinds[kind] = self.skipped_kinds.get(kind, 0) + 1


class Parser(ABC):
    """One parser per tool module file; one class may serve several tool modules."""

    # Tool module names this parser reads, as registered in contracts/.
    tool_modules: ClassVar[tuple[str, ...]]

    @abstractmethod
    def parse(self, path: Path, stats: ParseStats, tool_module: str) -> Iterator[Batch]:
        """Yield batches of records found in the file at `path`.

        `tool_module` is the tool module of the job, one of `tool_modules`: it
        opens every `dedup_key` the parser computes.
        """


def dedup_key(tool_module: str, *parts: str) -> str:
    """Deduplication key of a finding: the tool module name, then a digest of its parts.

    The name comes first so two tools never share a key: docs/data/database.md.
    The digest keeps the key short whatever the length of a matched URL.
    """
    digest = hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()
    return f"{tool_module}:{digest}"


class Readable(Protocol):
    def readline(self, size: int = -1, /) -> bytes: ...


def read_lines(stream: Readable, stats: ParseStats) -> Iterator[str]:
    """Decoded lines of a binary stream, dropping any line over MAX_LINE_BYTES."""
    readline = stream.readline
    while True:
        raw: bytes = readline(MAX_LINE_BYTES + 1)
        if not raw:
            return
        if len(raw) > MAX_LINE_BYTES and not raw.endswith(b"\n"):
            stats.dropped += 1
            # Drain the rest of the oversized line.
            while raw and not raw.endswith(b"\n"):
                raw = readline(MAX_LINE_BYTES)
            continue
        stats.lines += 1
        text = raw.decode("utf-8", errors="replace").strip()
        if text:
            yield text
