"""Raw output and the parse task: queued only after the bytes are stored (G8, debt 49)."""

from collections.abc import AsyncIterator, Awaitable, Callable

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import AuditLog
from app.core.identity import User, UserRole
from app.core.storage import delete_object
from app.core.tasks import PARSE_RAW_OUTPUT_TASK, pending_tasks
from app.program.models import ProgramStatus
from tests.factories import (
    make_job,
    make_program,
    make_raw_output,
    make_worker,
    tool_module_named,
    tool_module_without_parser,
)

API = "/api/v1"
HEADERS = {"origin": "https://reconos.example.com", "sec-fetch-site": "same-origin"}


@pytest_asyncio.fixture
async def stored_keys() -> AsyncIterator[list[str]]:
    keys: list[str] = []
    yield keys
    for key in keys:
        await delete_object(key)


def _parse_tasks(session: AsyncSession) -> list[str]:
    return [
        task.kwargs["raw_output_id"]
        for task in pending_tasks(session)
        if task.name == PARSE_RAW_OUTPUT_TASK
    ]


async def test_upload_of_a_parsed_tool_module_queues_the_parse(
    client: AsyncClient, db_session: AsyncSession, stored_keys: list[str]
) -> None:
    program = await make_program(db_session)
    tool = await tool_module_named(db_session, "osmedeus-general")
    worker, token = await make_worker(db_session, tool_modules=["osmedeus-general"])
    job = await make_job(db_session, program, tool, status="running", worker_id=worker.id)
    response = await client.put(
        f"{API}/worker/jobs/{job.id}/raw-outputs/osmedeus.zip",
        content=b"PK\x05\x06" + b"\x00" * 18,
        headers={"authorization": f"Bearer {token}", "content-type": "application/zip"},
    )
    assert response.status_code == 201
    body = response.json()
    stored_keys.append(f"{program.id}/{job.id}/osmedeus.zip")
    assert body["parse_status"] == "pending"
    assert _parse_tasks(db_session) == [body["id"]]
    # The same upload again stores nothing and queues nothing more.
    again = await client.put(
        f"{API}/worker/jobs/{job.id}/raw-outputs/osmedeus.zip",
        content=b"other",
        headers={"authorization": f"Bearer {token}"},
    )
    assert again.status_code == 200
    assert _parse_tasks(db_session) == [body["id"]]


async def test_reparse_by_operator(
    client: AsyncClient,
    db_session: AsyncSession,
    logged_in: Callable[..., Awaitable[User]],
) -> None:
    program = await make_program(db_session)
    tool = await tool_module_named(db_session, "osmedeus-general")
    job = await make_job(db_session, program, tool, status="completed")
    raw = await make_raw_output(db_session, job, parse_status="failed")
    raw.parse_error = "parse failed after retries"
    await db_session.flush()

    await logged_in(UserRole.USER)
    assert (
        await client.post(f"{API}/raw-outputs/{raw.id}/reparse", headers=HEADERS)
    ).status_code == 403
    await client.post(f"{API}/auth/logout", headers=HEADERS)
    actor = await logged_in(UserRole.ADMIN)
    response = await client.post(f"{API}/raw-outputs/{raw.id}/reparse", headers=HEADERS)
    assert response.status_code == 204
    await db_session.refresh(raw)
    assert raw.parse_status == "pending"
    assert raw.parse_error is None
    assert _parse_tasks(db_session) == [str(raw.id)]
    audit = await db_session.scalar(
        select(AuditLog).where(
            AuditLog.action == "raw_output_reparse_requested", AuditLog.resource_id == raw.id
        )
    )
    assert audit is not None and audit.user_id == actor.id


async def test_reparse_refuses_no_parser_and_archived(
    client: AsyncClient,
    db_session: AsyncSession,
    logged_in: Callable[..., Awaitable[User]],
) -> None:
    await logged_in(UserRole.ADMIN)
    program = await make_program(db_session)
    job = await make_job(
        db_session, program, await tool_module_without_parser(db_session), status="completed"
    )
    raw = await make_raw_output(db_session, job, filename="output.txt", parse_status="no_parser")
    assert (
        await client.post(f"{API}/raw-outputs/{raw.id}/reparse", headers=HEADERS)
    ).status_code == 409

    archived = await make_program(db_session, status=ProgramStatus.ARCHIVED)
    tool = await tool_module_named(db_session, "osmedeus-general")
    old_job = await make_job(db_session, archived, tool, status="completed")
    old_raw = await make_raw_output(db_session, old_job, parse_status="parsed")
    assert (
        await client.post(f"{API}/raw-outputs/{old_raw.id}/reparse", headers=HEADERS)
    ).status_code == 409
    assert _parse_tasks(db_session) == []
