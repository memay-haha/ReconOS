"""Parse one stored raw output into assets: docs/architecture/system.md, section
Luồng output thô và parse.

Runs in the background process, after the raw output is stored (G8). The file
is copied from MinIO to a private temporary file, read only; the object itself
is never written or deleted. The parse of one raw output is one transaction:
either every asset of the file is written and the row moves to `parsed`, or
nothing is written and the task retries.
"""

import tempfile
import time
import uuid
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
from pathlib import Path

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.asset import service as asset_service
from app.asset.schemas import IngestResult
from app.core.realtime import build_event, queue_event
from app.parser.base import ParseDataError, ParseStats
from app.parser.registry import parser_for
from app.raw_output import service as raw_output_service
from contracts.raw_output import ParseStatus

log = structlog.get_logger()

OpenStream = Callable[[str], AsyncIterator[bytes]]


@dataclass(frozen=True)
class ParseOutcome:
    status: ParseStatus | None
    found: IngestResult


async def _download(open_stream: OpenStream, object_key: str, directory: str) -> Path:
    path = Path(directory) / "raw_output"
    with path.open("wb") as handle:
        async for chunk in open_stream(object_key):
            handle.write(chunk)
    return path


async def parse_raw_output(
    session: AsyncSession,
    raw_output_id: uuid.UUID,
    *,
    open_stream: OpenStream = raw_output_service.open_stored,
) -> ParseOutcome:
    """Parse a `pending` raw output. Returns its new status, None when nothing was due.

    Raises ParseDataError when the file cannot be parsed; any other error is
    transient (database, MinIO) and the caller retries.
    """
    target = await raw_output_service.claim_for_parse(session, raw_output_id)
    if target is None:
        return ParseOutcome(status=None, found=IngestResult())
    structlog.contextvars.bind_contextvars(
        job_id=str(target.job_id), program_id=str(target.program_id), tool_module=target.tool_module
    )
    parser = parser_for(target.tool_module)
    if parser is None:
        await raw_output_service.finish_parse(session, raw_output_id, status=ParseStatus.NO_PARSER)
        return ParseOutcome(status=ParseStatus.NO_PARSER, found=IngestResult())
    started = time.monotonic()
    origin = asset_service.Provenance(
        program_id=target.program_id, job_id=target.job_id, raw_output_id=target.raw_output_id
    )
    rules = await asset_service.load_scope_rules(session, target.program_id)
    stats = ParseStats()
    found = IngestResult()
    with tempfile.TemporaryDirectory(prefix="reconos-parse-") as directory:
        path = await _download(open_stream, target.object_key, directory)
        for batch in parser.parse(path, stats):
            found = found.add(await asset_service.ingest(session, batch, origin, rules))
    await raw_output_service.finish_parse(session, raw_output_id, status=ParseStatus.PARSED)
    if found.total:
        # One event per parsed file, gathered by job on the browser side.
        queue_event(
            session,
            build_event(
                "asset.discovered",
                target.program_id,
                {"job_id": str(target.job_id), **found.model_dump()},
            ),
        )
    log.info(
        "parse_completed",
        raw_output_id=str(raw_output_id),
        lines=stats.lines,
        dropped=stats.dropped,
        skipped=stats.skipped_kinds,
        new_assets=found.model_dump(),
        duration_ms=int((time.monotonic() - started) * 1000),
    )
    return ParseOutcome(status=ParseStatus.PARSED, found=found)


async def mark_failed(session: AsyncSession, raw_output_id: uuid.UUID, reason: str) -> None:
    """Out of retries, or the file cannot be parsed: `failed` with a short reason."""
    await raw_output_service.finish_parse(
        session, raw_output_id, status=ParseStatus.FAILED, error=reason
    )


__all__ = ["ParseDataError", "ParseOutcome", "mark_failed", "parse_raw_output"]
