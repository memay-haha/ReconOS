"""Reports of a program: draft, edit, submit, export.

Rules: docs/architecture/business-flow.md, section Báo cáo.

- A report gathers `confirmed` findings of one program. A User reaches only the
  reports of the programs assigned to it; a hidden report answers 404 (G7).
- Submitting moves every finding of the report to `reported` through the
  finding service, all or none. A submitted report keeps only its
  `platform_report_ref` editable.
- Evidence is the raw output a finding came from: the report references it
  and never opens or changes the stored object (G6, G8).
- A report of an archived program is read only.
"""

import uuid
from collections.abc import Iterator, Sequence
from typing import Any, Final

from sqlalchemy import ColumnElement, Select, and_, delete, func, select, tuple_, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.asset import service as asset_service
from app.core import audit
from app.core.errors import ConflictError, NotFoundError, ValidationFailedError
from app.core.identity import User
from app.core.pagination import MAX_LIMIT, Page, decode_time_cursor, encode_cursor
from app.core.security import program_visible_to
from app.finding import service as finding_service
from app.finding.models import Finding, TriageStatus
from app.program import service as program_service
from app.program.models import Program
from app.raw_output import service as raw_output_service
from app.raw_output.schemas import RawOutputResponse
from app.report.models import Report, ReportFinding, ReportStatus
from app.report.schemas import (
    ReportCreateRequest,
    ReportDetailResponse,
    ReportExportFormat,
    ReportFindingResponse,
    ReportResponse,
    ReportSort,
    SeverityCounts,
)

RESOURCE = "report"
# Fields a submitted report still takes: the platform reference often comes later.
SUBMITTED_EDITABLE: Final = frozenset({"platform_report_ref"})


# ---------------------------------------------------------------- reads


def _visible(viewer: User) -> ColumnElement[bool]:
    return program_visible_to(viewer, Report.program_id)


def _row_select() -> Select[Report, str, str | None]:
    return (
        select(Report, Program.name.label("program_name"), User.username.label("username"))
        .join(Program, Program.id == Report.program_id)
        .outerjoin(User, User.id == Report.created_by)
    )


async def _severity_counts(
    session: AsyncSession, report_ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, dict[str, int]]:
    counts: dict[uuid.UUID, dict[str, int]] = {}
    if not report_ids:
        return counts
    for report_id, severity, count in await session.execute(
        select(ReportFinding.report_id, Finding.severity, func.count())
        .join(Finding, Finding.id == ReportFinding.finding_id)
        .where(ReportFinding.report_id.in_(list(report_ids)))
        .group_by(ReportFinding.report_id, Finding.severity)
    ):
        counts.setdefault(report_id, {})[severity] = count
    return counts


def _columns(
    report: Report, program_name: str, username: str | None, counts: dict[str, int]
) -> dict[str, Any]:
    return {
        "id": report.id,
        "program_id": report.program_id,
        "program_name": program_name,
        "title": report.title,
        "status": report.status,
        "platform_report_ref": report.platform_report_ref,
        "finding_count": sum(counts.values()),
        "severity_counts": SeverityCounts(**counts),
        "created_by": report.created_by,
        "created_by_username": username,
        "created_at": report.created_at,
        "updated_at": report.updated_at,
        "submitted_at": report.submitted_at,
    }


async def list_reports(
    session: AsyncSession,
    *,
    viewer: User,
    program_id: uuid.UUID | None,
    status: ReportStatus | None,
    q: str | None,
    limit: int,
    cursor: str | None,
    sort: ReportSort = "-created_at",
) -> Page[ReportResponse]:
    size = max(1, min(limit, MAX_LIMIT))
    clauses: list[ColumnElement[bool]] = [_visible(viewer)]
    if program_id is not None:
        clauses.append(Report.program_id == program_id)
    if status is not None:
        clauses.append(Report.status == status.value)
    if q:
        escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        clauses.append(Report.title.ilike(f"%{escaped}%", escape="\\"))
    where = and_(*clauses)
    descending = sort.startswith("-")
    stmt = _row_select().where(where)
    stmt = stmt.order_by(
        *(
            (Report.created_at.desc(), Report.id.desc())
            if descending
            else (Report.created_at.asc(), Report.id.asc())
        )
    )
    if cursor is not None:
        seen_at, seen_id = decode_time_cursor(cursor)
        key = tuple_(Report.created_at, Report.id)
        stmt = stmt.where(key < (seen_at, seen_id) if descending else key > (seen_at, seen_id))
    rows = list((await session.execute(stmt.limit(size + 1))).all())
    total = await session.scalar(select(func.count()).select_from(Report).where(where)) or 0
    page_rows = rows[:size]
    counts = await _severity_counts(session, [row[0].id for row in page_rows])
    next_cursor = (
        encode_cursor(page_rows[-1][0].created_at.isoformat(), page_rows[-1][0].id)
        if len(rows) > size
        else None
    )
    return Page[ReportResponse](
        items=[
            ReportResponse.model_validate(
                _columns(row[0], row.program_name, row.username, counts.get(row[0].id, {}))
            )
            for row in page_rows
        ],
        next_cursor=next_cursor,
        total=total,
    )


