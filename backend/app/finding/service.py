"""Findings of a program: ingest from the parser, read, triage, export.

Rules: docs/architecture/business-flow.md, section Vòng đời finding, and
docs/data/database.md, section Upsert và khử trùng lặp.

- The parser writes through `ingest`: an upsert on (`program_id`,
  `dedup_key`). A finding seen again only moves `last_seen_at`; its triage
  state, evidence links and first sighting stay.
- Every read goes through `program_visible_to`, so a User sees only findings of
  the programs assigned to it, and a hidden finding answers 404 (G7).
- Triage moves along `TRANSITIONS` only, with a conditional UPDATE, and every
  change writes one audit row. A finding of an archived program is read only.
- `reported` is reached only through `mark_reported`, when the report module
  submits a report holding the finding.
"""

import uuid
from collections.abc import Iterator, Sequence
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime, timedelta
from typing import Any, Final, Literal

import structlog
from sqlalchemy import (
    Boolean,
    ColumnElement,
    Row,
    Select,
    and_,
    case,
    func,
    literal_column,
    select,
    tuple_,
)
from sqlalchemy import update as sql_update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute

from app.asset import service as asset_service
from app.asset.models import Domain, Ip, Service, Url
from app.asset.schemas import DomainRecord, IngestBatch, IngestResult, IpRecord, ServiceRecord
from app.core import audit
from app.core.errors import BadRequestError, ConflictError, NotFoundError, ValidationFailedError
from app.core.identity import User
from app.core.pagination import MAX_LIMIT, Page, decode_cursor, decode_time_cursor, encode_cursor
from app.core.security import program_visible_to
from app.finding.models import Finding, Severity, TriageStatus
from app.finding.schemas import (
    ExportFormat,
    FindingAsset,
    FindingBatch,
    FindingDetailResponse,
    FindingIngestResult,
    FindingResponse,
    FindingSort,
    FindingSummaryResponse,
    FindingTagResponse,
    ProgramCount,
    SeverityCounts,
    TriageCounts,
)
from app.job.models import Job
from app.program.models import Program, ProgramStatus
from app.scope import service as scope_service
from app.scope.matching import Rule
from app.tag.models import FindingTag, Tag
from app.tool_module.models import ToolModule

log = structlog.get_logger()

RESOURCE = "finding"
EXPORT_BATCH = 1000
UPSERT_CHUNK = 500

# Triage moves a person may make: docs/architecture/business-flow.md, section
# Vòng đời finding. Staying in the same state is a no-op, not an error.
TRANSITIONS: Final[dict[TriageStatus, frozenset[TriageStatus]]] = {
    TriageStatus.NEW: frozenset(
        {TriageStatus.CONFIRMED, TriageStatus.FALSE_POSITIVE, TriageStatus.DUPLICATE}
    ),
    TriageStatus.CONFIRMED: frozenset(
        {
            TriageStatus.NEW,
            TriageStatus.FALSE_POSITIVE,
            TriageStatus.DUPLICATE,
            TriageStatus.REPORTED,
            TriageStatus.RESOLVED,
        }
    ),
    TriageStatus.FALSE_POSITIVE: frozenset({TriageStatus.NEW, TriageStatus.CONFIRMED}),
    TriageStatus.DUPLICATE: frozenset({TriageStatus.NEW, TriageStatus.CONFIRMED}),
    TriageStatus.REPORTED: frozenset({TriageStatus.CONFIRMED, TriageStatus.RESOLVED}),
    TriageStatus.RESOLVED: frozenset({TriageStatus.CONFIRMED}),
}

# Reached only by submitting a report, never by hand: business-flow.md, section
# Vòng đời finding. The move stays in TRANSITIONS so the table reads the same.
REPORT_ONLY: Final = frozenset({TriageStatus.REPORTED})

_SEVERITY_RANK: Final = {
    Severity.CRITICAL.value: 5,
    Severity.HIGH.value: 4,
    Severity.MEDIUM.value: 3,
    Severity.LOW.value: 2,
    Severity.INFO.value: 1,
}
_severity_rank = case(_SEVERITY_RANK, value=Finding.severity, else_=0)


# ---------------------------------------------------------------- ingest


