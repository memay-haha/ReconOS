"""Dispatcher: priority, limits, second scope check, stale jobs, send failures, the loop.

Mechanism: docs/architecture/system.md, section Cơ chế dispatcher.
"""

import asyncio
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from datetime import UTC, datetime, timedelta

import asyncpg
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.core import realtime
from app.core.config import get_settings
from app.core.identity import User, UserRole
from app.dispatcher import service
from app.job.models import Job
from app.program.models import Program, ProgramStatus
from app.tool_module.models import ToolModule
from tests.factories import assign, make_job, make_program, make_scope_rule, make_worker, nuclei

API = "/api/v1"
HEADERS = {"origin": "https://reconos.example.com", "sec-fetch-site": "same-origin"}


@pytest_asyncio.fixture
async def program(db_session: AsyncSession) -> Program:
    program = await make_program(db_session)
    await make_scope_rule(db_session, program, "*.example.com", rule_type="wildcard")
    return program


@pytest_asyncio.fixture
async def tool(db_session: AsyncSession) -> ToolModule:
    row = await nuclei(db_session)
    row.max_concurrency = 5
    row.rate_limit_per_minute = None
    await db_session.flush()
    return row


async def test_round_hands_out_highest_priority_first(
    db_session: AsyncSession, program: Program, tool: ToolModule
) -> None:
    tool.max_concurrency = 2
    low = await make_job(db_session, program, tool, priority=0)
    high = await make_job(db_session, program, tool, priority=2)
    normal = await make_job(db_session, program, tool, priority=1)
    planned = await service.dispatch_round(db_session)
    assert [item.job_id for item in planned] == [high.id, normal.id]
    assert {item.queue for item in planned} == {"job.nuclei"}
    for job in (low, high, normal):
        await db_session.refresh(job)
    assert (low.status, high.status, normal.status) == ("queued", "dispatched", "dispatched")
    assert high.dispatched_at is not None


async def test_concurrency_limit_counts_jobs_already_out(
    db_session: AsyncSession, program: Program, tool: ToolModule
) -> None:
    tool.max_concurrency = 1
    await make_job(db_session, program, tool, status="running")
    waiting = await make_job(db_session, program, tool)
    assert await service.dispatch_round(db_session) == []
    await db_session.refresh(waiting)
    assert waiting.status == "queued"


async def test_rate_limit_counts_the_last_minute(
    db_session: AsyncSession, program: Program, tool: ToolModule
) -> None:
    tool.rate_limit_per_minute = 1
    await make_job(db_session, program, tool, status="completed", dispatched_at=datetime.now(UTC))
    await make_job(db_session, program, tool)
    assert await service.dispatch_round(db_session) == []


async def test_target_that_left_scope_is_cancelled_at_dispatch(
    db_session: AsyncSession, program: Program, tool: ToolModule
) -> None:
    job = await make_job(db_session, program, tool, target=["example.org"])
    assert await service.dispatch_round(db_session) == []
    await db_session.refresh(job)
    assert job.status == "cancelled"
    assert job.status_reason == "Target no longer in scope at dispatch."


async def test_paused_program_and_disabled_tool_module_wait(
    db_session: AsyncSession, program: Program, tool: ToolModule
) -> None:
    paused = await make_program(db_session, status=ProgramStatus.PAUSED)
    await make_scope_rule(db_session, paused, "a.example.com")
    held = await make_job(db_session, paused, tool)
    assert await service.dispatch_round(db_session) == []
    await db_session.refresh(held)
    assert held.status == "queued"
    tool.is_enabled = False
    await make_job(db_session, program, tool)
    assert await service.dispatch_round(db_session) == []


async def test_archived_program_jobs_are_cancelled(
    db_session: AsyncSession, tool: ToolModule
) -> None:
    archived = await make_program(db_session, status=ProgramStatus.ARCHIVED)
    queued = await make_job(db_session, archived, tool)
    pending = await make_job(db_session, archived, tool, status="pending_approval")
    await service.dispatch_round(db_session)
    for job in (queued, pending):
        await db_session.refresh(job)
        assert (job.status, job.status_reason) == ("cancelled", "Program archived.")


async def test_running_job_without_heartbeat_fails(
    db_session: AsyncSession, program: Program, tool: ToolModule
) -> None:
    old = datetime.now(UTC) - timedelta(minutes=30)
    stale = await make_job(
        db_session, program, tool, status="running", started_at=old, last_heartbeat_at=old
    )
    fresh = await make_job(
        db_session,
        program,
        tool,
        status="running",
        started_at=old,
        last_heartbeat_at=datetime.now(UTC),
    )
    abandoned = await make_job(
        db_session, program, tool, status="cancelled", started_at=old, last_heartbeat_at=old
    )
    await service.dispatch_round(db_session)
    for job in (stale, fresh, abandoned):
        await db_session.refresh(job)
    assert (stale.status, stale.status_reason) == (
        "failed",
        "Worker lost connection: no heartbeat.",
    )
    assert fresh.status == "running"
    assert abandoned.finished_at is not None


