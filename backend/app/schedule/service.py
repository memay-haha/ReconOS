"""Periodic scans: schedules of a program and the jobs Celery Beat creates from them.

Every job goes through `create_scheduled_job` of the job module, behind the
same scope and parameter checks as a job from the API (G5). A schedule runs
only while its program is `active`: a paused or archived program is skipped,
and a paused one catches up with a single job once it is active again:
docs/architecture/business-flow.md.

Two Beat ticks, or two background processes, never run the same schedule
twice: due rows are read `FOR UPDATE SKIP LOCKED` and `next_run_at` moves
forward in the same transaction as the job.

Public API for app/background: `run_due_schedules`.
"""

import uuid
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from typing import Any, Final

import structlog
from sqlalchemy import Select, func, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import audit
from app.core.errors import AppError, NotFoundError, ValidationFailedError
from app.core.identity import User
from app.core.pagination import MAX_LIMIT, Page, decode_time_cursor, encode_cursor
from app.core.security import program_visible_to
from app.engine import service as engine_service
from app.job import service as job_service
from app.job.schemas import JobResponse
from app.program import service as program_service
from app.program.models import Program, ProgramStatus
from app.schedule.models import Schedule
from app.schedule.schemas import ScheduleResponse
from app.scope import service as scope_service
from app.tool_module import service as tool_module_service
from app.tool_module.models import ToolModule
from contracts.tool_modules import TOOL_MODULES, ToolGroup, ToolModuleSpec

log = structlog.get_logger()

RESOURCE: Final = "schedule"

# Schedules one Beat tick runs at most; the rest wait for the next tick.
DUE_BATCH: Final = 100


def _now() -> datetime:
    return datetime.now(UTC)


def _clamp(limit: int) -> int:
    return max(1, min(limit, MAX_LIMIT))


def next_run_after(previous: datetime, interval_minutes: int, now: datetime) -> datetime:
    """The first slot of the schedule's cadence later than `now`.

    Missed slots are skipped, never run one after another: a backlog of jobs
    for the same target scans nothing new.
    """
    step = timedelta(minutes=interval_minutes)
    if previous > now:
        return previous
    missed = (now - previous) // step
    return previous + (missed + 1) * step


# ---------------------------------------------------------------- reading


def _row_select() -> Select[Schedule, str, str]:
    return (
        select(Schedule, Program.name, ToolModule.name)
        .join(Program, Program.id == Schedule.program_id)
        .join(ToolModule, ToolModule.id == Schedule.tool_module_id)
    )


def _response(schedule: Schedule, program_name: str, tool_module_name: str) -> ScheduleResponse:
    return ScheduleResponse(
        id=schedule.id,
        program_id=schedule.program_id,
        program_name=program_name,
        tool_module_id=schedule.tool_module_id,
        tool_module_name=tool_module_name,
        target=list(schedule.target),
        params=schedule.params,
        interval_minutes=schedule.interval_minutes,
        is_enabled=schedule.is_enabled,
        created_by=schedule.created_by,
        last_run_at=schedule.last_run_at,
        next_run_at=schedule.next_run_at,
        created_at=schedule.created_at,
    )


async def _page(
    session: AsyncSession,
    stmt: Select[Schedule, str, str],
    *,
    limit: int,
    cursor: str | None,
) -> Page[ScheduleResponse]:
    size = _clamp(limit)
    total = await session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    ordered = stmt.order_by(Schedule.created_at.desc(), Schedule.id.desc())
    if cursor is not None:
        seen_at, seen_id = decode_time_cursor(cursor)
        ordered = ordered.where(tuple_(Schedule.created_at, Schedule.id) < (seen_at, seen_id))
    rows = (await session.execute(ordered.limit(size + 1))).all()
    page_rows = rows[:size]
    next_cursor = (
        encode_cursor(page_rows[-1][0].created_at.isoformat(), page_rows[-1][0].id)
        if len(rows) > size
        else None
    )
    return Page[ScheduleResponse](
        items=[_response(*row) for row in page_rows], next_cursor=next_cursor, total=total
    )


async def list_program_schedules(
    session: AsyncSession, *, viewer: User, program_id: uuid.UUID, limit: int, cursor: str | None
) -> Page[ScheduleResponse]:
    await program_service.get_program(session, viewer=viewer, program_id=program_id)
    stmt = _row_select().where(Schedule.program_id == program_id)
    return await _page(session, stmt, limit=limit, cursor=cursor)