def _asset_batch(batch: FindingBatch) -> IngestBatch:
    assets = IngestBatch()
    for record in batch.findings:
        asset = record.asset
        if isinstance(asset, DomainRecord):
            assets.domains.append(asset)
        elif isinstance(asset, IpRecord):
            assets.ips.append(asset)
        elif isinstance(asset, ServiceRecord):
            assets.services.append(asset)
        else:
            assets.urls.append(asset)
    return assets


@dataclass(frozen=True)
class IngestOutcome:
    findings: FindingIngestResult
    assets: IngestResult
    # Findings whose asset value could not be read: dropped, counted in the log.
    dropped: int
    new_by_severity: dict[str, int]
    # (id, severity, name) of each finding this batch created, for the alert rule
    # of the parser. Empty when every finding was seen before.
    new_findings: list[tuple[uuid.UUID, str, str]] = field(default_factory=list)


async def ingest(
    session: AsyncSession,
    batch: FindingBatch,
    origin: asset_service.Provenance,
    rules: Sequence[Rule],
) -> IngestOutcome:
    """Write one batch of parsed findings and the assets they sit on.

    The asset comes first, through the asset service, so a finding always links
    one existing row. The transaction belongs to the caller.
    """
    assets = await asset_service.ingest(session, _asset_batch(batch), origin, rules)
    located = await asset_service.locate(
        session, origin.program_id, [record.asset for record in batch.findings]
    )
    rows: dict[str, dict[str, Any]] = {}
    dropped = 0
    for record, place in zip(batch.findings, located, strict=True):
        if place is None:
            dropped += 1
            continue
        if record.dedup_key in rows:
            # Seen again within the batch: like a later sighting, it changes
            # nothing, so the first line's evidence stays.
            continue
        rows[record.dedup_key] = {
            "program_id": origin.program_id,
            "job_id": origin.job_id,
            "raw_output_id": origin.raw_output_id,
            f"{place.asset_type.value}_id": place.asset_id,
            "dedup_key": record.dedup_key,
            "name": record.name,
            "template_id": record.template_id,
            "severity": record.severity.value,
            "matched_at": record.matched_at,
            "evidence": record.evidence,
            "cve": list(record.cve),
            "detail": record.detail,
        }
    created = 0
    seen = 0
    new_by_severity: dict[str, int] = {}
    new_findings: list[tuple[uuid.UUID, str, str]] = []
    ordered = [rows[key] for key in sorted(rows)]
    for start in range(0, len(ordered), UPSERT_CHUNK):
        chunk = ordered[start : start + UPSERT_CHUNK]
        # Each row names one asset column; the others are explicit NULLs so
        # every row of the INSERT has the same columns.
        for row in chunk:
            for name in ("domain_id", "ip_id", "url_id", "service_id"):
                row.setdefault(name, None)
        upsert = insert(Finding).values(chunk)
        stmt = upsert.on_conflict_do_update(
            index_elements=[Finding.program_id, Finding.dedup_key],
            set_={"last_seen_at": func.now()},
        ).returning(
            Finding.id,
            Finding.severity,
            Finding.name,
            literal_column("(xmax = 0)", Boolean).label("created"),
        )
        for finding_id, severity, name, is_new in await session.execute(stmt):
            if is_new:
                created += 1
                new_by_severity[severity] = new_by_severity.get(severity, 0) + 1
                new_findings.append((finding_id, severity, name))
            else:
                seen += 1
    return IngestOutcome(
        findings=FindingIngestResult(created=created, seen_again=seen),
        assets=assets,
        dropped=dropped,
        new_by_severity=new_by_severity,
        new_findings=new_findings,
    )


# ---------------------------------------------------------------- filters, rows


@dataclass(frozen=True)
class FindingFilter:
    program_id: uuid.UUID | None = None
    triage_status: Sequence[TriageStatus] | None = None
    severity: Sequence[Severity] | None = None
    domain_id: uuid.UUID | None = None
    job_id: uuid.UUID | None = None
    tool_module_id: Sequence[uuid.UUID] | None = None
    tag_id: uuid.UUID | None = None
    q: str | None = None
    ids: Sequence[uuid.UUID] | None = None


def _like_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _visible(viewer: User) -> ColumnElement[bool]:
    return program_visible_to(viewer, Finding.program_id)


