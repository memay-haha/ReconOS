"""Tool modules: what the code declares plus what the operator tunes.

The group, the tools and the parameter schema come from `contracts.tool_modules`;
the `tool_module` row only holds values inside that range: docs/architecture/modules.md.
Public API for the modules above (job, dispatcher): `get_runnable`,
`validate_params`, `spec_of`. Job counts come from the job table, one tier up,
read by table name only: docs/architecture/dependency-graph.md.
"""

import statistics
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import structlog
from pydantic import ValidationError
from sqlalchemy import DateTime, Text, column, func, select, table
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import audit
from app.core.db import notify_dispatcher
from app.core.errors import BadRequestError, FieldError, NotFoundError, ValidationFailedError
from app.core.identity import User
from app.core.pagination import MAX_LIMIT, decode_cursor, encode_cursor
from app.core.system_setting import get_int_setting
from app.tool_module.models import ToolModule
from app.tool_module.schemas import (
    DisabledReason,
    GroupCounts,
    StatsWindow,
    ToolInstall,
    ToolModulePage,
    ToolModuleResponse,
    ToolModuleSort,
    ToolModuleStatsResponse,
    ToolModuleUpdateRequest,
    ToolResponse,
)
from app.user import service as user_service
from app.user.models import Worker
from contracts.tool_modules import TOOL_MODULES, ToolGroup, ToolModuleSpec

log = structlog.get_logger()

_job = table(
    "job",
    column("id", PG_UUID(as_uuid=True)),
    column("tool_module_id", PG_UUID(as_uuid=True)),
    column("status", Text),
    column("created_at", DateTime(timezone=True)),
    column("started_at", DateTime(timezone=True)),
    column("finished_at", DateTime(timezone=True)),
    column("last_heartbeat_at", DateTime(timezone=True)),
)
_finding = table("finding", column("job_id", PG_UUID(as_uuid=True)))

# estimated_seconds: median duration of this many latest completed jobs.
ESTIMATE_SAMPLE = 20
WINDOWS: dict[str, timedelta] = {
    "24h": timedelta(hours=24),
    "7d": timedelta(days=7),
    "30d": timedelta(days=30),
}


def spec_of(name: str) -> ToolModuleSpec | None:
    """The code declaration of a tool module, None when the code has none."""
    return TOOL_MODULES.get(name)


def validate_params(
    spec: ToolModuleSpec, defaults: dict[str, Any], params: dict[str, Any], *, field: str
) -> dict[str, Any]:
    """Check params against the allowlist schema of the tool module (G5).

    `defaults` (the operator's default_params) apply first, the caller's params
    override them. Any key outside the schema is refused, never dropped. The
    result is the full parameter set the runner will see.
    """
    try:
        checked = spec.params.model_validate({**defaults, **params})
    except ValidationError as err:
        errors: list[FieldError] = [
            {"field": ".".join([field, *(str(part) for part in item["loc"])]), "code": item["type"]}
            for item in err.errors()
        ]
        raise ValidationFailedError(
            detail="params do not match the tool module schema", errors=errors
        ) from err
    return checked.model_dump(mode="json")


async def get_tool_module(session: AsyncSession, tool_module_id: uuid.UUID) -> ToolModule:
    row = await session.get(ToolModule, tool_module_id)
    if row is None:
        raise NotFoundError(detail="tool module does not exist")
    return row


async def get_runnable(
    session: AsyncSession, tool_module_id: uuid.UUID, *, field: str
) -> tuple[ToolModule, ToolModuleSpec]:
    """A tool module a job may use now: it exists, the code declares it, it is on."""
    row = await session.get(ToolModule, tool_module_id)
    spec = spec_of(row.name) if row is not None else None
    if row is None or spec is None:
        raise ValidationFailedError(
            detail="tool module does not exist", errors=[{"field": field, "code": "not_found"}]
        )
    if not row.is_enabled:
        raise ValidationFailedError(
            detail="tool module is disabled",
            errors=[{"field": field, "code": "tool_module_disabled"}],
        )
    return row, spec


async def _job_aggregates(
    session: AsyncSession,
) -> dict[uuid.UUID, tuple[datetime | None, int, int]]:
    """Per tool module: last completed job, jobs created in 24 hours, findings of its jobs."""
    since = datetime.now(UTC) - timedelta(hours=24)
    result = await session.execute(
        select(
            _job.c.tool_module_id,
            func.max(_job.c.finished_at).filter(_job.c.status == "completed"),
            func.count().filter(_job.c.created_at >= since),
        ).group_by(_job.c.tool_module_id)
    )
    findings: dict[uuid.UUID, int] = {
        row[0]: int(row[1])
        for row in await session.execute(
            select(_job.c.tool_module_id, func.count())
            .select_from(_finding.join(_job, _job.c.id == _finding.c.job_id))
            .group_by(_job.c.tool_module_id)
        )
    }
    return {row[0]: (row[1], int(row[2]), findings.get(row[0], 0)) for row in result}


