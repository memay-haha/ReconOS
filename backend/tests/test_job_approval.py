"""Approval of exploit jobs on S10: a second person approves or rejects (G5).

docs/security/authorization.md, docs/architecture/business-flow.md.
"""

from collections.abc import Awaitable, Callable

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import realtime
from app.core.audit import AuditLog
from app.core.db import independent_session
from app.core.identity import User, UserRole
from app.dispatcher import service as dispatcher_service
from app.job import service as job_service
from app.program.models import Program
from app.tool_module.models import ToolModule
from tests.factories import assign, make_job, make_program, make_scope_rule, tool_module_named

API = "/api/v1"
HEADERS = {"origin": "https://reconos.example.com", "sec-fetch-site": "same-origin"}

Login = Callable[..., Awaitable[User]]
UserFactory = Callable[..., Awaitable[User]]


@pytest_asyncio.fixture
async def program(db_session: AsyncSession) -> Program:
    program = await make_program(db_session)
    await make_scope_rule(db_session, program, "*.example.com", rule_type="wildcard")
    return program


@pytest_asyncio.fixture
async def sqlmap(db_session: AsyncSession) -> ToolModule:
    return await tool_module_named(db_session, "sqlmap")


async def _audit_actions(session: AsyncSession, job_id: object) -> list[str]:
    rows = await session.scalars(
        select(AuditLog.action).where(AuditLog.resource_id == job_id).order_by(AuditLog.id)
    )
    return list(rows)


