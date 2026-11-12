"""Screenshots written by the gowitness parser, read on S06 and S07.

Tier 6: calls asset and job below it, reads `raw_output` (same tier) by table
name only: docs/architecture/dependency-graph.md. The image stays a raw output
in MinIO and is streamed by this module, never by a MinIO URL (G8). Every read
filters `deleted_at IS NULL`: docs/decisions/adr-soft-delete.md.
"""

import hashlib
import json
import uuid
from collections.abc import AsyncIterator, Iterator, Sequence
from dataclasses import dataclass, replace
from datetime import datetime
from typing import Any, Final

import structlog
from sqlalchemy import (
    Boolean,
    ColumnElement,
    Text,
    and_,
    case,
    cast,
    column,
    exists,
    func,
    literal_column,
    or_,
    select,
    table,
    tuple_,
)
from sqlalchemy.dialects.postgresql import ARRAY, array, insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.asset import service as asset_service
from app.asset.models import Technology, Url, UrlTechnology
from app.asset.schemas import IngestBatch, IngestResult
from app.core import audit
from app.core.errors import ConflictError, NotFoundError
from app.core.identity import User
from app.core.pagination import (
    MAX_LIMIT,
    Page,
    decode_cursor,
    decode_time_cursor,
    encode_cursor,
)
from app.core.security import program_visible_to
from app.core.storage import get_object_stream
from app.job.models import Job
from app.program.models import Program, ProgramStatus
from app.scope.matching import Rule
from app.screenshot.models import Screenshot
from app.screenshot.schemas import (
    SECURITY_HEADERS,
    ScreenshotBatch,
    ScreenshotDetailResponse,
    ScreenshotIngestResult,
    ScreenshotNetworkResponse,
    ScreenshotResponse,
    ScreenshotSort,
    ScreenshotSummaryResponse,
    ScreenshotTechnology,
    StatusClass,
    StatusCodeCounts,
)
from app.user.models import Worker
from contracts.job_status import JobStatus

log = structlog.get_logger()

RESOURCE = "screenshot"
UPSERT_CHUNK = 500
# Image formats served by GET /screenshots/{id}/image, by leading bytes. The
# stored content type came from the worker and is not trusted.
_IMAGE_SIGNATURES: Final = (
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
)
_SIGNATURE_BYTES: Final = 8
# gowitness captures at device scale 1: Chrome's default, never changed by the runner.
DEVICE_SCALE: Final = 1.0

# raw_output sits on the same tier: read by table name, never imported.
_raw_output = table(
    "raw_output",
    column("id"),
    column("job_id"),
    column("object_key"),
)


# ---------------------------------------------------------------- ingest


async def _viewport(
    session: AsyncSession, job_id: uuid.UUID | None
) -> tuple[int | None, int | None]:
    """Window size of the capture: the job parameters the runner passed to Chrome."""
    if job_id is None:
        return None, None
    params = await session.scalar(select(Job.params).where(Job.id == job_id))
    params = params or {}
    width, height = params.get("window_width"), params.get("window_height")
    return (
        width if isinstance(width, int) else None,
        height if isinstance(height, int) else None,
    )