async def _finding_ids(session: AsyncSession, report_id: uuid.UUID) -> list[uuid.UUID]:
    return list(
        await session.scalars(
            select(ReportFinding.finding_id).where(ReportFinding.report_id == report_id)
        )
    )


async def _findings(
    session: AsyncSession, viewer: User, report_id: uuid.UUID
) -> list[ReportFindingResponse]:
    findings = await finding_service.read_many(
        session, viewer=viewer, ids=await _finding_ids(session, report_id)
    )
    evidence = await raw_output_service.describe_many(
        session,
        viewer=viewer,
        ids=[item.raw_output_id for item in findings if item.raw_output_id is not None],
    )
    return [
        ReportFindingResponse.model_validate(
            {
                **item.model_dump(),
                "raw_output": evidence.get(item.raw_output_id) if item.raw_output_id else None,
            }
        )
        for item in findings
    ]


async def get_report(
    session: AsyncSession, *, viewer: User, report_id: uuid.UUID
) -> ReportDetailResponse:
    row = (
        await session.execute(_row_select().where(Report.id == report_id, _visible(viewer)))
    ).first()
    if row is None:
        raise NotFoundError(detail="report does not exist")
    report: Report = row[0]
    counts = (await _severity_counts(session, [report.id])).get(report.id, {})
    return ReportDetailResponse.model_validate(
        {
            **_columns(report, row.program_name, row.username, counts),
            "body": report.body,
            "findings": await _findings(session, viewer, report.id),
        }
    )


# ---------------------------------------------------------------- writes


async def _check_findings(
    session: AsyncSession,
    actor: User,
    program_id: uuid.UUID,
    ids: Sequence[uuid.UUID],
    already_in: frozenset[uuid.UUID] = frozenset(),
) -> list[uuid.UUID]:
    """The distinct ids, each a visible finding of the program, newly added ones `confirmed`.

    A finding already in the draft may have left `confirmed` since: it stays
    listed, and the submit refuses until it is confirmed again or removed.
    """
    wanted = list(dict.fromkeys(ids))
    found = {
        item.id: item
        for item in await finding_service.read_many(session, viewer=actor, ids=wanted)
        if item.program_id == program_id
    }
    if len(found) != len(wanted):
        raise ValidationFailedError(
            detail="finding_ids holds a finding that is not of this program",
            errors=[{"field": "finding_ids", "code": "not_found"}],
        )
    if any(
        item.triage_status != TriageStatus.CONFIRMED and item.id not in already_in
        for item in found.values()
    ):
        raise ValidationFailedError(
            detail="only confirmed findings can be added to a report",
            errors=[{"field": "finding_ids", "code": "not_confirmed"}],
        )
    return wanted


async def _link(session: AsyncSession, report_id: uuid.UUID, ids: Sequence[uuid.UUID]) -> None:
    if ids:
        await session.execute(
            insert(ReportFinding)
            .values([{"report_id": report_id, "finding_id": finding_id} for finding_id in ids])
            .on_conflict_do_nothing()
        )


async def create_report(
    session: AsyncSession, *, actor: User, data: ReportCreateRequest
) -> ReportDetailResponse:
    program = await program_service.get_writable_program(
        session, viewer=actor, program_id=data.program_id
    )
    ids = await _check_findings(session, actor, program.id, data.finding_ids)
    report = Report(
        program_id=program.id,
        title=data.title,
        body=data.body,
        platform_report_ref=data.platform_report_ref,
        created_by=actor.id,
    )
    session.add(report)
    await session.flush()
    await _link(session, report.id, ids)
    await audit.record(
        session,
        action="report_created",
        user_id=actor.id,
        program_id=program.id,
        resource_type=RESOURCE,
        resource_id=report.id,
        detail={"finding_count": len(ids)},
    )
    return await get_report(session, viewer=actor, report_id=report.id)


