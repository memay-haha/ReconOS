"""Raw output: stored untouched before anything reads it (G8).

Upload order, which nothing may reverse: the bytes go to MinIO first, then the
metadata row with its SHA-256, then (when the tool module has a parser) the
parse task: docs/data/database.md, section Lưu output thô. Nothing here parses.
"""

import uuid
from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime

import structlog
from pydantic import ValidationError
from sqlalchemy import func, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import audit
from app.core.errors import (
    ConflictError,
    NotFoundError,
    PayloadTooLargeError,
    ValidationFailedError,
)
from app.core.identity import User
from app.core.pagination import MAX_LIMIT, Page, decode_time_cursor, encode_cursor
from app.core.security import program_visible_to
from app.core.storage import ObjectTooLargeError, get_object_stream, put_object_from_stream
from app.core.system_setting import get_int_setting
from app.core.tasks import PARSE_QUEUE, PARSE_RAW_OUTPUT_TASK, queue_task
from app.job import service as job_service
from app.job.models import Job
from app.program.models import Program, ProgramStatus
from app.raw_output.models import RawOutput
from app.raw_output.schemas import RawOutputResponse, RawOutputSort
from app.tool_module.models import ToolModule
from app.user.models import Worker
from contracts.raw_output import DEFAULT_CONTENT_TYPE, ParseStatus, RawOutputFile

log = structlog.get_logger()

RESOURCE = "raw_output"
MAX_CONTENT_TYPE_LENGTH = 255

# Tool modules that have a parser. The parser module sits one tier up, so it
# declares itself here at import through `register_parser`; raw_output never
# imports it: docs/architecture/dependency-graph.md.
_parsers: set[str] = set()


def register_parser(tool_module_name: str) -> None:
    _parsers.add(tool_module_name)


def has_parser(tool_module_name: str) -> bool:
    return tool_module_name in _parsers


def object_key(job: Job, filename: str) -> str:
    return f"{job.program_id}/{job.id}/{filename}"


def check_filename(filename: str) -> str:
    try:
        return RawOutputFile(filename=filename).filename
    except ValidationError as err:
        raise ValidationFailedError(
            detail="file name may hold only letters, digits, '.', '-', '_'",
            errors=[{"field": "filename", "code": "filename_invalid"}],
        ) from err


def _content_type(value: str | None) -> str:
    # Stored as metadata only; downloads are always served as an attachment.
    if not value or len(value) > MAX_CONTENT_TYPE_LENGTH or not value.isprintable():
        return DEFAULT_CONTENT_TYPE
    return value.split(";", 1)[0].strip() or DEFAULT_CONTENT_TYPE


async def store_upload(
    session: AsyncSession,
    *,
    worker: Worker,
    job_id: uuid.UUID,
    filename: str,
    content_type: str | None,
    content_length: int | None,
    chunks: AsyncIterator[bytes],
) -> tuple[RawOutput, bool]:
    """Store one uploaded file. Returns the row and whether it is new.

    A second upload under the same name changes nothing and answers 200, so a
    worker can retry after a network error: docs/integrations/external-services.md.
    """
    name = check_filename(filename)
    job = await job_service.require_upload_job(session, worker=worker, job_id=job_id)
    max_bytes = await get_int_setting(session, "upload_max_bytes")
    if content_length is not None and content_length > max_bytes:
        raise PayloadTooLargeError(detail="raw output file exceeds upload_max_bytes")
    # Two uploads of the same name queue here; the second then finds the row.
    await session.execute(
        select(func.pg_advisory_xact_lock(func.hashtextextended(f"{job.id}/{name}", 0)))
    )
    existing = await session.scalar(
        select(RawOutput).where(RawOutput.job_id == job.id, RawOutput.filename == name)
    )
    if existing is not None:
        return existing, False
    key = object_key(job, name)
    stored_type = _content_type(content_type)
    try:
        size, sha256 = await put_object_from_stream(
            key, chunks, content_type=stored_type, max_bytes=max_bytes
        )
    except ObjectTooLargeError as err:
        raise PayloadTooLargeError(detail="raw output file exceeds upload_max_bytes") from err
    tool_module_name = await session.scalar(
        select(ToolModule.name).where(ToolModule.id == job.tool_module_id)
    )
    parser = has_parser(tool_module_name or "")
    row = RawOutput(
        job_id=job.id,
        filename=name,
        object_key=key,
        content_type=stored_type,
        size_bytes=size,
        sha256=sha256,
        # Without a parser the file is still listed and downloadable (G8).
        parse_status=(ParseStatus.PENDING if parser else ParseStatus.NO_PARSER).value,
    )
    session.add(row)
    await session.flush()
    await session.refresh(row)
    if parser:
        # Sent after this transaction commits, so the parser always finds the
        # row and the object already stored (G8): app/core/tasks.py.
        _queue_parse(session, row.id)
    log.info(
        "raw_output_stored",
        job_id=str(job.id),
        raw_output_id=str(row.id),
        size_bytes=size,
        tool_module=tool_module_name,
    )
    return row, True


