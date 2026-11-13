"""Celery Beat runs due schedules: through the job module (G5), once per slot.

The race test commits its rows on separate connections and removes them itself.
"""

import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.alert.models import Alert, AlertType
from app.background import schedule_tasks
from app.background.beat import BEAT_SCHEDULE
from app.background.celery_app import TASK_MODULES, app
from app.core.audit import AuditLog
from app.core.identity import User, UserRole
from app.core.realtime import take_pending_events
from app.core.tasks import RUN_DUE_SCHEDULES_TASK, SCHEDULE_QUEUE
from app.job.models import Job
from app.program.models import Program, ProgramStatus
from app.schedule import service
from app.schedule.models import Schedule
from app.scope.models import ScopeRule
from app.tool_module.models import ToolModule
from tests.factories import assign, make_program, make_schedule, make_scope_rule, nuclei

NOW = datetime(2026, 11, 13, 12, 0, tzinfo=UTC)


@pytest_asyncio.fixture
async def program(db_session: AsyncSession) -> Program:
    program = await make_program(db_session)
    await make_scope_rule(db_session, program, "*.example.com", rule_type="wildcard")
    return program


@pytest_asyncio.fixture
async def tool(db_session: AsyncSession) -> ToolModule:
    return await nuclei(db_session)


async def _jobs(session: AsyncSession, schedule: Schedule) -> list[Job]:
    return list((await session.scalars(select(Job).where(Job.schedule_id == schedule.id))).all())


@pytest.mark.parametrize(
    ("previous", "expected"),
    [
        (NOW + timedelta(minutes=5), NOW + timedelta(minutes=5)),
        (NOW, NOW + timedelta(minutes=60)),
        (NOW - timedelta(minutes=1), NOW + timedelta(minutes=59)),
        # Missed slots are skipped, the cadence stays.
        (NOW - timedelta(minutes=150), NOW + timedelta(minutes=30)),
    ],
)
def test_next_run_after(previous: datetime, expected: datetime) -> None:
    assert service.next_run_after(previous, 60, NOW) == expected


async def test_due_schedule_creates_job_without_creator(
    db_session: AsyncSession, program: Program, tool: ToolModule
) -> None:
    schedule = await make_schedule(
        db_session, program, tool, next_run_at=NOW - timedelta(minutes=1)
    )
    assert await service.run_due_schedules(db_session, now=NOW) == 1
    [job] = await _jobs(db_session, schedule)
    assert job.created_by is None
    assert job.status == "queued"
    assert job.priority == 1
    assert job.target == ["a.example.com"]
    assert job.params["rate"] == 150
    await db_session.refresh(schedule)
    assert schedule.last_run_at == NOW
    assert schedule.next_run_at == NOW + timedelta(minutes=59)
    created = await db_session.scalar(select(AuditLog).where(AuditLog.action == "job_created"))
    assert created is not None
    assert created.user_id is None


async def test_second_tick_in_same_slot_creates_nothing(
    db_session: AsyncSession, program: Program, tool: ToolModule
) -> None:
    schedule = await make_schedule(db_session, program, tool, next_run_at=NOW)
    assert await service.run_due_schedules(db_session, now=NOW) == 1
    assert await service.run_due_schedules(db_session, now=NOW + timedelta(seconds=30)) == 0
    assert len(await _jobs(db_session, schedule)) == 1


async def test_not_due_disabled_and_inactive_programs_are_skipped(
    db_session: AsyncSession, program: Program, tool: ToolModule
) -> None:
    later = await make_schedule(db_session, program, tool, next_run_at=NOW + timedelta(minutes=1))
    off = await make_schedule(db_session, program, tool, next_run_at=NOW, is_enabled=False)
    paused = await make_program(db_session, status=ProgramStatus.PAUSED)
    archived = await make_program(db_session, status=ProgramStatus.ARCHIVED)
    on_paused = await make_schedule(db_session, paused, tool, next_run_at=NOW)
    on_archived = await make_schedule(db_session, archived, tool, next_run_at=NOW)
    assert await service.run_due_schedules(db_session, now=NOW) == 0
    for schedule in (later, off, on_paused, on_archived):
        assert await _jobs(db_session, schedule) == []
    # A paused program catches up with one job once it is active again.
    paused.status = ProgramStatus.ACTIVE.value
    await make_scope_rule(db_session, paused, "*.example.com", rule_type="wildcard")
    await db_session.flush()
    later_now = NOW + timedelta(hours=5)
    assert await service.run_due_schedules(db_session, now=later_now) == 2
    assert len(await _jobs(db_session, on_paused)) == 1
    assert len(await _jobs(db_session, later)) == 1


