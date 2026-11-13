"""Alerts: the header bell, per role, and the paths that raise them.

docs/api/architecture.md (GET /alerts), docs/data/schema.md (alert.alert_type),
docs/security/authorization.md (a User sees its assigned programs only).
"""

import uuid
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.alert import service as alert_service
from app.alert.models import Alert, AlertType
from app.core.identity import User, UserRole
from app.core.realtime import take_pending_events
from app.job import service as job_service
from contracts.job_status import FinishStatus, JobFinish, JobStatus
from tests.factories import (
    assign,
    make_job,
    make_program,
    make_scope_rule,
    make_worker,
    nuclei,
    tool_module_named,
)

SAME_ORIGIN = {"origin": "https://reconos.example.com", "sec-fetch-site": "same-origin"}

Login = Callable[..., Awaitable[User]]


async def _alert(
    session: AsyncSession,
    program_id: uuid.UUID | None,
    alert_type: AlertType = AlertType.FINDING_NEW,
) -> uuid.UUID:
    alert_id = await alert_service.raise_alert(
        session, alert_type=alert_type, program_id=program_id, message="New critical finding"
    )
    assert alert_id is not None
    return alert_id


@pytest.mark.parametrize("role", [UserRole.SUPERADMIN, UserRole.ADMIN])
async def test_operators_see_every_alert_including_system_wide(
    client: AsyncClient, db_session: AsyncSession, logged_in: Login, role: UserRole
) -> None:
    await logged_in(role)
    program = await make_program(db_session)
    first = await _alert(db_session, program.id)
    system = await _alert(db_session, None, AlertType.JOB_FAILED)

    response = await client.get("/api/v1/alerts")

    assert response.status_code == 200
    body = response.json()
    assert [item["id"] for item in body["items"]] == [str(system), str(first)]
    assert body["total"] == 2
    assert body["items"][1] == {
        "id": str(first),
        "alert_type": "finding_new",
        "message": "New critical finding",
        "program_id": str(program.id),
        "finding_id": None,
        "job_id": None,
        "schedule_id": None,
        "created_at": body["items"][1]["created_at"],
        "is_read": False,
    }


async def test_a_user_sees_only_alerts_of_assigned_programs(
    client: AsyncClient, db_session: AsyncSession, logged_in: Login
) -> None:
    user = await logged_in(UserRole.USER)
    mine = await make_program(db_session)
    other = await make_program(db_session)
    await assign(db_session, mine, user.id)
    visible = await _alert(db_session, mine.id)
    hidden = await _alert(db_session, other.id)
    await _alert(db_session, None, AlertType.JOB_FAILED)

    body = (await client.get("/api/v1/alerts")).json()
    assert [item["id"] for item in body["items"]] == [str(visible)]

    # Marking an alert of a program not assigned answers like a missing one.
    response = await client.post(f"/api/v1/alerts/{hidden}/read", headers=SAME_ORIGIN)
    assert response.status_code == 404
    missing = await client.post(f"/api/v1/alerts/{uuid.uuid4()}/read", headers=SAME_ORIGIN)
    assert missing.status_code == 404


async def test_read_state_is_per_account_and_filters(
    client: AsyncClient, db_session: AsyncSession, logged_in: Login
) -> None:
    await logged_in(UserRole.ADMIN)
    program = await make_program(db_session)
    first = await _alert(db_session, program.id)
    second = await _alert(db_session, program.id, AlertType.ASSET_NEW)

    assert (
        await client.post(f"/api/v1/alerts/{first}/read", headers=SAME_ORIGIN)
    ).status_code == 204
    # Idempotent.
    assert (
        await client.post(f"/api/v1/alerts/{first}/read", headers=SAME_ORIGIN)
    ).status_code == 204

    unread = (await client.get("/api/v1/alerts", params={"is_read": "false"})).json()
    assert [item["id"] for item in unread["items"]] == [str(second)]
    assert unread["total"] == 1
    read = (await client.get("/api/v1/alerts", params={"is_read": "true"})).json()
    assert [item["id"] for item in read["items"]] == [str(first)]
    assert read["items"][0]["is_read"] is True
    typed = (await client.get("/api/v1/alerts", params={"alert_type": ["asset_new"]})).json()
    assert [item["id"] for item in typed["items"]] == [str(second)]

    assert (await client.post("/api/v1/alerts/read-all", headers=SAME_ORIGIN)).status_code == 204
    left = (await client.get("/api/v1/alerts", params={"is_read": "false"})).json()
    assert left["total"] == 0


async def test_read_all_of_a_user_leaves_other_programs_unread(
    client: AsyncClient,
    db_session: AsyncSession,
    logged_in: Login,
    user_factory: Callable[..., Awaitable[User]],
) -> None:
    user = await logged_in(UserRole.USER)
    mine = await make_program(db_session)
    other = await make_program(db_session)
    await assign(db_session, mine, user.id)
    await _alert(db_session, mine.id)
    hidden = await _alert(db_session, other.id)

    assert (await client.post("/api/v1/alerts/read-all", headers=SAME_ORIGIN)).status_code == 204

    marked = await db_session.scalar(
        select(func.count())
        .select_from(Alert)
        .where(Alert.id == hidden, alert_service._read_by(user))
    )
    assert marked == 0