@pytest.mark.parametrize("name", ["sqlmap", "dalfox"])
async def test_exploit_job_is_created_pending_approval(
    client: AsyncClient,
    logged_in: Login,
    db_session: AsyncSession,
    program: Program,
    name: str,
) -> None:
    await logged_in(UserRole.ADMIN)
    tool = await tool_module_named(db_session, name)
    response = await client.post(
        f"{API}/jobs",
        headers=HEADERS,
        json={
            "program_id": str(program.id),
            "tool_module_id": str(tool.id),
            "target": ["https://a.example.com/item?id=1"],
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "pending_approval"


async def test_exploit_job_refuses_params_outside_the_allowlist(
    client: AsyncClient,
    logged_in: Login,
    program: Program,
    sqlmap: ToolModule,
) -> None:
    await logged_in(UserRole.ADMIN)
    response = await client.post(
        f"{API}/jobs",
        headers=HEADERS,
        json={
            "program_id": str(program.id),
            "tool_module_id": str(sqlmap.id),
            "target": ["https://a.example.com/item?id=1"],
            "params": {"os_shell": True},
        },
    )
    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


@pytest.mark.parametrize("role", [UserRole.SUPERADMIN, UserRole.ADMIN])
async def test_second_person_approves_and_the_job_queues(
    client: AsyncClient,
    logged_in: Login,
    user_factory: UserFactory,
    db_session: AsyncSession,
    program: Program,
    sqlmap: ToolModule,
    role: UserRole,
) -> None:
    creator = await user_factory(role=UserRole.ADMIN)
    approver = await logged_in(role)
    job = await make_job(
        db_session, program, sqlmap, status="pending_approval", created_by=creator.id
    )
    response = await client.post(f"{API}/jobs/{job.id}/approve", headers=HEADERS)
    assert response.status_code == 204, response.text
    await db_session.refresh(job)
    assert job.status == "queued"
    assert job.approved_by == approver.id
    assert job.approved_at is not None
    assert await _audit_actions(db_session, job.id) == ["job_approved"]
    # Approved, the job is a dispatch candidate like any queued job.
    candidates = await job_service.dispatch_candidates(db_session, limit=10)
    assert job.id in {candidate.id for candidate, _ in candidates}


async def test_reject_cancels_with_a_reason(
    client: AsyncClient,
    logged_in: Login,
    user_factory: UserFactory,
    db_session: AsyncSession,
    program: Program,
    sqlmap: ToolModule,
) -> None:
    creator = await user_factory(role=UserRole.USER)
    await logged_in(UserRole.ADMIN)
    job = await make_job(
        db_session, program, sqlmap, status="pending_approval", created_by=creator.id
    )
    response = await client.post(f"{API}/jobs/{job.id}/reject", headers=HEADERS)
    assert response.status_code == 204
    await db_session.refresh(job)
    assert job.status == "cancelled"
    assert job.status_reason == "Rejected by approver."
    assert job.finished_at is not None
    assert job.approved_by is None
    assert await _audit_actions(db_session, job.id) == ["job_rejected"]


@pytest.mark.parametrize("action", ["approve", "reject"])
@pytest.mark.parametrize("role", [UserRole.SUPERADMIN, UserRole.ADMIN])
async def test_creator_cannot_review_own_job_even_superadmin(
    client: AsyncClient,
    logged_in: Login,
    db_session: AsyncSession,
    program: Program,
    sqlmap: ToolModule,
    action: str,
    role: UserRole,
) -> None:
    me = await logged_in(role)
    job = await make_job(db_session, program, sqlmap, status="pending_approval", created_by=me.id)
    response = await client.post(f"{API}/jobs/{job.id}/{action}", headers=HEADERS)
    assert response.status_code == 403
    body = response.json()
    assert body["code"] == "self_approval_forbidden"
    assert response.headers["content-type"].startswith("application/problem+json")
    await db_session.refresh(job)
    assert job.status == "pending_approval"
    assert job.approved_by is None


async def test_self_review_refusal_is_audited(
    client: AsyncClient,
    logged_in: Login,
    db_session: AsyncSession,
    program: Program,
    sqlmap: ToolModule,
) -> None:
    me = await logged_in(UserRole.SUPERADMIN)
    job = await make_job(db_session, program, sqlmap, status="pending_approval", created_by=me.id)
    await client.post(f"{API}/jobs/{job.id}/approve", headers=HEADERS)
    # The refusal goes through an independent session, so it is committed.
    async with independent_session() as session:
        row = await session.scalar(
            select(AuditLog).where(
                AuditLog.resource_id == job.id, AuditLog.action == "permission_denied"
            )
        )
        assert row is not None
        assert row.user_id == me.id
        assert row.detail is not None
        assert row.detail["reason"] == "self_approval"
        await session.delete(row)
        await session.commit()


async def test_user_role_cannot_approve_or_reject(
    client: AsyncClient,
    logged_in: Login,
    user_factory: UserFactory,
    db_session: AsyncSession,
    program: Program,
    sqlmap: ToolModule,
) -> None:
    user = await logged_in(UserRole.USER)
    await assign(db_session, program, user.id)
    creator = await user_factory(role=UserRole.ADMIN)
    job = await make_job(
        db_session, program, sqlmap, status="pending_approval", created_by=creator.id
    )
    for action in ("approve", "reject"):
        response = await client.post(f"{API}/jobs/{job.id}/{action}", headers=HEADERS)
        assert response.status_code == 403
        assert response.json()["code"] == "forbidden"
    await db_session.refresh(job)
    assert job.status == "pending_approval"


async def test_anonymous_cannot_approve(
    client: AsyncClient, db_session: AsyncSession, program: Program, sqlmap: ToolModule
) -> None:
    job = await make_job(db_session, program, sqlmap, status="pending_approval")
    response = await client.post(f"{API}/jobs/{job.id}/approve", headers=HEADERS)
    assert response.status_code == 401


async def test_unknown_job_is_404(client: AsyncClient, logged_in: Login) -> None:
    await logged_in(UserRole.ADMIN)
    response = await client.post(
        f"{API}/jobs/00000000-0000-7000-8000-000000000000/approve", headers=HEADERS
    )
    assert response.status_code == 404


@pytest.mark.parametrize("status", ["queued", "running", "completed", "failed", "cancelled"])
@pytest.mark.parametrize("action", ["approve", "reject"])
async def test_only_a_pending_job_can_be_reviewed(
    client: AsyncClient,
    logged_in: Login,
    db_session: AsyncSession,
    program: Program,
    sqlmap: ToolModule,
    status: str,
    action: str,
) -> None:
    await logged_in(UserRole.ADMIN)
    job = await make_job(db_session, program, sqlmap, status=status)
    response = await client.post(f"{API}/jobs/{job.id}/{action}", headers=HEADERS)
    assert response.status_code == 409
    await db_session.refresh(job)
    assert job.status == status


async def test_second_review_of_the_same_job_is_409(
    client: AsyncClient,
    logged_in: Login,
    db_session: AsyncSession,
    program: Program,
    sqlmap: ToolModule,
) -> None:
    await logged_in(UserRole.ADMIN)
    job = await make_job(db_session, program, sqlmap, status="pending_approval")
    assert (await client.post(f"{API}/jobs/{job.id}/approve", headers=HEADERS)).status_code == 204
    assert (await client.post(f"{API}/jobs/{job.id}/reject", headers=HEADERS)).status_code == 409
    await db_session.refresh(job)
    assert job.status == "queued"


async def test_schedule_job_without_creator_can_be_approved(
    client: AsyncClient,
    logged_in: Login,
    db_session: AsyncSession,
    program: Program,
    sqlmap: ToolModule,
) -> None:
    await logged_in(UserRole.ADMIN)
    job = await make_job(db_session, program, sqlmap, status="pending_approval", created_by=None)
    assert (await client.post(f"{API}/jobs/{job.id}/approve", headers=HEADERS)).status_code == 204


async def test_dispatcher_never_hands_out_a_pending_job(
    db_session: AsyncSession, program: Program, sqlmap: ToolModule
) -> None:
    job = await make_job(db_session, program, sqlmap, status="pending_approval")
    dispatched = await dispatcher_service.dispatch_round(db_session)
    assert job.id not in {item.job_id for item in dispatched}
    await db_session.refresh(job)
    assert job.status == "pending_approval"


async def test_approve_queues_the_realtime_event_in_the_same_transaction(
    user_factory: UserFactory, db_session: AsyncSession, program: Program, sqlmap: ToolModule
) -> None:
    approver = await user_factory(role=UserRole.ADMIN)
    job = await make_job(db_session, program, sqlmap, status="pending_approval")
    realtime.take_pending_events(db_session)
    await job_service.approve_job(db_session, actor=approver, job_id=job.id, path="/test")
    events = realtime.take_pending_events(db_session)
    assert [(event["type"], event["data"]["status"]) for event in events] == [
        ("job.status_changed", "queued")
    ]
