"""Engines on S16, S17: connection, write-only keys, variables, REST reads, claim (G7).

The engine REST API is a mock transport: .claude/rules/testing.md.
"""

import json
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

import httpx
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import AuditLog
from app.core.crypto import decrypt
from app.core.identity import User, UserRole
from app.engine import service
from app.engine.models import Engine, EngineVariable
from app.tool_module.models import ToolModule
from tests.factories import make_job, make_program, make_worker

API = "/api/v1"
HEADERS = {"origin": "https://reconos.example.com", "sec-fetch-site": "same-origin"}
Login = Callable[..., Awaitable[User]]
API_KEY = "osm-test-key"
VARIABLE_VALUE = "variable-test-value"


async def _engine(session: AsyncSession, name: str) -> Engine:
    row = await session.scalar(select(Engine).where(Engine.name == name))
    assert row is not None, "seeded by migration 0005"
    return row


@pytest_asyncio.fixture
async def osmedeus(db_session: AsyncSession) -> Engine:
    return await _engine(db_session, "osmedeus")


@pytest_asyncio.fixture
async def superadmin(logged_in: Login) -> User:
    return await logged_in(UserRole.SUPERADMIN)


def osmedeus_handler(request: httpx.Request) -> httpx.Response:
    if request.headers.get("x-osm-api-key") != API_KEY:
        return httpx.Response(401, json={"error": True})
    path = request.url.path
    if path == "/server-info":
        return httpx.Response(200, json={"version": "v5.1.2", "message": "ok"})
    if path == "/osm/api/workflows":
        return httpx.Response(
            200,
            json={
                "data": [
                    {"name": "general", "kind": "flow", "tags": ["recon"], "module_count": 10},
                    {"name": "domain-lite", "kind": "flow", "description": "Quick recon"},
                    {"name": "secret", "kind": "module", "hidden": True},
                ]
            },
        )
    if path == "/osm/api/workflows/domain-lite":
        return httpx.Response(
            200,
            json={
                "name": "domain-lite",
                "kind": "flow",
                "description": "Quick recon",
                "tags": "recon, domain, lite",
                "steps": [],
                "modules": [{"name": "enum-subdomain"}, {"name": "probe-dns"}],
            },
        )
    return httpx.Response(404, json={"error": True})