async def test_alerts_page_with_a_cursor(
    client: AsyncClient, db_session: AsyncSession, logged_in: Login
) -> None:
    await logged_in(UserRole.SUPERADMIN)
    program = await make_program(db_session)
    ids = [await _alert(db_session, program.id) for _ in range(3)]

    first = (await client.get("/api/v1/alerts", params={"limit": 2})).json()
    assert [item["id"] for item in first["items"]] == [str(ids[2]), str(ids[1])]
    second = (
        await client.get("/api/v1/alerts", params={"limit": 2, "cursor": first["next_cursor"]})
    ).json()
    assert [item["id"] for item in second["items"]] == [str(ids[0])]
    assert second["next_cursor"] is None
    oldest = (await client.get("/api/v1/alerts", params={"sort": "created_at", "limit": 1})).json()
    assert oldest["items"][0]["id"] == str(ids[0])
    bad = await client.get("/api/v1/alerts", params={"cursor": "not-a-cursor"})
    assert bad.status_code == 400


async def test_alert_list_needs_a_session(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/alerts")).status_code == 401


async def test_raise_alert_queues_the_event_and_is_once_per_job(db_session: AsyncSession) -> None:
    program = await make_program(db_session)
    job = await make_job(db_session, program, await nuclei(db_session))
    take_pending_events(db_session)

    first = await alert_service.raise_alert(
        db_session,
        alert_type=AlertType.ASSET_NEW,
        program_id=program.id,
        message="New assets",
        job_id=job.id,
    )
    again = await alert_service.raise_alert(
        db_session,
        alert_type=AlertType.ASSET_NEW,
        program_id=program.id,
        message="New assets",
        job_id=job.id,
    )

    assert first is not None and again is None
    events = take_pending_events(db_session)
    assert [(e["type"], e["program_id"], e["data"]) for e in events] == [
        ("alert.created", str(program.id), {"alert_id": str(first), "alert_type": "asset_new"})
    ]


async def test_a_long_message_is_cut(db_session: AsyncSession) -> None:
    program = await make_program(db_session)
    alert_id = await alert_service.raise_alert(
        db_session, alert_type=AlertType.FINDING_NEW, program_id=program.id, message="x" * 2000
    )
    message = await db_session.scalar(select(Alert.message).where(Alert.id == alert_id))
    assert message is not None and len(message) == alert_service.MESSAGE_MAX_CHARS


# ---------------------------------------------------------------- raised by job transitions


async def _alerts_of(session: AsyncSession, job_id: uuid.UUID) -> list[tuple[str, str]]:
    rows = await session.execute(
        select(Alert.alert_type, Alert.message).where(Alert.job_id == job_id)
    )
    return [(row[0], row[1]) for row in rows]


async def test_a_stale_job_raises_job_failed(db_session: AsyncSession) -> None:
    program = await make_program(db_session)
    long_ago = datetime.now(UTC) - timedelta(hours=1)
    job = await make_job(
        db_session,
        program,
        await nuclei(db_session),
        status=JobStatus.RUNNING.value,
        target=["a.example.com", "b.example.com"],
        started_at=long_ago,
        last_heartbeat_at=long_ago,
    )

    failed = await job_service.fail_stale_jobs(db_session)

    assert [row.id for row in failed] == [job.id]
    assert await _alerts_of(db_session, job.id) == [
        (
            "job_failed",
            "nuclei job on a.example.com and 1 more failed: " + job_service.REASON_WORKER_LOST,
        )
    ]


async def test_a_worker_reporting_failure_raises_job_failed(db_session: AsyncSession) -> None:
    program = await make_program(db_session)
    worker, _ = await make_worker(db_session)
    job = await make_job(
        db_session, program, await nuclei(db_session), status="running", worker_id=worker.id
    )

    await job_service.finish_job(
        db_session,
        worker=worker,
        job_id=job.id,
        finish=JobFinish(status=FinishStatus.FAILED, status_reason="nuclei exited with code 2"),
    )

    assert await _alerts_of(db_session, job.id) == [
        ("job_failed", "nuclei job on a.example.com failed: nuclei exited with code 2")
    ]


@pytest.mark.parametrize("approve", [True, False])
async def test_an_exploit_job_raises_job_pending_approval_once(
    db_session: AsyncSession, user_factory: Callable[..., Awaitable[User]], approve: bool
) -> None:
    creator = await user_factory(role=UserRole.ADMIN)
    reviewer = await user_factory(role=UserRole.ADMIN)
    program = await make_program(db_session)
    await make_scope_rule(db_session, program, "*.example.com", rule_type="wildcard")
    sqlmap = await tool_module_named(db_session, "sqlmap")

    job = await job_service.create_job(
        db_session,
        actor=creator,
        program_id=program.id,
        tool_module_id=sqlmap.id,
        target=["https://a.example.com/item?id=1"],
        params={},
    )

    assert job.status == JobStatus.PENDING_APPROVAL.value
    expected = [
        (
            "job_pending_approval",
            "sqlmap job on https://a.example.com/item?id=1 is waiting for approval",
        )
    ]
    assert await _alerts_of(db_session, job.id) == expected
    # Approving queues the job, rejecting cancels it: neither raises another alert.
    review = job_service.approve_job if approve else job_service.reject_job
    await review(db_session, actor=reviewer, job_id=job.id, path="/api/v1/jobs")
    assert await _alerts_of(db_session, job.id) == expected


async def test_a_queued_job_raises_nothing(
    db_session: AsyncSession, user_factory: Callable[..., Awaitable[User]]
) -> None:
    actor = await user_factory(role=UserRole.ADMIN)
    program = await make_program(db_session)
    await make_scope_rule(db_session, program, value="a.example.com")
    job = await job_service.create_job(
        db_session,
        actor=actor,
        program_id=program.id,
        tool_module_id=(await nuclei(db_session)).id,
        target=["a.example.com"],
        params={},
    )
    assert job.status == JobStatus.QUEUED.value
    assert await _alerts_of(db_session, job.id) == []
