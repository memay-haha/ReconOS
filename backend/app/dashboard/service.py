"""Read-only figures for S02, system health and diagnostics for S15, global search,
application log.

Tier 8: reads the tables of the modules below and calls their services, writes
only its own `diagnostic_run`: docs/architecture/dependency-graph.md. Every
figure is limited to the programs the caller can see:
docs/security/authorization.md.

Public API: none. No module sits above this one.
"""

import uuid
from datetime import UTC, date, datetime, time, timedelta
from typing import Any, Final

import redis.asyncio as redis
import sqlalchemy as sa
import structlog
from sqlalchemy import ColumnElement, and_, func, select, tuple_
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.asset.models import Domain, Ip, Service, Url
from app.core import audit, realtime
from app.core.db import get_log_engine
from app.core.errors import NotFoundError, ValidationFailedError
from app.core.identity import User, UserRole
from app.core.pagination import (
    MAX_LIMIT,
    Page,
    contains_ignore_case,
    decode_time_cursor,
    encode_cursor,
)
from app.core.security import program_visible_to
from app.core.system_setting import get_int_setting
from app.core.tasks import PARSE_QUEUE, RUN_DIAGNOSTICS_TASK, queue_task
from app.dashboard import health
from app.dashboard.models import DiagnosticRun, DiagnosticStatus
from app.dashboard.schemas import (
    AppLogResponse,
    AssetCounts,
    ClosedAssets,
    ComponentResponse,
    DailyAssets,
    DashboardSummaryResponse,
    DashboardWindow,
    DiagnosticRunCreated,
    DiagnosticRunResponse,
    LogSort,
    SearchItem,
    SearchResponse,
    SeverityCounts,
    SystemHealthResponse,
    ToolsInstalled,
    TopPort,
    TopProgram,
    TopServiceName,
)
from app.finding.models import Finding
from app.job.models import Job
from app.program.models import Program
from app.tool_module.models import ToolModule
from app.user import service as user_service
from contracts.job_status import JobStatus

log = structlog.get_logger()

WINDOWS: Final[dict[str, timedelta]] = {
    "24h": timedelta(hours=24),
    "7d": timedelta(days=7),
    "30d": timedelta(days=30),
}
# The summary is recomputed at most this often per audience: docs/architecture/modules.md.
SUMMARY_CACHE_SECONDS: Final = 30
SUMMARY_CACHE_PREFIX: Final = "reconos:dashboard:summary"
DAILY_DAYS: Final = 14
TOP_LIMIT: Final = 5
SEARCH_DEFAULT_LIMIT: Final = 10
SEARCH_MAX_LIMIT: Final = 50
SEVERITIES: Final = ("critical", "high", "medium", "low", "info")
OPEN_TRIAGE_EXCLUDED: Final = ("false_positive", "duplicate", "resolved")
# finding_sla_days minus this many days marks a finding near its SLA.
SLA_WARNING_DAYS: Final = 2
DIAGNOSTIC_RESOURCE: Final = "diagnostic_run"
LOG_RESOURCE: Final = "app_log"


def _now() -> datetime:
    return datetime.now(UTC)


# ---------------------------------------------------------------- summary for S02


def _cache_key(viewer: User, window: DashboardWindow) -> str:
    # Superadmin and Admin see every program, so they share one entry; a User
    # gets its own, because its figures cover its assigned programs only.
    audience = "all" if viewer.role != UserRole.USER else f"user:{viewer.id}"
    return f"{SUMMARY_CACHE_PREFIX}:{audience}:{window}"


async def _cached(key: str) -> DashboardSummaryResponse | None:
    client = realtime.build_client()
    try:
        raw = await client.get(key)
    except (redis.RedisError, OSError) as error:
        log.warning("dashboard_cache_failed", error_type=type(error).__name__)
        return None
    finally:
        await client.aclose()
    return DashboardSummaryResponse.model_validate_json(raw) if isinstance(raw, str) else None