async def ingest(
    session: AsyncSession,
    batch: ScreenshotBatch,
    origin: asset_service.Provenance,
    rules: Sequence[Rule],
    *,
    images: dict[str, uuid.UUID],
    html_raw_output_id: uuid.UUID,
) -> tuple[ScreenshotIngestResult, IngestResult]:
    """Write one batch of captures and the URLs they show.

    `images` maps the PNG file names of the job to their raw output rows. The
    URL goes through the asset service first, so a screenshot always links an
    existing row. The transaction belongs to the caller.
    """
    urls = [record.url for record in batch.screenshots]
    assets = await asset_service.ingest(session, IngestBatch(urls=urls), origin, rules)
    located = await asset_service.locate(session, origin.program_id, urls)
    width, height = await _viewport(session, origin.job_id)
    rows: dict[uuid.UUID, dict[str, Any]] = {}
    dropped = 0
    for record, place in zip(batch.screenshots, located, strict=True):
        if place is None:
            dropped += 1
            continue
        image_id = images.get(record.image_filename) if record.image_filename else None
        rows[place.asset_id] = {
            "program_id": origin.program_id,
            "url_id": place.asset_id,
            "job_id": origin.job_id,
            "raw_output_id": image_id,
            "html_raw_output_id": html_raw_output_id if record.html else None,
            "final_url": record.final_url,
            "status_code": record.status_code,
            "title": record.title,
            "perception_hash": record.perception_hash,
            "http_headers": record.http_headers,
            "width": width,
            "height": height,
            "device_scale": DEVICE_SCALE,
            "remote_ip": record.remote_ip,
            "duration_ms": record.duration_ms,
            "tls": record.tls,
            "network_log": record.network_log,
            "console_log": record.console_log,
            "cookies": record.cookies,
            "html": record.html,
            # No image to show is a failed capture, whatever gowitness reported.
            "is_failed": record.is_failed or image_id is None,
            "error_message": record.error_message
            or (None if image_id or record.is_failed else "screenshot image was not uploaded"),
            "captured_at": record.captured_at or func.now(),
        }
    created = updated = 0
    ordered = [rows[key] for key in sorted(rows)]
    for start in range(0, len(ordered), UPSERT_CHUNK):
        chunk = ordered[start : start + UPSERT_CHUNK]
        upsert = insert(Screenshot).values(chunk)
        # Every column but the keys and deleted_at: a soft delete survives a reparse.
        kept = {"id", "program_id", "url_id", "job_id", "deleted_at"}
        stmt = upsert.on_conflict_do_update(
            index_elements=[Screenshot.job_id, Screenshot.url_id],
            set_={
                name: upsert.excluded[name]
                for name in Screenshot.__table__.columns.keys()  # noqa: SIM118  ColumnCollection
                if name not in kept
            },
        ).returning(literal_column("(xmax = 0)", Boolean))
        for (is_new,) in await session.execute(stmt):
            if is_new:
                created += 1
            else:
                updated += 1
    return ScreenshotIngestResult(created=created, updated=updated, dropped=dropped), assets


# ---------------------------------------------------------------- filters


@dataclass(frozen=True)
class ScreenshotFilter:
    program_id: uuid.UUID | None = None
    domain_id: uuid.UUID | None = None
    is_failed: bool | None = None
    q: str | None = None
    technology_id: Sequence[uuid.UUID] | None = None
    status_code: Sequence[StatusClass] | None = None
    job_id: uuid.UUID | None = None


def _like_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _status_class(name: StatusClass) -> ColumnElement[bool]:
    low = int(name[0]) * 100
    return and_(Screenshot.status_code >= low, Screenshot.status_code < low + 100)


def _where(viewer: User, flt: ScreenshotFilter) -> ColumnElement[bool]:
    clauses: list[ColumnElement[bool]] = [
        Screenshot.deleted_at.is_(None),
        program_visible_to(viewer, Screenshot.program_id),
    ]
    if flt.program_id is not None:
        clauses.append(Screenshot.program_id == flt.program_id)
    if flt.job_id is not None:
        clauses.append(Screenshot.job_id == flt.job_id)
    if flt.is_failed is not None:
        clauses.append(Screenshot.is_failed.is_(flt.is_failed))
    if flt.domain_id is not None:
        clauses.append(Screenshot.url_id.in_(select(Url.id).where(Url.domain_id == flt.domain_id)))
    if flt.technology_id:
        clauses.append(
            exists(
                select(UrlTechnology.url_id).where(
                    UrlTechnology.url_id == Screenshot.url_id,
                    UrlTechnology.technology_id.in_(list(flt.technology_id)),
                )
            )
        )
    if flt.status_code:
        clauses.append(or_(*(_status_class(name) for name in flt.status_code)))
    if flt.q:
        pattern = f"%{_like_escape(flt.q)}%"
        clauses.append(
            or_(
                Screenshot.title.ilike(pattern, escape="\\"),
                Screenshot.final_url.ilike(pattern, escape="\\"),
            )
        )
    return and_(*clauses)


# ---------------------------------------------------------------- list rows


async def _groups(
    session: AsyncSession, where: ColumnElement[bool]
) -> dict[str, tuple[int | None, int]]:
    """Look-alike groups of the filtered rows: number and size per `perception_hash`.

    Groups of two or more are numbered by their earliest capture (M15); a hash
    seen once is unique and gets no number.
    """
    grouped = (
        select(
            Screenshot.perception_hash.label("hash"),
            func.count().label("size"),
            func.min(Screenshot.captured_at).label("first"),
        )
        .where(where, Screenshot.perception_hash.is_not(None))
        .group_by(Screenshot.perception_hash)
        .subquery()
    )
    numbered = select(
        grouped.c.hash,
        grouped.c.size,
        case(
            (
                grouped.c.size > 1,
                func.row_number().over(
                    partition_by=grouped.c.size > 1,
                    order_by=(grouped.c.first, grouped.c.hash),
                ),
            ),
            else_=None,
        ),
    )
    return {hash_: (number, size) for hash_, size, number in await session.execute(numbered)}


