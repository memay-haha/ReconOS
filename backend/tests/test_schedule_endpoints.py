"""Periodic scans on S09 and S16: schedule endpoints per role, checks like a job (G5)."""

import dataclasses
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import AuditLog
from app.core.identity import User, UserRole
from app.engine.models import Engine
from app.job.models import Job
from app.program.models import Program, ProgramStatus
from app.schedule.models import Schedule
from app.tool_module.models import ToolModule
from contracts import tool_modules
from contracts.tool_modules import ToolGroup
from tests.factories import assign, make_program, make_schedule, make_scope_rule, nuclei

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


def _body(tool: ToolModule, **overrides: object) -> dict[str, object]:
    return {
        "tool_module_id": str(tool.id),
        "target": ["A.Example.com"],
        "interval_minutes": 60,
        **overrides,
    }


async def _actions(session: AsyncSession, action: str) -> list[AuditLog]:
    return list((await session.scalars(select(AuditLog).where(AuditLog.action == action))).all())


# ---------------------------------------------------------------- create


async def test_admin_creates_schedule_with_canonical_target(
    client: AsyncClient,
    logged_in: Login,
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
) -> None:
    actor = await logged_in(UserRole.ADMIN)
    before = datetime.now(UTC)
    response = await client.post(
        f"{API}/programs/{program.id}/schedules",
        json=_body(tool, params={"severity": ["high"]}),
        headers=HEADERS,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["target"] == ["a.example.com"]
    assert body["params"] == {"severity": ["high"]}
    assert body["program_name"] == program.name
    assert body["tool_module_name"] == "nuclei"
    assert body["is_enabled"] is True
    assert body["created_by"] == str(actor.id)
    assert body["last_run_at"] is None
    next_run = datetime.fromisoformat(body["next_run_at"])
    assert before + timedelta(minutes=59) < next_run < before + timedelta(minutes=61)
    [entry] = await _actions(db_session, "schedule_created")
    assert entry.user_id == actor.id
    assert entry.program_id == program.id


async def test_user_cannot_create_schedule(
    client: AsyncClient,
    logged_in: Login,
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
) -> None:
    actor = await logged_in(UserRole.USER)
    await assign(db_session, program, actor.id)
    response = await client.post(
        f"{API}/programs/{program.id}/schedules", json=_body(tool), headers=HEADERS
    )
    assert response.status_code == 403


@pytest.mark.parametrize(
    ("overrides", "field", "code"),
    [
        ({"target": ["admin.example.com"]}, "target[0]", "target_out_of_scope"),
        ({"target": ["a.example.org"]}, "target[0]", "target_out_of_scope"),
        ({"target": ["*.shop.example.com"]}, "target[0]", "target_type_not_supported"),
        ({"params": {"os_shell": True}}, "params.os_shell", "extra_forbidden"),
        ({"interval_minutes": 5}, "interval_minutes", "greater_than_equal"),
        ({"interval_minutes": 525_601}, "interval_minutes", "less_than_equal"),
    ],
)
async def test_create_refuses_what_a_job_would_refuse(
    client: AsyncClient,
    logged_in: Login,
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
    overrides: dict[str, object],
    field: str,
    code: str,
) -> None:
    await logged_in(UserRole.ADMIN)
    response = await client.post(
        f"{API}/programs/{program.id}/schedules", json=_body(tool, **overrides), headers=HEADERS
    )
    assert response.status_code == 422
    assert {"field": field, "code": code} in [
        {"field": error["field"], "code": error["code"]} for error in response.json()["errors"]
    ]
    assert (await db_session.scalar(select(Schedule.id))) is None


async def test_create_refuses_disabled_tool_module(
    client: AsyncClient,
    logged_in: Login,
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
) -> None:
    await logged_in(UserRole.ADMIN)
    tool.is_enabled = False
    await db_session.flush()
    response = await client.post(
        f"{API}/programs/{program.id}/schedules", json=_body(tool), headers=HEADERS
    )
    assert response.status_code == 422
    assert response.json()["errors"][0]["code"] == "tool_module_disabled"


async def test_create_refuses_exploit_tool_module(
    client: AsyncClient,
    logged_in: Login,
    program: Program,
    tool: ToolModule,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    exploit = dataclasses.replace(tool_modules.TOOL_MODULES["nuclei"], group=ToolGroup.EXPLOIT)
    monkeypatch.setitem(tool_modules.TOOL_MODULES, "nuclei", exploit)
    await logged_in(UserRole.ADMIN)
    response = await client.post(
        f"{API}/programs/{program.id}/schedules", json=_body(tool), headers=HEADERS
    )
    assert response.status_code == 422
    assert response.json()["errors"] == [
        {"field": "tool_module_id", "code": "tool_module_not_schedulable"}
    ]


async def test_create_on_archived_program_is_conflict(
    client: AsyncClient, logged_in: Login, db_session: AsyncSession, tool: ToolModule
) -> None:
    archived = await make_program(db_session, status=ProgramStatus.ARCHIVED)
    await logged_in(UserRole.ADMIN)
    response = await client.post(
        f"{API}/programs/{archived.id}/schedules", json=_body(tool), headers=HEADERS
    )
    assert response.status_code == 409


async def test_create_rejects_unknown_field(
    client: AsyncClient, logged_in: Login, program: Program, tool: ToolModule
) -> None:
    await logged_in(UserRole.ADMIN)
    response = await client.post(
        f"{API}/programs/{program.id}/schedules",
        json=_body(tool, next_run_at="2026-01-01T00:00:00Z"),
        headers=HEADERS,
    )
    assert response.status_code == 422


# ---------------------------------------------------------------- list


@pytest.mark.parametrize("role", [UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER])
async def test_every_role_lists_schedules_of_a_visible_program(
    client: AsyncClient,
    logged_in: Login,
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
    role: UserRole,
) -> None:
    schedule = await make_schedule(db_session, program, tool)
    actor = await logged_in(role)
    if role is UserRole.USER:
        await assign(db_session, program, actor.id)
    response = await client.get(f"{API}/programs/{program.id}/schedules")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert [item["id"] for item in body["items"]] == [str(schedule.id)]


async def test_user_gets_404_for_unassigned_program(
    client: AsyncClient,
    logged_in: Login,
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
) -> None:
    schedule = await make_schedule(db_session, program, tool)
    await logged_in(UserRole.USER)
    response = await client.get(f"{API}/programs/{program.id}/schedules")
    assert response.status_code == 404
    listed = await client.get(f"{API}/schedules")
    assert listed.status_code == 200
    assert str(schedule.id) not in [item["id"] for item in listed.json()["items"]]


async def test_list_pages_newest_first(
    client: AsyncClient,
    logged_in: Login,
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
) -> None:
    first = await make_schedule(db_session, program, tool)
    second = await make_schedule(db_session, program, tool)
    second.created_at = first.created_at + timedelta(seconds=1)
    await db_session.flush()
    await logged_in(UserRole.ADMIN)
    page = (await client.get(f"{API}/programs/{program.id}/schedules?limit=1")).json()
    assert [item["id"] for item in page["items"]] == [str(second.id)]
    assert page["total"] == 2
    rest = (
        await client.get(
            f"{API}/programs/{program.id}/schedules?limit=1&cursor={page['next_cursor']}"
        )
    ).json()
    assert [item["id"] for item in rest["items"]] == [str(first.id)]
    assert rest["next_cursor"] is None


async def test_list_by_engine_keeps_tool_modules_of_that_engine(
    client: AsyncClient,
    logged_in: Login,
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
) -> None:
    osmedeus_tool = await db_session.scalar(
        select(ToolModule).where(ToolModule.name == "osmedeus-general")
    )
    engine = await db_session.scalar(select(Engine).where(Engine.name == "osmedeus"))
    assert osmedeus_tool is not None
    assert engine is not None
    on_engine = await make_schedule(db_session, program, osmedeus_tool, params={})
    await make_schedule(db_session, program, tool)
    await logged_in(UserRole.ADMIN)
    body = (await client.get(f"{API}/schedules?engine_id={engine.id}")).json()
    assert [item["id"] for item in body["items"]] == [str(on_engine.id)]
    assert body["items"][0]["tool_module_name"] == "osmedeus-general"
    everything = (await client.get(f"{API}/schedules")).json()
    assert everything["total"] == 2


async def test_list_by_unknown_engine_is_404(client: AsyncClient, logged_in: Login) -> None:
    await logged_in(UserRole.ADMIN)
    response = await client.get(f"{API}/schedules?engine_id=00000000-0000-7000-8000-000000000000")
    assert response.status_code == 404


# ---------------------------------------------------------------- update, delete


async def test_patch_changes_interval_and_restarts_count(
    client: AsyncClient,
    logged_in: Login,
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
) -> None:
    schedule = await make_schedule(db_session, program, tool)
    await logged_in(UserRole.ADMIN)
    before = datetime.now(UTC)
    response = await client.patch(
        f"{API}/schedules/{schedule.id}",
        json={"interval_minutes": 120, "target": ["B.example.com"]},
        headers=HEADERS,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["interval_minutes"] == 120
    assert body["target"] == ["b.example.com"]
    next_run = datetime.fromisoformat(body["next_run_at"])
    assert next_run > before + timedelta(minutes=119)
    [entry] = await _actions(db_session, "schedule_updated")
    assert entry.detail == {"fields": ["interval_minutes", "target"]}


async def test_patch_rechecks_scope_and_params(
    client: AsyncClient,
    logged_in: Login,
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
) -> None:
    schedule = await make_schedule(db_session, program, tool)
    await logged_in(UserRole.ADMIN)
    out = await client.patch(
        f"{API}/schedules/{schedule.id}", json={"target": ["admin.example.com"]}, headers=HEADERS
    )
    assert out.status_code == 422
    bad = await client.patch(
        f"{API}/schedules/{schedule.id}", json={"params": {"os_shell": True}}, headers=HEADERS
    )
    assert bad.status_code == 422
    null = await client.patch(
        f"{API}/schedules/{schedule.id}", json={"interval_minutes": None}, headers=HEADERS
    )
    assert null.status_code == 422
    assert null.json()["errors"][0]["code"] == "null_not_allowed"
    wildcard = await client.patch(
        f"{API}/schedules/{schedule.id}", json={"target": ["*.shop.example.com"]}, headers=HEADERS
    )
    assert wildcard.status_code == 422
    assert wildcard.json()["errors"][0]["code"] == "target_type_not_supported"


async def test_patch_disable_then_enable(
    client: AsyncClient,
    logged_in: Login,
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
) -> None:
    schedule = await make_schedule(
        db_session, program, tool, next_run_at=datetime.now(UTC) - timedelta(days=3)
    )
    await logged_in(UserRole.SUPERADMIN)
    off = await client.patch(
        f"{API}/schedules/{schedule.id}", json={"is_enabled": False}, headers=HEADERS
    )
    assert off.json()["is_enabled"] is False
    on = await client.patch(
        f"{API}/schedules/{schedule.id}", json={"is_enabled": True}, headers=HEADERS
    )
    # Switched back on: the stale slot is not run at once.
    assert datetime.fromisoformat(on.json()["next_run_at"]) > datetime.now(UTC)


@pytest.mark.parametrize("role", [UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER])
async def test_patch_delete_run_roles(
    client: AsyncClient,
    logged_in: Login,
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
    role: UserRole,
) -> None:
    schedule = await make_schedule(db_session, program, tool)
    actor = await logged_in(role)
    await assign(db_session, program, actor.id) if role is UserRole.USER else None
    allowed = role is not UserRole.USER
    patch = await client.patch(
        f"{API}/schedules/{schedule.id}", json={"is_enabled": False}, headers=HEADERS
    )
    assert patch.status_code == (200 if allowed else 403)
    run = await client.post(f"{API}/schedules/{schedule.id}/run", headers=HEADERS)
    assert run.status_code == (200 if allowed else 403)
    delete = await client.delete(f"{API}/schedules/{schedule.id}", headers=HEADERS)
    assert delete.status_code == (204 if allowed else 403)


async def test_delete_keeps_job_history(
    client: AsyncClient,
    logged_in: Login,
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
) -> None:
    schedule = await make_schedule(db_session, program, tool)
    await logged_in(UserRole.ADMIN)
    run = await client.post(f"{API}/schedules/{schedule.id}/run", headers=HEADERS)
    job_id = run.json()["id"]
    response = await client.delete(f"{API}/schedules/{schedule.id}", headers=HEADERS)
    assert response.status_code == 204
    job = await db_session.get(Job, job_id)
    assert job is not None
    await db_session.refresh(job)
    assert job.schedule_id is None
    assert await _actions(db_session, "schedule_deleted")


async def test_unknown_schedule_is_404(client: AsyncClient, logged_in: Login) -> None:
    await logged_in(UserRole.ADMIN)
    missing = "00000000-0000-7000-8000-000000000000"
    patch = await client.patch(f"{API}/schedules/{missing}", json={}, headers=HEADERS)
    assert patch.status_code == 404
    assert (await client.post(f"{API}/schedules/{missing}/run", headers=HEADERS)).status_code == 404


async def test_archived_program_schedule_is_read_only(
    client: AsyncClient, logged_in: Login, db_session: AsyncSession, tool: ToolModule
) -> None:
    archived = await make_program(db_session, status=ProgramStatus.ARCHIVED)
    schedule = await make_schedule(db_session, archived, tool)
    await logged_in(UserRole.ADMIN)
    patch = await client.patch(
        f"{API}/schedules/{schedule.id}", json={"is_enabled": False}, headers=HEADERS
    )
    assert patch.status_code == 409
    delete = await client.delete(f"{API}/schedules/{schedule.id}", headers=HEADERS)
    assert delete.status_code == 409
    run = await client.post(f"{API}/schedules/{schedule.id}/run", headers=HEADERS)
    assert run.status_code == 409


# ---------------------------------------------------------------- run now


async def test_run_creates_job_keeps_next_run(
    client: AsyncClient,
    logged_in: Login,
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
) -> None:
    schedule = await make_schedule(db_session, program, tool, params={"severity": ["high"]})
    next_run = schedule.next_run_at
    actor = await logged_in(UserRole.ADMIN)
    response = await client.post(f"{API}/schedules/{schedule.id}/run", headers=HEADERS)
    assert response.status_code == 200
    body = response.json()
    assert body["schedule_id"] == str(schedule.id)
    assert body["created_by"] == str(actor.id)
    assert body["status"] == "queued"
    assert body["priority"] == "normal"
    # Tool module defaults fill in at run time, as for a job from the API.
    assert body["params"]["severity"] == ["high"]
    assert body["params"]["rate"] == 150
    await db_session.refresh(schedule)
    assert schedule.next_run_at == next_run
    assert schedule.last_run_at is not None
    assert await _actions(db_session, "schedule_run")
    [created] = await _actions(db_session, "job_created")
    assert created.detail is not None
    assert created.detail["schedule_id"] == str(schedule.id)


async def test_run_rechecks_scope(
    client: AsyncClient,
    logged_in: Login,
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
) -> None:
    schedule = await make_schedule(db_session, program, tool, target=["x.example.com"])
    await make_scope_rule(
        db_session, program, "x.example.com", scope_type="out_of_scope", reason="Left scope."
    )
    await logged_in(UserRole.ADMIN)
    response = await client.post(f"{API}/schedules/{schedule.id}/run", headers=HEADERS)
    assert response.status_code == 422
    assert response.json()["code"] == "target_out_of_scope"


async def test_run_on_paused_program_is_conflict(
    client: AsyncClient, logged_in: Login, db_session: AsyncSession, tool: ToolModule
) -> None:
    paused = await make_program(db_session, status=ProgramStatus.PAUSED)
    await make_scope_rule(db_session, paused, "*.example.com", rule_type="wildcard")
    schedule = await make_schedule(db_session, paused, tool)
    await logged_in(UserRole.ADMIN)
    response = await client.post(f"{API}/schedules/{schedule.id}/run", headers=HEADERS)
    assert response.status_code == 409