async def test_worker_going_stale_is_announced_once(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    announced: list[tuple[uuid.UUID, bool]] = []
    monkeypatch.setattr(
        realtime,
        "queue_worker_event",
        lambda _session, *, worker_id, is_online: announced.append((worker_id, is_online)),
    )
    worker, _ = await make_worker(db_session)
    state = service.RoundState()
    await service.dispatch_round(db_session, state)
    assert worker.id in state.online_workers
    worker.last_heartbeat_at = datetime.now(UTC) - timedelta(hours=1)
    await db_session.flush()
    await service.dispatch_round(db_session, state)
    await service.dispatch_round(db_session, state)
    assert announced == [(worker.id, False)]


# ---------------------------------------------------------------- committed rounds


@pytest_asyncio.fixture
async def committed_job(db_engine: AsyncEngine) -> AsyncIterator[uuid.UUID]:
    async with AsyncSession(db_engine, expire_on_commit=False) as session:
        program = Program(name=f"dispatch-{uuid.uuid4().hex[:8]}", bounty_type="bounty")
        session.add(program)
        await session.flush()
        await make_scope_rule(session, program, "a.example.com")
        tool = await nuclei(session)
        job = await make_job(session, program, tool)
        await session.commit()
    yield job.id
    async with AsyncSession(db_engine) as session:
        await session.execute(delete(Program).where(Program.id == program.id))
        await session.commit()


async def _status(engine: AsyncEngine, job_id: uuid.UUID) -> str | None:
    async with AsyncSession(engine) as session:
        return await session.scalar(select(Job.status).where(Job.id == job_id))


async def test_failed_send_puts_the_job_back_in_the_queue(
    db_engine: AsyncEngine, committed_job: uuid.UUID
) -> None:
    async def broken(_queue: str, _job_id: uuid.UUID) -> None:
        raise ConnectionError

    assert await service.run_round(db_engine, broken, service.RoundState()) == 0
    assert await _status(db_engine, committed_job) == "queued"


async def test_run_forever_sends_once_holding_the_lock(
    db_engine: AsyncEngine, committed_job: uuid.UUID
) -> None:
    sent: list[tuple[str, uuid.UUID]] = []
    stop = asyncio.Event()

    async def send(queue: str, job_id: uuid.UUID) -> None:
        sent.append((queue, job_id))
        if job_id == committed_job:
            stop.set()

    await asyncio.wait_for(service.run_forever(send=send, stop=stop), timeout=20)
    assert ("job.nuclei", committed_job) in sent
    assert await _status(db_engine, committed_job) == "dispatched"
    beat, _ = await service.read_heartbeat()
    assert beat is not None


async def test_advisory_lock_admits_one_dispatcher() -> None:
    settings = get_settings()
    connect: Callable[[], Awaitable[asyncpg.Connection]] = lambda: asyncpg.connect(  # noqa: E731
        service._asyncpg_dsn(settings), password=settings.db_password.get_secret_value()
    )
    first, second = await connect(), await connect()
    try:
        query = "SELECT pg_try_advisory_lock($1)"
        assert await first.fetchval(query, service.ADVISORY_LOCK_KEY) is True
        assert await second.fetchval(query, service.ADVISORY_LOCK_KEY) is False
        await first.close()
        # A closed connection frees the lock, so a standby takes over.
        assert await second.fetchval(query, service.ADVISORY_LOCK_KEY) is True
    finally:
        await second.close()
        if not first.is_closed():
            await first.close()


# ---------------------------------------------------------------- status and wake


@pytest.mark.parametrize(
    ("age", "expected"), [(None, "down"), (10, "ok"), (100, "degraded"), (1000, "down")]
)
def test_health_follows_the_heartbeat_age(age: int | None, expected: str) -> None:
    now = datetime.now(UTC)
    beat = now - timedelta(seconds=age) if age is not None else None
    assert service.health_of(beat, 30, now) == expected


def test_broker_url_carries_the_password_only_when_set(
    settings_factory: Callable[..., object],
) -> None:
    plain = settings_factory(redis_url="redis://localhost:6379/0", redis_password=None)
    assert service._broker_url(plain) == "redis://localhost:6379/0"  # type: ignore[arg-type]  # factory returns Settings
    with_password = settings_factory(redis_url="redis://localhost:6379/0", redis_password="pw")
    assert service._broker_url(with_password) == "redis://:pw@localhost:6379/0"  # type: ignore[arg-type]  # factory returns Settings


async def test_status_counts_only_visible_programs(
    client: AsyncClient,
    logged_in: Callable[..., Awaitable[User]],
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
) -> None:
    user = await logged_in(UserRole.USER)
    other = await make_program(db_session)
    await assign(db_session, program, user.id)
    await make_job(db_session, program, tool)
    await make_job(db_session, other, tool)
    body = (await client.get(f"{API}/dispatcher/status")).json()
    assert body["queued_by_program"] == {str(program.id): 1}
    assert body["queued_total"] == 1
    assert body["queue_capacity"] == 1000
    assert body["status"] in {"ok", "degraded", "down"}


async def test_wake_is_for_operators(
    client: AsyncClient, logged_in: Callable[..., Awaitable[User]]
) -> None:
    await logged_in(UserRole.USER)
    assert (await client.post(f"{API}/dispatcher/wake", headers=HEADERS)).status_code == 403


async def test_operator_wakes_the_dispatcher(
    client: AsyncClient, logged_in: Callable[..., Awaitable[User]]
) -> None:
    await logged_in(UserRole.ADMIN)
    assert (await client.post(f"{API}/dispatcher/wake", headers=HEADERS)).status_code == 204


def test_queue_name_follows_the_contract() -> None:
    assert service.job_queue("nuclei") == "job.nuclei"


async def test_celery_sender_sends_only_the_job_id(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, dict[str, object], str]] = []

    class FakeCelery:
        def send_task(self, name: str, *, kwargs: dict[str, object], queue: str) -> None:
            calls.append((name, kwargs, queue))

    job_id = uuid.uuid4()
    await service.celery_sender(FakeCelery())("job.nuclei", job_id)
    assert calls == [("worker.run_job", {"job_id": str(job_id)}, "job.nuclei")]


def test_build_celery_uses_json_only(settings_factory: Callable[..., object]) -> None:
    app = service.build_celery(settings_factory())  # type: ignore[arg-type]  # factory returns Settings
    assert app.conf.task_serializer == "json"
    assert app.conf.accept_content == ["json"]