async def _technologies(
    session: AsyncSession, url_ids: set[uuid.UUID]
) -> dict[uuid.UUID, list[ScreenshotTechnology]]:
    found: dict[uuid.UUID, list[ScreenshotTechnology]] = {}
    if not url_ids:
        return found
    rows = await session.execute(
        select(UrlTechnology.url_id, Technology.name, Technology.category)
        .join(Technology, Technology.id == UrlTechnology.technology_id)
        .where(UrlTechnology.url_id.in_(url_ids))
        .order_by(Technology.name)
    )
    for url_id, name, category in rows:
        found.setdefault(url_id, []).append(ScreenshotTechnology(name=name, category=category))
    return found


async def _retry_statuses(
    session: AsyncSession, shots: Sequence[Screenshot]
) -> dict[uuid.UUID, JobStatus]:
    """Status of the newest job of the same tool module on `final_url`, after the capture."""
    wanted = [s for s in shots if s.final_url and s.job_id]
    if not wanted:
        return {}
    tool_modules = dict(
        (
            await session.execute(
                select(Job.id, Job.tool_module_id).where(
                    Job.id.in_({s.job_id for s in wanted if s.job_id})
                )
            )
        ).all()
    )

    def forms(url: str) -> set[str]:
        # Job targets are stored canonical, which may drop the trailing slash.
        return {url, url.rstrip("/")}

    urls = sorted({form for s in wanted if s.final_url for form in forms(s.final_url)})
    jobs = (
        await session.execute(
            select(
                Job.id, Job.target, Job.status, Job.created_at, Job.tool_module_id, Job.program_id
            )
            .where(
                Job.target.overlap(cast(array(urls), ARRAY(Text))),
                Job.tool_module_id.in_(set(tool_modules.values())),
                Job.program_id.in_({s.program_id for s in wanted}),
            )
            .order_by(Job.created_at.desc())
        )
    ).all()
    found: dict[uuid.UUID, JobStatus] = {}
    for shot in wanted:
        for job_id, target, status, created_at, tool_module_id, program_id in jobs:
            if (
                job_id != shot.job_id
                and program_id == shot.program_id
                and shot.job_id is not None
                and tool_module_id == tool_modules.get(shot.job_id)
                and created_at > shot.captured_at
                and shot.final_url is not None
                and forms(shot.final_url) & set(target)
            ):
                found[shot.id] = JobStatus(status)
                break
    return found


async def _rows(
    session: AsyncSession, shots: Sequence[Screenshot], where: ColumnElement[bool]
) -> list[ScreenshotResponse]:
    groups = await _groups(session, where)
    technologies = await _technologies(session, {s.url_id for s in shots})
    retries = await _retry_statuses(session, shots)
    rows = []
    for shot in shots:
        number, size = groups.get(shot.perception_hash or "", (None, 1))
        rows.append(
            ScreenshotResponse(
                id=shot.id,
                program_id=shot.program_id,
                url_id=shot.url_id,
                job_id=shot.job_id,
                raw_output_id=shot.raw_output_id,
                final_url=shot.final_url,
                status_code=shot.status_code,
                title=shot.title,
                perception_hash=shot.perception_hash,
                http_headers=shot.http_headers,
                is_failed=shot.is_failed,
                error_message=shot.error_message,
                captured_at=shot.captured_at,
                similar_group=number,
                similar_count=size,
                technologies=technologies.get(shot.url_id, []),
                retry_job_status=retries.get(shot.id),
                width=shot.width,
                height=shot.height,
            )
        )
    return rows


def _clamp(limit: int) -> int:
    return max(1, min(limit, MAX_LIMIT))


