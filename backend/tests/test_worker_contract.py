"""Worker contract: token, claim, heartbeat, finish, worker heartbeat, log batches.

Contract: docs/integrations/external-services.md.
"""

import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_log_engine
from app.core.identity import User, UserRole
from app.job.models import Job
from app.program.models import Program
from app.tool_module.models import ToolModule
from app.user.models import Worker, WorkerToken
from tests.factories import make_job, make_program, make_proxy, make_worker, nuclei

API = "/api/v1"
HEADERS = {"origin": "https://reconos.example.com", "sec-fetch-site": "same-origin"}


def bearer(token: str) -> dict[str, str]:
    return {"authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def program(db_session: AsyncSession) -> Program:
    return await make_program(db_session)


@pytest_asyncio.fixture
async def tool(db_session: AsyncSession) -> ToolModule:
    return await nuclei(db_session)


@pytest_asyncio.fixture
async def worker(db_session: AsyncSession) -> tuple[Worker, str]:
    return await make_worker(db_session)


# ---------------------------------------------------------------- authentication


@pytest.mark.parametrize("header", [None, "Basic abc", "Bearer ", "Bearer unknown-token"])
async def test_worker_routes_refuse_a_missing_or_unknown_token(
    client: AsyncClient, header: str | None
) -> None:
    headers = {"authorization": header} if header else {}
    response = await client.post(
        f"{API}/worker/heartbeat", json={"tool_modules": [], "tools": []}, headers=headers
    )
    assert response.status_code == 401
    assert response.json()["code"] == "unauthenticated"


async def test_revoked_token_is_refused(
    client: AsyncClient, db_session: AsyncSession, worker: tuple[Worker, str]
) -> None:
    row, token = worker
    stored = await db_session.scalar(select(WorkerToken).where(WorkerToken.worker_id == row.id))
    assert stored is not None
    # Only the digest is stored, never the token (G7).
    assert token not in stored.token_hash
    stored.revoked_at = datetime.now(UTC)
    await db_session.flush()
    response = await client.post(
        f"{API}/worker/heartbeat", json={"tool_modules": [], "tools": []}, headers=bearer(token)
    )
    assert response.status_code == 401


async def test_session_cookie_does_not_open_worker_routes(
    client: AsyncClient, logged_in: Callable[..., Awaitable[User]]
) -> None:
    await logged_in(UserRole.SUPERADMIN)
    response = await client.post(
        f"{API}/worker/heartbeat", json={"tool_modules": [], "tools": []}, headers=HEADERS
    )
    assert response.status_code == 401


# ---------------------------------------------------------------- claim, heartbeat, finish


async def test_claim_hands_the_spec_to_one_worker_only(
    client: AsyncClient,
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
    worker: tuple[Worker, str],
) -> None:
    row, token = worker
    proxy = await make_proxy(db_session, program, url="http://user:pw@198.51.100.10:3128")
    job = await make_job(db_session, program, tool, status="dispatched", proxy_id=proxy.id)
    response = await client.post(f"{API}/worker/jobs/{job.id}/claim", headers=bearer(token))
    assert response.status_code == 200
    spec = response.json()
    assert spec["job_id"] == str(job.id)
    assert spec["tool_module"] == "nuclei"
    assert spec["target"] == ["a.example.com"]
    assert spec["timeout_minutes"] == tool.timeout_minutes
    assert spec["heartbeat_seconds"] == 30
    assert spec["proxy_url"] == "http://user:pw@198.51.100.10:3128"
    await db_session.refresh(job)
    assert job.status == "running"
    assert job.worker_id == row.id
    # A redelivered task gets 409 and the worker drops it.
    again = await client.post(f"{API}/worker/jobs/{job.id}/claim", headers=bearer(token))
    assert again.status_code == 409


@pytest.mark.parametrize("status", ["queued", "running", "completed", "cancelled"])
async def test_claim_refuses_a_job_not_dispatched(
    client: AsyncClient,
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
    worker: tuple[Worker, str],
    status: str,
) -> None:
    job = await make_job(db_session, program, tool, status=status)
    response = await client.post(f"{API}/worker/jobs/{job.id}/claim", headers=bearer(worker[1]))
    assert response.status_code == 409


async def test_job_heartbeat_answers_continue_then_cancel(
    client: AsyncClient,
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
    worker: tuple[Worker, str],
) -> None:
    row, token = worker
    job = await make_job(db_session, program, tool, status="running", worker_id=row.id)
    url = f"{API}/worker/jobs/{job.id}/heartbeat"
    response = await client.post(url, headers=bearer(token))
    assert response.json() == {"action": "continue"}
    job.status = "cancelled"
    await db_session.flush()
    assert (await client.post(url, headers=bearer(token))).json() == {"action": "cancel"}
    _, other_token = await make_worker(db_session)
    assert (await client.post(url, headers=bearer(other_token))).status_code == 409


async def test_finish_completes_and_is_idempotent(
    client: AsyncClient,
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
    worker: tuple[Worker, str],
) -> None:
    row, token = worker
    job = await make_job(db_session, program, tool, status="running", worker_id=row.id)
    url = f"{API}/worker/jobs/{job.id}/finish"
    body = {"status": "completed", "tool_version": "3.3.0"}
    assert (await client.post(url, json=body, headers=bearer(token))).status_code == 204
    await db_session.refresh(job)
    assert (job.status, job.tool_version) == ("completed", "3.3.0")
    assert job.finished_at is not None
    # A finish retried after a network error answers 204 and changes nothing.
    assert (await client.post(url, json=body, headers=bearer(token))).status_code == 204
    conflicting = {"status": "failed", "status_reason": "Tool exited with code 2."}
    assert (await client.post(url, json=conflicting, headers=bearer(token))).status_code == 409


async def test_finish_failed_records_the_reason(
    client: AsyncClient,
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
    worker: tuple[Worker, str],
) -> None:
    row, token = worker
    job = await make_job(db_session, program, tool, status="running", worker_id=row.id)
    body = {"status": "failed", "status_reason": "Tool exited with code 2."}
    response = await client.post(
        f"{API}/worker/jobs/{job.id}/finish", json=body, headers=bearer(token)
    )
    assert response.status_code == 204
    await db_session.refresh(job)
    assert (job.status, job.status_reason) == ("failed", "Tool exited with code 2.")


@pytest.mark.parametrize("reported", ["completed", "cancelled"])
async def test_finish_of_a_cancelled_job_keeps_it_cancelled(
    client: AsyncClient,
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
    worker: tuple[Worker, str],
    reported: str,
) -> None:
    row, token = worker
    job = await make_job(db_session, program, tool, status="cancelled", worker_id=row.id)
    response = await client.post(
        f"{API}/worker/jobs/{job.id}/finish", json={"status": reported}, headers=bearer(token)
    )
    assert response.status_code == 204
    await db_session.refresh(job)
    assert job.status == "cancelled"
    assert job.finished_at is not None


async def test_finish_by_another_worker_is_refused(
    client: AsyncClient,
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
    worker: tuple[Worker, str],
) -> None:
    job = await make_job(db_session, program, tool, status="running", worker_id=worker[0].id)
    _, other_token = await make_worker(db_session)
    response = await client.post(
        f"{API}/worker/jobs/{job.id}/finish",
        json={"status": "completed"},
        headers=bearer(other_token),
    )
    assert response.status_code == 409


# ---------------------------------------------------------------- worker heartbeat and logs


async def test_worker_heartbeat_records_what_the_worker_reports(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    row, token = await make_worker(db_session, online=False, tool_modules=[])
    body = {
        "tool_modules": ["nuclei"],
        "tools": [{"name": "nuclei", "version": "3.3.1"}],
        "cpu_percent": 12.5,
    }
    response = await client.post(f"{API}/worker/heartbeat", json=body, headers=bearer(token))
    assert response.status_code == 204
    await db_session.flush()
    await db_session.refresh(row)
    assert row.tool_modules == ["nuclei"]
    assert row.tool_versions == [{"name": "nuclei", "version": "3.3.1"}]
    assert row.cpu_percent == 12.5
    assert row.last_heartbeat_at is not None


@pytest_asyncio.fixture
async def log_rows() -> AsyncIterator[list[uuid.UUID]]:
    """Worker IDs whose reconos_log rows are removed after the test."""
    workers: list[uuid.UUID] = []
    yield workers
    async with get_log_engine().begin() as connection:
        for worker_id in workers:
            await connection.execute(
                text("DELETE FROM app_log WHERE worker_id = :id"), {"id": worker_id}
            )


async def test_log_batch_lands_in_reconos_log_masked_and_scoped(
    client: AsyncClient,
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
    log_rows: list[uuid.UUID],
) -> None:
    row, token = await make_worker(db_session)
    log_rows.append(row.id)
    mine = await make_job(db_session, program, tool, status="running", worker_id=row.id)
    other, _ = await make_worker(db_session)
    theirs = await make_job(db_session, program, tool, status="running", worker_id=other.id)
    now = datetime.now(UTC).isoformat()
    body = {
        "records": [
            {
                "logged_at": now,
                "level": "info",
                "event": "tool_started",
                "job_id": str(mine.id),
                "context": {"api_key": "do-not-store", "items": [{"Token": "x"}]},
            },
            {"logged_at": now, "level": "error", "event": "tool_failed", "job_id": str(theirs.id)},
        ]
    }
    response = await client.post(f"{API}/worker/logs", json=body, headers=bearer(token))
    assert response.status_code == 204
    async with get_log_engine().connect() as connection:
        rows = (
            await connection.execute(
                text(
                    "SELECT event, job_id, program_id, service, context FROM app_log "
                    "WHERE worker_id = :id ORDER BY event DESC"
                ),
                {"id": row.id},
            )
        ).all()
    assert [(r.event, r.job_id, r.program_id, r.service) for r in rows] == [
        ("tool_started", mine.id, program.id, "worker"),
        ("tool_failed", None, None, "worker"),
    ]
    assert rows[0].context == {"api_key": "***", "items": [{"Token": "***"}]}
    assert rows[1].context == {"job_id_rejected": True}


async def test_log_batch_refuses_debug_and_bad_events(
    client: AsyncClient, worker: tuple[Worker, str]
) -> None:
    now = datetime.now(UTC).isoformat()
    for record in (
        {"logged_at": now, "level": "debug", "event": "x"},
        {"logged_at": now, "level": "info", "event": "Not Snake"},
    ):
        response = await client.post(
            f"{API}/worker/logs", json={"records": [record]}, headers=bearer(worker[1])
        )
        assert response.status_code == 422


# ---------------------------------------------------------------- worker management


async def test_superadmin_registers_a_worker_and_sees_the_token_once(
    client: AsyncClient,
    logged_in: Callable[..., Awaitable[User]],
    db_session: AsyncSession,
) -> None:
    await logged_in(UserRole.SUPERADMIN)
    created = await client.post(f"{API}/workers", json={"name": "scanner-01"}, headers=HEADERS)
    assert created.status_code == 200
    worker_id = created.json()["id"]
    duplicate = await client.post(f"{API}/workers", json={"name": "scanner-01"}, headers=HEADERS)
    assert duplicate.status_code == 409
    issued = await client.post(f"{API}/workers/{worker_id}/tokens", headers=HEADERS)
    assert issued.status_code == 200
    token = issued.json()["token"]
    stored = await db_session.scalar(
        select(WorkerToken).where(WorkerToken.id == uuid.UUID(issued.json()["id"]))
    )
    assert stored is not None
    assert stored.token_hash != token
    beat = await client.post(
        f"{API}/worker/heartbeat",
        json={"tool_modules": ["nuclei"], "tools": []},
        # The test client also holds the superadmin cookie, so it sends origin headers.
        headers={**HEADERS, **bearer(token)},
    )
    assert beat.status_code == 204
    revoke = await client.post(f"{API}/worker-tokens/{stored.id}/revoke", headers=HEADERS)
    assert revoke.status_code == 204
    again = await client.post(f"{API}/worker-tokens/{stored.id}/revoke", headers=HEADERS)
    assert again.status_code == 204
    beat = await client.post(
        f"{API}/worker/heartbeat",
        json={"tool_modules": ["nuclei"], "tools": []},
        # The test client also holds the superadmin cookie, so it sends origin headers.
        headers={**HEADERS, **bearer(token)},
    )
    assert beat.status_code == 401
    missing = uuid.uuid4()
    assert (
        await client.post(f"{API}/workers/{missing}/tokens", headers=HEADERS)
    ).status_code == 404
    assert (
        await client.post(f"{API}/worker-tokens/{missing}/revoke", headers=HEADERS)
    ).status_code == 404


async def test_admin_lists_workers_but_cannot_issue_tokens(
    client: AsyncClient,
    logged_in: Callable[..., Awaitable[User]],
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
) -> None:
    await logged_in(UserRole.ADMIN)
    online, _ = await make_worker(db_session, name="a-online")
    stale, _ = await make_worker(db_session, name="b-stale", online=False)
    stale.last_heartbeat_at = datetime.now(UTC) - timedelta(hours=1)
    await make_job(db_session, program, tool, status="running", worker_id=online.id)
    page = (await client.get(f"{API}/workers", params={"limit": 200})).json()
    rows = {item["name"]: item for item in page["items"]}
    assert rows["a-online"]["is_online"] is True
    assert rows["a-online"]["running_job_count"] == 1
    assert rows["a-online"]["running_tool_module_ids"] == [str(tool.id)]
    assert rows["b-stale"]["is_online"] is False
    first = (await client.get(f"{API}/workers", params={"limit": 1})).json()
    assert first["next_cursor"] is not None
    second = (
        await client.get(f"{API}/workers", params={"limit": 1, "cursor": first["next_cursor"]})
    ).json()
    assert second["items"][0]["name"] > first["items"][0]["name"]
    assert (
        await client.post(f"{API}/workers", json={"name": "x"}, headers=HEADERS)
    ).status_code == 403
    assert (
        await client.post(f"{API}/workers/{online.id}/tokens", headers=HEADERS)
    ).status_code == 403


async def test_user_cannot_list_workers(
    client: AsyncClient, logged_in: Callable[..., Awaitable[User]]
) -> None:
    await logged_in(UserRole.USER)
    assert (await client.get(f"{API}/workers")).status_code == 403


async def test_job_row_is_visible_after_claim(
    client: AsyncClient,
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
    worker: tuple[Worker, str],
) -> None:
    job = await make_job(db_session, program, tool, status="dispatched")
    await client.post(f"{API}/worker/jobs/{job.id}/claim", headers=bearer(worker[1]))
    stored = await db_session.scalar(select(Job).where(Job.id == job.id))
    assert stored is not None
    assert stored.started_at is not None
    assert stored.last_heartbeat_at is not None