async def _writable(session: AsyncSession, actor: User, report_id: uuid.UUID) -> Report:
    """The report, locked, refusing one of an archived program: 404 when hidden."""
    report = await session.scalar(
        select(Report).where(Report.id == report_id, _visible(actor)).with_for_update()
    )
    if report is None:
        raise NotFoundError(detail="report does not exist")
    await program_service.get_writable_program(session, viewer=actor, program_id=report.program_id)
    return report


def _submitted(field: str) -> ConflictError:
    return ConflictError(
        detail="a submitted report takes only platform_report_ref",
        errors=[{"field": field, "code": "report_submitted"}],
    )


async def update_report(
    session: AsyncSession, *, actor: User, report_id: uuid.UUID, changes: dict[str, Any]
) -> ReportDetailResponse:
    report = await _writable(session, actor, report_id)
    if report.status == ReportStatus.SUBMITTED:
        refused = sorted(set(changes) - SUBMITTED_EDITABLE)
        if refused:
            raise _submitted(refused[0])
    if not changes:
        return await get_report(session, viewer=actor, report_id=report.id)
    finding_ids = changes.pop("finding_ids", None)
    if finding_ids is not None:
        current = frozenset(await _finding_ids(session, report.id))
        ids = await _check_findings(session, actor, report.program_id, finding_ids, current)
        await session.execute(
            delete(ReportFinding).where(
                ReportFinding.report_id == report.id, ReportFinding.finding_id.not_in(ids)
            )
        )
        await _link(session, report.id, ids)
    # updated_at is set here too: a change of the finding list alone touches no column.
    await session.execute(
        update(Report)
        .where(Report.id == report.id)
        .values(**changes, updated_at=func.clock_timestamp())
        .execution_options(synchronize_session=False)
    )
    await audit.record(
        session,
        action="report_updated",
        user_id=actor.id,
        program_id=report.program_id,
        resource_type=RESOURCE,
        resource_id=report.id,
        detail={
            "fields": sorted([*changes, *(["finding_ids"] if finding_ids is not None else [])])
        },
    )
    session.expire(report)
    return await get_report(session, viewer=actor, report_id=report_id)


async def delete_report(session: AsyncSession, *, actor: User, report_id: uuid.UUID) -> None:
    """Delete a draft. A submitted report is the record of what was filed: it stays."""
    report = await _writable(session, actor, report_id)
    if report.status == ReportStatus.SUBMITTED:
        raise ConflictError(
            detail="a submitted report cannot be deleted",
            errors=[{"field": "status", "code": "report_submitted"}],
        )
    await audit.record(
        session,
        action="report_deleted",
        user_id=actor.id,
        program_id=report.program_id,
        resource_type=RESOURCE,
        resource_id=report.id,
        detail={"title": report.title},
    )
    await session.delete(report)
    await session.flush()


async def submit_report(
    session: AsyncSession,
    *,
    actor: User,
    report_id: uuid.UUID,
    platform_report_ref: str | None,
) -> ReportDetailResponse:
    report = await _writable(session, actor, report_id)
    if report.status != ReportStatus.DRAFT:
        raise ConflictError(
            detail="the report is already submitted",
            errors=[{"field": "status", "code": "invalid_transition"}],
        )
    ids = await _finding_ids(session, report.id)
    await finding_service.mark_reported(session, actor=actor, ids=ids, report_id=report.id)
    values: dict[str, Any] = {
        "status": ReportStatus.SUBMITTED.value,
        "submitted_at": func.now(),
        "updated_at": func.clock_timestamp(),
    }
    if platform_report_ref is not None:
        values["platform_report_ref"] = platform_report_ref
    # The row lock already holds the draft; the status condition stays as the guard.
    await session.execute(
        update(Report)
        .where(Report.id == report.id, Report.status == ReportStatus.DRAFT.value)
        .values(**values)
        .execution_options(synchronize_session=False)
    )
    await audit.record(
        session,
        action="report_submitted",
        user_id=actor.id,
        program_id=report.program_id,
        resource_type=RESOURCE,
        resource_id=report.id,
        detail={"finding_count": len(ids)},
    )
    session.expire(report)
    return await get_report(session, viewer=actor, report_id=report_id)


# ---------------------------------------------------------------- export