async def list_screenshots(
    session: AsyncSession,
    *,
    viewer: User,
    flt: ScreenshotFilter,
    limit: int,
    cursor: str | None,
    sort: ScreenshotSort = "-captured_at",
) -> Page[ScreenshotResponse]:
    """A page of screenshots. `perception_hash` puts look-alike captures side by side."""
    where = _where(viewer, flt)
    size = _clamp(limit)
    stmt = select(Screenshot).where(where)
    if sort == "perception_hash":
        # NULL hashes (failed captures) go last; '~' sorts after any hex digit.
        key = func.coalesce(Screenshot.perception_hash, "~")
        stmt = stmt.order_by(key.asc(), Screenshot.id.asc())
        if cursor is not None:
            seen, seen_id = decode_cursor(cursor)
            if not isinstance(seen, str):
                seen = str(seen)
            stmt = stmt.where(tuple_(key, Screenshot.id) > (seen, seen_id))
    else:
        descending = sort == "-captured_at"
        order = (Screenshot.captured_at, Screenshot.id)
        stmt = stmt.order_by(*(c.desc() if descending else c.asc() for c in order))
        if cursor is not None:
            seen_at, seen_id = decode_time_cursor(cursor)
            pair = tuple_(*order)
            stmt = stmt.where(
                pair < (seen_at, seen_id) if descending else pair > (seen_at, seen_id)
            )
    shots = list(await session.scalars(stmt.limit(size + 1)))
    total = await session.scalar(select(func.count()).select_from(Screenshot).where(where)) or 0
    page = shots[:size]
    next_cursor = None
    if len(shots) > size:
        last = page[-1]
        value = (
            last.perception_hash or "~"
            if sort == "perception_hash"
            else last.captured_at.isoformat()
        )
        next_cursor = encode_cursor(value, last.id)
    return Page[ScreenshotResponse](
        items=await _rows(session, page, where), next_cursor=next_cursor, total=total
    )


async def summary(
    session: AsyncSession, *, viewer: User, flt: ScreenshotFilter
) -> ScreenshotSummaryResponse:
    """Counts per HTTP status class, under every filter but `status_code`."""
    where = _where(viewer, replace(flt, status_code=None))
    row = (
        await session.execute(
            select(
                *(func.count().filter(_status_class(name)) for name in ("2xx", "3xx", "4xx", "5xx"))
            ).where(where)
        )
    ).one()
    return ScreenshotSummaryResponse(
        by_status_code=StatusCodeCounts(c2xx=row[0], c3xx=row[1], c4xx=row[2], c5xx=row[3])
    )


# ---------------------------------------------------------------- one screenshot


async def _visible(session: AsyncSession, viewer: User, screenshot_id: uuid.UUID) -> Screenshot:
    shot = await session.scalar(
        select(Screenshot).where(
            Screenshot.id == screenshot_id,
            Screenshot.deleted_at.is_(None),
            program_visible_to(viewer, Screenshot.program_id),
        )
    )
    if shot is None:
        raise NotFoundError(detail="screenshot does not exist")
    return shot


def security_headers(headers: dict[str, Any] | None) -> dict[str, bool]:
    present = {str(key).lower() for key in (headers or {})}
    return {name: name in present for name in SECURITY_HEADERS}


async def get_screenshot(
    session: AsyncSession, *, viewer: User, screenshot_id: uuid.UUID
) -> ScreenshotDetailResponse:
    shot = await _visible(session, viewer, screenshot_id)
    # Grouping and retry status of the detail use the program as the filter.
    where = _where(viewer, ScreenshotFilter(program_id=shot.program_id))
    (row,) = await _rows(session, [shot], where)
    worker_name = await session.scalar(
        select(Worker.name).join(Job, Job.worker_id == Worker.id).where(Job.id == shot.job_id)
    )
    html_bytes = shot.html.encode("utf-8") if shot.html else None
    headers = security_headers(shot.http_headers)
    return ScreenshotDetailResponse.model_validate(
        {
            **row.model_dump(),
            "worker_name": worker_name,
            "device_scale": shot.device_scale,
            "remote_ip": str(shot.remote_ip) if shot.remote_ip else None,
            "duration_ms": shot.duration_ms,
            "tls": shot.tls,
            "console_log": shot.console_log,
            "cookies": shot.cookies,
            "html_size": len(html_bytes) if html_bytes is not None else None,
            "html_sha256": hashlib.sha256(html_bytes).hexdigest() if html_bytes else None,
            "security_headers": headers,
            "security_headers_passed": sum(headers.values()),
            "security_headers_total": len(headers),
        }
    )


async def get_network(
    session: AsyncSession, *, viewer: User, screenshot_id: uuid.UUID
) -> ScreenshotNetworkResponse:
    shot = await _visible(session, viewer, screenshot_id)
    return ScreenshotNetworkResponse.model_validate({"network_log": shot.network_log})