@pytest.fixture
def engine_api(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(service, "_transport", httpx.MockTransport(osmedeus_handler))


async def _configure(client: AsyncClient, engine: Engine, **body: object) -> httpx.Response:
    payload = {"base_url": "http://engine.test:8002", "api_key": API_KEY, **body}
    return await client.patch(f"{API}/engines/{engine.id}", json=payload, headers=HEADERS)


# ---------------------------------------------------------------- list, roles


async def test_list_returns_seeded_engines_without_credentials(
    client: AsyncClient, superadmin: User, osmedeus: Engine
) -> None:
    await _configure(client, osmedeus)
    body = (await client.get(f"{API}/engines")).json()
    assert [item["name"] for item in body["items"]] == ["osmedeus", "vigolium"]
    row = body["items"][0]
    assert row["has_api_key"] is True
    assert row["has_llm_api_key"] is False
    assert row["slots_total"] == 3  # three Osmedeus tool modules, one slot each
    assert row["slots_used"] == 0
    assert {key for key in row if "key" in key} == {
        "has_api_key",
        "has_llm_api_key",
        "api_key_updated_at",
    }
    assert API_KEY not in json.dumps(body)


@pytest.mark.parametrize("role", [UserRole.ADMIN, UserRole.USER])
async def test_engine_routes_are_superadmin_only(
    client: AsyncClient, logged_in: Login, osmedeus: Engine, role: UserRole
) -> None:
    await logged_in(role)
    assert (await client.get(f"{API}/engines")).status_code == 403
    response = await client.put(
        f"{API}/engines/{osmedeus.id}/variables/token", json={"value": "x"}, headers=HEADERS
    )
    assert response.status_code == 403


# ---------------------------------------------------------------- patch


async def test_patch_stores_the_key_encrypted_and_audits_only_the_change(
    client: AsyncClient, db_session: AsyncSession, superadmin: User, osmedeus: Engine
) -> None:
    response = await _configure(client, osmedeus, settings={"scan_preset": "deep"}, is_enabled=True)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["base_url"] == "http://engine.test:8002"
    assert body["settings"] == {"scan_preset": "deep"}
    assert body["is_enabled"] is True
    assert body["api_key_updated_at"] is not None
    assert API_KEY not in response.text
    await db_session.refresh(osmedeus)
    assert osmedeus.api_key_encrypted is not None
    assert decrypt(osmedeus.api_key_encrypted, context=service.API_KEY_CONTEXT) == API_KEY
    entry = await db_session.scalar(
        select(AuditLog).where(
            AuditLog.action == "engine_updated", AuditLog.resource_id == osmedeus.id
        )
    )
    assert entry is not None
    assert entry.detail is not None
    assert entry.detail["after"]["api_key"] == "changed"
    assert API_KEY not in json.dumps(entry.detail)


async def test_enable_needs_a_connection(
    client: AsyncClient, db_session: AsyncSession, superadmin: User, osmedeus: Engine
) -> None:
    osmedeus.base_url, osmedeus.api_key_encrypted = "", None
    await db_session.flush()
    response = await client.patch(
        f"{API}/engines/{osmedeus.id}", json={"is_enabled": True}, headers=HEADERS
    )
    assert response.status_code == 422
    assert response.json()["errors"] == [{"field": "is_enabled", "code": "engine_not_configured"}]


@pytest.mark.parametrize(
    ("body", "field"),
    [
        ({"settings": {"scan_preset": "turbo"}}, "settings.scan_preset"),
        ({"settings": {"database_url": "x"}}, "settings.database_url"),
        ({"llm_api_key": "sk-test"}, "llm_api_key"),
        ({"is_enabled": None}, "is_enabled"),
    ],
)
async def test_patch_refuses_what_the_engine_does_not_take(
    client: AsyncClient, superadmin: User, osmedeus: Engine, body: dict[str, object], field: str
) -> None:
    response = await client.patch(f"{API}/engines/{osmedeus.id}", json=body, headers=HEADERS)
    assert response.status_code == 422
    assert field in [error["field"] for error in response.json()["errors"]]


async def test_vigolium_takes_an_llm_key(
    client: AsyncClient, db_session: AsyncSession, superadmin: User
) -> None:
    vigolium = await _engine(db_session, "vigolium")
    response = await client.patch(
        f"{API}/engines/{vigolium.id}",
        json={"llm_api_key": "sk-test-llm", "settings": {"llm_provider": "openai"}},
        headers=HEADERS,
    )
    assert response.status_code == 200
    assert response.json()["has_llm_api_key"] is True
    assert "sk-test-llm" not in response.text


async def test_unknown_engine_is_404(client: AsyncClient, superadmin: User) -> None:
    missing = "00000000-0000-7000-8000-000000000000"
    assert (
        await client.patch(f"{API}/engines/{missing}", json={}, headers=HEADERS)
    ).status_code == 404


# ---------------------------------------------------------------- test, workflows


async def test_connection_test_records_the_version(
    client: AsyncClient,
    db_session: AsyncSession,
    superadmin: User,
    osmedeus: Engine,
    engine_api: None,
) -> None:
    await _configure(client, osmedeus)
    response = await client.post(f"{API}/engines/{osmedeus.id}/test", headers=HEADERS)
    assert response.status_code == 200
    assert response.json() == {"version": "v5.1.2"}
    await db_session.refresh(osmedeus)
    assert osmedeus.last_test_ok is True
    assert osmedeus.version == "v5.1.2"
    assert osmedeus.ok_since is not None


async def test_failed_test_answers_502_and_keeps_the_outcome(
    client: AsyncClient,
    db_session: AsyncSession,
    superadmin: User,
    osmedeus: Engine,
    engine_api: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    @asynccontextmanager
    async def same_session() -> AsyncIterator[AsyncSession]:
        # The test transaction holds the row lock; production uses its own connection.
        yield db_session

    monkeypatch.setattr(service, "independent_session", same_session)
    await _configure(client, osmedeus, api_key="wrong-key")
    response = await client.post(f"{API}/engines/{osmedeus.id}/test", headers=HEADERS)
    assert response.status_code == 502
    assert response.json()["code"] == "engine_unavailable"
    assert "wrong-key" not in response.text
    await db_session.refresh(osmedeus)
    assert osmedeus.last_test_ok is False
    assert osmedeus.ok_since is None


async def test_unconfigured_engine_cannot_be_reached(
    client: AsyncClient, db_session: AsyncSession, superadmin: User, osmedeus: Engine
) -> None:
    osmedeus.base_url, osmedeus.api_key_encrypted = "", None
    await db_session.flush()
    response = await client.post(f"{API}/engines/{osmedeus.id}/test", headers=HEADERS)
    assert response.status_code == 502
    assert response.json()["detail"] == "engine has no base_url or API key"


async def test_workflows_are_read_live_from_the_engine(
    client: AsyncClient, superadmin: User, osmedeus: Engine, engine_api: None
) -> None:
    await _configure(client, osmedeus)
    body = (await client.get(f"{API}/engines/{osmedeus.id}/workflows")).json()
    assert [item["name"] for item in body["items"]] == ["domain-lite", "general"]
    general = body["items"][1]
    assert general == {
        "name": "general",
        "kind": "flow",
        "step_count": 10,
        "description": None,
        "tags": ["recon"],
    }
    detail = (await client.get(f"{API}/engines/{osmedeus.id}/workflows/domain-lite")).json()
    assert detail["tags"] == ["recon", "domain", "lite"]
    assert [step["name"] for step in detail["steps"]] == ["enum-subdomain", "probe-dns"]
    missing = await client.get(f"{API}/engines/{osmedeus.id}/workflows/nothing")
    assert missing.status_code == 404


async def test_workflows_of_an_engine_without_them_is_404(
    client: AsyncClient, db_session: AsyncSession, superadmin: User, engine_api: None
) -> None:
    vigolium = await _engine(db_session, "vigolium")
    await _configure(client, vigolium)
    assert (await client.get(f"{API}/engines/{vigolium.id}/workflows")).status_code == 404


# ---------------------------------------------------------------- variables


async def test_variables_are_write_only(
    client: AsyncClient, db_session: AsyncSession, superadmin: User, osmedeus: Engine
) -> None:
    url = f"{API}/engines/{osmedeus.id}/variables"
    for key in ("slack_token", "github_token"):
        response = await client.put(f"{url}/{key}", json={"value": VARIABLE_VALUE}, headers=HEADERS)
        assert response.status_code == 204
    replaced = await client.put(f"{url}/slack_token", json={"value": "new"}, headers=HEADERS)
    assert replaced.status_code == 204
    page = await client.get(url, params={"limit": 1})
    body = page.json()
    assert body["total"] == 2
    assert [item["key"] for item in body["items"]] == ["github_token"]
    assert VARIABLE_VALUE not in page.text
    rest = (await client.get(url, params={"cursor": body["next_cursor"]})).json()
    assert [item["key"] for item in rest["items"]] == ["slack_token"]
    stored = await db_session.scalar(
        select(EngineVariable).where(EngineVariable.key == "slack_token")
    )
    assert stored is not None
    assert decrypt(stored.value_encrypted, context=service.VARIABLE_CONTEXT) == "new"
    assert (await client.delete(f"{url}/slack_token", headers=HEADERS)).status_code == 204
    assert (await client.delete(f"{url}/slack_token", headers=HEADERS)).status_code == 404


@pytest.mark.parametrize("key", ["1abc", "a-b", "a.b", "x" * 65])
async def test_variable_key_must_be_a_parameter_name(
    client: AsyncClient, superadmin: User, osmedeus: Engine, key: str
) -> None:
    response = await client.put(
        f"{API}/engines/{osmedeus.id}/variables/{key}", json={"value": "v"}, headers=HEADERS
    )
    assert response.status_code == 422


# ---------------------------------------------------------------- claim


async def test_claim_hands_the_engine_to_an_engine_job(
    client: AsyncClient, db_session: AsyncSession, superadmin: User, osmedeus: Engine
) -> None:
    await _configure(client, osmedeus, is_enabled=True, settings={"scan_preset": "quick"})
    await client.put(
        f"{API}/engines/{osmedeus.id}/variables/slack_token",
        json={"value": VARIABLE_VALUE},
        headers=HEADERS,
    )
    tool = await db_session.scalar(
        select(ToolModule).where(ToolModule.name == "osmedeus-domain-lite")
    )
    assert tool is not None
    program = await make_program(db_session)
    _, token = await make_worker(db_session, tool_modules=["osmedeus-domain-lite"])
    job = await make_job(db_session, program, tool, status="dispatched")
    response = await client.post(
        f"{API}/worker/jobs/{job.id}/claim",
        headers={**HEADERS, "Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    assert response.json()["engine"] == {
        "name": "osmedeus",
        "base_url": "http://engine.test:8002",
        "api_key": API_KEY,
        "variables": {"slack_token": VARIABLE_VALUE},
        "settings": {"scan_preset": "quick"},
    }


async def test_disabled_engine_is_not_handed_out(
    db_session: AsyncSession, osmedeus: Engine
) -> None:
    osmedeus.is_enabled = False
    await db_session.flush()
    assert await service.engine_spec_for(db_session, "osmedeus") is None
    assert await service.engine_spec_for(db_session, "unknown") is None


# ---------------------------------------------------------------- health for S15


async def test_health_check_keeps_ok_since_across_ok_results(
    client: AsyncClient,
    db_session: AsyncSession,
    superadmin: User,
    osmedeus: Engine,
    engine_api: None,
) -> None:
    assert (await service.health_check(db_session, "osmedeus")).status == "down"
    await _configure(client, osmedeus)
    assert (await service.health_check(db_session, "osmedeus")).message == "Engine is disabled."
    await _configure(client, osmedeus, is_enabled=True)

    first = await service.health_check(db_session, "osmedeus")

    assert first.status == "ok"
    assert first.version == "v5.1.2"
    assert first.latency_ms is not None
    since = osmedeus.ok_since
    assert since is not None
    await service.health_check(db_session, "osmedeus")
    assert osmedeus.ok_since == since


async def test_health_check_of_a_refusing_engine_clears_ok_since(
    client: AsyncClient,
    db_session: AsyncSession,
    superadmin: User,
    osmedeus: Engine,
    engine_api: None,
) -> None:
    await _configure(client, osmedeus, api_key="wrong-key", is_enabled=True)
    osmedeus.ok_since = osmedeus.updated_at
    await db_session.flush()

    result = await service.health_check(db_session, "osmedeus")

    assert result.status == "down"
    assert result.message == "engine refused the API key"
    assert osmedeus.ok_since is None
    assert (await service.health_check(db_session, "nonexistent")).status == "down"


# ---------------------------------------------------------------- Vigolium native modules, checks

VIG_KEY = "vgl-test-key"
LLM_KEY = "sk-test-llm-value"


class FakeVigolium:
    """Answers like the Vigolium REST docs for the calls the adapter makes."""

    def __init__(self) -> None:
        self.config: dict[str, str] = {
            "dynamic-assessment.enabled_modules.active_modules": "all",
            "dynamic-assessment.enabled_modules.passive_modules": "[header-audit tls-weak]",
        }
        self.posted: list[dict[str, str]] = []
        self.config_errors: list[str] = []
        self.diagnostics: dict[str, object] = {
            "status": "degraded",
            "timestamp": "2026-11-13T03:40:08+08:00",
            "database": {"status": "ok", "message": "driver=sqlite"},
            "agent": {"status": "ok", "name": "olium", "provider": "openai-compatible"},
            "browser": {"status": "warning", "message": "disabled in config"},
            "tools": {"chromium": {"status": "error", "path": "/usr/bin/chromium"}},
        }

    def handler(self, request: httpx.Request) -> httpx.Response:
        if request.headers.get("authorization") != f"Bearer {VIG_KEY}":
            return httpx.Response(401, json={"error": "unauthorized"})
        path = request.url.path
        if path == "/api/modules":
            modules = [
                {"id": "xss-light", "type": "active", "short_description": "Reflected XSS"},
                {"id": "sqli-error-based", "type": "active"},
                {"id": "header-audit", "type": "passive"},
                {"id": "tls-weak", "type": "passive"},
                {"id": "cookie-flags", "type": "passive"},
                {"id": "ext-odd", "type": "extension"},
            ]
            return httpx.Response(200, json={"modules": modules, "total": len(modules)})
        if path == "/api/config" and request.method == "GET":
            entries = [{"key": key, "value": value} for key, value in self.config.items()]
            return httpx.Response(200, json={"entries": entries, "total": len(entries)})
        if path == "/api/config" and request.method == "POST":
            body = json.loads(request.content)
            self.posted.append(body)
            self.config.update(body)
            return httpx.Response(200, json={"message": "ok", "errors": self.config_errors})
        if path == "/api/diagnostics":
            return httpx.Response(200, json=self.diagnostics)
        return httpx.Response(404, json={"error": "not found"})


@pytest_asyncio.fixture
async def vigolium(db_session: AsyncSession) -> Engine:
    return await _engine(db_session, "vigolium")


@pytest.fixture
def vig_api(monkeypatch: pytest.MonkeyPatch) -> FakeVigolium:
    fake = FakeVigolium()
    monkeypatch.setattr(service, "_transport", httpx.MockTransport(fake.handler))
    return fake


async def _configure_vigolium(client: AsyncClient, engine: Engine, **body: object) -> None:
    payload = {"base_url": "http://engine.test:9002", "api_key": VIG_KEY, **body}
    response = await client.patch(f"{API}/engines/{engine.id}", json=payload, headers=HEADERS)
    assert response.status_code == 200


@pytest.mark.parametrize("role", [UserRole.ADMIN, UserRole.USER])
async def test_vigolium_routes_are_superadmin_only(
    client: AsyncClient, logged_in: Login, vigolium: Engine, role: UserRole
) -> None:
    await logged_in(role)
    base = f"{API}/engines/{vigolium.id}"
    assert (await client.get(f"{base}/modules")).status_code == 403
    patch = {"modules": [{"name": "xss-light", "is_enabled": False}]}
    assert (await client.patch(f"{base}/modules", json=patch, headers=HEADERS)).status_code == 403
    assert (await client.post(f"{base}/validate", headers=HEADERS)).status_code == 403
    assert (await client.post(f"{base}/verify-model", headers=HEADERS)).status_code == 403


async def test_native_modules_are_read_live(
    client: AsyncClient, superadmin: User, vigolium: Engine, vig_api: FakeVigolium
) -> None:
    await _configure_vigolium(client, vigolium)
    body = (await client.get(f"{API}/engines/{vigolium.id}/modules")).json()
    assert body["total"] == 5
    rows = {item["name"]: item for item in body["items"]}
    assert "ext-odd" not in rows
    assert rows["xss-light"] == {
        "name": "xss-light",
        "kind": "active",
        "is_enabled": True,
        "description": "Reflected XSS",
    }
    assert rows["header-audit"]["is_enabled"] is True
    assert rows["cookie-flags"]["is_enabled"] is False


async def test_switching_modules_writes_the_engine_config_and_audits(
    client: AsyncClient,
    db_session: AsyncSession,
    superadmin: User,
    vigolium: Engine,
    vig_api: FakeVigolium,
) -> None:
    await _configure_vigolium(client, vigolium)
    response = await client.patch(
        f"{API}/engines/{vigolium.id}/modules",
        json={
            "modules": [
                {"name": "xss-light", "is_enabled": False},
                {"name": "cookie-flags", "is_enabled": True},
            ]
        },
        headers=HEADERS,
    )
    assert response.status_code == 200
    assert vig_api.posted == [
        {
            "dynamic-assessment.enabled_modules.active_modules": "sqli-error-based",
            "dynamic-assessment.enabled_modules.passive_modules": "all",
        }
    ]
    rows = {item["name"]: item["is_enabled"] for item in response.json()["items"]}
    assert rows["xss-light"] is False
    assert rows["cookie-flags"] is True
    entry = await db_session.scalar(
        select(AuditLog).where(AuditLog.action == "engine_modules_updated")
    )
    assert entry is not None
    assert entry.detail == {"modules": {"xss-light": False, "cookie-flags": True}}


@pytest.mark.parametrize(
    ("changes", "code"),
    [
        ([{"name": "nothing-here", "is_enabled": True}], "not_found"),
        (
            [
                {"name": "xss-light", "is_enabled": False},
                {"name": "sqli-error-based", "is_enabled": False},
            ],
            "module_required",
        ),
    ],
)
async def test_module_switch_refuses_what_the_engine_cannot_take(
    client: AsyncClient,
    superadmin: User,
    vigolium: Engine,
    vig_api: FakeVigolium,
    changes: list[dict[str, object]],
    code: str,
) -> None:
    await _configure_vigolium(client, vigolium)
    response = await client.patch(
        f"{API}/engines/{vigolium.id}/modules", json={"modules": changes}, headers=HEADERS
    )
    assert response.status_code == 422
    assert [error["code"] for error in response.json()["errors"]] == [code]
    assert vig_api.posted == []


async def test_refused_module_config_is_502(
    client: AsyncClient, superadmin: User, vigolium: Engine, vig_api: FakeVigolium
) -> None:
    await _configure_vigolium(client, vigolium)
    vig_api.config_errors = ["bad key"]
    response = await client.patch(
        f"{API}/engines/{vigolium.id}/modules",
        json={"modules": [{"name": "xss-light", "is_enabled": False}]},
        headers=HEADERS,
    )
    assert response.status_code == 502
    assert response.json()["code"] == "engine_unavailable"


async def test_osmedeus_has_no_native_modules_or_checks(
    client: AsyncClient, superadmin: User, osmedeus: Engine, engine_api: None
) -> None:
    await _configure(client, osmedeus)
    base = f"{API}/engines/{osmedeus.id}"
    assert (await client.get(f"{base}/modules")).status_code == 404
    patch = {"modules": [{"name": "x", "is_enabled": True}]}
    assert (await client.patch(f"{base}/modules", json=patch, headers=HEADERS)).status_code == 404
    assert (await client.post(f"{base}/validate", headers=HEADERS)).status_code == 404
    assert (await client.post(f"{base}/verify-model", headers=HEADERS)).status_code == 404


async def test_validate_turns_diagnostics_into_issues(
    client: AsyncClient, superadmin: User, vigolium: Engine, vig_api: FakeVigolium
) -> None:
    await _configure_vigolium(client, vigolium)
    body = (await client.post(f"{API}/engines/{vigolium.id}/validate", headers=HEADERS)).json()
    assert body == {
        "ok": True,
        "issues": [
            {"level": "advisory", "message": "browser: disabled in config"},
            {"level": "advisory", "message": "tools.chromium: error"},
        ],
    }
    vig_api.diagnostics["database"] = {"status": "error", "message": "ping timeout"}
    body = (await client.post(f"{API}/engines/{vigolium.id}/validate", headers=HEADERS)).json()
    assert body["ok"] is False
    assert {"level": "critical", "message": "database: ping timeout"} in body["issues"]


async def test_validate_with_an_odd_body_is_502(
    client: AsyncClient, superadmin: User, vigolium: Engine, vig_api: FakeVigolium
) -> None:
    await _configure_vigolium(client, vigolium)
    vig_api.diagnostics = {"database": {"status": ["not", "text"]}}
    response = await client.post(f"{API}/engines/{vigolium.id}/validate", headers=HEADERS)
    assert response.status_code == 502


async def test_verify_model_hands_the_llm_settings_to_the_engine(
    client: AsyncClient,
    db_session: AsyncSession,
    superadmin: User,
    vigolium: Engine,
    vig_api: FakeVigolium,
) -> None:
    await _configure_vigolium(
        client,
        vigolium,
        llm_api_key=LLM_KEY,
        settings={
            "llm_provider": "openai-compatible",
            "llm_model": "gemma4:latest",
            "llm_base_url": "http://llm.test:11434/v1",
        },
    )
    response = await client.post(f"{API}/engines/{vigolium.id}/verify-model", headers=HEADERS)
    assert response.status_code == 200
    assert response.json() == {"ok": True, "issues": []}
    assert LLM_KEY not in response.text
    assert vig_api.posted == [
        {
            "agent.olium.provider": "openai-compatible",
            "agent.olium.model": "gemma4:latest",
            "agent.olium.custom_provider.model_id": "gemma4:latest",
            "agent.olium.custom_provider.base_url": "http://llm.test:11434/v1",
            "agent.olium.llm_api_key": LLM_KEY,
            "agent.olium.custom_provider.api_key": LLM_KEY,
        }
    ]
    entry = await db_session.scalar(
        select(AuditLog).where(AuditLog.action == "engine_model_verified")
    )
    assert entry is not None and entry.detail == {"ok": True}
    assert LLM_KEY not in json.dumps(entry.detail)


async def test_verify_model_reports_the_agent_check(
    client: AsyncClient, superadmin: User, vigolium: Engine, vig_api: FakeVigolium
) -> None:
    await _configure_vigolium(client, vigolium, settings={"llm_provider": "openai-api-key"})
    vig_api.diagnostics["agent"] = {"status": "error", "message": "no credentials"}
    body = (await client.post(f"{API}/engines/{vigolium.id}/verify-model", headers=HEADERS)).json()
    assert body == {
        "ok": False,
        "issues": [{"level": "critical", "message": "agent: no credentials"}],
    }
    vig_api.config_errors = ["agent.olium.provider: rejected"]
    body = (await client.post(f"{API}/engines/{vigolium.id}/verify-model", headers=HEADERS)).json()
    assert body["issues"] == [{"level": "critical", "message": "engine refused the LLM settings"}]


async def test_verify_model_without_a_provider_calls_nothing(
    client: AsyncClient, superadmin: User, vigolium: Engine, vig_api: FakeVigolium
) -> None:
    await _configure_vigolium(client, vigolium)
    body = (await client.post(f"{API}/engines/{vigolium.id}/verify-model", headers=HEADERS)).json()
    assert body["ok"] is False
    assert vig_api.posted == []


async def test_vigolium_down_is_502(
    client: AsyncClient, superadmin: User, vigolium: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    def down(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused", request=request)

    monkeypatch.setattr(service, "_transport", httpx.MockTransport(down))
    await _configure_vigolium(client, vigolium)
    response = await client.get(f"{API}/engines/{vigolium.id}/modules")
    assert response.status_code == 502