async def list_schedules(
    session: AsyncSession,
    *,
    viewer: User,
    engine_id: uuid.UUID | None,
    limit: int,
    cursor: str | None,
) -> Page[ScheduleResponse]:
    """Schedules of every program the viewer sees: the Schedules tab of S16."""
    stmt = _row_select().where(program_visible_to(viewer, Schedule.program_id))
    if engine_id is not None:
        engine = await engine_service.get_engine(session, engine_id)
        names = [spec.name for spec in TOOL_MODULES.values() if spec.runs_on == engine.name]
        stmt = stmt.where(ToolModule.name.in_(names))
    return await _page(session, stmt, limit=limit, cursor=cursor)


async def _row(session: AsyncSession, schedule_id: uuid.UUID) -> ScheduleResponse:
    row = (await session.execute(_row_select().where(Schedule.id == schedule_id))).one()
    return _response(*row)


async def _visible_schedule(
    session: AsyncSession, viewer: User, schedule_id: uuid.UUID, *, lock: bool = False
) -> Schedule:
    stmt = select(Schedule).where(
        Schedule.id == schedule_id, program_visible_to(viewer, Schedule.program_id)
    )
    schedule = await session.scalar(stmt.with_for_update() if lock else stmt)
    if schedule is None:
        raise NotFoundError(detail="schedule does not exist")
    return schedule


# ---------------------------------------------------------------- checks


def _schedulable(spec: ToolModuleSpec, *, field: str) -> None:
    # An exploit job needs a second person to approve it, and a job Beat
    # creates has no creator to keep from approving it (G5).
    if spec.group is ToolGroup.EXPLOIT:
        raise ValidationFailedError(
            detail="exploit tool modules cannot be scheduled",
            errors=[{"field": field, "code": "tool_module_not_schedulable"}],
        )


def _checked_params(tool_module: ToolModule, params: dict[str, Any]) -> None:
    spec = tool_module_service.spec_of(tool_module.name)
    if spec is None:
        raise ValidationFailedError(
            detail="tool module does not exist",
            errors=[{"field": "tool_module_id", "code": "not_found"}],
        )
    tool_module_service.validate_params(spec, tool_module.default_params, params, field="params")


# ---------------------------------------------------------------- writing


async def create_schedule(
    session: AsyncSession,
    *,
    actor: User,
    program_id: uuid.UUID,
    tool_module_id: uuid.UUID,
    target: Sequence[str],
    params: dict[str, Any],
    interval_minutes: int,
    is_enabled: bool,
) -> ScheduleResponse:
    """Checks like a job (G5): tool module on, params in schema, target in scope.

    The first run is one interval from now; POST /schedules/{id}/run runs it at once.
    """
    program = await program_service.get_writable_program(
        session, viewer=actor, program_id=program_id
    )
    tool_module, spec = await tool_module_service.get_runnable(
        session, tool_module_id, field="tool_module_id"
    )
    _schedulable(spec, field="tool_module_id")
    tool_module_service.validate_params(spec, tool_module.default_params, params, field="params")
    canonical = await scope_service.require_in_scope(session, program.id, target)
    schedule = Schedule(
        program_id=program.id,
        tool_module_id=tool_module.id,
        target=canonical,
        params=params,
        interval_minutes=interval_minutes,
        is_enabled=is_enabled,
        created_by=actor.id,
        next_run_at=_now() + timedelta(minutes=interval_minutes),
    )
    session.add(schedule)
    await session.flush()
    await audit.record(
        session,
        action="schedule_created",
        user_id=actor.id,
        program_id=program.id,
        resource_type=RESOURCE,
        resource_id=schedule.id,
        detail={
            "tool_module": tool_module.name,
            "interval_minutes": interval_minutes,
            "target_count": len(canonical),
            "is_enabled": is_enabled,
        },
    )
    return await _row(session, schedule.id)


async def _writable_schedule(
    session: AsyncSession, actor: User, schedule_id: uuid.UUID
) -> Schedule:
    schedule = await _visible_schedule(session, actor, schedule_id, lock=True)
    await program_service.get_writable_program(
        session, viewer=actor, program_id=schedule.program_id
    )
    return schedule


