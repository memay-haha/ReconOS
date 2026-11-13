"""S10 job endpoints: creation behind scope and params (G5), list, cancel, retry."""

from collections.abc import Awaitable, Callable

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import AuditLog
from app.core.identity import User, UserRole
from app.job.models import Job
from app.program.models import Program, ProgramStatus
from app.tool_module.models import ToolModule
from tests.factories import (
    assign,
    make_job,
    make_program,
    make_proxy,
    make_scope_rule,
    nuclei,
    tool_module_named,
)

API = "/api/v1"
HEADERS = {"origin": "https://reconos.example.com", "sec-fetch-site": "same-origin"}

Login = Callable[..., Awaitable[User]]


@pytest_asyncio.fixture
async def program(db_session: AsyncSession) -> Program:
    program = await make_program(db_session)
    await make_scope_rule(db_session, program, "*.example.com", rule_type="wildcard")
    await make_scope_rule(
        db_session,
        program,
        "admin.example.com",
        scope_type="out_of_scope",
        reason="Production admin.",
    )
    return program


@pytest_asyncio.fixture
async def tool(db_session: AsyncSession) -> ToolModule:
    return await nuclei(db_session)


def _body(program: Program, tool: ToolModule, **overrides: object) -> dict[str, object]:
    return {
        "program_id": str(program.id),
        "tool_module_id": str(tool.id),
        "target": ["A.Example.com"],
        **overrides,
    }


async def _job_count(session: AsyncSession) -> int:
    return int(await session.scalar(select(func.count()).select_from(Job)) or 0)


# ---------------------------------------------------------------- create