async def _estimated_seconds(session: AsyncSession, tool_module_id: uuid.UUID) -> int | None:
    rows = await session.execute(
        select(_job.c.started_at, _job.c.finished_at)
        .where(
            _job.c.tool_module_id == tool_module_id,
            _job.c.status == "completed",
            _job.c.started_at.is_not(None),
            _job.c.finished_at.is_not(None),
        )
        .order_by(_job.c.finished_at.desc())
        .limit(ESTIMATE_SAMPLE)
    )
    durations = [(finished - started).total_seconds() for started, finished in rows]
    return round(statistics.median(durations)) if durations else None


def _disabled_reason(row: ToolModule, workers: list[Worker]) -> DisabledReason | None:
    if not row.is_enabled:
        return "off"
    if not any(row.name in worker.tool_modules for worker in workers):
        return "not_installed"
    return None


async def _response(
    session: AsyncSession,
    row: ToolModule,
    spec: ToolModuleSpec,
    aggregates: dict[uuid.UUID, tuple[datetime | None, int, int]],
    workers: list[Worker],
) -> ToolModuleResponse:
    last_job_at, jobs_24h, finding_count = aggregates.get(row.id, (None, 0, 0))
    return ToolModuleResponse(
        id=row.id,
        name=row.name,
        title=spec.title,
        description=spec.description,
        group=spec.group,
        is_enabled=row.is_enabled,
        default_params=row.default_params,
        max_concurrency=row.max_concurrency,
        rate_limit_per_minute=row.rate_limit_per_minute,
        timeout_minutes=row.timeout_minutes,
        updated_at=row.updated_at,
        runs_on=spec.runs_on,
        tools=list(spec.tools),
        output_types=list(spec.output_types),
        accepts_wildcard=spec.accepts_wildcard,
        param_schema=spec.params.model_json_schema(),
        last_job_at=last_job_at,
        jobs_24h=jobs_24h,
        finding_count=finding_count,
        # No engine-backed tool module exists yet, so no engine status either.
        engine_status=None,
        disabled_reason=_disabled_reason(row, workers),
        estimated_seconds=await _estimated_seconds(session, row.id),
    )


async def list_tool_modules(
    session: AsyncSession,
    *,
    limit: int,
    cursor: str | None,
    sort: ToolModuleSort = "name",
    q: str | None = None,
    group: ToolGroup | None = None,
    runs_on: str | None = None,
    is_enabled: bool | None = None,
) -> ToolModulePage:
    """Tool modules are few (one row per module in code), so filtering runs in memory."""
    rows = list(await session.scalars(select(ToolModule).order_by(ToolModule.name)))
    declared: list[tuple[ToolModule, ToolModuleSpec]] = []
    for row in rows:
        spec = spec_of(row.name)
        if spec is None:
            # A row the code no longer declares cannot run; keep it off the list.
            log.warning("tool_module_not_declared", tool_module=row.name)
            continue
        declared.append((row, spec))
    workers = await user_service.online_workers(session)
    aggregates = await _job_aggregates(session)
    reasons = [_disabled_reason(row, workers) for row, _ in declared]

    needle = q.lower() if q else None
    matched = [
        (row, spec)
        for row, spec in declared
        if (needle is None or needle in row.name.lower() or needle in spec.title.lower())
        and (group is None or spec.group == group)
        and (runs_on is None or spec.runs_on == runs_on)
        and (is_enabled is None or row.is_enabled == is_enabled)
    ]
    descending = sort.startswith("-")
    matched.sort(key=lambda item: (item[0].name, str(item[0].id)), reverse=descending)
    if cursor is not None:
        seen_name, seen_id = decode_cursor(cursor)
        if not isinstance(seen_name, str):
            raise BadRequestError(detail="cursor is not valid")
        seen = (seen_name, str(seen_id))
        matched = [
            item
            for item in matched
            if (
                (item[0].name, str(item[0].id)) < seen
                if descending
                else (item[0].name, str(item[0].id)) > seen
            )
        ]
    size = max(1, min(limit, MAX_LIMIT))
    page = matched[:size]
    next_cursor = encode_cursor(page[-1][0].name, page[-1][0].id) if len(matched) > size else None
    counts = GroupCounts()
    for _, spec in declared:
        setattr(counts, spec.group.value, getattr(counts, spec.group.value) + 1)
    return ToolModulePage(
        items=[await _response(session, row, spec, aggregates, workers) for row, spec in page],
        next_cursor=next_cursor,
        total=len(matched),
        enabled_count=sum(1 for row, _ in declared if row.is_enabled),
        disabled_count=sum(1 for row, _ in declared if not row.is_enabled),
        disabled_names=[row.name for row, _ in declared if not row.is_enabled],
        group_counts=counts,
        # The engine table arrives in a later batch.
        engines_bound=0,
        installed_count=sum(
            1
            for row, _ in declared
            if row.is_enabled and any(row.name in worker.tool_modules for worker in workers)
        ),
        ready_count=sum(1 for reason in reasons if reason is None),
    )