# Characters Markdown gives a meaning to. Untrusted text is escaped so a finding
# name cannot open a link, an image or raw HTML in the file: security.md.
_MD_SPECIAL: Final = frozenset("\\`*_{}[]()#+-.!|<>~")


def _md_text(value: object) -> str:
    text = " ".join(str(value or "").split())
    return "".join(f"\\{char}" if char in _MD_SPECIAL else char for char in text)


def _longest_backtick_run(text: str) -> int:
    longest = run = 0
    for char in text:
        run = run + 1 if char == "`" else 0
        longest = max(longest, run)
    return longest


def _code(value: object) -> str:
    """An inline code span that no backtick inside the text can close."""
    text = " ".join(str(value or "").split())
    ticks = "`" * (_longest_backtick_run(text) + 1)
    return f"{ticks} {text} {ticks}"


def _fence(value: str) -> str:
    """A fenced block whose fence is longer than any backtick run of the text."""
    ticks = "`" * max(3, _longest_backtick_run(value) + 1)
    return f"{ticks}text\n{value.rstrip()}\n{ticks}\n"


def _evidence_line(item: ReportFindingResponse) -> str:
    raw: RawOutputResponse | None = item.raw_output
    if raw is None:
        return "- Evidence file: none, the raw output is gone\n"
    return (
        f"- Evidence file: {_code(raw.filename)}, SHA-256 {_code(raw.sha256)}, "
        f"{raw.size_bytes} bytes, raw output {_code(raw.id)} of job {_code(raw.job_id)}\n"
    )


def _markdown(report: ReportDetailResponse) -> Iterator[str]:
    yield f"# {_md_text(report.title)}\n\n"
    yield f"- Program: {_md_text(report.program_name)}\n"
    yield f"- Status: {report.status.value}\n"
    ref = _code(report.platform_report_ref) if report.platform_report_ref else "none"
    yield f"- Platform report: {ref}\n"
    if report.submitted_at is not None:
        yield f"- Submitted at: {report.submitted_at.isoformat()}\n"
    yield f"- Findings: {report.finding_count}\n\n"
    if report.body.strip():
        # Written by a person in ReconOS: kept as the Markdown it is.
        yield report.body.rstrip() + "\n\n"
    yield "## Findings\n\n"
    for number, item in enumerate(report.findings, start=1):
        yield f"### {number}. {_md_text(item.name)}\n\n"
        yield f"- Severity: {item.severity.value}\n"
        yield f"- Triage status: {item.triage_status.value}\n"
        yield f"- Asset: {item.asset.type} {_code(item.asset.name)}\n"
        if item.matched_at:
            yield f"- Matched at: {_code(item.matched_at)}\n"
        if item.template_id:
            yield f"- Template: {_code(item.template_id)}\n"
        if item.cve:
            yield f"- CVE: {', '.join(_code(cve) for cve in item.cve)}\n"
        yield _evidence_line(item)
        if item.evidence:
            yield "\nEvidence:\n\n" + _fence(item.evidence)
        yield "\n"


EXPORT_COLUMNS: Final = (
    "id",
    "name",
    "severity",
    "triage_status",
    "asset_type",
    "asset_name",
    "matched_at",
    "template_id",
    "cve",
    "raw_output_id",
    "raw_output_filename",
    "raw_output_sha256",
)


def _rows(findings: Sequence[ReportFindingResponse]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for item in findings:
        row = item.model_dump()
        row["asset_type"] = item.asset.type
        row["asset_name"] = item.asset.name
        row["raw_output_filename"] = item.raw_output.filename if item.raw_output else None
        row["raw_output_sha256"] = item.raw_output.sha256 if item.raw_output else None
        rows.append(row)
    return rows


async def export_report(
    session: AsyncSession, *, viewer: User, report_id: uuid.UUID, fmt: ReportExportFormat
) -> tuple[Iterator[str], str, dict[str, str]]:
    """The file, its media type and headers. CSV cells that read as formulas get a `'`."""
    report = await get_report(session, viewer=viewer, report_id=report_id)
    media_type, headers = asset_service.export_headers(f"report-{report.id}", fmt)
    if fmt == "md":
        return _markdown(report), media_type, headers
    return (
        asset_service.render_export(fmt, EXPORT_COLUMNS, _rows(report.findings)),
        media_type,
        headers,
    )


__all__ = [
    "create_report",
    "delete_report",
    "export_report",
    "get_report",
    "list_reports",
    "submit_report",
    "update_report",
]