async def _store(key: str, summary: DashboardSummaryResponse) -> None:
    client = realtime.build_client()
    try:
        await client.set(key, summary.model_dump_json(), ex=SUMMARY_CACHE_SECONDS)
    except (redis.RedisError, OSError) as error:
        log.warning("dashboard_cache_failed", error_type=type(error).__name__)
    finally:
        await client.aclose()


async def summary(
    session: AsyncSession, *, viewer: User, window: DashboardWindow
) -> DashboardSummaryResponse:
    """`GET /dashboard/summary`, from the Redis cache when fresh. Redis down: computed."""
    key = _cache_key(viewer, window)
    cached = await _cached(key)
    if cached is not None:
        return cached
    computed = await compute_summary(session, viewer=viewer, window=window)
    await _store(key, computed)
    return computed


async def _count(session: AsyncSession, model: Any, *where: ColumnElement[bool]) -> int:  # noqa: ANN401  a mapped class
    return int(await session.scalar(select(func.count()).select_from(model).where(*where)) or 0)


async def compute_summary(
    session: AsyncSession, *, viewer: User, window: DashboardWindow
) -> DashboardSummaryResponse:
    """Every figure of S02 for the programs `viewer` sees: docs/api/architecture.md."""
    now = _now()
    since = now - WINDOWS[window]
    day_ago = now - timedelta(hours=24)
    live_domain = and_(program_visible_to(viewer, Domain.program_id), Domain.deleted_at.is_(None))
    seen_ip = program_visible_to(viewer, Ip.program_id)
    seen_url = program_visible_to(viewer, Url.program_id)
    seen_service = program_visible_to(viewer, Service.program_id)
    seen_finding = program_visible_to(viewer, Finding.program_id)
    seen_job = program_visible_to(viewer, Job.program_id)
    seen_program = program_visible_to(viewer, Program.id)

    programs = await _count(session, Program, seen_program)
    programs_active = await _count(session, Program, seen_program, Program.status == "active")
    synced = await session.scalar(
        select(func.count(func.distinct(Job.program_id)))
        .join(Program, Program.id == Job.program_id)
        .where(
            seen_job,
            Program.status == "active",
            Job.status == JobStatus.COMPLETED.value,
            Job.finished_at >= day_ago,
        )
    )
    assets = AssetCounts(
        domain=await _count(session, Domain, live_domain),
        ip=await _count(session, Ip, seen_ip),
        url=await _count(session, Url, seen_url),
        service=await _count(session, Service, seen_service),
    )
    assets_new = AssetCounts(
        domain=await _count(session, Domain, live_domain, Domain.first_seen_at >= since),
        ip=await _count(session, Ip, seen_ip, Ip.first_seen_at >= since),
        url=await _count(session, Url, seen_url, Url.first_seen_at >= since),
        service=await _count(session, Service, seen_service, Service.first_seen_at >= since),
    )
    in_scope = await _count(session, Domain, live_domain, Domain.in_scope.is_(True))
    open_finding = Finding.triage_status.not_in(OPEN_TRIAGE_EXCLUDED)
    by_severity = {
        str(severity): int(count)
        for severity, count in await session.execute(
            select(Finding.severity, func.count())
            .where(seen_finding, open_finding)
            .group_by(Finding.severity)
        )
    }
    sla_days = await get_int_setting(session, "finding_sla_days")
    jobs_by_status = {status.value: 0 for status in JobStatus}
    for status, count in await session.execute(
        select(Job.status, func.count()).where(seen_job).group_by(Job.status)
    ):
        jobs_by_status[str(status)] = int(count)
    completed_hour = await _count(
        session,
        Job,
        seen_job,
        Job.status == JobStatus.COMPLETED.value,
        Job.finished_at >= now - timedelta(hours=1),
    )
    service_total = assets.service
    top_name = (
        await session.execute(
            select(Service.name, func.count().label("n"))
            .where(seen_service, Service.name.is_not(None))
            .group_by(Service.name)
            .order_by(func.count().desc(), Service.name)
            .limit(1)
        )
    ).first()
    return DashboardSummaryResponse(
        programs=programs,
        programs_active=programs_active,
        active_sync_ratio=(int(synced or 0) / programs_active) if programs_active else None,
        programs_new=await _count(session, Program, seen_program, Program.created_at >= since),
        assets=assets,
        assets_new=assets_new,
        assets_closed=ClosedAssets(
            service=await _count(session, Service, seen_service, Service.closed_at >= since)
        ),
        new_assets_daily=await _daily(session, viewer, now),
        top_programs=await _top_programs(session, viewer),
        scope_coverage=(in_scope / assets.domain) if assets.domain else None,
        top_ports=await _top_ports(session, seen_service),
        top_service_name=(
            TopServiceName(name=str(top_name[0]), ratio=int(top_name[1]) / service_total)
            if top_name is not None and service_total
            else None
        ),
        findings_by_severity=SeverityCounts(**{s: by_severity.get(s, 0) for s in SEVERITIES}),
        findings_triage_new=await _count(
            session, Finding, seen_finding, Finding.triage_status == "new"
        ),
        findings_near_sla=await _count(
            session,
            Finding,
            seen_finding,
            Finding.triage_status.in_(("confirmed", "reported")),
            Finding.first_seen_at < now - timedelta(days=max(sla_days - SLA_WARNING_DAYS, 0)),
        ),
        confirmed_cve_findings_24h=await _count(
            session,
            Finding,
            seen_finding,
            Finding.triage_status == "confirmed",
            func.cardinality(Finding.cve) > 0,
            Finding.triaged_at >= day_ago,
        ),
        jobs_by_status=jobs_by_status,
        jobs_per_minute=completed_hour / 60,
        workers_online=len(await user_service.online_workers(session)),
    )