def _queue_parse(session: AsyncSession, raw_output_id: uuid.UUID) -> None:
    queue_task(
        session,
        PARSE_RAW_OUTPUT_TASK,
        queue=PARSE_QUEUE,
        kwargs={"raw_output_id": str(raw_output_id)},
    )


def _visible(viewer: User) -> object:
    return program_visible_to(viewer, Job.program_id)


async def list_for_job(
    session: AsyncSession,
    *,
    viewer: User,
    job_id: uuid.UUID,
    limit: int,
    cursor: str | None,
    sort: RawOutputSort = "created_at",
) -> Page[RawOutputResponse]:
    await job_service.get_visible_job(session, viewer=viewer, job_id=job_id)
    size = max(1, min(limit, MAX_LIMIT))
    descending = sort.startswith("-")
    stmt = select(RawOutput).where(RawOutput.job_id == job_id)
    if descending:
        stmt = stmt.order_by(RawOutput.created_at.desc(), RawOutput.id.desc())
    else:
        stmt = stmt.order_by(RawOutput.created_at.asc(), RawOutput.id.asc())
    if cursor is not None:
        seen_at, seen_id = decode_time_cursor(cursor)
        key = tuple_(RawOutput.created_at, RawOutput.id)
        stmt = stmt.where(key < (seen_at, seen_id) if descending else key > (seen_at, seen_id))
    rows = list(await session.scalars(stmt.limit(size + 1)))
    total = await session.scalar(
        select(func.count()).select_from(RawOutput).where(RawOutput.job_id == job_id)
    )
    page_rows = rows[:size]
    next_cursor = (
        encode_cursor(page_rows[-1].created_at.isoformat(), page_rows[-1].id)
        if len(rows) > size
        else None
    )
    return Page[RawOutputResponse](
        items=[RawOutputResponse.model_validate(row) for row in page_rows],
        next_cursor=next_cursor,
        total=total or 0,
    )


async def get_raw_output(
    session: AsyncSession, *, viewer: User, raw_output_id: uuid.UUID
) -> tuple[RawOutput, uuid.UUID]:
    """The row and its program, or 404 when the viewer may not see the job."""
    row = (
        await session.execute(
            select(RawOutput, Job.program_id)
            .join(Job, Job.id == RawOutput.job_id)
            .where(RawOutput.id == raw_output_id, program_visible_to(viewer, Job.program_id))
        )
    ).first()
    if row is None:
        raise NotFoundError(detail="raw output does not exist")
    return row[0], row[1]


async def describe_many(
    session: AsyncSession, *, viewer: User, ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, RawOutputResponse]:
    """Metadata of the visible raw outputs among `ids`, for evidence references (G6).

    Only the row is read: the stored object is never opened or changed (G8).
    """
    if not ids:
        return {}
    rows = await session.scalars(
        select(RawOutput)
        .join(Job, Job.id == RawOutput.job_id)
        .where(RawOutput.id.in_(list(set(ids))), program_visible_to(viewer, Job.program_id))
    )
    return {row.id: RawOutputResponse.model_validate(row) for row in rows}


async def open_content(
    session: AsyncSession, *, viewer: User, raw_output_id: uuid.UUID
) -> tuple[RawOutput, AsyncIterator[bytes]]:
    """The stored bytes as a stream, exactly as uploaded. Each download is audited (G7)."""
    row, program_id = await get_raw_output(session, viewer=viewer, raw_output_id=raw_output_id)
    await audit.record(
        session,
        action="raw_output_downloaded",
        user_id=viewer.id,
        program_id=program_id,
        resource_type=RESOURCE,
        resource_id=row.id,
    )
    return row, get_object_stream(row.object_key)