async def test_create_job_in_scope_queues_canonical_target(
    client: AsyncClient,
    logged_in: Login,
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
) -> None:
    actor = await logged_in(UserRole.ADMIN)
    response = await client.post(
        f"{API}/jobs", json=_body(program, tool, params={"severity": ["high"]}), headers=HEADERS
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "queued"
    assert body["target"] == ["a.example.com"]
    assert body["priority"] == "normal"
    assert body["tool_module_name"] == "nuclei"
    assert body["created_by_username"] == actor.username
    # Schema defaults are filled in, so the runner sees the full set.
    assert body["params"]["severity"] == ["high"]
    assert body["params"]["rate"] == 150
    assert body["status_changed_at"] == body["created_at"]
    audit = await db_session.scalar(select(AuditLog).where(AuditLog.action == "job_created"))
    assert audit is not None
    assert audit.program_id == program.id


async def test_out_of_scope_target_refuses_the_job(
    client: AsyncClient,
    logged_in: Login,
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
) -> None:
    await logged_in(UserRole.ADMIN)
    before = await _job_count(db_session)
    response = await client.post(
        f"{API}/jobs",
        json=_body(program, tool, target=["a.example.com", "admin.example.com", "example.org"]),
        headers=HEADERS,
    )
    assert response.status_code == 422
    assert response.json()["code"] == "target_out_of_scope"
    assert response.json()["errors"] == [
        {"field": "target[1]", "code": "target_out_of_scope"},
        {"field": "target[2]", "code": "target_out_of_scope"},
    ]
    assert await _job_count(db_session) == before


@pytest.mark.parametrize(
    ("params", "field", "code"),
    [
        ({"code": True}, "params.code", "extra_forbidden"),
        ({"rate": 0}, "params.rate", "greater_than_equal"),
        ({"severity": ["urgent"]}, "params.severity.0", "literal_error"),
        ({"tags": ["Bad Tag"]}, "params.tags.0", "string_pattern_mismatch"),
    ],
)
async def test_params_outside_the_schema_are_refused(
    client: AsyncClient,
    logged_in: Login,
    program: Program,
    tool: ToolModule,
    params: dict[str, object],
    field: str,
    code: str,
) -> None:
    await logged_in(UserRole.ADMIN)
    response = await client.post(
        f"{API}/jobs", json=_body(program, tool, params=params), headers=HEADERS
    )
    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"
    assert {"field": field, "code": code} in response.json()["errors"]


async def test_wildcard_target_runs_on_a_tool_module_that_takes_it(
    client: AsyncClient, logged_in: Login, db_session: AsyncSession, program: Program
) -> None:
    await logged_in(UserRole.ADMIN)
    tool = await tool_module_named(db_session, "osmedeus-domain-lite")
    tool.is_enabled = True
    response = await client.post(
        f"{API}/jobs", json=_body(program, tool, target=["*.Shop.Example.com"]), headers=HEADERS
    )
    assert response.status_code == 200
    assert response.json()["target"] == ["*.shop.example.com"]


async def test_wildcard_target_is_refused_for_a_tool_module_without_it(
    client: AsyncClient,
    logged_in: Login,
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
) -> None:
    await logged_in(UserRole.ADMIN)
    before = await _job_count(db_session)
    response = await client.post(
        f"{API}/jobs", json=_body(program, tool, target=["*.shop.example.com"]), headers=HEADERS
    )
    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"
    assert response.json()["errors"] == [
        {"field": "target[0]", "code": "target_type_not_supported"}
    ]
    assert await _job_count(db_session) == before


async def test_wildcard_target_touching_out_of_scope_is_refused(
    client: AsyncClient, logged_in: Login, db_session: AsyncSession, program: Program
) -> None:
    """`*.example.com` would reach admin.example.com, an Out-of-Scope host (G5)."""
    await logged_in(UserRole.ADMIN)
    tool = await tool_module_named(db_session, "osmedeus-domain-lite")
    tool.is_enabled = True
    response = await client.post(
        f"{API}/jobs", json=_body(program, tool, target=["*.example.com"]), headers=HEADERS
    )
    assert response.status_code == 422
    assert response.json()["code"] == "target_out_of_scope"


async def test_disabled_tool_module_is_refused(
    client: AsyncClient, logged_in: Login, program: Program, tool: ToolModule
) -> None:
    await logged_in(UserRole.ADMIN)
    tool.is_enabled = False
    response = await client.post(f"{API}/jobs", json=_body(program, tool), headers=HEADERS)
    assert response.status_code == 422
    assert response.json()["errors"] == [
        {"field": "tool_module_id", "code": "tool_module_disabled"}
    ]


async def test_unknown_tool_module_is_refused(
    client: AsyncClient, logged_in: Login, program: Program, tool: ToolModule
) -> None:
    await logged_in(UserRole.ADMIN)
    body = _body(program, tool, tool_module_id="00000000-0000-7000-8000-000000000000")
    response = await client.post(f"{API}/jobs", json=body, headers=HEADERS)
    assert response.status_code == 422
    assert response.json()["errors"] == [{"field": "tool_module_id", "code": "not_found"}]


@pytest.mark.parametrize("status", [ProgramStatus.PAUSED, ProgramStatus.ARCHIVED])
async def test_only_an_active_program_takes_jobs(
    client: AsyncClient,
    logged_in: Login,
    db_session: AsyncSession,
    tool: ToolModule,
    status: ProgramStatus,
) -> None:
    await logged_in(UserRole.ADMIN)
    program = await make_program(db_session, status=status)
    await make_scope_rule(db_session, program, "a.example.com")
    response = await client.post(f"{API}/jobs", json=_body(program, tool), headers=HEADERS)
    assert response.status_code == 409


async def test_user_creates_jobs_only_in_assigned_programs(
    client: AsyncClient,
    logged_in: Login,
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
) -> None:
    user = await logged_in(UserRole.USER)
    response = await client.post(f"{API}/jobs", json=_body(program, tool), headers=HEADERS)
    assert response.status_code == 404
    await assign(db_session, program, user.id)
    response = await client.post(f"{API}/jobs", json=_body(program, tool), headers=HEADERS)
    assert response.status_code == 200


async def test_proxy_must_belong_to_the_program_and_be_enabled(
    client: AsyncClient,
    logged_in: Login,
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
) -> None:
    await logged_in(UserRole.ADMIN)
    other = await make_program(db_session)
    foreign = await make_proxy(db_session, other)
    disabled = await make_proxy(db_session, program, is_enabled=False)
    enabled = await make_proxy(db_session, program)
    for proxy, code in ((foreign, "not_found"), (disabled, "proxy_disabled")):
        response = await client.post(
            f"{API}/jobs", json=_body(program, tool, proxy_id=str(proxy.id)), headers=HEADERS
        )
        assert response.status_code == 422
        assert response.json()["errors"] == [{"field": "proxy_id", "code": code}]
    response = await client.post(
        f"{API}/jobs", json=_body(program, tool, proxy_id=str(enabled.id)), headers=HEADERS
    )
    assert response.status_code == 200
    assert response.json()["proxy_id"] == str(enabled.id)


async def test_bulk_create_is_all_or_nothing(
    client: AsyncClient,
    logged_in: Login,
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
) -> None:
    await logged_in(UserRole.ADMIN)
    before = await _job_count(db_session)
    body = {
        "program_id": str(program.id),
        "target": ["a.example.com"],
        "priority": "high",
        "items": [
            {"tool_module_id": str(tool.id)},
            {"tool_module_id": str(tool.id), "params": {"headless": True}},
        ],
    }
    response = await client.post(f"{API}/jobs/bulk-create", json=body, headers=HEADERS)
    assert response.status_code == 422
    assert response.json()["errors"] == [
        {"field": "items[1].params.headless", "code": "extra_forbidden"}
    ]
    assert await _job_count(db_session) == before
    body["items"] = [{"tool_module_id": str(tool.id)}, {"tool_module_id": str(tool.id)}]
    response = await client.post(f"{API}/jobs/bulk-create", json=body, headers=HEADERS)
    assert response.status_code == 200
    assert [item["priority"] for item in response.json()["items"]] == ["high", "high"]


# ---------------------------------------------------------------- read


async def test_user_lists_only_jobs_of_assigned_programs(
    client: AsyncClient,
    logged_in: Login,
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
) -> None:
    user = await logged_in(UserRole.USER)
    other = await make_program(db_session)
    await assign(db_session, program, user.id)
    mine = await make_job(db_session, program, tool)
    hidden = await make_job(db_session, other, tool)
    response = await client.get(f"{API}/jobs", params={"program_id": str(program.id)})
    assert [item["id"] for item in response.json()["items"]] == [str(mine.id)]
    assert (await client.get(f"{API}/jobs/{hidden.id}")).status_code == 404
    assert (await client.get(f"{API}/jobs/{mine.id}")).status_code == 200


async def test_list_filters_and_pages_by_priority(
    client: AsyncClient,
    logged_in: Login,
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
) -> None:
    await logged_in(UserRole.ADMIN)
    low = await make_job(db_session, program, tool, priority=0)
    high = await make_job(db_session, program, tool, priority=2, target=["b.example.com"])
    done = await make_job(db_session, program, tool, status="completed")
    query: dict[str, str | int | list[str]] = {
        "program_id": str(program.id),
        "status": ["queued"],
        "sort": "-priority",
        "limit": 1,
    }
    first = (await client.get(f"{API}/jobs", params=query)).json()
    assert [item["id"] for item in first["items"]] == [str(high.id)]
    assert first["total"] == 2
    second = (
        await client.get(f"{API}/jobs", params={**query, "cursor": first["next_cursor"]})
    ).json()
    assert [item["id"] for item in second["items"]] == [str(low.id)]
    assert second["next_cursor"] is None
    by_target = (await client.get(f"{API}/jobs", params={"target": "b.example.com"})).json()[
        "items"
    ]
    assert [item["id"] for item in by_target] == [str(high.id)]
    by_q = (await client.get(f"{API}/jobs", params={"q": "b.example"})).json()["items"]
    assert [item["id"] for item in by_q] == [str(high.id)]
    assert str(done.id) not in {item["id"] for item in first["items"] + second["items"]}


@pytest.mark.parametrize("sort", ["created_at", "-created_at", "-status_changed_at"])
async def test_every_sort_pages_without_overlap(
    client: AsyncClient,
    logged_in: Login,
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
    sort: str,
) -> None:
    await logged_in(UserRole.ADMIN)
    ids = {str((await make_job(db_session, program, tool)).id) for _ in range(3)}
    seen: list[str] = []
    cursor = None
    while True:
        params: dict[str, str | int] = {"program_id": str(program.id), "sort": sort, "limit": 2}
        if cursor:
            params["cursor"] = cursor
        page = (await client.get(f"{API}/jobs", params=params)).json()
        seen += [item["id"] for item in page["items"]]
        cursor = page["next_cursor"]
        if cursor is None:
            break
    assert sorted(seen) == sorted(ids)


async def test_bad_cursor_is_400(client: AsyncClient, logged_in: Login) -> None:
    await logged_in(UserRole.ADMIN)
    for sort in ("-priority", "-created_at"):
        response = await client.get(f"{API}/jobs", params={"sort": sort, "cursor": "bm9wZQ"})
        assert response.status_code == 400


# ---------------------------------------------------------------- cancel, retry, queue


async def test_cancel_moves_an_unfinished_job_once(
    client: AsyncClient,
    logged_in: Login,
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
) -> None:
    await logged_in(UserRole.ADMIN)
    job = await make_job(db_session, program, tool)
    response = await client.post(f"{API}/jobs/{job.id}/cancel", headers=HEADERS)
    assert response.status_code == 204
    await db_session.refresh(job)
    assert job.status == "cancelled"
    assert job.finished_at is not None
    again = await client.post(f"{API}/jobs/{job.id}/cancel", headers=HEADERS)
    assert again.status_code == 409


async def test_cancelling_a_running_job_leaves_it_open_for_the_worker(
    client: AsyncClient,
    logged_in: Login,
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
) -> None:
    await logged_in(UserRole.ADMIN)
    job = await make_job(db_session, program, tool, status="running")
    assert (await client.post(f"{API}/jobs/{job.id}/cancel", headers=HEADERS)).status_code == 204
    await db_session.refresh(job)
    assert job.status == "cancelled"
    assert job.finished_at is None


async def test_user_cancels_only_its_own_jobs(
    client: AsyncClient,
    logged_in: Login,
    user_factory: Callable[..., Awaitable[User]],
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
) -> None:
    user = await logged_in(UserRole.USER)
    await assign(db_session, program, user.id)
    someone = await user_factory(role=UserRole.USER)
    theirs = await make_job(db_session, program, tool, created_by=someone.id)
    mine = await make_job(db_session, program, tool, created_by=user.id)
    response = await client.post(f"{API}/jobs/{theirs.id}/cancel", headers=HEADERS)
    assert response.status_code == 403
    assert (await client.post(f"{API}/jobs/{mine.id}/cancel", headers=HEADERS)).status_code == 204


async def test_retry_creates_a_linked_job_after_a_new_scope_check(
    client: AsyncClient,
    logged_in: Login,
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
) -> None:
    await logged_in(UserRole.ADMIN)
    failed = await make_job(db_session, program, tool, status="failed")
    queued = await make_job(db_session, program, tool)
    response = await client.post(f"{API}/jobs/{failed.id}/retry", headers=HEADERS)
    assert response.status_code == 200
    assert response.json()["retry_of_job_id"] == str(failed.id)
    assert response.json()["status"] == "queued"
    assert (await client.post(f"{API}/jobs/{queued.id}/retry", headers=HEADERS)).status_code == 409
    gone = await make_job(db_session, program, tool, status="failed", target=["example.org"])
    response = await client.post(
        f"{API}/jobs/bulk-retry", json={"ids": [str(gone.id)]}, headers=HEADERS
    )
    assert response.json()["code"] == "target_out_of_scope"


async def test_prioritize_and_cleanup(
    client: AsyncClient,
    logged_in: Login,
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
) -> None:
    await logged_in(UserRole.ADMIN)
    job = await make_job(db_session, program, tool, priority=0)
    assert (
        await client.post(f"{API}/jobs/{job.id}/prioritize", headers=HEADERS)
    ).status_code == 204
    await db_session.refresh(job)
    assert job.priority == 2
    paused = await make_program(db_session, status=ProgramStatus.PAUSED)
    held = await make_job(db_session, paused, tool)
    response = await client.post(f"{API}/jobs/cleanup", headers=HEADERS)
    assert response.json()["cancelled"] >= 1
    await db_session.refresh(held)
    await db_session.refresh(job)
    assert held.status == "cancelled"
    assert job.status == "queued"
    assert (
        await client.post(f"{API}/jobs/{held.id}/prioritize", headers=HEADERS)
    ).status_code == 409


async def test_user_may_not_prioritize(
    client: AsyncClient, logged_in: Login, program: Program, db_session: AsyncSession
) -> None:
    await logged_in(UserRole.USER)
    tool = await nuclei(db_session)
    job = await make_job(db_session, program, tool)
    assert (
        await client.post(f"{API}/jobs/{job.id}/prioritize", headers=HEADERS)
    ).status_code == 403


async def test_proxy_of_an_unfinished_job_cannot_be_deleted(
    client: AsyncClient,
    logged_in: Login,
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
) -> None:
    await logged_in(UserRole.ADMIN)
    proxy = await make_proxy(db_session, program)
    job = await make_job(db_session, program, tool, proxy_id=proxy.id)
    response = await client.delete(f"{API}/proxies/{proxy.id}", headers=HEADERS)
    assert response.status_code == 409
    job.status = "completed"
    await db_session.flush()
    assert (await client.delete(f"{API}/proxies/{proxy.id}", headers=HEADERS)).status_code == 204
    await db_session.flush()
    await db_session.refresh(job)
    # The finished job keeps its history without the proxy.
    assert job.proxy_id is None
