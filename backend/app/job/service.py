"""Jobs: creation behind the scope and parameter checks, status, worker contract.

Every job is created here, with the target checked against scope and the
params against the tool module schema (G5): docs/architecture/request-flow.md.
Every status change is one `UPDATE ... WHERE status IN (<allowed>)`, so two
processes racing on the same job cannot both win, and it queues the realtime
event and, when the dispatcher cares, a NOTIFY in the same transaction:
.claude/rules/design-patterns.md.

Public API for the modules above (raw_output, dispatcher): `require_upload_job`,
`dispatch_candidates`, `active_counts`, `recent_dispatch_counts`,
`mark_dispatched`, `revert_dispatch`, `cancel_out_of_scope`, `fail_stale_jobs`,
`cancel_jobs_of_archived_programs`.
"""

import uuid
from collections.abc import Collection, Sequence
from datetime import UTC, datetime, timedelta
from typing import Any

import structlog
from sqlalchemy import (
    ColumnElement,
    Select,
    Text,
    and_,
    case,
    column,
    func,
    null,
    or_,
    select,
    table,
    tuple_,
    update,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import audit, realtime
from app.core.db import notify_dispatcher
from app.core.errors import (
    BadRequestError,
    ConflictError,
    FieldError,
    ForbiddenError,
    NotFoundError,
    ValidationFailedError,
)
from app.core.identity import User, UserRole
from app.core.pagination import (
    MAX_LIMIT,
    Page,
    contains_ignore_case,
    decode_cursor,
    decode_time_cursor,
    encode_cursor,
)
from app.core.security import program_visible_to
from app.core.system_setting import get_int_setting
from app.engine import service as engine_service
from app.job.models import Job, JobPriority
from app.job.schemas import (
    PRIORITY_NAMES,
    PRIORITY_VALUES,
    JobBulkItem,
    JobResponse,
    JobSort,
    PriorityName,
)
from app.program import service as program_service
from app.program.models import ProgramStatus
from app.scope import service as scope_service
from app.tool_module import service as tool_module_service
from app.tool_module.models import ToolModule
from app.user.models import Worker
from contracts.job_status import FinishStatus, JobFinish, JobHeartbeatAction, JobHeartbeatResponse
from contracts.job_status import JobStatus as S
from contracts.tasks import JobSpec
from contracts.tool_modules import ToolGroup, ToolModuleSpec

log = structlog.get_logger()

RESOURCE = "job"

CANCELLABLE = (S.PENDING_APPROVAL, S.QUEUED, S.DISPATCHED, S.RUNNING)
UNFINISHED = CANCELLABLE
RETRYABLE = (S.FAILED, S.CANCELLED)

# Reasons are fixed English sentences: no request data, no credential.
REASON_CANCELLED_BY_USER = "Cancelled by user."
REASON_CLEANUP = "Queue cleanup: program is paused or archived."
REASON_ARCHIVED = "Program archived."
REASON_OUT_OF_SCOPE = "Target no longer in scope at dispatch."
REASON_WORKER_LOST = "Worker lost connection: no heartbeat."

_program = table("program", column("id", PG_UUID(as_uuid=True)), column("status", Text))

# status_changed_at is the newest of the lifecycle timestamps: docs/api/architecture.md.
STATUS_CHANGED_AT: ColumnElement[datetime] = func.greatest(
    Job.created_at, Job.approved_at, Job.dispatched_at, Job.started_at, Job.finished_at
).label("status_changed_at")


def _now() -> datetime:
    return datetime.now(UTC)


# ---------------------------------------------------------------- transitions


async def _transition(
    session: AsyncSession,
    job_id: uuid.UUID,
    *,
    sources: Collection[S],
    target: S,
    values: dict[str, Any] | None = None,
    where: Sequence[ColumnElement[bool]] = (),
) -> Job | None:
    """Move one job from any of `sources` to `target`, or do nothing.

    The status condition sits in the UPDATE itself: two processes racing on
    the same job both send it and PostgreSQL lets exactly one row change.
    None means the job was not in a source status, which callers treat as
    already handled. The event is published after commit by session_scope.
    """
    stmt = (
        update(Job)
        .where(Job.id == job_id, Job.status.in_([s.value for s in sources]), *where)
        .values(status=target.value, **(values or {}))
        .returning(Job)
        .execution_options(populate_existing=True, synchronize_session=False)
    )
    job = (await session.execute(stmt)).scalar_one_or_none()
    if job is not None:
        realtime.queue_job_event(
            session, job_id=job.id, program_id=job.program_id, status=job.status
        )
        log.info("job_status_changed", job_id=str(job.id), status=job.status)
    return job


async def _transition_many(
    session: AsyncSession,
    condition: ColumnElement[bool],
    *,
    target: S,
    values: dict[str, Any],
) -> list[Job]:
    stmt = (
        update(Job)
        .where(condition)
        .values(status=target.value, **values)
        .returning(Job)
        .execution_options(populate_existing=True, synchronize_session=False)
    )
    jobs = list((await session.execute(stmt)).scalars())
    for job in jobs:
        realtime.queue_job_event(
            session, job_id=job.id, program_id=job.program_id, status=job.status
        )
    return jobs


# ---------------------------------------------------------------- reading


def _row_select() -> Select[Job, str, str, str, datetime]:
    return (
        select(Job, ToolModule.name, Worker.name, User.username, STATUS_CHANGED_AT)
        .join(ToolModule, ToolModule.id == Job.tool_module_id)
        .outerjoin(Worker, Worker.id == Job.worker_id)
        .outerjoin(User, User.id == Job.created_by)
    )


def _response(
    job: Job,
    tool_module_name: str,
    worker_name: str | None,
    username: str | None,
    status_changed_at: datetime,
) -> JobResponse:
    return JobResponse(
        id=job.id,
        program_id=job.program_id,
        tool_module_id=job.tool_module_id,
        tool_module_name=tool_module_name,
        status=S(job.status),
        priority=PRIORITY_NAMES[job.priority],
        target=list(job.target),
        params=job.params,
        proxy_id=job.proxy_id,
        schedule_id=job.schedule_id,
        retry_of_job_id=job.retry_of_job_id,
        worker_id=job.worker_id,
        worker_name=worker_name,
        created_by=job.created_by,
        created_by_username=username,
        approved_by=job.approved_by,
        status_reason=job.status_reason,
        tool_version=job.tool_version,
        created_at=job.created_at,
        approved_at=job.approved_at,
        dispatched_at=job.dispatched_at,
        started_at=job.started_at,
        last_heartbeat_at=job.last_heartbeat_at,
        finished_at=job.finished_at,
        status_changed_at=status_changed_at,
    )


async def get_job_row(session: AsyncSession, *, viewer: User, job_id: uuid.UUID) -> JobResponse:
    """The job, or 404 when it does not exist or its program is not the viewer's."""
    row = (
        await session.execute(
            _row_select().where(Job.id == job_id, program_visible_to(viewer, Job.program_id))
        )
    ).first()
    if row is None:
        raise NotFoundError(detail="job does not exist")
    return _response(*row)


async def get_visible_job(session: AsyncSession, *, viewer: User, job_id: uuid.UUID) -> Job:
    job = await session.scalar(
        select(Job).where(Job.id == job_id, program_visible_to(viewer, Job.program_id))
    )
    if job is None:
        raise NotFoundError(detail="job does not exist")
    return job


def _sort_cursor(sort: JobSort, row: Any) -> str:  # noqa: ANN401  a SQLAlchemy Row
    job: Job = row[0]
    if sort == "-status_changed_at":
        return encode_cursor(row[4].isoformat(), job.id)
    if sort == "-priority":
        return encode_cursor(f"{job.priority}|{job.created_at.isoformat()}", job.id)
    return encode_cursor(job.created_at.isoformat(), job.id)


def _after_cursor(sort: JobSort, cursor: str) -> ColumnElement[bool]:
    if sort == "-priority":
        value, seen_id = decode_cursor(cursor)
        try:
            priority_text, _, created_text = str(value).partition("|")
            priority = int(priority_text)
            created = datetime.fromisoformat(created_text)
        except ValueError as err:
            raise BadRequestError(detail="cursor is not valid") from err
        if created.tzinfo is None:
            raise BadRequestError(detail="cursor is not valid")
        return tuple_(Job.priority, Job.created_at, Job.id) < (priority, created, seen_id)
    seen_at, seen_id = decode_time_cursor(cursor)
    if sort == "-status_changed_at":
        return tuple_(STATUS_CHANGED_AT, Job.id) < (seen_at, seen_id)
    if sort == "created_at":
        return tuple_(Job.created_at, Job.id) > (seen_at, seen_id)
    return tuple_(Job.created_at, Job.id) < (seen_at, seen_id)


_ORDER: dict[str, tuple[Any, ...]] = {
    "created_at": (Job.created_at.asc(), Job.id.asc()),
    "-created_at": (Job.created_at.desc(), Job.id.desc()),
    "-status_changed_at": (STATUS_CHANGED_AT.desc(), Job.id.desc()),
    "-priority": (Job.priority.desc(), Job.created_at.desc(), Job.id.desc()),
}


async def list_jobs(
    session: AsyncSession,
    *,
    viewer: User,
    limit: int,
    cursor: str | None,
    sort: JobSort = "-created_at",
    status: Sequence[S] = (),
    program_id: uuid.UUID | None = None,
    target: str | None = None,
    q: str | None = None,
    tool_module_id: Sequence[uuid.UUID] = (),
) -> Page[JobResponse]:
    size = max(1, min(limit, MAX_LIMIT))
    conditions: list[ColumnElement[bool]] = [program_visible_to(viewer, Job.program_id)]
    if status:
        conditions.append(Job.status.in_([value.value for value in status]))
    if program_id is not None:
        conditions.append(Job.program_id == program_id)
    if target is not None:
        # Containment uses the GIN index on target.
        conditions.append(Job.target.contains([target]))
    if tool_module_id:
        conditions.append(Job.tool_module_id.in_(list(tool_module_id)))
    if q:
        conditions.append(
            or_(
                contains_ignore_case(ToolModule.name, q),
                func.array_to_string(Job.target, " ").ilike(
                    "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%",
                    escape="\\",
                ),
            )
        )
    stmt = _row_select().where(*conditions).order_by(*_ORDER[sort])
    if cursor is not None:
        stmt = stmt.where(_after_cursor(sort, cursor))
    rows = list((await session.execute(stmt.limit(size + 1))).all())
    total = await session.scalar(
        select(func.count())
        .select_from(Job)
        .join(ToolModule, ToolModule.id == Job.tool_module_id)
        .where(*conditions)
    )
    page_rows = rows[:size]
    next_cursor = _sort_cursor(sort, page_rows[-1]) if len(rows) > size else None
    return Page[JobResponse](
        items=[_response(*row) for row in page_rows], next_cursor=next_cursor, total=total or 0
    )


# ---------------------------------------------------------------- creation


def _initial_status(spec: ToolModuleSpec) -> S:
    # Exploit jobs wait for a second person (G5); everything else queues.
    return S.PENDING_APPROVAL if spec.group is ToolGroup.EXPLOIT else S.QUEUED


async def _checked_program(session: AsyncSession, actor: User, program_id: uuid.UUID) -> None:
    # Locked, so an archive cannot slip in between this check and the insert.
    program = await program_service.get_program(
        session, viewer=actor, program_id=program_id, lock=True
    )
    if program.status != ProgramStatus.ACTIVE:
        raise ConflictError(detail="jobs can only be created in an active program")


async def _insert(
    session: AsyncSession,
    *,
    actor: User,
    program_id: uuid.UUID,
    tool_module: ToolModule,
    spec: ToolModuleSpec,
    target: list[str],
    params: dict[str, Any],
    priority: PriorityName,
    proxy_id: uuid.UUID | None,
    retry_of_job_id: uuid.UUID | None = None,
) -> Job:
    status = _initial_status(spec)
    job = Job(
        program_id=program_id,
        tool_module_id=tool_module.id,
        status=status.value,
        priority=PRIORITY_VALUES[priority].value,
        target=target,
        params=params,
        proxy_id=proxy_id,
        retry_of_job_id=retry_of_job_id,
        created_by=actor.id,
    )
    session.add(job)
    await session.flush()
    await session.refresh(job)
    realtime.queue_job_event(session, job_id=job.id, program_id=program_id, status=job.status)
    await audit.record(
        session,
        action="job_created",
        user_id=actor.id,
        program_id=program_id,
        resource_type=RESOURCE,
        resource_id=job.id,
        detail={
            "tool_module": tool_module.name,
            "status": job.status,
            "priority": priority,
            "target_count": len(target),
            "retry_of_job_id": str(retry_of_job_id) if retry_of_job_id else None,
        },
    )
    return job


async def create_jobs(
    session: AsyncSession,
    *,
    actor: User,
    program_id: uuid.UUID,
    target: Sequence[str],
    items: Sequence[JobBulkItem],
    priority: PriorityName = "normal",
    proxy_id: uuid.UUID | None = None,
    field_prefix: str = "items",
) -> list[Job]:
    """Create one job per item, all or nothing (G5).

    Checks, in the order of docs/architecture/request-flow.md: program active,
    tool module enabled, params against the schema, proxy, then every target
    against scope. One failure refuses the whole batch.
    """
    await _checked_program(session, actor, program_id)
    errors: list[FieldError] = []
    checked: list[tuple[ToolModule, ToolModuleSpec, dict[str, Any]]] = []
    for index, item in enumerate(items):
        prefix = f"{field_prefix}[{index}]." if field_prefix else ""
        try:
            tool_module, spec = await tool_module_service.get_runnable(
                session, item.tool_module_id, field=f"{prefix}tool_module_id"
            )
            params = tool_module_service.validate_params(
                spec, tool_module.default_params, item.params, field=f"{prefix}params"
            )
        except ValidationFailedError as err:
            errors.extend(err.errors or [])
            continue
        checked.append((tool_module, spec, params))
    if errors:
        raise ValidationFailedError(detail="job is not valid", errors=errors)
    if proxy_id is not None:
        await program_service.require_job_proxy(
            session, program_id=program_id, proxy_id=proxy_id, field="proxy_id"
        )
    canonical = await scope_service.require_in_scope(session, program_id, target)
    jobs = [
        await _insert(
            session,
            actor=actor,
            program_id=program_id,
            tool_module=tool_module,
            spec=spec,
            target=canonical,
            params=params,
            priority=priority,
            proxy_id=proxy_id,
        )
        for tool_module, spec, params in checked
    ]
    if any(job.status == S.QUEUED for job in jobs):
        await notify_dispatcher(session, "job_created")
    return jobs


async def create_job(
    session: AsyncSession,
    *,
    actor: User,
    program_id: uuid.UUID,
    tool_module_id: uuid.UUID,
    target: Sequence[str],
    params: dict[str, Any],
    priority: PriorityName = "normal",
    proxy_id: uuid.UUID | None = None,
) -> Job:
    jobs = await create_jobs(
        session,
        actor=actor,
        program_id=program_id,
        target=target,
        items=[JobBulkItem(tool_module_id=tool_module_id, params=params)],
        priority=priority,
        proxy_id=proxy_id,
        field_prefix="",
    )
    return jobs[0]


async def _refuse_foreign_job(actor: User, job: Job, *, method: str, path: str) -> None:
    """A User acts only on jobs it created: docs/security/authorization.md."""
    if actor.role == UserRole.USER and job.created_by != actor.id:
        # Detached: the 403 below rolls the request transaction back.
        await audit.record_detached(
            action="permission_denied",
            user_id=actor.id,
            resource_type=RESOURCE,
            resource_id=job.id,
            detail={"reason": "not_job_creator", "method": method, "path": path},
        )
        raise ForbiddenError(detail="only the creator of the job may do this")


async def retry_jobs(
    session: AsyncSession, *, actor: User, job_ids: Sequence[uuid.UUID], path: str
) -> list[Job]:
    """New jobs copying failed or cancelled ones, all or nothing.

    Each new job passes every creation check again, scope included, and
    links the old one through retry_of_job_id. The old job keeps its status
    and raw output: docs/architecture/business-flow.md.
    """
    sources: list[Job] = []
    for job_id in dict.fromkeys(job_ids):
        job = await get_visible_job(session, viewer=actor, job_id=job_id)
        await _refuse_foreign_job(actor, job, method="POST", path=path)
        if job.status not in {s.value for s in RETRYABLE}:
            raise ConflictError(detail="only a failed or cancelled job can be retried")
        sources.append(job)
    created: list[Job] = []
    for job in sources:
        await _checked_program(session, actor, job.program_id)
        tool_module, spec = await tool_module_service.get_runnable(
            session, job.tool_module_id, field="tool_module_id"
        )
        params = tool_module_service.validate_params(spec, {}, job.params, field="params")
        if job.proxy_id is not None:
            await program_service.require_job_proxy(
                session, program_id=job.program_id, proxy_id=job.proxy_id, field="proxy_id"
            )
        canonical = await scope_service.require_in_scope(session, job.program_id, job.target)
        created.append(
            await _insert(
                session,
                actor=actor,
                program_id=job.program_id,
                tool_module=tool_module,
                spec=spec,
                target=canonical,
                params=params,
                priority=PRIORITY_NAMES[job.priority],
                proxy_id=job.proxy_id,
                retry_of_job_id=job.id,
            )
        )
    if any(job.status == S.QUEUED for job in created):
        await notify_dispatcher(session, "job_created")
    return created


# ---------------------------------------------------------------- operator actions


async def cancel_job(session: AsyncSession, *, actor: User, job_id: uuid.UUID, path: str) -> None:
    """Cancel a job that has not finished. A running job stops at its next heartbeat."""
    job = await get_visible_job(session, viewer=actor, job_id=job_id)
    await _refuse_foreign_job(actor, job, method="POST", path=path)
    now = _now()
    changed = await _transition(
        session,
        job.id,
        sources=CANCELLABLE,
        target=S.CANCELLED,
        values={
            "status_reason": REASON_CANCELLED_BY_USER,
            # A running job is closed by its worker's finish call, which
            # uploads what the tool produced so far first.
            "finished_at": case((Job.status == S.RUNNING.value, null()), else_=now),
        },
    )
    if changed is None:
        raise ConflictError(detail="job status does not allow cancel")
    await audit.record(
        session,
        action="job_cancelled",
        user_id=actor.id,
        program_id=changed.program_id,
        resource_type=RESOURCE,
        resource_id=changed.id,
    )
    await notify_dispatcher(session, "job_cancelled")


async def prioritize_job(session: AsyncSession, *, actor: User, job_id: uuid.UUID) -> None:
    """Dispatch Now: raise a queued job to `high` and wake the dispatcher.

    The job still passes every dispatch check: docs/architecture/business-flow.md.
    """
    job = await get_visible_job(session, viewer=actor, job_id=job_id)
    result = await session.execute(
        update(Job)
        .where(Job.id == job.id, Job.status == S.QUEUED.value)
        .values(priority=JobPriority.HIGH.value)
        .returning(Job.id)
    )
    if result.scalar_one_or_none() is None:
        raise ConflictError(detail="only a queued job can be dispatched now")
    await audit.record(
        session,
        action="job_prioritized",
        user_id=actor.id,
        program_id=job.program_id,
        resource_type=RESOURCE,
        resource_id=job.id,
    )
    await notify_dispatcher(session, "job_prioritized")


async def cleanup_queue(session: AsyncSession, *, actor: User) -> int:
    """Cleanup: cancel every queued job of a paused or archived program."""
    held = select(_program.c.id).where(
        _program.c.status.in_([ProgramStatus.PAUSED.value, ProgramStatus.ARCHIVED.value])
    )
    jobs = await _transition_many(
        session,
        and_(Job.status == S.QUEUED.value, Job.program_id.in_(held)),
        target=S.CANCELLED,
        values={"status_reason": REASON_CLEANUP, "finished_at": _now()},
    )
    await audit.record(
        session,
        action="job_queue_cleaned",
        user_id=actor.id,
        resource_type=RESOURCE,
        detail={"cancelled": len(jobs)},
    )
    return len(jobs)


# ---------------------------------------------------------------- worker contract


async def _job_tool_module(session: AsyncSession, job: Job) -> ToolModule:
    tool_module = await session.get(ToolModule, job.tool_module_id)
    if tool_module is None:  # pragma: no cover - the foreign key forbids it
        raise NotFoundError(detail="tool module does not exist")
    return tool_module


async def claim_job(session: AsyncSession, *, worker: Worker, job_id: uuid.UUID) -> JobSpec:
    """`dispatched` to `running` for this worker, and the spec the runner needs.

    Any other status answers 409 and the worker drops the task: a task
    redelivered by Celery never runs a job twice.
    """
    now = _now()
    job = await _transition(
        session,
        job_id,
        sources=(S.DISPATCHED,),
        target=S.RUNNING,
        values={"worker_id": worker.id, "started_at": now, "last_heartbeat_at": now},
    )
    if job is None:
        raise ConflictError(detail="job is not waiting for a worker")
    tool_module = await _job_tool_module(session, job)
    proxy_url = (
        await program_service.proxy_url_for_job(session, job.proxy_id)
        if job.proxy_id is not None
        else None
    )
    spec = tool_module_service.spec_of(tool_module.name)
    # None when the engine is off or not set up: the runner finishes the job failed.
    engine = (
        await engine_service.engine_spec_for(session, spec.runs_on)
        if spec is not None and spec.runs_on is not None
        else None
    )
    log.info("job_claimed", job_id=str(job.id), tool_module=tool_module.name)
    return JobSpec.model_validate(
        {
            "engine": engine,
            "job_id": job.id,
            "tool_module": tool_module.name,
            "target": list(job.target),
            "params": job.params,
            "timeout_minutes": tool_module.timeout_minutes,
            "heartbeat_seconds": await get_int_setting(session, "job_heartbeat_seconds"),
            "proxy_url": proxy_url,
        }
    )


async def _owned_job(session: AsyncSession, *, worker: Worker, job_id: uuid.UUID) -> Job | None:
    return await session.scalar(select(Job).where(Job.id == job_id, Job.worker_id == worker.id))


async def heartbeat_job(
    session: AsyncSession, *, worker: Worker, job_id: uuid.UUID
) -> JobHeartbeatResponse:
    result = await session.execute(
        update(Job)
        .where(Job.id == job_id, Job.worker_id == worker.id, Job.status == S.RUNNING.value)
        .values(last_heartbeat_at=_now())
        .returning(Job.id)
    )
    if result.scalar_one_or_none() is not None:
        return JobHeartbeatResponse(action=JobHeartbeatAction.CONTINUE)
    job = await _owned_job(session, worker=worker, job_id=job_id)
    if job is not None and job.status == S.CANCELLED and job.finished_at is None:
        job.last_heartbeat_at = _now()
        return JobHeartbeatResponse(action=JobHeartbeatAction.CANCEL)
    raise ConflictError(detail="job is not running on this worker")


async def require_upload_job(session: AsyncSession, *, worker: Worker, job_id: uuid.UUID) -> Job:
    """The job a worker may upload raw output for, locked against a racing finish.

    Running on this worker, or cancelled while running there and not yet
    closed: a cancelled runner uploads what it has before finishing.
    """
    job = await session.scalar(
        select(Job)
        .where(
            Job.id == job_id,
            Job.worker_id == worker.id,
            Job.finished_at.is_(None),
            Job.status.in_([S.RUNNING.value, S.CANCELLED.value]),
        )
        .with_for_update(read=True)
    )
    if job is None:
        raise ConflictError(detail="job is not running on this worker")
    return job


async def finish_job(
    session: AsyncSession, *, worker: Worker, job_id: uuid.UUID, finish: JobFinish
) -> None:
    """Close a job after its uploads. Idempotent: a retried finish answers 204.

    A job cancelled while it ran keeps `cancelled` whatever the worker reports;
    the finish only records when the runner stopped.
    """
    now = _now()
    values: dict[str, Any] = {"finished_at": now, "tool_version": finish.tool_version}
    owned = (Job.worker_id == worker.id,)
    if finish.status is not FinishStatus.CANCELLED:
        target = S(finish.status.value)
        reason = finish.status_reason if target is S.FAILED else None
        job = await _transition(
            session,
            job_id,
            sources=(S.RUNNING,),
            target=target,
            values={**values, "status_reason": reason},
            where=owned,
        )
        if job is not None:
            await notify_dispatcher(session, "job_finished")
            return
    closed = await session.execute(
        update(Job)
        .where(
            Job.id == job_id,
            *owned,
            Job.status == S.CANCELLED.value,
            Job.finished_at.is_(None),
        )
        .values(**values)
        .returning(Job.id)
    )
    if closed.scalar_one_or_none() is not None:
        await notify_dispatcher(session, "job_finished")
        return
    current = await _owned_job(session, worker=worker, job_id=job_id)
    if (
        current is not None
        and current.finished_at is not None
        and (current.status == S.CANCELLED or current.status == finish.status.value)
    ):
        # A retry of a finish that already went through.
        return
    raise ConflictError(detail="job is not running on this worker")


# ---------------------------------------------------------------- dispatcher


async def dispatch_candidates(session: AsyncSession, *, limit: int) -> list[tuple[Job, ToolModule]]:
    """Queued jobs the dispatcher may hand out, highest priority, oldest first.

    Skips jobs of a program that is not active and jobs of a disabled tool
    module. Rows are locked, so a concurrent cancel waits for this round.
    """
    rows = await session.execute(
        select(Job, ToolModule)
        .join(ToolModule, ToolModule.id == Job.tool_module_id)
        .join(_program, _program.c.id == Job.program_id)
        .where(
            Job.status == S.QUEUED.value,
            _program.c.status == ProgramStatus.ACTIVE.value,
            ToolModule.is_enabled.is_(True),
        )
        .order_by(Job.priority.desc(), Job.created_at, Job.id)
        .limit(limit)
        .with_for_update(of=Job, skip_locked=True)
    )
    return [(row[0], row[1]) for row in rows]


async def active_counts(session: AsyncSession) -> dict[uuid.UUID, int]:
    """Jobs handed out and not finished, per tool module: the concurrency count."""
    rows = await session.execute(
        select(Job.tool_module_id, func.count())
        .where(Job.status.in_([S.DISPATCHED.value, S.RUNNING.value]))
        .group_by(Job.tool_module_id)
    )
    return {row[0]: int(row[1]) for row in rows}


async def recent_dispatch_counts(session: AsyncSession) -> dict[uuid.UUID, int]:
    """Jobs dispatched in the last minute, per tool module: the rate count."""
    since = _now() - timedelta(minutes=1)
    rows = await session.execute(
        select(Job.tool_module_id, func.count())
        .where(Job.dispatched_at >= since)
        .group_by(Job.tool_module_id)
    )
    return {row[0]: int(row[1]) for row in rows}


async def mark_dispatched(session: AsyncSession, job_id: uuid.UUID) -> Job | None:
    return await _transition(
        session,
        job_id,
        sources=(S.QUEUED,),
        target=S.DISPATCHED,
        values={"dispatched_at": _now()},
    )


async def revert_dispatch(session: AsyncSession, job_id: uuid.UUID) -> Job | None:
    """Back to `queued` when the Celery task could not be sent."""
    return await _transition(
        session,
        job_id,
        sources=(S.DISPATCHED,),
        target=S.QUEUED,
        values={"dispatched_at": None},
    )


async def cancel_out_of_scope(session: AsyncSession, job_id: uuid.UUID) -> Job | None:
    """Second scope check, at dispatch: a target that left scope cancels the job (G5)."""
    return await _transition(
        session,
        job_id,
        sources=(S.QUEUED,),
        target=S.CANCELLED,
        values={"status_reason": REASON_OUT_OF_SCOPE, "finished_at": _now()},
    )


async def fail_stale_jobs(session: AsyncSession) -> list[Job]:
    """Running jobs without a heartbeat past the threshold become `failed`.

    A cancelled job whose worker vanished before finishing is closed too.
    """
    minutes = await get_int_setting(session, "job_heartbeat_timeout_minutes")
    now = _now()
    cutoff = now - timedelta(minutes=minutes)
    last_seen = func.coalesce(Job.last_heartbeat_at, Job.started_at)
    failed = await _transition_many(
        session,
        and_(Job.status == S.RUNNING.value, last_seen < cutoff),
        target=S.FAILED,
        values={"status_reason": REASON_WORKER_LOST, "finished_at": now},
    )
    await session.execute(
        update(Job)
        .where(
            Job.status == S.CANCELLED.value,
            Job.finished_at.is_(None),
            func.coalesce(last_seen, Job.created_at) < cutoff,
        )
        .values(finished_at=now)
    )
    return failed


async def cancel_jobs_of_archived_programs(session: AsyncSession) -> list[Job]:
    """Archiving stops every job that has not started: docs/architecture/business-flow.md."""
    archived = select(_program.c.id).where(_program.c.status == ProgramStatus.ARCHIVED.value)
    return await _transition_many(
        session,
        and_(
            Job.status.in_([S.PENDING_APPROVAL.value, S.QUEUED.value]),
            Job.program_id.in_(archived),
        ),
        target=S.CANCELLED,
        values={"status_reason": REASON_ARCHIVED, "finished_at": _now()},
    )