def _where(viewer: User, flt: FindingFilter) -> ColumnElement[bool]:
    clauses: list[ColumnElement[bool]] = [_visible(viewer)]
    if flt.ids:
        clauses.append(Finding.id.in_(list(flt.ids)))
    if flt.program_id is not None:
        clauses.append(Finding.program_id == flt.program_id)
    if flt.triage_status:
        clauses.append(Finding.triage_status.in_([status.value for status in flt.triage_status]))
    if flt.severity:
        clauses.append(Finding.severity.in_([severity.value for severity in flt.severity]))
    if flt.domain_id is not None:
        clauses.append(
            asset_service.domain_asset_clause(
                flt.domain_id,
                domain_column=Finding.domain_id,
                url_column=Finding.url_id,
                service_column=Finding.service_id,
            )
        )
    if flt.job_id is not None:
        clauses.append(Finding.job_id == flt.job_id)
    if flt.tool_module_id:
        clauses.append(
            Finding.job_id.in_(
                select(Job.id).where(Job.tool_module_id.in_(list(flt.tool_module_id)))
            )
        )
    if flt.tag_id is not None:
        clauses.append(
            Finding.id.in_(select(FindingTag.finding_id).where(FindingTag.tag_id == flt.tag_id))
        )
    if flt.q:
        pattern = f"%{_like_escape(flt.q)}%"
        clauses.append(
            Finding.name.ilike(pattern, escape="\\")
            | Finding.template_id.ilike(pattern, escape="\\")
            | Finding.matched_at.ilike(pattern, escape="\\")
            | func.array_to_string(Finding.cve, " ").ilike(pattern, escape="\\")
        )
    return and_(*clauses)


def _row_select() -> Select[Finding, str, str, str]:
    return (
        select(
            Finding,
            Program.name.label("program_name"),
            ToolModule.name.label("tool_module_name"),
            User.username.label("triaged_by_username"),
        )
        .join(Program, Program.id == Finding.program_id)
        .outerjoin(Job, Job.id == Finding.job_id)
        .outerjoin(ToolModule, ToolModule.id == Job.tool_module_id)
        .outerjoin(User, User.id == Finding.triaged_by)
    )


@dataclass(frozen=True)
class _AssetInfo:
    asset: FindingAsset
    in_scope: bool
    # What the scope rules are matched against: name, address or URL.
    target: str


async def _assets(
    session: AsyncSession, findings: Sequence[Finding]
) -> dict[uuid.UUID, _AssetInfo]:
    """The asset of each finding, read in one query per asset type."""
    found: dict[uuid.UUID, _AssetInfo] = {}
    by_type: dict[str, dict[uuid.UUID, list[uuid.UUID]]] = {}
    for finding in findings:
        for kind, asset_id in (
            ("domain", finding.domain_id),
            ("ip", finding.ip_id),
            ("url", finding.url_id),
            ("service", finding.service_id),
        ):
            if asset_id is not None:
                by_type.setdefault(kind, {}).setdefault(asset_id, []).append(finding.id)
    info: dict[tuple[str, uuid.UUID], _AssetInfo] = {}
    if ids := list(by_type.get("domain", {})):
        for row_id, name, in_scope in await session.execute(
            select(Domain.id, Domain.name, Domain.in_scope).where(Domain.id.in_(ids))
        ):
            info["domain", row_id] = _AssetInfo(
                FindingAsset(type="domain", id=row_id, name=name), in_scope, name
            )
    if ids := list(by_type.get("ip", {})):
        for row_id, address, in_scope in await session.execute(
            select(Ip.id, func.host(Ip.address), Ip.in_scope).where(Ip.id.in_(ids))
        ):
            info["ip", row_id] = _AssetInfo(
                FindingAsset(type="ip", id=row_id, name=address, ip=address), in_scope, address
            )
    if ids := list(by_type.get("url", {})):
        for row_id, url, port, in_scope in await session.execute(
            select(Url.id, Url.url, Url.port, Url.in_scope).where(Url.id.in_(ids))
        ):
            info["url", row_id] = _AssetInfo(
                FindingAsset(type="url", id=row_id, name=url, port=port), in_scope, url
            )
    if ids := list(by_type.get("service", {})):
        for row_id, address, port, name, in_scope in await session.execute(
            select(Service.id, func.host(Ip.address), Service.port, Service.name, Service.in_scope)
            .join(Ip, Ip.id == Service.ip_id)
            .where(Service.id.in_(ids))
        ):
            shown = f"[{address}]:{port}" if ":" in address else f"{address}:{port}"
            info["service", row_id] = _AssetInfo(
                FindingAsset(
                    type="service", id=row_id, name=shown, ip=address, port=port, service_name=name
                ),
                in_scope,
                address,
            )
    for kind, assets in by_type.items():
        for asset_id, finding_ids in assets.items():
            if (kind, asset_id) in info:
                for finding_id in finding_ids:
                    found[finding_id] = info[kind, asset_id]
    return found