async def request_reparse(session: AsyncSession, *, actor: User, raw_output_id: uuid.UUID) -> None:
    """Parse the stored file again: docs/data/database.md, section Lưu output thô.

    The object in MinIO is left as it is. A tool module without a parser and
    the read-only data of an archived program answer 409.
    """
    row, program_id = await get_raw_output(session, viewer=actor, raw_output_id=raw_output_id)
    found = (
        await session.execute(
            select(ToolModule.name, Program.status)
            .join(Job, Job.tool_module_id == ToolModule.id)
            .join(Program, Program.id == Job.program_id)
            .where(Job.id == row.job_id)
        )
    ).one()
    tool_module_name, program_status = found
    if program_status == ProgramStatus.ARCHIVED:
        raise ConflictError(detail="program is archived and read only")
    if not has_parser(tool_module_name):
        raise ConflictError(detail="the tool module of this raw output has no parser")
    row.parse_status = ParseStatus.PENDING.value
    row.parse_error = None
    row.parsed_at = None
    await session.flush()
    _queue_parse(session, row.id)
    await audit.record(
        session,
        action="raw_output_reparse_requested",
        user_id=actor.id,
        program_id=program_id,
        resource_type=RESOURCE,
        resource_id=row.id,
    )


# ---------------------------------------------------------------- parse bookkeeping


@dataclass(frozen=True)
class ParseTarget:
    """What the parser needs about one stored file. Read by the parse task."""

    raw_output_id: uuid.UUID
    object_key: str
    job_id: uuid.UUID
    program_id: uuid.UUID
    tool_module: str
    filename: str


async def claim_for_parse(session: AsyncSession, raw_output_id: uuid.UUID) -> ParseTarget | None:
    """Lock a `pending` raw output for this parse, or None when there is nothing to do.

    A task delivered twice, or one whose row a reparse already finished, finds
    the row in another state and stops: the parse runs once per request.
    """
    found = (
        await session.execute(
            select(RawOutput, Job.program_id, ToolModule.name)
            .join(Job, Job.id == RawOutput.job_id)
            .join(ToolModule, ToolModule.id == Job.tool_module_id)
            .where(
                RawOutput.id == raw_output_id,
                RawOutput.parse_status == ParseStatus.PENDING.value,
            )
            .with_for_update(of=RawOutput)
        )
    ).first()
    if found is None:
        return None
    row, program_id, tool_module_name = found
    return ParseTarget(
        raw_output_id=row.id,
        object_key=row.object_key,
        job_id=row.job_id,
        program_id=program_id,
        tool_module=tool_module_name,
        filename=row.filename,
    )


async def ids_by_filename(
    session: AsyncSession, job_id: uuid.UUID, filenames: set[str]
) -> dict[str, uuid.UUID]:
    """Raw outputs of one job by file name: a parser links the files a line names."""
    if not filenames:
        return {}
    rows = await session.execute(
        select(RawOutput.filename, RawOutput.id).where(
            RawOutput.job_id == job_id, RawOutput.filename.in_(sorted(filenames))
        )
    )
    return {str(filename): row_id for filename, row_id in rows.tuples()}


# Short English reason kept in parse_error; never a path or a value from the file.
MAX_PARSE_ERROR_LENGTH = 500


async def finish_parse(
    session: AsyncSession,
    raw_output_id: uuid.UUID,
    *,
    status: ParseStatus,
    error: str | None = None,
) -> None:
    """Record the outcome. Only a `pending` row moves, so a late duplicate changes nothing."""
    row = await session.scalar(
        select(RawOutput)
        .where(RawOutput.id == raw_output_id, RawOutput.parse_status == ParseStatus.PENDING.value)
        .with_for_update()
    )
    if row is None:
        return
    row.parse_status = status.value
    row.parse_error = error[:MAX_PARSE_ERROR_LENGTH] if error else None
    row.parsed_at = datetime.now(UTC) if status is ParseStatus.PARSED else None
    await session.flush()


def open_stored(object_key: str) -> AsyncIterator[bytes]:
    """The stored bytes, read only. The parser never writes or deletes the object (G8)."""
    return get_object_stream(object_key)