async def get_html(session: AsyncSession, *, viewer: User, screenshot_id: uuid.UUID) -> str:
    shot = await _visible(session, viewer, screenshot_id)
    if shot.html is None:
        raise NotFoundError(detail="screenshot has no HTML")
    return shot.html


def _har_time(value: datetime) -> str:
    return value.isoformat()


async def build_har(
    session: AsyncSession, *, viewer: User, screenshot_id: uuid.UUID
) -> tuple[uuid.UUID, Iterator[str]]:
    """HAR 1.2 from `network_log`. Only what gowitness recorded: no body, no cookie value."""
    shot = await _visible(session, viewer, screenshot_id)
    started = _har_time(shot.captured_at)
    entries = [
        {
            "startedDateTime": started,
            "time": entry.get("duration_ms") or 0,
            "request": {
                "method": entry.get("method") or "GET",
                "url": entry.get("url", ""),
                "httpVersion": "",
                "cookies": [],
                "headers": [],
                "queryString": [],
                "headersSize": -1,
                "bodySize": -1,
            },
            "response": {
                "status": entry.get("status_code") or 0,
                "statusText": "",
                "httpVersion": "",
                "cookies": [],
                "headers": [],
                "content": {
                    "size": entry.get("size_bytes") or 0,
                    "mimeType": entry.get("content_type") or "",
                },
                "redirectURL": "",
                "headersSize": -1,
                "bodySize": entry.get("size_bytes") or -1,
            },
            "cache": {},
            "timings": {"send": 0, "wait": entry.get("duration_ms") or 0, "receive": 0},
            **({"serverIPAddress": entry["remote_ip"]} if entry.get("remote_ip") else {}),
        }
        for entry in shot.network_log
    ]
    har = {
        "log": {
            "version": "1.2",
            "creator": {"name": "ReconOS", "version": "1.0"},
            "pages": [
                {
                    "startedDateTime": started,
                    "id": str(shot.id),
                    "title": shot.final_url or "",
                    "pageTimings": {},
                }
            ],
            "entries": [{**entry, "pageref": str(shot.id)} for entry in entries],
        }
    }
    return shot.id, iter([json.dumps(har)])


async def _signed(stream: AsyncIterator[bytes]) -> tuple[str, AsyncIterator[bytes]]:
    """The image type from its leading bytes, and the full stream to send."""
    head = b""
    async for chunk in stream:
        head += chunk
        if len(head) >= _SIGNATURE_BYTES:
            break
    media_type = next((kind for sig, kind in _IMAGE_SIGNATURES if head.startswith(sig)), None)
    if media_type is None:
        raise NotFoundError(detail="screenshot has no image")

    async def body() -> AsyncIterator[bytes]:
        yield head
        async for chunk in stream:
            yield chunk

    return media_type, body()


async def open_image(
    session: AsyncSession, *, viewer: User, screenshot_id: uuid.UUID
) -> tuple[str, AsyncIterator[bytes]]:
    """The PNG of the capture, checked to be an image before a byte is sent.

    Only the raw output the screenshot row names, of the same job, is served:
    no other file of the job can come out of this endpoint.
    """
    shot = await _visible(session, viewer, screenshot_id)
    if shot.raw_output_id is None:
        raise NotFoundError(detail="screenshot has no image")
    object_key = await session.scalar(
        select(_raw_output.c.object_key).where(
            _raw_output.c.id == shot.raw_output_id, _raw_output.c.job_id == shot.job_id
        )
    )
    if object_key is None:
        raise NotFoundError(detail="screenshot has no image")
    return await _signed(get_object_stream(object_key))


async def delete_screenshot(
    session: AsyncSession, *, actor: User, screenshot_id: uuid.UUID
) -> None:
    """Soft delete. The image and the JSONL stay as raw output (D5, G8)."""
    shot = await _visible(session, actor, screenshot_id)
    status = await session.scalar(select(Program.status).where(Program.id == shot.program_id))
    if status == ProgramStatus.ARCHIVED:
        raise ConflictError(detail="program is archived and read only")
    shot.deleted_at = func.now()
    await session.flush()
    await audit.record(
        session,
        action="screenshot_deleted",
        user_id=actor.id,
        program_id=shot.program_id,
        resource_type=RESOURCE,
        resource_id=shot.id,
        detail={"url_id": str(shot.url_id)},
    )