async def _tags(
    session: AsyncSession, ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, list[FindingTagResponse]]:
    tags: dict[uuid.UUID, list[FindingTagResponse]] = {}
    if not ids:
        return tags
    for finding_id, tag_id, key, value in await session.execute(
        select(FindingTag.finding_id, Tag.id, Tag.key, Tag.value)
        .join(Tag, Tag.id == FindingTag.tag_id)
        .where(FindingTag.finding_id.in_(list(ids)))
        .order_by(Tag.key, Tag.value)
    ):
        tags.setdefault(finding_id, []).append(
            FindingTagResponse(tag_id=tag_id, key=key, value=value)
        )
    return tags


def _text(detail: dict[str, Any], key: str) -> str | None:
    value = detail.get(key)
    return value if isinstance(value, str) else None


def _columns(
    row: Row[Finding, str, str, str], asset: FindingAsset, tags: list[FindingTagResponse]
) -> dict[str, Any]:
    finding: Finding = row[0]
    return {
        "id": finding.id,
        "program_id": finding.program_id,
        "program_name": row.program_name,
        "job_id": finding.job_id,
        "raw_output_id": finding.raw_output_id,
        "tool_module_name": row.tool_module_name,
        "dedup_key": finding.dedup_key,
        "name": finding.name,
        "template_id": finding.template_id,
        "severity": finding.severity,
        "matched_at": finding.matched_at,
        "evidence": finding.evidence,
        "cve": list(finding.cve or []),
        "matcher": _text(finding.detail or {}, "matcher"),
        "asset": asset,
        "triage_status": finding.triage_status,
        "duplicate_of_id": finding.duplicate_of_id,
        "triaged_by": finding.triaged_by,
        "triaged_by_username": row.triaged_by_username,
        "triaged_at": finding.triaged_at,
        "first_seen_at": finding.first_seen_at,
        "last_seen_at": finding.last_seen_at,
        "tags": tags,
    }


async def _responses(
    session: AsyncSession, rows: Sequence[Row[Finding, str, str, str]]
) -> list[FindingResponse]:
    findings = [row[0] for row in rows]
    assets = await _assets(session, findings)
    tags = await _tags(session, [finding.id for finding in findings])
    return [
        FindingResponse.model_validate(
            _columns(row, assets[row[0].id].asset, tags.get(row[0].id, []))
        )
        for row in rows
    ]


# ---------------------------------------------------------------- list, summary, export


@dataclass(frozen=True)
class _Sort:
    expression: ColumnElement[Any] | InstrumentedAttribute[Any]
    descending: bool
    kind: Literal["int", "time"]


def _sort(sort: FindingSort) -> _Sort:
    name = sort.lstrip("-")
    descending = sort.startswith("-")
    if name == "severity":
        return _Sort(_severity_rank, descending, "int")
    column = Finding.first_seen_at if name == "first_seen_at" else Finding.last_seen_at
    return _Sort(column, descending, "time")


def _clamp(limit: int) -> int:
    return max(1, min(limit, MAX_LIMIT))


def _decode(cursor: str, sort: _Sort) -> tuple[Any, uuid.UUID]:
    if sort.kind == "time":
        return decode_time_cursor(cursor)
    value, row_id = decode_cursor(cursor)
    if not isinstance(value, int) or isinstance(value, bool):
        raise BadRequestError(detail="cursor is not valid")
    return value, row_id


