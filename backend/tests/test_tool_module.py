"""Tool modules on S15 and S18: code declaration, operator settings, parameter schema (G5)."""

from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import AuditLog
from app.core.errors import ValidationFailedError
from app.core.identity import User, UserRole
from app.tool_module import service
from app.tool_module.models import ToolModule
from app.user import service as user_service
from contracts.tool_modules import TOOL_MODULES
from tests.factories import make_job, make_program, make_worker, nuclei

API = "/api/v1"
HEADERS = {"origin": "https://reconos.example.com", "sec-fetch-site": "same-origin"}
Login = Callable[..., Awaitable[User]]


@pytest_asyncio.fixture
async def tool(db_session: AsyncSession) -> ToolModule:
    return await nuclei(db_session)


# ---------------------------------------------------------------- validate_params


def test_defaults_apply_then_params_override() -> None:
    spec = TOOL_MODULES["nuclei"]
    params = service.validate_params(spec, {"rate": 50, "threads": 5}, {"rate": 20}, field="params")
    assert params["rate"] == 20
    assert params["threads"] == 5
    assert params["severity"] == []


def test_unknown_parameter_is_refused_not_dropped() -> None:
    with pytest.raises(ValidationFailedError) as caught:
        service.validate_params(
            TOOL_MODULES["nuclei"], {}, {"-code": True}, field="items[0].params"
        )
    assert caught.value.errors == [{"field": "items[0].params.-code", "code": "extra_forbidden"}]


# ---------------------------------------------------------------- list


async def test_list_merges_code_and_row(
    client: AsyncClient, logged_in: Login, db_session: AsyncSession, tool: ToolModule
) -> None:
    await logged_in(UserRole.USER)
    body = (await client.get(f"{API}/tool-modules")).json()
    row = next(item for item in body["items"] if item["name"] == "nuclei")
    assert row["group"] == "scan"
    assert row["tools"] == ["nuclei"]
    assert row["output_types"] == ["finding"]
    assert set(row["param_schema"]["properties"]) >= {"severity", "rate", "threads"}
    assert row["param_schema"]["additionalProperties"] is False
    assert row["runs_on"] is None
    assert row["finding_count"] == 0
    assert body["group_counts"]["scan"] >= 1
    assert body["engines_bound"] == 0


async def test_disabled_reason_follows_switch_and_workers(
    client: AsyncClient, logged_in: Login, db_session: AsyncSession, tool: ToolModule
) -> None:
    await logged_in(UserRole.ADMIN)

    async def nuclei_row() -> dict[str, object]:
        items = (await client.get(f"{API}/tool-modules", params={"q": "nucl"})).json()["items"]
        return dict(items[0])

    # Online workers left by other tests would hide not_installed: none here yet.
    workers = await user_service.online_workers(db_session)
    if not any("nuclei" in worker.tool_modules for worker in workers):
        assert (await nuclei_row())["disabled_reason"] == "not_installed"
    await make_worker(db_session)
    assert (await nuclei_row())["disabled_reason"] is None
    tool.is_enabled = False
    await db_session.flush()
    row = await nuclei_row()
    assert row["disabled_reason"] == "off"
    filtered = await client.get(f"{API}/tool-modules", params={"is_enabled": "false"})
    assert "nuclei" in filtered.json()["disabled_names"]
    assert [item["name"] for item in filtered.json()["items"]] == ["nuclei"]


async def test_list_filters_and_pages(
    client: AsyncClient, logged_in: Login, tool: ToolModule
) -> None:
    await logged_in(UserRole.ADMIN)
    assert (await client.get(f"{API}/tool-modules", params={"group": "exploit"})).json()[
        "items"
    ] == []
    on_engine = (await client.get(f"{API}/tool-modules", params={"runs_on": "osmedeus"})).json()
    assert [item["name"] for item in on_engine["items"]] == [
        "osmedeus-domain-extensive",
        "osmedeus-domain-lite",
        "osmedeus-general",
    ]
    first = (await client.get(f"{API}/tool-modules", params={"limit": 1, "sort": "-name"})).json()
    assert first["items"][0]["name"] == "vigolium"
    if first["next_cursor"]:
        after = await client.get(
            f"{API}/tool-modules",
            params={"limit": 1, "sort": "-name", "cursor": first["next_cursor"]},
        )
        assert after.status_code == 200
    bad = await client.get(f"{API}/tool-modules", params={"cursor": "eyJ2IjoxLCJpZCI6IjAifQ"})
    assert bad.status_code == 400