async def _daily(session: AsyncSession, viewer: User, now: datetime) -> list[DailyAssets]:
    """New domains, URLs, IPs per UTC day, 14 days, oldest first, today last."""
    today = now.date()
    first = today - timedelta(days=DAILY_DAYS - 1)
    start = datetime.combine(first, time.min, tzinfo=UTC)
    counts: dict[str, dict[date, int]] = {}
    for kind, model, extra in (
        ("domain", Domain, (Domain.deleted_at.is_(None),)),
        ("url", Url, ()),
        ("ip", Ip, ()),
    ):
        day = func.date(func.timezone("UTC", model.first_seen_at))
        rows = await session.execute(
            select(day, func.count())
            .where(
                program_visible_to(viewer, model.program_id), model.first_seen_at >= start, *extra
            )
            .group_by(day)
        )
        counts[kind] = {row[0]: int(row[1]) for row in rows}
    return [
        DailyAssets(
            date=first + timedelta(days=offset),
            domain=counts["domain"].get(first + timedelta(days=offset), 0),
            url=counts["url"].get(first + timedelta(days=offset), 0),
            ip=counts["ip"].get(first + timedelta(days=offset), 0),
        )
        for offset in range(DAILY_DAYS)
    ]


async def _top_programs(session: AsyncSession, viewer: User) -> list[TopProgram]:
    count = func.count(Domain.id)
    rows = await session.execute(
        select(Program.id, Program.name, count)
        .join(Domain, and_(Domain.program_id == Program.id, Domain.deleted_at.is_(None)))
        .where(program_visible_to(viewer, Program.id))
        .group_by(Program.id, Program.name)
        .order_by(count.desc(), Program.name)
        .limit(TOP_LIMIT)
    )
    return [TopProgram(id=row[0], name=row[1], domain_count=int(row[2])) for row in rows]


async def _top_ports(session: AsyncSession, seen: ColumnElement[bool]) -> list[TopPort]:
    count = func.count()
    # The most frequent service name on the port, NULL when none was recognised.
    name = func.mode().within_group(Service.name)
    rows = await session.execute(
        select(Service.port, Service.transport, name, count)
        .where(seen)
        .group_by(Service.port, Service.transport)
        .order_by(count.desc(), Service.port)
        .limit(TOP_LIMIT)
    )
    return [TopPort(port=int(r[0]), transport=str(r[1]), name=r[2], count=int(r[3])) for r in rows]