async def list_findings(
    session: AsyncSession,
    *,
    viewer: User,
    flt: FindingFilter,
    limit: int,
    cursor: str | None,
    sort: FindingSort = "-last_seen_at",
) -> Page[FindingResponse]:
    size = _clamp(limit)
    order = _sort(sort)
    keyset = (order.expression, Finding.id)
    stmt = (
        _row_select()
        .add_columns(order.expression.label("sort_value"))
        .where(_where(viewer, flt))
        .order_by(
            *(
                (order.expression.desc(), Finding.id.desc())
                if order.descending
                else (order.expression.asc(), Finding.id.asc())
            )
        )
    )
    if cursor is not None:
        seen, seen_id = _decode(cursor, order)
        pair = tuple_(*keyset)
        stmt = stmt.where(pair < (seen, seen_id) if order.descending else pair > (seen, seen_id))
    rows = list((await session.execute(stmt.limit(size + 1))).all())
    total = (
        await session.scalar(select(func.count()).select_from(Finding).where(_where(viewer, flt)))
        or 0
    )
    page_rows = rows[:size]
    next_cursor = None
    if len(rows) > size:
        last = page_rows[-1]
        value = last.sort_value
        next_cursor = encode_cursor(
            value.isoformat() if isinstance(value, datetime) else int(value), last[0].id
        )
    return Page[FindingResponse](
        items=await _responses(session, page_rows), next_cursor=next_cursor, total=total
    )


async def summary(
    session: AsyncSession, *, viewer: User, flt: FindingFilter
) -> FindingSummaryResponse:
    where = _where(viewer, flt)
    day_ago = datetime.now(UTC) - timedelta(hours=24)
    by_severity: dict[str, int] = {}
    new_24h: dict[str, int] = {}
    for severity, count, recent in await session.execute(
        select(
            Finding.severity,
            func.count(),
            func.count().filter(Finding.first_seen_at >= day_ago),
        )
        .where(where)
        .group_by(Finding.severity)
    ):
        by_severity[severity] = count
        new_24h[severity] = recent
    by_status = dict(
        list(
            (
                await session.execute(
                    select(Finding.triage_status, func.count())
                    .where(where)
                    .group_by(Finding.triage_status)
                )
            ).all()
        )
    )
    by_program = [
        ProgramCount(program_id=program_id, name=name, count=count)
        for program_id, name, count in await session.execute(
            select(Finding.program_id, Program.name, func.count())
            .join(Program, Program.id == Finding.program_id)
            .where(where)
            .group_by(Finding.program_id, Program.name)
            .order_by(func.count().desc(), Program.name)
        )
    ]
    return FindingSummaryResponse(
        total=sum(by_severity.values()),
        by_severity=SeverityCounts(**by_severity),
        by_triage_status=TriageCounts(**by_status),
        by_program=by_program,
        new_24h_by_severity=SeverityCounts(**new_24h),
    )


EXPORT_COLUMNS = (
    "id",
    "program_name",
    "name",
    "template_id",
    "severity",
    "triage_status",
    "asset_type",
    "asset_name",
    "matched_at",
    "cve",
    "matcher",
    "tool_module_name",
    "first_seen_at",
    "last_seen_at",
)


async def export_findings(
    session: AsyncSession, *, viewer: User, flt: FindingFilter, fmt: ExportFormat
) -> Iterator[str]:
    rows: list[dict[str, Any]] = []
    cursor: str | None = None
    while True:
        page = await list_findings(
            session, viewer=viewer, flt=flt, limit=EXPORT_BATCH, cursor=cursor
        )
        for item in page.items:
            row = item.model_dump()
            row["asset_type"] = item.asset.type
            row["asset_name"] = item.asset.name
            rows.append(row)
        if page.next_cursor is None:
            break
        cursor = page.next_cursor
    return asset_service.render_export(fmt, EXPORT_COLUMNS, rows)


def export_headers(fmt: ExportFormat) -> tuple[str, dict[str, str]]:
    return asset_service.export_headers("findings", fmt)


# ---------------------------------------------------------------- detail