async def test_aggregates_come_from_jobs(
    client: AsyncClient, logged_in: Login, db_session: AsyncSession, tool: ToolModule
) -> None:
    await logged_in(UserRole.ADMIN)
    program = await make_program(db_session)
    start = datetime.now(UTC) - timedelta(minutes=10)
    for minutes in (2, 4, 6):
        await make_job(
            db_session,
            program,
            tool,
            status="completed",
            started_at=start,
            finished_at=start + timedelta(minutes=minutes),
        )
    row = (await client.get(f"{API}/tool-modules", params={"q": "nuclei"})).json()["items"][0]
    assert row["jobs_24h"] >= 3
    assert row["last_job_at"] is not None
    assert row["estimated_seconds"] is not None


# ---------------------------------------------------------------- patch


async def test_superadmin_tunes_a_tool_module(
    client: AsyncClient, logged_in: Login, db_session: AsyncSession, tool: ToolModule
) -> None:
    await logged_in(UserRole.SUPERADMIN)
    body = {"max_concurrency": 3, "rate_limit_per_minute": 10, "default_params": {"rate": 40}}
    response = await client.patch(f"{API}/tool-modules/{tool.id}", json=body, headers=HEADERS)
    assert response.status_code == 200
    assert response.json()["max_concurrency"] == 3
    assert response.json()["default_params"] == {"rate": 40}
    audit = await db_session.scalar(
        select(AuditLog).where(AuditLog.action == "tool_module_updated")
    )
    assert audit is not None
    assert audit.detail is not None
    assert audit.detail["after"]["max_concurrency"] == 3
    cleared = await client.patch(
        f"{API}/tool-modules/{tool.id}", json={"rate_limit_per_minute": None}, headers=HEADERS
    )
    assert cleared.json()["rate_limit_per_minute"] is None


@pytest.mark.parametrize(
    ("body", "field", "code"),
    [
        ({"default_params": {"shell": "id"}}, "default_params.shell", "extra_forbidden"),
        ({"max_concurrency": None}, "max_concurrency", "null_not_allowed"),
        ({"max_concurrency": 0}, "max_concurrency", "greater_than_equal"),
    ],
)
async def test_patch_refuses_values_outside_the_range(
    client: AsyncClient,
    logged_in: Login,
    tool: ToolModule,
    body: dict[str, object],
    field: str,
    code: str,
) -> None:
    await logged_in(UserRole.SUPERADMIN)
    response = await client.patch(f"{API}/tool-modules/{tool.id}", json=body, headers=HEADERS)
    assert response.status_code == 422
    assert {"field": field, "code": code} in response.json()["errors"]


async def test_only_superadmin_patches(
    client: AsyncClient, logged_in: Login, tool: ToolModule
) -> None:
    await logged_in(UserRole.ADMIN)
    response = await client.patch(
        f"{API}/tool-modules/{tool.id}", json={"max_concurrency": 2}, headers=HEADERS
    )
    assert response.status_code == 403


async def test_patch_unknown_tool_module_is_404(client: AsyncClient, logged_in: Login) -> None:
    await logged_in(UserRole.SUPERADMIN)
    response = await client.patch(
        f"{API}/tool-modules/00000000-0000-7000-8000-000000000000",
        json={"max_concurrency": 2},
        headers=HEADERS,
    )
    assert response.status_code == 404


# ---------------------------------------------------------------- tools and stats


async def test_tools_report_versions_from_heartbeats(
    client: AsyncClient, logged_in: Login, db_session: AsyncSession
) -> None:
    await logged_in(UserRole.ADMIN)
    worker, _ = await make_worker(db_session)
    body = (await client.get(f"{API}/tools")).json()
    row = next(item for item in body["items"] if item["name"] == "nuclei")
    assert row["status"] == "installed"
    assert {"worker_name": worker.name, "version": "3.3.0"} in row["installed"]
    # The Osmedeus workflows run nuclei inside the engine too.
    assert row["tool_modules"] == ["nuclei", "osmedeus-domain-extensive", "osmedeus-general"]


async def test_user_cannot_read_tools(client: AsyncClient, logged_in: Login) -> None:
    await logged_in(UserRole.USER)
    assert (await client.get(f"{API}/tools")).status_code == 403


async def test_stats_count_window_and_stalled_jobs(
    client: AsyncClient, logged_in: Login, db_session: AsyncSession, tool: ToolModule
) -> None:
    await logged_in(UserRole.USER)
    program = await make_program(db_session)
    old = datetime.now(UTC) - timedelta(hours=1)
    await make_job(db_session, program, tool, status="running", started_at=old)
    body = (await client.get(f"{API}/tool-modules/stats", params={"window": "7d"})).json()
    assert body["window"] == "7d"
    assert body["jobs"] >= 1
    assert body["stalled"] >= 1