# ---------------------------------------------------------------- global search


async def search(
    session: AsyncSession, *, viewer: User, q: str, limit: int = SEARCH_DEFAULT_LIMIT
) -> SearchResponse:
    """Programs, domains, URLs, findings, tool modules whose name contains `q`.

    Each kind is asked for `limit` rows; the merged list keeps that order and is
    cut at `limit`, so a broad term still shows the programs first.
    """
    size = max(1, min(limit, SEARCH_MAX_LIMIT))
    items: list[SearchItem] = []
    queries: list[tuple[str, Any]] = [
        (
            "program",
            select(Program.id, Program.name, Program.id)
            .where(program_visible_to(viewer, Program.id), contains_ignore_case(Program.name, q))
            .order_by(Program.name),
        ),
        (
            "domain",
            select(Domain.id, Domain.name, Domain.program_id)
            .where(
                program_visible_to(viewer, Domain.program_id),
                Domain.deleted_at.is_(None),
                contains_ignore_case(Domain.name, q),
            )
            .order_by(Domain.name),
        ),
        (
            "url",
            select(Url.id, Url.url, Url.program_id)
            .where(program_visible_to(viewer, Url.program_id), contains_ignore_case(Url.url, q))
            .order_by(Url.url),
        ),
        (
            "finding",
            select(Finding.id, Finding.name, Finding.program_id)
            .where(
                program_visible_to(viewer, Finding.program_id),
                contains_ignore_case(Finding.name, q),
            )
            .order_by(Finding.name),
        ),
        (
            "tool_module",
            select(ToolModule.id, ToolModule.name, sa.null())
            .where(contains_ignore_case(ToolModule.name, q))
            .order_by(ToolModule.name),
        ),
    ]
    for kind, stmt in queries:
        if len(items) >= size:
            break
        for row in await session.execute(stmt.limit(size - len(items))):
            items.append(SearchItem(type=kind, id=row[0], label=str(row[1]), program_id=row[2]))
    return SearchResponse(items=items)


# ---------------------------------------------------------------- system health for S15


async def system_health(
    session: AsyncSession, *, component: str | None = None
) -> SystemHealthResponse:
    names = (component,) if component is not None else health.COMPONENTS
    components = await health.check_all(session, names)
    online = await user_service.online_workers(session)
    on_workers = {name for worker in online for name in worker.tool_modules}
    enabled = list(await session.scalars(select(ToolModule).where(ToolModule.is_enabled.is_(True))))
    total = int(await session.scalar(select(func.count()).select_from(ToolModule)) or 0)
    slots = sum(row.max_concurrency for row in enabled)
    running = await _count(session, Job, Job.status == JobStatus.RUNNING.value)
    return SystemHealthResponse(
        components=[ComponentResponse(**c.__dict__) for c in components],
        queue_length=await _count(session, Job, Job.status == JobStatus.QUEUED.value),
        workers_online=len(online),
        tools_installed=ToolsInstalled(
            installed=sum(1 for row in enabled if row.name in on_workers), total=total
        ),
        fleet_load=(running / slots) if slots else None,
    )


# ---------------------------------------------------------------- diagnostics


def _diagnostic(row: DiagnosticRun) -> DiagnosticRunResponse:
    return DiagnosticRunResponse.model_validate(row, from_attributes=True)


async def create_diagnostic(session: AsyncSession, *, actor: User) -> DiagnosticRunCreated:
    """Record a run and hand it to the background process once this commits."""
    row = DiagnosticRun(status=DiagnosticStatus.RUNNING.value, created_by=actor.id)
    session.add(row)
    await session.flush()
    await audit.record(
        session,
        action="diagnostic_run_created",
        user_id=actor.id,
        resource_type=DIAGNOSTIC_RESOURCE,
        resource_id=row.id,
    )
    queue_task(
        session,
        RUN_DIAGNOSTICS_TASK,
        queue=PARSE_QUEUE,
        kwargs={"diagnostic_run_id": str(row.id)},
    )
    return DiagnosticRunCreated(id=row.id, status=DiagnosticStatus.RUNNING.value)