async def test_refused_schedule_is_audited_and_others_still_run(
    db_session: AsyncSession, program: Program, tool: ToolModule
) -> None:
    broken = await make_schedule(
        db_session, program, tool, target=["x.example.com"], next_run_at=NOW
    )
    await make_scope_rule(
        db_session, program, "x.example.com", scope_type="out_of_scope", reason="Left scope."
    )
    healthy = await make_schedule(db_session, program, tool, next_run_at=NOW)
    assert await service.run_due_schedules(db_session, now=NOW) == 1
    assert await _jobs(db_session, broken) == []
    assert len(await _jobs(db_session, healthy)) == 1
    await db_session.refresh(broken)
    assert broken.next_run_at == NOW + timedelta(minutes=60)
    assert broken.last_run_at is None
    failure = await db_session.scalar(
        select(AuditLog).where(AuditLog.action == "schedule_run_failed")
    )
    assert failure is not None
    assert failure.resource_id == broken.id
    assert failure.detail == {"codes": ["target_out_of_scope"]}


async def test_disabled_tool_module_is_refused_at_run(
    db_session: AsyncSession, program: Program, tool: ToolModule
) -> None:
    schedule = await make_schedule(db_session, program, tool, next_run_at=NOW)
    tool.is_enabled = False
    await db_session.flush()
    assert await service.run_due_schedules(db_session, now=NOW) == 0
    assert await _jobs(db_session, schedule) == []
    failure = await db_session.scalar(
        select(AuditLog).where(AuditLog.action == "schedule_run_failed")
    )
    assert failure is not None
    assert failure.detail == {"codes": ["tool_module_disabled"]}


# ---------------------------------------------------------------- alerts


async def _run_failed_alerts(session: AsyncSession, schedule: Schedule) -> list[Alert]:
    rows = await session.scalars(
        select(Alert).where(Alert.schedule_id == schedule.id).order_by(Alert.created_at, Alert.id)
    )
    return list(rows.all())


async def test_refused_run_raises_one_alert_per_failure_streak(
    db_session: AsyncSession, program: Program, tool: ToolModule
) -> None:
    schedule = await make_schedule(
        db_session, program, tool, target=["x.example.com"], next_run_at=NOW
    )
    rule = await make_scope_rule(
        db_session, program, "x.example.com", scope_type="out_of_scope", reason="Left scope."
    )
    take_pending_events(db_session)

    assert await service.run_due_schedules(db_session, now=NOW) == 0
    [alert] = await _run_failed_alerts(db_session, schedule)
    assert alert.alert_type == AlertType.SCHEDULE_RUN_FAILED
    assert alert.program_id == program.id
    assert alert.job_id is None
    assert alert.message == "Scheduled nuclei on x.example.com did not run: target_out_of_scope"
    events = [e for e in take_pending_events(db_session) if e["type"] == "alert.created"]
    assert [e["data"]["alert_type"] for e in events] == ["schedule_run_failed"]
    await db_session.refresh(schedule)
    assert schedule.failing_since == NOW

    # Still broken at the next slots: audited each time, no second alert.
    later = NOW + timedelta(hours=1)
    assert await service.run_due_schedules(db_session, now=later) == 0
    assert await service.run_due_schedules(db_session, now=later + timedelta(hours=1)) == 0
    assert len(await _run_failed_alerts(db_session, schedule)) == 1
    failures = await db_session.scalar(
        select(func.count()).select_from(AuditLog).where(AuditLog.action == "schedule_run_failed")
    )
    assert failures == 3

    # A successful run ends the streak; the next refusal alerts again.
    await db_session.delete(rule)
    await db_session.flush()
    fixed = later + timedelta(hours=2)
    assert await service.run_due_schedules(db_session, now=fixed) == 1
    await db_session.refresh(schedule)
    assert schedule.failing_since is None
    await make_scope_rule(
        db_session, program, "x.example.com", scope_type="out_of_scope", reason="Left again."
    )
    assert await service.run_due_schedules(db_session, now=fixed + timedelta(hours=1)) == 0
    assert len(await _run_failed_alerts(db_session, schedule)) == 2