async def get_finding(
    session: AsyncSession, *, viewer: User, finding_id: uuid.UUID
) -> FindingDetailResponse:
    row = (
        await session.execute(_row_select().where(Finding.id == finding_id, _visible(viewer)))
    ).first()
    if row is None:
        raise NotFoundError(detail="finding does not exist")
    finding: Finding = row[0]
    info = (await _assets(session, [finding]))[finding.id]
    tags = (await _tags(session, [finding.id])).get(finding.id, [])
    decision = await scope_service.decide_target(session, finding.program_id, info.target)
    detail = dict(finding.detail or {})
    current = TriageStatus(finding.triage_status)
    return FindingDetailResponse.model_validate(
        {
            **_columns(row, info.asset, tags),
            "description": _text(detail, "description"),
            "remediation": _text(detail, "remediation"),
            "request": _text(detail, "request"),
            "response": _text(detail, "response"),
            "detail": detail,
            "in_scope": info.in_scope,
            "scope_rule": decision.rule_value if decision.allowed else None,
            "allowed_triage_statuses": sorted(TRANSITIONS[current] - REPORT_ONLY),
        }
    )


# ---------------------------------------------------------------- triage


async def _locked(
    session: AsyncSession, viewer: User, ids: Sequence[uuid.UUID]
) -> list[tuple[Finding, str]]:
    """The findings with their program status, locked, all or none: 404 when one is hidden."""
    wanted = set(ids)
    rows = list(
        (
            await session.execute(
                select(Finding, Program.status)
                .join(Program, Program.id == Finding.program_id)
                .where(Finding.id.in_(wanted), _visible(viewer))
                .order_by(Finding.id)
                .with_for_update(of=Finding)
            )
        ).all()
    )
    if len(rows) != len(wanted):
        raise NotFoundError(detail="finding does not exist")
    if any(status == ProgramStatus.ARCHIVED for _, status in rows):
        raise ConflictError(detail="program is archived and read only")
    return [(finding, status) for finding, status in rows]


def _check_move(finding: Finding, target: TriageStatus, *, by_report: bool = False) -> None:
    current = TriageStatus(finding.triage_status)
    if current != target and target not in TRANSITIONS[current]:
        raise ConflictError(
            detail=f"triage status cannot move from {current.value} to {target.value}",
            errors=[{"field": "triage_status", "code": "invalid_transition"}],
        )
    if target in REPORT_ONLY and current != target and not by_report:
        # Every reported finding then traces to the report that carried it (G6).
        raise ConflictError(
            detail="a finding becomes reported only when a report holding it is submitted",
            errors=[{"field": "triage_status", "code": "reported_by_report"}],
        )


async def _check_duplicate_of(
    session: AsyncSession, viewer: User, finding: Finding, duplicate_of_id: uuid.UUID | None
) -> None:
    """A duplicate points at another, non-duplicate finding of the same program."""
    if duplicate_of_id is None:
        raise ValidationFailedError(
            detail="duplicate_of_id is required for a duplicate",
            errors=[{"field": "duplicate_of_id", "code": "missing"}],
        )
    if duplicate_of_id == finding.id:
        raise ValidationFailedError(
            detail="a finding cannot duplicate itself",
            errors=[{"field": "duplicate_of_id", "code": "same_finding"}],
        )
    original = await session.scalar(
        select(Finding).where(Finding.id == duplicate_of_id, _visible(viewer))
    )
    if original is None or original.program_id != finding.program_id:
        raise ValidationFailedError(
            detail="duplicate_of_id is not a finding of the same program",
            errors=[{"field": "duplicate_of_id", "code": "not_found"}],
        )
    if original.triage_status == TriageStatus.DUPLICATE:
        raise ValidationFailedError(
            detail="duplicate_of_id is itself a duplicate",
            errors=[{"field": "duplicate_of_id", "code": "duplicate_chain"}],
        )
    pointed_at = await session.scalar(
        select(func.count()).select_from(Finding).where(Finding.duplicate_of_id == finding.id)
    )
    if pointed_at:
        raise ConflictError(
            detail="other findings are duplicates of this one",
            errors=[{"field": "triage_status", "code": "has_duplicates"}],
        )