async def update_schedule(
    session: AsyncSession, *, actor: User, schedule_id: uuid.UUID, fields: dict[str, Any]
) -> ScheduleResponse:
    """Change target, params, interval or the switch.

    A new interval, or switching the schedule back on, restarts the count from
    now: the next run is one interval away.
    """
    schedule = await _writable_schedule(session, actor, schedule_id)
    if "params" in fields:
        tool_module = await tool_module_service.get_tool_module(session, schedule.tool_module_id)
        _checked_params(tool_module, fields["params"])
        schedule.params = fields["params"]
    if "target" in fields:
        schedule.target = await scope_service.require_in_scope(
            session, schedule.program_id, fields["target"]
        )
    restart = False
    if "interval_minutes" in fields and fields["interval_minutes"] != schedule.interval_minutes:
        schedule.interval_minutes = fields["interval_minutes"]
        restart = True
    if "is_enabled" in fields and fields["is_enabled"] != schedule.is_enabled:
        schedule.is_enabled = fields["is_enabled"]
        restart = restart or schedule.is_enabled
    if restart:
        schedule.next_run_at = _now() + timedelta(minutes=schedule.interval_minutes)
    await session.flush()
    await audit.record(
        session,
        action="schedule_updated",
        user_id=actor.id,
        program_id=schedule.program_id,
        resource_type=RESOURCE,
        resource_id=schedule.id,
        # Field names only: a target list can be long, the row holds the values.
        detail={"fields": sorted(fields)},
    )
    return await _row(session, schedule.id)


async def delete_schedule(session: AsyncSession, *, actor: User, schedule_id: uuid.UUID) -> None:
    """Jobs the schedule created keep their history, `schedule_id` set to NULL."""
    schedule = await _writable_schedule(session, actor, schedule_id)
    await session.delete(schedule)
    await audit.record(
        session,
        action="schedule_deleted",
        user_id=actor.id,
        program_id=schedule.program_id,
        resource_type=RESOURCE,
        resource_id=schedule.id,
        detail={"interval_minutes": schedule.interval_minutes},
    )


# ---------------------------------------------------------------- running


async def run_schedule(
    session: AsyncSession, *, actor: User, schedule_id: uuid.UUID
) -> JobResponse:
    """One job now, with the actor as its creator. `next_run_at` stays."""
    schedule = await _visible_schedule(session, actor, schedule_id, lock=True)
    job = await job_service.create_scheduled_job(
        session,
        actor=actor,
        schedule_id=schedule.id,
        program_id=schedule.program_id,
        tool_module_id=schedule.tool_module_id,
        target=list(schedule.target),
        params=schedule.params,
    )
    schedule.last_run_at = _now()
    await audit.record(
        session,
        action="schedule_run",
        user_id=actor.id,
        program_id=schedule.program_id,
        resource_type=RESOURCE,
        resource_id=schedule.id,
        detail={"job_id": str(job.id)},
    )
    return await job_service.get_job_row(session, viewer=actor, job_id=job.id)


async def run_due_schedules(
    session: AsyncSession, *, now: datetime | None = None, limit: int = DUE_BATCH
) -> int:
    """Create the job of every due schedule of an active program; return how many.

    One schedule failing its checks (target left the scope, tool module off,
    params no longer valid) is recorded in the audit log and skipped; the
    others still run. Its `next_run_at` moves on all the same, so a broken
    schedule does not retry every tick.
    """
    now = now or _now()
    due = (
        await session.scalars(
            select(Schedule)
            .join(Program, Program.id == Schedule.program_id)
            .where(
                Schedule.is_enabled.is_(True),
                Schedule.next_run_at <= now,
                Program.status == ProgramStatus.ACTIVE.value,
            )
            .order_by(Schedule.next_run_at, Schedule.id)
            .limit(limit)
            .with_for_update(of=Schedule, skip_locked=True)
        )
    ).all()
    created = 0
    for schedule in due:
        schedule.next_run_at = next_run_after(schedule.next_run_at, schedule.interval_minutes, now)
        try:
            # A savepoint per schedule: a refused job rolls back alone.
            async with session.begin_nested():
                job = await job_service.create_scheduled_job(
                    session,
                    actor=None,
                    schedule_id=schedule.id,
                    program_id=schedule.program_id,
                    tool_module_id=schedule.tool_module_id,
                    target=list(schedule.target),
                    params=schedule.params,
                )
        except AppError as err:
            codes = sorted({error["code"] for error in err.errors or []}) or [err.code]
            log.warning("schedule_run_failed", schedule_id=str(schedule.id), codes=codes)
            await audit.record(
                session,
                action="schedule_run_failed",
                program_id=schedule.program_id,
                resource_type=RESOURCE,
                resource_id=schedule.id,
                detail={"codes": codes},
            )
            continue
        schedule.last_run_at = now
        created += 1
        log.info("schedule_run", schedule_id=str(schedule.id), job_id=str(job.id))
    await session.flush()
    return created