async def get_diagnostic(session: AsyncSession, run_id: uuid.UUID) -> DiagnosticRunResponse:
    row = await session.get(DiagnosticRun, run_id)
    if row is None:
        raise NotFoundError(detail="diagnostic run does not exist")
    return _diagnostic(row)


async def latest_diagnostic(session: AsyncSession) -> DiagnosticRunResponse:
    row = await session.scalar(
        select(DiagnosticRun)
        .order_by(DiagnosticRun.created_at.desc(), DiagnosticRun.id.desc())
        .limit(1)
    )
    if row is None:
        raise NotFoundError(detail="no diagnostic run yet")
    return _diagnostic(row)


_PREFIX: Final = {"ok": "[OK]", "degraded": "[WARN]", "down": "[FAIL]"}


async def run_diagnostic(session: AsyncSession, run_id: uuid.UUID) -> None:
    """The background task: check every component and the worker fleet, one line each.

    The API is not checked from here; it answered the request that created the run.
    Lines carry no credential, path or PID: docs/data/schema.md.
    """
    row = await session.get(DiagnosticRun, run_id, with_for_update=True)
    if row is None or row.status != DiagnosticStatus.RUNNING.value:
        return
    lines = [f"[*] ReconOS diagnostics, backend {health.backend_version() or 'unknown'}"]
    names = tuple(name for name in health.COMPONENTS if name != "api")
    failed = False
    for result in await health.check_all(session, names):
        if result.status == "down":
            failed = True
        extra = " ".join(
            part
            for part in (
                f"version {result.version}" if result.version else None,
                f"{result.latency_ms} ms" if result.latency_ms is not None else None,
                result.detail,
                result.message,
            )
            if part
        )
        lines.append(f"{_PREFIX[result.status]} {result.name}: {result.status} {extra}".rstrip())
    online = await user_service.online_workers(session)
    lines.append(f"[*] workers online: {len(online)}")
    if not online:
        lines.append("[WARN] no worker is online, jobs stay queued")
    enabled = list(await session.scalars(select(ToolModule).where(ToolModule.is_enabled.is_(True))))
    installed = {name for worker in online for name in worker.tool_modules}
    for module in sorted(enabled, key=lambda m: m.name):
        mark = "[OK]" if module.name in installed else "[WARN]"
        state = (
            "installed on an online worker" if module.name in installed else "on no online worker"
        )
        lines.append(f"{mark} tool module {module.name}: {state}")
    row.status = (DiagnosticStatus.FAILED if failed else DiagnosticStatus.PASSED).value
    row.exit_code = 1 if failed else 0
    row.output = "\n".join(lines)
    row.finished_at = _now()
    await session.flush()


# ---------------------------------------------------------------- application log


_app_log = sa.table(
    "app_log",
    sa.column("id", PG_UUID(as_uuid=True)),
    sa.column("logged_at", sa.DateTime(timezone=True)),
    sa.column("level", sa.Text),
    sa.column("service", sa.Text),
    sa.column("event", sa.Text),
    sa.column("request_id", PG_UUID(as_uuid=True)),
    sa.column("job_id", PG_UUID(as_uuid=True)),
    sa.column("program_id", PG_UUID(as_uuid=True)),
    sa.column("worker_id", PG_UUID(as_uuid=True)),
    sa.column("context", JSONB),
)


async def _visible_programs(session: AsyncSession, viewer: User) -> list[uuid.UUID] | None:
    """None: every program. Otherwise the assigned programs of a User."""
    if viewer.role != UserRole.USER:
        return None
    return list(
        await session.scalars(select(Program.id).where(program_visible_to(viewer, Program.id)))
    )