async def test_editing_a_failing_schedule_opens_a_new_streak(
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
    user_factory: Callable[..., Awaitable[User]],
) -> None:
    schedule = await make_schedule(db_session, program, tool, next_run_at=NOW)
    tool.is_enabled = False
    await db_session.flush()
    assert await service.run_due_schedules(db_session, now=NOW) == 0
    [alert] = await _run_failed_alerts(db_session, schedule)
    assert alert.message.endswith("did not run: tool_module_disabled")

    admin = await user_factory(UserRole.ADMIN)
    await service.update_schedule(
        db_session, actor=admin, schedule_id=schedule.id, fields={"interval_minutes": 30}
    )
    await db_session.refresh(schedule)
    assert schedule.failing_since is None
    assert await service.run_due_schedules(db_session, now=NOW + timedelta(hours=1)) == 0
    assert len(await _run_failed_alerts(db_session, schedule)) == 2


async def test_a_user_sees_schedule_alerts_of_assigned_programs_only(
    client: AsyncClient,
    db_session: AsyncSession,
    logged_in: Callable[..., Awaitable[User]],
    tool: ToolModule,
) -> None:
    user = await logged_in(UserRole.USER)
    mine = await make_program(db_session)
    other = await make_program(db_session)
    await assign(db_session, mine, user.id)
    tool.is_enabled = False
    await db_session.flush()
    own = await make_schedule(db_session, mine, tool, next_run_at=NOW)
    await make_schedule(db_session, other, tool, next_run_at=NOW)
    assert await service.run_due_schedules(db_session, now=NOW) == 0

    body = (await client.get("/api/v1/alerts", params={"alert_type": "schedule_run_failed"})).json()
    assert [
        (item["program_id"], item["schedule_id"], item["job_id"]) for item in body["items"]
    ] == [(str(mine.id), str(own.id), None)]


# ---------------------------------------------------------------- race


@pytest_asyncio.fixture
async def committed_schedule(db_engine: AsyncEngine) -> AsyncIterator[uuid.UUID]:
    async with AsyncSession(db_engine, expire_on_commit=False) as session:
        program = Program(name=f"race-{uuid.uuid4().hex[:8]}", bounty_type="bounty")
        session.add(program)
        await session.flush()
        session.add(
            ScopeRule(
                program_id=program.id,
                scope_type="in_scope",
                rule_type="wildcard",
                value="*.example.com",
            )
        )
        tool = await nuclei(session)
        schedule = await make_schedule(session, program, tool, next_run_at=NOW)
        await session.commit()
    try:
        yield schedule.id
    finally:
        async with db_engine.begin() as connection:
            await connection.execute(delete(Program).where(Program.id == program.id))


async def test_two_ticks_at_once_create_one_job(
    db_engine: AsyncEngine, committed_schedule: uuid.UUID
) -> None:
    first = AsyncSession(db_engine)
    second = AsyncSession(db_engine)
    try:
        # The first tick holds its row lock; the second skips the row.
        assert await service.run_due_schedules(first, now=NOW) == 1
        assert await service.run_due_schedules(second, now=NOW) == 0
        await first.commit()
        await second.commit()
        # After the commit the slot has moved on: a late tick finds nothing.
        assert await service.run_due_schedules(second, now=NOW) == 0
        await second.commit()
    finally:
        await first.close()
        await second.close()
    async with AsyncSession(db_engine) as session:
        count = await session.scalar(
            select(func.count()).select_from(Job).where(Job.schedule_id == committed_schedule)
        )
    assert count == 1


# ---------------------------------------------------------------- Celery wiring


def test_task_and_beat_are_wired_to_queue_schedule() -> None:
    assert "app.background.schedule_tasks" in TASK_MODULES
    task = app.tasks[RUN_DUE_SCHEDULES_TASK]
    assert task.queue == SCHEDULE_QUEUE
    [entry] = [e for e in BEAT_SCHEDULE.values() if e["task"] == RUN_DUE_SCHEDULES_TASK]
    assert entry["options"]["queue"] == SCHEDULE_QUEUE
    assert app.conf.beat_schedule == BEAT_SCHEDULE


def test_task_runs_the_service_in_its_own_session(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[object] = []

    def fake_run_in_session(work: object, **_: str) -> int:
        calls.append(work)
        return 2

    monkeypatch.setattr(schedule_tasks, "run_in_session", fake_run_in_session)
    assert schedule_tasks.run_due_schedules() == 2
    assert calls == [service.run_due_schedules]