_NOT_NULL_FIELDS = ("is_enabled", "default_params", "max_concurrency", "timeout_minutes")


async def update_tool_module(
    session: AsyncSession,
    *,
    actor: User,
    tool_module_id: uuid.UUID,
    changes: ToolModuleUpdateRequest,
) -> ToolModuleResponse:
    """Superadmin tunes a tool module. Jobs created afterwards use the new values."""
    row = await session.get(ToolModule, tool_module_id, with_for_update=True)
    spec = spec_of(row.name) if row is not None else None
    if row is None or spec is None:
        raise NotFoundError(detail="tool module does not exist")
    sent = changes.model_fields_set
    errors: list[FieldError] = [
        {"field": name, "code": "null_not_allowed"}
        for name in _NOT_NULL_FIELDS
        if name in sent and getattr(changes, name) is None
    ]
    if errors:
        raise ValidationFailedError(detail="field may not be null", errors=errors)
    before: dict[str, Any] = {}
    after: dict[str, Any] = {}
    if changes.default_params is not None:
        checked = validate_params(spec, {}, changes.default_params, field="default_params")
        # Store only the keys the operator chose; the schema defaults stay in code.
        changes.default_params = {key: checked[key] for key in changes.default_params}
    for name in sorted(sent):
        value = getattr(changes, name)
        if getattr(row, name) != value:
            before[name] = getattr(row, name)
            after[name] = value
            setattr(row, name, value)
    if after:
        row.updated_by = actor.id
        await session.flush()
        await session.refresh(row)
        await audit.record(
            session,
            action="tool_module_updated",
            user_id=actor.id,
            resource_type="tool_module",
            resource_id=row.id,
            detail={"before": before, "after": after},
        )
        # A new limit or an enabled module may free queued jobs.
        await notify_dispatcher(session, "tool_module_updated")
    workers = await user_service.online_workers(session)
    return await _response(session, row, spec, await _job_aggregates(session), workers)


async def list_tools(session: AsyncSession) -> list[ToolResponse]:
    """Every tool the declared tool modules use, with the version each online worker reports."""
    workers = await user_service.online_workers(session)
    used_by: dict[str, list[str]] = {}
    for spec in TOOL_MODULES.values():
        for tool in spec.tools:
            used_by.setdefault(tool, []).append(spec.name)
    tools: list[ToolResponse] = []
    for name in sorted(used_by):
        installed = [
            ToolInstall(worker_name=worker.name, version=item.get("version"))
            for worker in workers
            for item in worker.tool_versions
            if item.get("name") == name
        ]
        tools.append(
            ToolResponse(
                name=name,
                tool_modules=sorted(used_by[name]),
                status="installed" if installed else "missing",
                installed=installed,
            )
        )
    return tools


async def stats(session: AsyncSession, *, window: StatsWindow) -> ToolModuleStatsResponse:
    now = datetime.now(UTC)
    span = WINDOWS[window]
    timeout = await get_int_setting(session, "job_heartbeat_timeout_minutes")
    jobs = await session.scalar(
        select(func.count()).select_from(_job).where(_job.c.created_at >= now - span)
    )
    jobs_prev = await session.scalar(
        select(func.count())
        .select_from(_job)
        .where(_job.c.created_at >= now - 2 * span, _job.c.created_at < now - span)
    )
    stalled = await session.scalar(
        select(func.count())
        .select_from(_job)
        .where(
            _job.c.status == "running",
            func.coalesce(_job.c.last_heartbeat_at, _job.c.started_at)
            < now - timedelta(minutes=timeout),
        )
    )
    return ToolModuleStatsResponse(
        window=window, jobs=jobs or 0, jobs_prev=jobs_prev or 0, stalled=stalled or 0
    )