async def list_logs(
    session: AsyncSession,
    *,
    viewer: User,
    limit: int,
    cursor: str | None,
    sort: LogSort,
    level: str | None,
    service: str | None,
    logged_at_from: datetime | None,
    logged_at_to: datetime | None,
    program_id: uuid.UUID | None,
    event: str | None,
    engine: str | None,
) -> Page[AppLogResponse]:
    """`GET /logs` over reconos_log. A User reads only logs of jobs of its programs.

    reconos_log has no foreign key to the main database, so the visible program
    ids are read here first and passed as a list.
    """
    size = max(1, min(limit, MAX_LIMIT))
    for bound in (logged_at_from, logged_at_to):
        if bound is not None and bound.tzinfo is None:
            raise ValidationFailedError(
                detail="logged_at bounds must carry a timezone",
                errors=[{"field": "logged_at_from", "code": "timezone_required"}],
            )
    t = _app_log.c
    conditions: list[ColumnElement[bool]] = []
    visible = await _visible_programs(session, viewer)
    if visible is not None:
        if program_id is not None and program_id not in visible:
            raise NotFoundError(detail="program does not exist")
        conditions += [t.program_id.in_(visible), t.job_id.is_not(None)]
    if program_id is not None:
        conditions.append(t.program_id == program_id)
    if level is not None:
        conditions.append(t.level == level)
    if service is not None:
        conditions.append(t.service == service)
    if event is not None:
        conditions.append(t.event == event)
    if engine is not None:
        conditions.append(t.context["engine"].astext == engine)
    if logged_at_from is not None:
        conditions.append(t.logged_at >= logged_at_from)
    if logged_at_to is not None:
        conditions.append(t.logged_at <= logged_at_to)
    descending = sort == "-logged_at"
    key = tuple_(t.logged_at, t.id)
    stmt = select(_app_log).where(*conditions)
    stmt = (
        stmt.order_by(t.logged_at.desc(), t.id.desc())
        if descending
        else stmt.order_by(t.logged_at.asc(), t.id.asc())
    )
    if cursor is not None:
        seen_at, seen_id = decode_time_cursor(cursor)
        stmt = stmt.where(key < (seen_at, seen_id) if descending else key > (seen_at, seen_id))
    async with get_log_engine().connect() as connection:
        rows = (await connection.execute(stmt.limit(size + 1))).mappings().all()
        total = int(
            await connection.scalar(select(func.count()).select_from(_app_log).where(*conditions))
            or 0
        )
    page_rows = rows[:size]
    return Page[AppLogResponse](
        items=[AppLogResponse.model_validate(dict(row)) for row in page_rows],
        next_cursor=(
            encode_cursor(page_rows[-1]["logged_at"].isoformat(), page_rows[-1]["id"])
            if len(rows) > size
            else None
        ),
        total=total,
    )


async def delete_logs(session: AsyncSession, *, actor: User, before: date) -> int:
    """Remove every log row logged before `before` 00:00 UTC. Today's rows stay.

    Rows are deleted rather than partitions dropped: daily partitions are not
    created yet, every row sits in the default partition (batch 10 decisions).
    """
    if before > _now().date():
        raise ValidationFailedError(
            detail="before cannot be after today (UTC)",
            errors=[{"field": "before", "code": "out_of_range"}],
        )
    cutoff = datetime.combine(before, time.min, tzinfo=UTC)
    async with get_log_engine().begin() as connection:
        result = await connection.execute(sa.delete(_app_log).where(_app_log.c.logged_at < cutoff))
    deleted = int(result.rowcount or 0)
    await audit.record(
        session,
        action="app_log_deleted",
        user_id=actor.id,
        resource_type=LOG_RESOURCE,
        detail={"before": before.isoformat(), "deleted": deleted},
    )
    log.info("app_log_deleted", before=before.isoformat(), deleted=deleted)
    return deleted


__all__ = [
    "compute_summary",
    "create_diagnostic",
    "delete_logs",
    "get_diagnostic",
    "latest_diagnostic",
    "list_logs",
    "run_diagnostic",
    "search",
    "summary",
    "system_health",
]
