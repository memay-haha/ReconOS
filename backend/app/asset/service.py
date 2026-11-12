"""Assets of a program: read, soft delete, ingest and scope recompute.

Every read goes through `program_visible_to`, so a User sees only assets of the
programs assigned to it (G7), and every domain read filters `deleted_at IS NULL`:
docs/decisions/adr-soft-delete.md. Writes from tools arrive through `ingest`
(called by the parser) and are documented in app/asset/ingest.py.

The finding table sits one tier up, so it is read by table name only, never
imported: docs/architecture/dependency-graph.md. The findings of a domain are
those on the domain, on one of its URLs, or on a service of an IP it resolves
to: `domain_asset_clause`.
"""

import uuid
from collections.abc import Iterator, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import structlog
from sqlalchemy import (
    ColumnElement,
    Select,
    Text,
    and_,
    column,
    distinct,
    exists,
    func,
    literal,
    null,
    or_,
    select,
    table,
    true,
    tuple_,
    union_all,
    update,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute, aliased

from app.asset import export
from app.asset import ingest as ingest_module
from app.asset.ingest import Located as Located
from app.asset.ingest import Provenance as Provenance
from app.asset.models import (
    AssetEvent,
    DnsStatus,
    Domain,
    DomainIp,
    Ip,
    Service,
    Technology,
    Url,
    UrlTechnology,
)
from app.asset.schemas import (
    AssetEventResponse,
    AssetSort,
    DomainActivityResponse,
    DomainDetailResponse,
    DomainRecord,
    DomainRowResponse,
    DomainSort,
    DomainSummaryResponse,
    DomainTag,
    EventSort,
    ExportFormat,
    IngestBatch,
    IngestResult,
    IpRecord,
    IpRecordResponse,
    IpResponse,
    ProgramStatusFilter,
    ServiceRecord,
    ServiceResponse,
    TechnologyResponse,
    TechnologySort,
    UrlDetailResponse,
    UrlRecord,
    UrlResponse,
    UrlTechnologyResponse,
)
from app.core import audit
from app.core.db import Base
from app.core.errors import BadRequestError, ConflictError, NotFoundError
from app.core.identity import User
from app.core.pagination import MAX_LIMIT, Page, decode_cursor, decode_time_cursor, encode_cursor
from app.core.security import program_visible_to
from app.job.models import Job
from app.program.models import Program, ProgramStatus
from app.program.schemas import FindingCounts
from app.scope.matching import Rule
from app.tag.models import AssetTag, Tag
from app.tool_module.models import ToolModule

log = structlog.get_logger()

RESOURCE = "domain"
# Rows read per query when an export walks a whole list.
EXPORT_BATCH = 1000


# ---------------------------------------------------------------- ingest, recompute

SortExpression = ColumnElement[Any] | InstrumentedAttribute[Any]


async def load_scope_rules(session: AsyncSession, program_id: uuid.UUID) -> list[Rule]:
    """The rules one parse marks its assets with, read once per parse."""
    return await ingest_module.load_scope_rules(session, program_id)


async def ingest(
    session: AsyncSession, batch: IngestBatch, origin: Provenance, rules: Sequence[Rule]
) -> IngestResult:
    """Upsert one batch of parsed assets: app/asset/ingest.py."""
    return await ingest_module.ingest(session, batch, origin, rules)


async def locate(
    session: AsyncSession,
    program_id: uuid.UUID,
    records: Sequence[DomainRecord | IpRecord | ServiceRecord | UrlRecord],
) -> list[Located | None]:
    """The asset row each ingest record landed on, in order: app/asset/ingest.py."""
    return await ingest_module.locate(session, program_id, records)


def render_export(
    fmt: ExportFormat, columns: Sequence[str], rows: Sequence[dict[str, Any]]
) -> Iterator[str]:
    """The export file format shared by every list that exports: app/asset/export.py."""
    return export.render(fmt, columns, rows)


def export_headers(resource: str, fmt: ExportFormat) -> tuple[str, dict[str, str]]:
    """Media type and headers of an export download: docs/api/architecture.md."""
    return export.MEDIA_TYPES[fmt], {
        "Content-Disposition": f'attachment; filename="{export.filename(resource, fmt)}"',
        "X-Content-Type-Options": "nosniff",
    }


def domain_asset_clause(
    domain_id: ColumnElement[uuid.UUID] | InstrumentedAttribute[uuid.UUID] | uuid.UUID,
    *,
    domain_column: SortExpression,
    url_column: SortExpression,
    service_column: SortExpression,
) -> ColumnElement[bool]:
    """Rows that link an asset of the domain: the domain itself, one of its URLs,
    or a service on an IP the domain resolves to, as `/services?domain_id=` reads.
    """
    return or_(
        domain_column == domain_id,
        url_column.in_(select(Url.id).where(Url.domain_id == domain_id)),
        service_column.in_(
            select(Service.id)
            .join(DomainIp, DomainIp.ip_id == Service.ip_id)
            .where(DomainIp.domain_id == domain_id)
        ),
    )


async def recompute_in_scope(session: AsyncSession, program_id: uuid.UUID) -> int:
    """Re-mark every asset of the program after its scope rules changed."""
    changed = await ingest_module.recompute_in_scope(session, program_id)
    log.info("asset_scope_recomputed", program_id=str(program_id), changed=changed)
    return changed


# ---------------------------------------------------------------- shared helpers


def _clamp(limit: int) -> int:
    return max(1, min(limit, MAX_LIMIT))


def _like_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _search(column: SortExpression, q: str, *, wildcard: bool) -> ColumnElement[bool]:
    """`q`: case-insensitive substring; `*` is a wildcard on names and addresses only.

    With a `*` the pattern covers the whole value, so `*.example.com` finds the
    subdomains and not a name that merely contains it: docs/api/architecture.md.
    """
    if wildcard and "*" in q:
        pattern = "%".join(_like_escape(part) for part in q.split("*"))
        return column.ilike(pattern, escape="\\")
    return column.ilike(f"%{_like_escape(q)}%", escape="\\")


@dataclass(frozen=True)
class _Sort:
    expression: SortExpression
    descending: bool
    kind: Literal["text", "time"]


def _sort(expression: SortExpression, name: str, kind: Literal["text", "time"]) -> _Sort:
    return _Sort(expression, name.startswith("-"), kind)


def _decode(cursor: str, sort: _Sort) -> tuple[Any, uuid.UUID]:
    if sort.kind == "time":
        return decode_time_cursor(cursor)
    value, row_id = decode_cursor(cursor)
    if not isinstance(value, str):
        raise BadRequestError(detail="cursor is not valid")
    return value, row_id


def _encode(value: object, row_id: uuid.UUID) -> str:
    return encode_cursor(value.isoformat() if isinstance(value, datetime) else str(value), row_id)


async def _keyset_page(
    session: AsyncSession,
    stmt: Select[Any],
    *,
    id_column: InstrumentedAttribute[uuid.UUID],
    where: ColumnElement[bool],
    sort: _Sort,
    limit: int,
    cursor: str | None,
    count_from: type[Base],
) -> tuple[list[Any], str | None, int]:
    """One page of `stmt` ordered by the sort key then id, with the filtered total."""
    size = _clamp(limit)
    order = (
        (sort.expression.desc(), id_column.desc())
        if sort.descending
        else (sort.expression.asc(), id_column.asc())
    )
    page_stmt = stmt.add_columns(sort.expression.label("sort_value")).where(where).order_by(*order)
    if cursor is not None:
        seen, seen_id = _decode(cursor, sort)
        keyset = tuple_(sort.expression, id_column)
        page_stmt = page_stmt.where(
            keyset < (seen, seen_id) if sort.descending else keyset > (seen, seen_id)
        )
    rows = list((await session.execute(page_stmt.limit(size + 1))).all())
    total = await session.scalar(select(func.count()).select_from(count_from).where(where)) or 0
    page_rows = rows[:size]
    next_cursor = None
    if len(rows) > size:
        last = page_rows[-1]
        next_cursor = _encode(last[-1], last[0].id)
    return [row[0] for row in page_rows], next_cursor, total


def _ids_clause(
    column: InstrumentedAttribute[uuid.UUID], ids: Sequence[uuid.UUID] | None
) -> ColumnElement[bool]:
    return column.in_(list(ids)) if ids else true()


# ---------------------------------------------------------------- domains


_finding = table(
    "finding",
    column("id", PG_UUID(as_uuid=True)),
    column("domain_id", PG_UUID(as_uuid=True)),
    column("url_id", PG_UUID(as_uuid=True)),
    column("service_id", PG_UUID(as_uuid=True)),
    column("job_id", PG_UUID(as_uuid=True)),
    column("name", Text),
    column("severity", Text),
    column("triage_status", Text),
    column("first_seen_at"),
)
# screenshot sits one tier up too: read by table name, live rows only (D5).
_screenshot = table(
    "screenshot",
    column("id", PG_UUID(as_uuid=True)),
    column("url_id", PG_UUID(as_uuid=True)),
    column("job_id", PG_UUID(as_uuid=True)),
    column("title", Text),
    column("final_url", Text),
    column("captured_at"),
    column("deleted_at"),
)
# Closed triage states; any other is an open finding: docs/api/architecture.md.
CLOSED_TRIAGE = ("false_positive", "duplicate", "resolved")


def _of_domain(
    domain_id: ColumnElement[uuid.UUID] | InstrumentedAttribute[uuid.UUID] | uuid.UUID,
) -> ColumnElement[bool]:
    return domain_asset_clause(
        domain_id,
        domain_column=_finding.c.domain_id,
        url_column=_finding.c.url_id,
        service_column=_finding.c.service_id,
    )


def _has_open_finding(severity: str | None = None) -> ColumnElement[bool]:
    clauses = [_of_domain(Domain.id), _finding.c.triage_status.not_in(CLOSED_TRIAGE)]
    if severity is not None:
        clauses.append(_finding.c.severity == severity)
    return exists(select(_finding.c.id).where(*clauses).correlate(Domain))


async def _open_finding_counts(
    session: AsyncSession, ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, FindingCounts]:
    """Open findings per domain and severity, each finding counted once per domain."""
    if not ids:
        return {}
    open_finding = _finding.c.triage_status.not_in(CLOSED_TRIAGE)
    direct = select(
        _finding.c.domain_id.label("domain_id"), _finding.c.id, _finding.c.severity
    ).where(_finding.c.domain_id.in_(ids), open_finding)
    via_url = (
        select(Url.domain_id.label("domain_id"), _finding.c.id, _finding.c.severity)
        .join(Url, Url.id == _finding.c.url_id)
        .where(Url.domain_id.in_(ids), open_finding)
    )
    via_service = (
        select(DomainIp.domain_id.label("domain_id"), _finding.c.id, _finding.c.severity)
        .join(Service, Service.id == _finding.c.service_id)
        .join(DomainIp, DomainIp.ip_id == Service.ip_id)
        .where(DomainIp.domain_id.in_(ids), open_finding)
    )
    pairs = direct.union(via_url, via_service).subquery()
    counts: dict[uuid.UUID, dict[str, int]] = {}
    for domain_id, severity, count in await session.execute(
        select(pairs.c.domain_id, pairs.c.severity, func.count()).group_by(
            pairs.c.domain_id, pairs.c.severity
        )
    ):
        counts.setdefault(domain_id, {})[severity] = count
    return {domain_id: FindingCounts(**found) for domain_id, found in counts.items()}


def _domain_visible(viewer: User) -> ColumnElement[bool]:
    return and_(Domain.deleted_at.is_(None), program_visible_to(viewer, Domain.program_id))


@dataclass(frozen=True)
class DomainFilter:
    program_id: uuid.UUID | None = None
    dns_status: Sequence[DnsStatus] | None = None
    in_scope: bool | None = None
    q: str | None = None
    has_findings: bool | None = None
    first_seen_at_from: datetime | None = None
    program_status: ProgramStatusFilter | None = None
    ids: Sequence[uuid.UUID] | None = None


def _domain_where(viewer: User, flt: DomainFilter) -> ColumnElement[bool]:
    clauses: list[ColumnElement[bool]] = [_domain_visible(viewer), _ids_clause(Domain.id, flt.ids)]
    if flt.program_id is not None:
        clauses.append(Domain.program_id == flt.program_id)
    if flt.dns_status:
        clauses.append(Domain.dns_status.in_([status.value for status in flt.dns_status]))
    if flt.in_scope is not None:
        clauses.append(Domain.in_scope.is_(flt.in_scope))
    if flt.q:
        clauses.append(_search(Domain.name, flt.q, wildcard=True))
    if flt.has_findings is not None:
        found = _has_open_finding()
        clauses.append(found if flt.has_findings else ~found)
    if flt.first_seen_at_from is not None:
        clauses.append(Domain.first_seen_at >= flt.first_seen_at_from)
    if flt.program_status is not None:
        clauses.append(
            Domain.program_id.in_(select(Program.id).where(Program.status == flt.program_status))
        )
    return and_(*clauses)


_DOMAIN_SORTS: dict[str, tuple[SortExpression, Literal["text", "time"]]] = {
    "name": (Domain.name, "text"),
    "first_seen_at": (Domain.first_seen_at, "time"),
    "last_seen_at": (Domain.last_seen_at, "time"),
}


async def _domain_rows(session: AsyncSession, domains: Sequence[Domain]) -> list[DomainRowResponse]:
    """Add the fields computed on read: docs/api/architecture.md."""
    ids = [domain.id for domain in domains]
    addresses: dict[uuid.UUID, list[tuple[str, int | None, str | None]]] = {}
    url_counts: dict[uuid.UUID, int] = {}
    service_counts: dict[uuid.UUID, int] = {}
    finding_counts = await _open_finding_counts(session, ids)
    if ids:
        for domain_id, address, asn, asn_org in await session.execute(
            select(DomainIp.domain_id, func.host(Ip.address), Ip.asn, Ip.asn_org)
            .join(Ip, Ip.id == DomainIp.ip_id)
            .where(DomainIp.domain_id.in_(ids))
            .distinct()
            .order_by(DomainIp.domain_id, func.host(Ip.address))
        ):
            addresses.setdefault(domain_id, []).append((address, asn, asn_org))
        url_counts = {
            domain_id: count
            for domain_id, count in (
                await session.execute(
                    select(Url.domain_id, func.count())
                    .where(Url.domain_id.in_(ids))
                    .group_by(Url.domain_id)
                )
            ).all()
            if domain_id is not None
        }
        # list() first: a Result has keys(), so dict() would read it as a mapping.
        service_counts = dict(
            list(
                (
                    await session.execute(
                        select(DomainIp.domain_id, func.count(distinct(Service.id)))
                        .join(Service, Service.ip_id == DomainIp.ip_id)
                        .where(DomainIp.domain_id.in_(ids))
                        .group_by(DomainIp.domain_id)
                    )
                ).all()
            )
        )
    rows: list[DomainRowResponse] = []
    for domain in domains:
        found = addresses.get(domain.id, [])
        first = found[0] if found else None
        counts = finding_counts.get(domain.id, FindingCounts())
        rows.append(
            DomainRowResponse.model_validate(
                {
                    **_domain_columns(domain),
                    "ips": [address for address, _, _ in found],
                    "url_count": url_counts.get(domain.id, 0),
                    "service_count": service_counts.get(domain.id, 0),
                    "finding_counts": counts,
                    "has_findings": any(counts.model_dump().values()),
                    "asn": first[1] if first else None,
                    "asn_org": first[2] if first else None,
                }
            )
        )
    return rows


def _domain_columns(domain: Domain) -> dict[str, Any]:
    return {
        "id": domain.id,
        "program_id": domain.program_id,
        "name": domain.name,
        "apex": domain.apex,
        "is_wildcard": domain.is_wildcard,
        "cname": domain.cname,
        "dns_status": domain.dns_status,
        "in_scope": domain.in_scope,
        "first_seen_at": domain.first_seen_at,
        "last_seen_at": domain.last_seen_at,
    }


async def list_domains(
    session: AsyncSession,
    *,
    viewer: User,
    flt: DomainFilter,
    limit: int,
    cursor: str | None,
    sort: DomainSort = "name",
) -> Page[DomainRowResponse]:
    expression, kind = _DOMAIN_SORTS[sort.lstrip("-")]
    domains, next_cursor, total = await _keyset_page(
        session,
        select(Domain),
        id_column=Domain.id,
        where=_domain_where(viewer, flt),
        sort=_sort(expression, sort, kind),
        limit=limit,
        cursor=cursor,
        count_from=Domain,
    )
    return Page[DomainRowResponse](
        items=await _domain_rows(session, domains), next_cursor=next_cursor, total=total
    )


async def domain_summary(
    session: AsyncSession, *, viewer: User, flt: DomainFilter
) -> DomainSummaryResponse:
    now = datetime.now(UTC)
    day_ago = now - timedelta(hours=24)
    week_start = day_ago - timedelta(days=7)
    resolved = Domain.dns_status == DnsStatus.RESOLVED.value
    row = (
        await session.execute(
            select(
                func.count(),
                func.count().filter(Domain.in_scope.is_(True)),
                func.count().filter(resolved),
                func.count().filter(resolved, Domain.first_seen_at >= day_ago),
                func.count().filter(
                    Domain.dns_status.in_([DnsStatus.NXDOMAIN.value, DnsStatus.TIMEOUT.value])
                ),
                func.count().filter(Domain.first_seen_at >= day_ago),
                func.count().filter(
                    Domain.first_seen_at >= week_start, Domain.first_seen_at < day_ago
                ),
                func.count().filter(_has_open_finding()),
                func.count().filter(_has_open_finding("critical")),
            ).where(_domain_where(viewer, flt))
        )
    ).one()
    return DomainSummaryResponse(
        total=row[0],
        in_scope=row[1],
        resolved=row[2],
        resolved_new_24h=row[3],
        unresolved=row[4],
        with_findings=row[7],
        with_critical=row[8],
        new_24h=row[5],
        new_daily_avg_7d=round(row[6] / 7, 2),
    )


async def _visible_domain(session: AsyncSession, viewer: User, domain_id: uuid.UUID) -> Domain:
    domain = await session.scalar(
        select(Domain).where(Domain.id == domain_id, _domain_visible(viewer))
    )
    if domain is None:
        raise NotFoundError(detail="domain does not exist")
    return domain


async def get_domain(
    session: AsyncSession, *, viewer: User, domain_id: uuid.UUID
) -> DomainDetailResponse:
    domain = await _visible_domain(session, viewer, domain_id)
    row = (await _domain_rows(session, [domain]))[0]
    tags = [
        DomainTag(id=tag_row[0], tag_id=tag_row[1], key=tag_row[2], value=tag_row[3])
        for tag_row in await session.execute(
            select(AssetTag.id, AssetTag.tag_id, Tag.key, Tag.value)
            .join(Tag, Tag.id == AssetTag.tag_id)
            .where(AssetTag.domain_id == domain.id)
            .order_by(Tag.key, Tag.value)
        )
    ]
    ip_records = [
        IpRecordResponse(address=address, record_type=record_type)
        for address, record_type in await session.execute(
            select(func.host(Ip.address), DomainIp.record_type)
            .join(Ip, Ip.id == DomainIp.ip_id)
            .where(DomainIp.domain_id == domain.id)
            .order_by(DomainIp.record_type, func.host(Ip.address))
        )
    ]
    ports = list(
        await session.scalars(
            select(Service.port)
            .join(DomainIp, DomainIp.ip_id == Service.ip_id)
            .where(DomainIp.domain_id == domain.id)
            .distinct()
            .order_by(Service.port)
        )
    )
    return DomainDetailResponse.model_validate(
        {**row.model_dump(), "tags": tags, "ip_records": ip_records, "service_ports": ports}
    )


async def delete_domains(
    session: AsyncSession, *, actor: User, domain_ids: Sequence[uuid.UUID]
) -> None:
    """Soft delete, all or none. Raw output, URLs and findings stay (D5).

    A domain the actor cannot see answers 404 like a missing one. A domain of
    an archived program is read only: 409.
    """
    wanted = set(domain_ids)
    rows = list(
        (
            await session.execute(
                select(Domain, Program.status)
                .join(Program, Program.id == Domain.program_id)
                .where(Domain.id.in_(wanted), _domain_visible(actor))
                .with_for_update(of=Domain)
            )
        ).all()
    )
    if len(rows) != len(wanted):
        raise NotFoundError(detail="domain does not exist")
    if any(status == ProgramStatus.ARCHIVED for _, status in rows):
        raise ConflictError(detail="program is archived and read only")
    await session.execute(update(Domain).where(Domain.id.in_(wanted)).values(deleted_at=func.now()))
    for domain, _ in rows:
        await audit.record(
            session,
            action="domain_deleted",
            user_id=actor.id,
            program_id=domain.program_id,
            resource_type=RESOURCE,
            resource_id=domain.id,
            detail={"name": domain.name},
        )


_EVENT_TITLES = {"discovered": "Discovered", "changed": "Changed"}


async def domain_activity(
    session: AsyncSession,
    *,
    viewer: User,
    domain_id: uuid.UUID,
    limit: int,
    cursor: str | None,
) -> Page[DomainActivityResponse]:
    """The domain timeline, newest first: asset events, findings and screenshots.

    A screenshot belongs to the domain through its URL (`url.domain_id`).
    """
    domain = await _visible_domain(session, viewer, domain_id)
    events = select(
        literal("asset_event").label("kind"),
        AssetEvent.id.label("id"),
        AssetEvent.created_at.label("at"),
        AssetEvent.job_id.label("job_id"),
        AssetEvent.event_type.label("event_type"),
        AssetEvent.diff.label("diff"),
        null().cast(Text).label("name"),
    ).where(AssetEvent.domain_id == domain.id)
    findings = select(
        literal("finding"),
        _finding.c.id,
        _finding.c.first_seen_at,
        _finding.c.job_id,
        null().cast(Text),
        null().cast(JSONB),
        _finding.c.name,
    ).where(_of_domain(domain.id))
    screenshots = (
        select(
            literal("screenshot"),
            _screenshot.c.id,
            _screenshot.c.captured_at,
            _screenshot.c.job_id,
            null().cast(Text),
            null().cast(JSONB),
            func.coalesce(_screenshot.c.title, _screenshot.c.final_url),
        )
        .join(Url, Url.id == _screenshot.c.url_id)
        .where(Url.domain_id == domain.id, _screenshot.c.deleted_at.is_(None))
    )
    timeline = union_all(events, findings, screenshots).subquery()
    stmt = (
        select(timeline, ToolModule.name.label("tool_module_name"))
        .outerjoin(Job, Job.id == timeline.c.job_id)
        .outerjoin(ToolModule, ToolModule.id == Job.tool_module_id)
    )
    size = _clamp(limit)
    page_stmt = stmt.order_by(timeline.c.at.desc(), timeline.c.id.desc())
    if cursor is not None:
        seen_at, seen_id = decode_time_cursor(cursor)
        page_stmt = page_stmt.where(tuple_(timeline.c.at, timeline.c.id) < (seen_at, seen_id))
    rows = list((await session.execute(page_stmt.limit(size + 1))).all())
    total = await session.scalar(select(func.count()).select_from(timeline)) or 0
    page_rows = rows[:size]
    items = []
    for row in page_rows:
        if row.kind == "finding":
            title = row.name
        elif row.kind == "screenshot":
            title = f"Screenshot: {row.name}" if row.name else "Screenshot"
        else:
            changed = ", ".join(sorted(row.diff)) if row.diff else ""
            title = _EVENT_TITLES[row.event_type] + (f": {changed}" if changed else "")
        items.append(
            DomainActivityResponse(
                kind=row.kind,
                id=row.id,
                at=row.at,
                title=title,
                tool_module_name=row.tool_module_name,
                job_id=row.job_id,
            )
        )
    next_cursor = (
        encode_cursor(page_rows[-1].at.isoformat(), page_rows[-1].id) if len(rows) > size else None
    )
    return Page[DomainActivityResponse](items=items, next_cursor=next_cursor, total=total)


DOMAIN_EXPORT_COLUMNS = (
    "id",
    "program_id",
    "name",
    "apex",
    "is_wildcard",
    "cname",
    "dns_status",
    "in_scope",
    "ips",
    "url_count",
    "service_count",
    "first_seen_at",
    "last_seen_at",
)


async def export_domains(
    session: AsyncSession, *, viewer: User, flt: DomainFilter, fmt: ExportFormat
) -> Iterator[str]:
    rows: list[dict[str, Any]] = []
    cursor: str | None = None
    while True:
        page = await list_domains(
            session, viewer=viewer, flt=flt, limit=EXPORT_BATCH, cursor=cursor
        )
        rows.extend(item.model_dump() for item in page.items)
        if page.next_cursor is None:
            break
        cursor = page.next_cursor
    return export.render(fmt, DOMAIN_EXPORT_COLUMNS, rows)


# ---------------------------------------------------------------- IPs, URLs, services


@dataclass(frozen=True)
class AssetFilter:
    program_id: uuid.UUID | None = None
    domain_id: uuid.UUID | None = None
    q: str | None = None
    ids: Sequence[uuid.UUID] | None = None


def _ip_where(viewer: User, flt: AssetFilter) -> ColumnElement[bool]:
    clauses = [program_visible_to(viewer, Ip.program_id), _ids_clause(Ip.id, flt.ids)]
    if flt.program_id is not None:
        clauses.append(Ip.program_id == flt.program_id)
    if flt.q:
        clauses.append(
            or_(
                _search(func.host(Ip.address), flt.q, wildcard=True),
                _search(Ip.asn_org, flt.q, wildcard=False),
            )
        )
    return and_(*clauses)


def _url_where(viewer: User, flt: AssetFilter) -> ColumnElement[bool]:
    clauses = [program_visible_to(viewer, Url.program_id), _ids_clause(Url.id, flt.ids)]
    if flt.program_id is not None:
        clauses.append(Url.program_id == flt.program_id)
    if flt.domain_id is not None:
        clauses.append(Url.domain_id == flt.domain_id)
    if flt.q:
        clauses.append(
            or_(_search(Url.url, flt.q, wildcard=False), _search(Url.title, flt.q, wildcard=False))
        )
    return and_(*clauses)


def _service_where(viewer: User, flt: AssetFilter) -> ColumnElement[bool]:
    clauses = [program_visible_to(viewer, Service.program_id), _ids_clause(Service.id, flt.ids)]
    if flt.program_id is not None:
        clauses.append(Service.program_id == flt.program_id)
    if flt.domain_id is not None:
        # Services on the IPs the domain resolves to: docs/api/architecture.md.
        clauses.append(
            Service.ip_id.in_(select(DomainIp.ip_id).where(DomainIp.domain_id == flt.domain_id))
        )
    if flt.q:
        clauses.append(
            or_(
                _search(Service.name, flt.q, wildcard=False),
                _search(Service.product, flt.q, wildcard=False),
            )
        )
    return and_(*clauses)


def _time_sort(model: type[Ip] | type[Url] | type[Service], sort: AssetSort) -> _Sort:
    return _sort(getattr(model, sort.lstrip("-")), sort, "time")


def _ip_response(ip: Ip) -> IpResponse:
    return IpResponse.model_validate(
        {
            **{name: getattr(ip, name) for name in IpResponse.model_fields if name != "address"},
            "address": _address_text(ip.address),
        }
    )


def _address_text(value: object) -> str:
    # asyncpg answers inet as an ipaddress object, or text with a host mask.
    return str(value).split("/", 1)[0]


async def list_ips(
    session: AsyncSession,
    *,
    viewer: User,
    flt: AssetFilter,
    limit: int,
    cursor: str | None,
    sort: AssetSort = "-last_seen_at",
) -> Page[IpResponse]:
    ips, next_cursor, total = await _keyset_page(
        session,
        select(Ip),
        id_column=Ip.id,
        where=_ip_where(viewer, flt),
        sort=_time_sort(Ip, sort),
        limit=limit,
        cursor=cursor,
        count_from=Ip,
    )
    return Page[IpResponse](
        items=[_ip_response(ip) for ip in ips], next_cursor=next_cursor, total=total
    )


async def get_ip(session: AsyncSession, *, viewer: User, ip_id: uuid.UUID) -> IpResponse:
    ip = await session.scalar(
        select(Ip).where(Ip.id == ip_id, program_visible_to(viewer, Ip.program_id))
    )
    if ip is None:
        raise NotFoundError(detail="ip does not exist")
    return _ip_response(ip)


async def list_urls(
    session: AsyncSession,
    *,
    viewer: User,
    flt: AssetFilter,
    limit: int,
    cursor: str | None,
    sort: AssetSort = "-last_seen_at",
) -> Page[UrlResponse]:
    urls, next_cursor, total = await _keyset_page(
        session,
        select(Url),
        id_column=Url.id,
        where=_url_where(viewer, flt),
        sort=_time_sort(Url, sort),
        limit=limit,
        cursor=cursor,
        count_from=Url,
    )
    return Page[UrlResponse](
        items=[UrlResponse.model_validate(url) for url in urls],
        next_cursor=next_cursor,
        total=total,
    )


async def get_url(session: AsyncSession, *, viewer: User, url_id: uuid.UUID) -> UrlDetailResponse:
    url = await session.scalar(
        select(Url).where(Url.id == url_id, program_visible_to(viewer, Url.program_id))
    )
    if url is None:
        raise NotFoundError(detail="url does not exist")
    technologies = [
        UrlTechnologyResponse(technology_id=row[0], name=row[1], category=row[2], version=row[3])
        for row in await session.execute(
            select(Technology.id, Technology.name, Technology.category, UrlTechnology.version)
            .join(UrlTechnology, UrlTechnology.technology_id == Technology.id)
            .where(UrlTechnology.url_id == url.id)
            .order_by(Technology.name)
        )
    ]
    return UrlDetailResponse.model_validate(
        {**UrlResponse.model_validate(url).model_dump(), "technologies": technologies}
    )


async def list_services(
    session: AsyncSession,
    *,
    viewer: User,
    flt: AssetFilter,
    limit: int,
    cursor: str | None,
    sort: AssetSort = "-last_seen_at",
) -> Page[ServiceResponse]:
    services, next_cursor, total = await _keyset_page(
        session,
        select(Service),
        id_column=Service.id,
        where=_service_where(viewer, flt),
        sort=_time_sort(Service, sort),
        limit=limit,
        cursor=cursor,
        count_from=Service,
    )
    return Page[ServiceResponse](
        items=[ServiceResponse.model_validate(service) for service in services],
        next_cursor=next_cursor,
        total=total,
    )


async def get_service(
    session: AsyncSession, *, viewer: User, service_id: uuid.UUID
) -> ServiceResponse:
    service = await session.scalar(
        select(Service).where(
            Service.id == service_id, program_visible_to(viewer, Service.program_id)
        )
    )
    if service is None:
        raise NotFoundError(detail="service does not exist")
    return ServiceResponse.model_validate(service)


ExportResource = Literal["ips", "urls", "services"]

_EXPORT_COLUMNS: dict[str, tuple[str, ...]] = {
    "ips": tuple(IpResponse.model_fields),
    "urls": tuple(UrlResponse.model_fields),
    "services": tuple(ServiceResponse.model_fields),
}


async def export_assets(
    session: AsyncSession,
    *,
    viewer: User,
    resource: ExportResource,
    flt: AssetFilter,
    fmt: ExportFormat,
) -> Iterator[str]:
    rows: list[dict[str, Any]] = []
    cursor: str | None = None
    while True:
        page: Page[IpResponse] | Page[UrlResponse] | Page[ServiceResponse]
        if resource == "ips":
            page = await list_ips(
                session, viewer=viewer, flt=flt, limit=EXPORT_BATCH, cursor=cursor
            )
        elif resource == "urls":
            page = await list_urls(
                session, viewer=viewer, flt=flt, limit=EXPORT_BATCH, cursor=cursor
            )
        else:
            page = await list_services(
                session, viewer=viewer, flt=flt, limit=EXPORT_BATCH, cursor=cursor
            )
        rows.extend(item.model_dump() for item in page.items)
        if page.next_cursor is None:
            break
        cursor = page.next_cursor
    return export.render(fmt, _EXPORT_COLUMNS[resource], rows)


# ---------------------------------------------------------------- events, technologies


_EventIp = aliased(Ip)
_ServiceIp = aliased(Ip)


def _event_name() -> ColumnElement[str]:
    service_name = func.concat(
        func.host(_ServiceIp.address), literal(":"), Service.port, literal("/"), Service.transport
    )
    return func.coalesce(Domain.name, func.host(_EventIp.address), Url.url, service_name)


async def list_asset_events(
    session: AsyncSession,
    *,
    viewer: User,
    program_id: uuid.UUID | None,
    domain_id: uuid.UUID | None,
    limit: int,
    cursor: str | None,
    sort: EventSort = "-created_at",
) -> Page[AssetEventResponse]:
    clauses: list[ColumnElement[bool]] = [
        program_visible_to(viewer, AssetEvent.program_id),
        # Events of a soft-deleted domain leave the feed with the domain.
        or_(AssetEvent.domain_id.is_(None), Domain.deleted_at.is_(None)),
    ]
    if program_id is not None:
        clauses.append(AssetEvent.program_id == program_id)
    if domain_id is not None:
        clauses.append(or_(AssetEvent.domain_id == domain_id, Url.domain_id == domain_id))
    where = and_(*clauses)
    joined = (
        AssetEvent.__table__.join(Program, Program.id == AssetEvent.program_id)
        .outerjoin(Domain, Domain.id == AssetEvent.domain_id)
        .outerjoin(_EventIp, _EventIp.id == AssetEvent.ip_id)
        .outerjoin(Url, Url.id == AssetEvent.url_id)
        .outerjoin(Service, Service.id == AssetEvent.service_id)
        .outerjoin(_ServiceIp, _ServiceIp.id == Service.ip_id)
        .outerjoin(Job, Job.id == AssetEvent.job_id)
        .outerjoin(ToolModule, ToolModule.id == Job.tool_module_id)
    )
    stmt = (
        select(AssetEvent)
        .select_from(joined)
        .add_columns(_event_name(), Program.name, ToolModule.name, _EventIp.asn, _EventIp.asn_org)
    )
    size = _clamp(limit)
    descending = sort.startswith("-")
    keyset = tuple_(AssetEvent.created_at, AssetEvent.id)
    order = (
        (AssetEvent.created_at.desc(), AssetEvent.id.desc())
        if descending
        else (AssetEvent.created_at.asc(), AssetEvent.id.asc())
    )
    page_stmt = stmt.where(where).order_by(*order)
    if cursor is not None:
        seen_at, seen_id = decode_time_cursor(cursor)
        page_stmt = page_stmt.where(
            keyset < (seen_at, seen_id) if descending else keyset > (seen_at, seen_id)
        )
    rows = list((await session.execute(page_stmt.limit(size + 1))).all())
    total = await session.scalar(select(func.count()).select_from(joined).where(where)) or 0
    page_rows = rows[:size]
    items = [
        AssetEventResponse(
            id=event.id,
            program_id=event.program_id,
            domain_id=event.domain_id,
            ip_id=event.ip_id,
            url_id=event.url_id,
            service_id=event.service_id,
            event_type=event.event_type,
            job_id=event.job_id,
            raw_output_id=event.raw_output_id,
            diff=event.diff,
            created_at=event.created_at,
            asset_type=_asset_type(event),
            asset_name=name or "",
            program_name=program_name,
            tool_module_name=tool_module_name,
            asn=asn if event.ip_id else None,
            asn_org=asn_org if event.ip_id else None,
        )
        for event, name, program_name, tool_module_name, asn, asn_org in page_rows
    ]
    next_cursor = (
        encode_cursor(page_rows[-1][0].created_at.isoformat(), page_rows[-1][0].id)
        if len(rows) > size
        else None
    )
    return Page[AssetEventResponse](items=items, next_cursor=next_cursor, total=total)


def _asset_type(event: AssetEvent) -> str:
    if event.domain_id is not None:
        return "domain"
    if event.ip_id is not None:
        return "ip"
    if event.url_id is not None:
        return "url"
    return "service"


async def list_technologies(
    session: AsyncSession,
    *,
    limit: int,
    cursor: str | None,
    sort: TechnologySort = "name",
) -> Page[TechnologyResponse]:
    """The shared catalogue. It names software, not program data, so every role sees it."""
    technologies, next_cursor, total = await _keyset_page(
        session,
        select(Technology),
        id_column=Technology.id,
        where=true(),
        sort=_sort(Technology.name, sort, "text"),
        limit=limit,
        cursor=cursor,
        count_from=Technology,
    )
    return Page[TechnologyResponse](
        items=[TechnologyResponse.model_validate(row) for row in technologies],
        next_cursor=next_cursor,
        total=total,
    )
