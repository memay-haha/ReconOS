"""Status changes race safely: two processes on one job, exactly one wins.

Rows here are committed on separate connections, so the test removes them itself.
"""

import asyncio
import uuid
from collections.abc import AsyncIterator

import pytest_asyncio
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.core.errors import ConflictError
from app.job import service
from app.job.models import Job
from app.program.models import Program
from app.tool_module.models import ToolModule
from app.user.models import Worker
from contracts.job_status import JobStatus


@pytest_asyncio.fixture
async def committed(db_engine: AsyncEngine) -> AsyncIterator[tuple[uuid.UUID, list[Worker]]]:
    """A committed dispatched job and two workers, deleted after the test."""
    async with AsyncSession(db_engine, expire_on_commit=False) as session:
        program = Program(name=f"race-{uuid.uuid4().hex[:8]}", bounty_type="bounty")
        workers = [Worker(name=f"race-{uuid.uuid4().hex[:8]}") for _ in range(2)]
        session.add_all([program, *workers])
        await session.flush()
        tool = await session.scalar(select(ToolModule).where(ToolModule.name == "nuclei"))
        assert tool is not None
        job = Job(
            program_id=program.id,
            tool_module_id=tool.id,
            status="dispatched",
            target=["a.example.com"],
            params={},
        )
        session.add(job)
        await session.commit()
    yield job.id, workers
    async with AsyncSession(db_engine) as session:
        await session.execute(delete(Program).where(Program.id == program.id))
        await session.execute(delete(Worker).where(Worker.id.in_([w.id for w in workers])))
        await session.commit()


async def _claim(engine: AsyncEngine, job_id: uuid.UUID, worker: Worker) -> bool:
    async with AsyncSession(engine, expire_on_commit=False) as session:
        try:
            await service.claim_job(session, worker=worker, job_id=job_id)
        except ConflictError:
            await session.rollback()
            return False
        # Hold the row lock a moment so the other UPDATE has to wait on it.
        await asyncio.sleep(0.2)
        await session.commit()
        return True


async def test_two_claims_on_one_job_only_one_wins(
    db_engine: AsyncEngine, committed: tuple[uuid.UUID, list[Worker]]
) -> None:
    job_id, workers = committed
    results = await asyncio.gather(*(_claim(db_engine, job_id, worker) for worker in workers))
    assert sorted(results) == [False, True]
    async with AsyncSession(db_engine) as session:
        job = await session.get(Job, job_id)
    assert job is not None
    assert job.status == JobStatus.RUNNING
    winner = workers[results.index(True)]
    assert job.worker_id == winner.id


async def _cancel_queued(engine: AsyncEngine, job_id: uuid.UUID) -> bool:
    async with AsyncSession(engine, expire_on_commit=False) as session:
        changed = await service.revert_dispatch(session, job_id)
        await asyncio.sleep(0.2)
        await session.commit()
        return changed is not None


async def test_claim_racing_a_requeue_never_both_apply(
    db_engine: AsyncEngine, committed: tuple[uuid.UUID, list[Worker]]
) -> None:
    job_id, workers = committed
    claimed, requeued = await asyncio.gather(
        _claim(db_engine, job_id, workers[0]), _cancel_queued(db_engine, job_id)
    )
    assert claimed != requeued
    async with AsyncSession(db_engine) as session:
        job = await session.get(Job, job_id)
    assert job is not None
    assert job.status == (JobStatus.RUNNING if claimed else JobStatus.QUEUED)