async def _move(
    session: AsyncSession,
    actor: User,
    finding: Finding,
    target: TriageStatus,
    duplicate_of_id: uuid.UUID | None,
    report_id: uuid.UUID | None = None,
) -> bool:
    """Write one triage change and its audit row. False when nothing changes."""
    current = finding.triage_status
    if current == target and finding.duplicate_of_id == duplicate_of_id:
        return False
    result = await session.execute(
        sql_update(Finding)
        .where(Finding.id == finding.id, Finding.triage_status == current)
        .values(
            triage_status=target.value,
            duplicate_of_id=duplicate_of_id,
            triaged_by=actor.id,
            triaged_at=func.now(),
        )
        .execution_options(synchronize_session=False)
    )
    if getattr(result, "rowcount", 0) != 1:
        # The row lock makes this unreachable; kept as the conditional-update guard.
        raise ConflictError(detail="the finding changed meanwhile, reload it")
    await audit.record(
        session,
        action="finding_triaged",
        user_id=actor.id,
        program_id=finding.program_id,
        resource_type=RESOURCE,
        resource_id=finding.id,
        detail={
            "from": current,
            "to": target.value,
            "duplicate_of_id": str(duplicate_of_id) if duplicate_of_id else None,
            **({"report_id": str(report_id)} if report_id else {}),
        },
    )
    return True


async def triage(
    session: AsyncSession,
    *,
    actor: User,
    finding_id: uuid.UUID,
    triage_status: TriageStatus,
    duplicate_of_id: uuid.UUID | None,
) -> FindingDetailResponse:
    ((finding, _),) = await _locked(session, actor, [finding_id])
    _check_move(finding, triage_status)
    if triage_status == TriageStatus.DUPLICATE:
        await _check_duplicate_of(session, actor, finding, duplicate_of_id)
    elif duplicate_of_id is not None:
        raise ValidationFailedError(
            detail="duplicate_of_id is only taken with duplicate",
            errors=[{"field": "duplicate_of_id", "code": "not_allowed"}],
        )
    if await _move(session, actor, finding, triage_status, duplicate_of_id):
        session.expire(finding)
    return await get_finding(session, viewer=actor, finding_id=finding_id)


async def bulk_triage(
    session: AsyncSession,
    *,
    actor: User,
    ids: Sequence[uuid.UUID],
    triage_status: TriageStatus,
) -> None:
    """One status onto many findings, all or none. `duplicate` is refused by the schema."""
    rows = await _locked(session, actor, ids)
    for finding, _ in rows:
        _check_move(finding, triage_status)
    for finding, _ in rows:
        await _move(session, actor, finding, triage_status, None)


# ---------------------------------------------------------------- for the report module


async def read_many(
    session: AsyncSession, *, viewer: User, ids: Sequence[uuid.UUID]
) -> list[FindingResponse]:
    """The visible findings among `ids`, worst severity first. Hidden ones are left out."""
    if not ids:
        return []
    rows = list(
        (
            await session.execute(
                _row_select()
                .where(Finding.id.in_(list(set(ids))), _visible(viewer))
                .order_by(_severity_rank.desc(), Finding.name, Finding.id)
            )
        ).all()
    )
    return await _responses(session, rows)


async def mark_reported(
    session: AsyncSession, *, actor: User, ids: Sequence[uuid.UUID], report_id: uuid.UUID
) -> None:
    """Move the findings of a submitted report to `reported`, all or none.

    Each must still be `confirmed`: one that left it since the report was drafted
    stops the submit with 409, so nothing is reported by accident.
    """
    rows = await _locked(session, actor, ids)
    stale = [finding for finding, _ in rows if finding.triage_status != TriageStatus.CONFIRMED]
    if stale:
        raise ConflictError(
            detail="every finding of the report must be confirmed to submit it",
            errors=[{"field": "finding_ids", "code": "not_confirmed"}],
        )
    for finding, _ in rows:
        _check_move(finding, TriageStatus.REPORTED, by_report=True)
        await _move(session, actor, finding, TriageStatus.REPORTED, None, report_id)


def with_ids(flt: FindingFilter, ids: Sequence[uuid.UUID] | None) -> FindingFilter:
    return replace(flt, ids=ids or None)


__all__ = [
    "REPORT_ONLY",
    "TRANSITIONS",
    "FindingFilter",
    "IngestOutcome",
    "bulk_triage",
    "export_findings",
    "get_finding",
    "ingest",
    "list_findings",
    "mark_reported",
    "read_many",
    "summary",
    "triage",
]
