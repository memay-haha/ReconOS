"""S02 summary, global search, S15 health, diagnostics and the application log.

docs/api/architecture.md (aggregate responses), docs/security/authorization.md.
"""

import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
import pytest_asyncio
import sqlalchemy as sa
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.asset.models import Domain, Ip, Service, Url
from app.core.audit import AuditLog
from app.core.db import get_log_engine
from app.core.identity import User, UserRole
from app.core.logging import write_app_log_rows
from app.core.tasks import RUN_DIAGNOSTICS_TASK, pending_tasks
from app.dashboard import health
from app.dashboard import service as dashboard_service
from app.dashboard.models import DiagnosticRun
from app.program.models import Program
from tests.factories import (
    assign,
    make_findings,
    make_job,
    make_program,
    make_worker,
    nuclei,
    nuclei_line,
)

SAME_ORIGIN = {"origin": "https://reconos.example.com", "sec-fetch-site": "same-origin"}

Login = Callable[..., Awaitable[User]]


@pytest.fixture(autouse=True)
def _private_cache(monkeypatch: pytest.MonkeyPatch) -> None:
    # A cache entry of another test would answer instead of the rows of this one.
    monkeypatch.setattr(
        dashboard_service, "SUMMARY_CACHE_PREFIX", f"reconos:test:summary:{uuid.uuid4()}"
    )


async def _seed(session: AsyncSession) -> tuple[uuid.UUID, uuid.UUID]:
    """Two programs: `mine` with assets, findings, jobs; `other` with one domain."""
    mine = await make_program(session, name="alpha")
    other = await make_program(session, name="beta")
    old = datetime.now(UTC) - timedelta(days=20)
    session.add_all(
        [
            Domain(program_id=mine.id, name="a.example.com", apex="example.com"),
            Domain(
                program_id=mine.id,
                name="b.example.com",
                apex="example.com",
                # a.example.com is rewritten by the finding upsert, b is not.
                in_scope=True,
                first_seen_at=old,
                last_seen_at=old,
            ),
            Domain(
                program_id=mine.id,
                name="gone.example.com",
                apex="example.com",
                deleted_at=datetime.now(UTC),
            ),
            Domain(program_id=other.id, name="c.example.org", apex="example.org"),
        ]
    )
    ip = Ip(program_id=mine.id, address="192.0.2.10")
    session.add(ip)
    await session.flush()
    session.add_all(
        [
            Service(program_id=mine.id, ip_id=ip.id, port=443, name="https"),
            Service(program_id=mine.id, ip_id=ip.id, port=22, name="ssh"),
            Service(
                program_id=mine.id,
                ip_id=ip.id,
                port=8443,
                name="https",
                closed_at=datetime.now(UTC),
            ),
            Url(
                program_id=mine.id,
                url="https://a.example.com/",
                url_hash=b"\x01" * 32,
                scheme="https",
                host="a.example.com",
                port=443,
                path="/",
            ),
        ]
    )
    tool = await nuclei(session)
    await make_job(session, mine, tool, status="queued")
    await make_job(
        session,
        mine,
        tool,
        status="completed",
        finished_at=datetime.now(UTC) - timedelta(minutes=5),
    )
    await make_job(session, other, tool, status="failed")
    await make_findings(
        session,
        mine,
        [
            nuclei_line("one", "https://a.example.com/x", severity="critical"),
            nuclei_line("two", "https://a.example.com/y", severity="high"),
        ],
    )
    await make_worker(session)
    await session.flush()
    return mine.id, other.id


async def test_summary_of_a_superadmin_covers_every_program(
    client: AsyncClient, db_session: AsyncSession, logged_in: Login
) -> None:
    await logged_in(UserRole.SUPERADMIN)
    mine, _ = await _seed(db_session)

    response = await client.get("/api/v1/dashboard/summary")

    assert response.status_code == 200
    body = response.json()
    assert body["programs"] >= 2
    assert body["assets"]["domain"] >= 3
    assert body["assets_closed"] == {"service": 1}
    assert len(body["new_assets_daily"]) == 14
    assert body["new_assets_daily"][-1]["date"] == datetime.now(UTC).date().isoformat()
    assert body["top_programs"][0] == {"id": str(mine), "name": "alpha", "domain_count": 2}
    assert body["top_ports"][0]["port"] in {22, 443, 8443}
    assert body["jobs_by_status"]["failed"] >= 1
    assert set(body["jobs_by_status"]) == {
        "pending_approval",
        "queued",
        "dispatched",
        "running",
        "completed",
        "failed",
        "cancelled",
    }
    assert body["workers_online"] >= 1
    assert body["findings_triage_new"] >= 2


async def test_summary_of_a_user_covers_assigned_programs_only(
    client: AsyncClient, db_session: AsyncSession, logged_in: Login
) -> None:
    user = await logged_in(UserRole.USER)
    mine, _ = await _seed(db_session)
    program = await db_session.get(Program, mine)
    assert program is not None
    await assign(db_session, program, user.id)

    body = (await client.get("/api/v1/dashboard/summary", params={"window": "7d"})).json()

    assert body["programs"] == 1
    assert body["programs_active"] == 1
    # The completed job of the last 24 hours syncs the one active program.
    assert body["active_sync_ratio"] == 1.0
    # Deleted domains are not counted; the old one is outside the window.
    # The two findings sit on two more URLs of a.example.com.
    assert body["assets"] == {"domain": 2, "ip": 1, "url": 3, "service": 3}
    assert body["assets_new"] == {"domain": 1, "ip": 1, "url": 3, "service": 3}
    assert body["scope_coverage"] == 0.5
    assert body["findings_by_severity"] == {
        "critical": 1,
        "high": 1,
        "medium": 0,
        "low": 0,
        "info": 0,
    }
    assert body["findings_triage_new"] == 2
    assert body["jobs_by_status"]["queued"] == 1
    assert body["jobs_by_status"]["failed"] == 0
    assert body["jobs_per_minute"] == pytest.approx(1 / 60)
    assert body["top_programs"] == [{"id": str(mine), "name": "alpha", "domain_count": 2}]
    assert body["top_service_name"] == {"name": "https", "ratio": pytest.approx(2 / 3)}
    assert body["top_ports"][0] == {"port": 22, "transport": "tcp", "name": "ssh", "count": 1}


async def test_summary_without_programs(client: AsyncClient, logged_in: Login) -> None:
    await logged_in(UserRole.USER)
    body = (await client.get("/api/v1/dashboard/summary")).json()
    assert body["programs"] == 0
    assert body["active_sync_ratio"] is None
    assert body["scope_coverage"] is None
    assert body["top_service_name"] is None
    assert body["top_programs"] == []


async def test_summary_is_cached_for_thirty_seconds(
    client: AsyncClient, db_session: AsyncSession, logged_in: Login
) -> None:
    await logged_in(UserRole.ADMIN)
    first = (await client.get("/api/v1/dashboard/summary")).json()
    await make_program(db_session)
    again = (await client.get("/api/v1/dashboard/summary")).json()
    # Served from Redis: the program created since is not counted yet.
    assert again["programs"] == first["programs"]
    other_window = (await client.get("/api/v1/dashboard/summary", params={"window": "30d"})).json()
    assert other_window["programs"] == first["programs"] + 1


async def test_summary_refuses_an_unknown_window(client: AsyncClient, logged_in: Login) -> None:
    await logged_in(UserRole.ADMIN)
    assert (
        await client.get("/api/v1/dashboard/summary", params={"window": "1y"})
    ).status_code == 422


# ---------------------------------------------------------------- search


async def test_search_finds_each_kind_within_assigned_programs(
    client: AsyncClient, db_session: AsyncSession, logged_in: Login
) -> None:
    user = await logged_in(UserRole.USER)
    mine, _ = await _seed(db_session)
    program = await db_session.get(Program, mine)
    assert program is not None
    await assign(db_session, program, user.id)

    body = (await client.get("/api/v1/search", params={"q": "example"})).json()
    kinds = {(item["type"], item["label"]) for item in body["items"]}
    assert ("domain", "a.example.com") in kinds
    assert ("url", "https://a.example.com/") in kinds
    # The other program's domain stays hidden, the deleted one too.
    assert ("domain", "c.example.org") not in kinds
    assert ("domain", "gone.example.com") not in kinds

    tool = (await client.get("/api/v1/search", params={"q": "nucl"})).json()
    assert {"type": "tool_module", "label": "nuclei"} in [
        {"type": i["type"], "label": i["label"]} for i in tool["items"]
    ]
    assert all(i["program_id"] is None for i in tool["items"] if i["type"] == "tool_module")
    capped = (await client.get("/api/v1/search", params={"q": "a", "limit": 2})).json()
    assert len(capped["items"]) <= 2
    assert (await client.get("/api/v1/search", params={"q": ""})).status_code == 422


# ---------------------------------------------------------------- system health


def _fake(status: health.Status) -> health.Check:
    async def check(_: AsyncSession, name: str) -> health.ComponentHealth:
        return health.ComponentHealth(
            name,
            status,
            5,
            datetime.now(UTC),
            version="1.0",
            detail=None,
            message=None,
        )

    return check


@pytest.fixture
def fake_checks(monkeypatch: pytest.MonkeyPatch) -> None:
    """Every component answers `ok` except Redis, which is `down`."""
    for name in health.COMPONENTS:
        monkeypatch.setitem(health.CHECKS, name, _fake("down" if name == "redis" else "ok"))


@pytest.mark.parametrize("role", [UserRole.SUPERADMIN, UserRole.ADMIN])
async def test_health_lists_every_component(
    client: AsyncClient,
    db_session: AsyncSession,
    logged_in: Login,
    fake_checks: None,
    role: UserRole,
) -> None:
    await logged_in(role)
    await make_worker(db_session, tool_modules=["nuclei"])
    response = await client.get("/api/v1/system/health")
    assert response.status_code == 200
    body = response.json()
    assert [c["name"] for c in body["components"]] == list(health.COMPONENTS)
    assert {c["name"]: c["status"] for c in body["components"]}["redis"] == "down"
    assert body["workers_online"] >= 1
    assert body["tools_installed"]["installed"] >= 1
    assert body["tools_installed"]["total"] >= body["tools_installed"]["installed"]
    one = (await client.get("/api/v1/system/health", params={"component": "redis"})).json()
    assert [c["name"] for c in one["components"]] == ["redis"]


async def test_health_is_closed_to_users(client: AsyncClient, logged_in: Login) -> None:
    await logged_in(UserRole.USER)
    assert (await client.get("/api/v1/system/health")).status_code == 403
    assert (await client.get("/api/v1/system/diagnostics/latest")).status_code == 403
    assert (await client.post("/api/v1/system/diagnostics", headers=SAME_ORIGIN)).status_code == 403


async def test_real_checks_report_the_stores_of_the_test_stack(db_session: AsyncSession) -> None:
    """PostgreSQL and Redis of the Compose stack answer, with their version."""
    postgres, redis_state, api = await health.check_all(db_session, ("postgres", "redis", "api"))
    assert postgres.status in {"ok", "degraded"}
    assert postgres.version is not None and postgres.version.startswith("18")
    assert postgres.detail is not None and "connections" in postgres.detail
    assert redis_state.status in {"ok", "degraded"}
    assert redis_state.version is not None and redis_state.version.startswith("8")
    assert api.status == "ok"


async def test_a_disabled_engine_is_down_without_a_call(db_session: AsyncSession) -> None:
    (osmedeus,) = await health.check_all(db_session, ("osmedeus",))
    assert osmedeus.status == "down"
    assert osmedeus.message == "Engine is disabled."


async def test_beat_is_down_without_a_heartbeat_and_up_after_one(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.background import system_tasks

    monkeypatch.setattr(health, "BEAT_HEARTBEAT_KEY", f"reconos:test:beat:{uuid.uuid4()}")
    (before,) = await health.check_all(db_session, ("beat",))
    assert before.status == "down"
    await system_tasks.stamp_beat_heartbeat()
    (after,) = await health.check_all(db_session, ("beat",))
    assert after.status == "ok"


async def test_a_check_that_overruns_reports_down(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def slow(_: AsyncSession, name: str) -> health.ComponentHealth:
        raise TimeoutError

    monkeypatch.setitem(health.CHECKS, "minio", slow)
    (result,) = await health.check_all(db_session, ("minio",))
    assert result.status == "down"
    assert result.message == "Check timed out."


# ---------------------------------------------------------------- diagnostics


async def test_diagnostics_run_in_the_background_and_record_each_check(
    client: AsyncClient, db_session: AsyncSession, logged_in: Login, fake_checks: None
) -> None:
    actor = await logged_in(UserRole.ADMIN)
    assert (await client.get("/api/v1/system/diagnostics/latest")).status_code == 404

    created = await client.post("/api/v1/system/diagnostics", headers=SAME_ORIGIN)
    assert created.status_code == 200
    run_id = uuid.UUID(created.json()["id"])
    assert created.json()["status"] == "running"
    assert [t.name for t in pending_tasks(db_session)] == [RUN_DIAGNOSTICS_TASK]
    entry = await db_session.scalar(
        select(AuditLog).where(AuditLog.action == "diagnostic_run_created")
    )
    assert entry is not None and entry.user_id == actor.id

    await dashboard_service.run_diagnostic(db_session, run_id)

    body = (await client.get(f"/api/v1/system/diagnostics/{run_id}")).json()
    assert body["status"] == "failed"
    assert body["exit_code"] == 1
    lines = body["output"].splitlines()
    assert lines[0].startswith("[*] ReconOS diagnostics")
    assert "[FAIL] redis: down version 1.0 5 ms" in lines
    assert all(line.split(" ", 1)[0] in {"[OK]", "[WARN]", "[FAIL]", "[*]"} for line in lines)
    latest = (await client.get("/api/v1/system/diagnostics/latest")).json()
    assert latest["id"] == str(run_id)
    # Running it again changes nothing: the run is finished.
    await dashboard_service.run_diagnostic(db_session, run_id)
    row = await db_session.get(DiagnosticRun, run_id)
    assert row is not None and row.status == "failed"
    assert (await client.get(f"/api/v1/system/diagnostics/{uuid.uuid4()}")).status_code == 404


async def test_diagnostics_pass_when_every_component_is_up(
    db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    for name in health.COMPONENTS:
        monkeypatch.setitem(health.CHECKS, name, _fake("ok"))
    row = DiagnosticRun(status="running")
    db_session.add(row)
    await db_session.flush()
    await dashboard_service.run_diagnostic(db_session, row.id)
    assert row.status == "passed" and row.exit_code == 0


# ---------------------------------------------------------------- application log


@pytest_asyncio.fixture
async def log_rows(db_session: AsyncSession) -> AsyncIterator[dict[str, Any]]:
    """Rows in reconos_log_test, which no per-test transaction covers: removed after."""
    mine = await make_program(db_session)
    other = await make_program(db_session)
    job_id = uuid.uuid4()
    now = datetime.now(UTC)
    marker = f"test_{uuid.uuid4().hex}"
    await write_app_log_rows(
        [
            {
                "logged_at": now - timedelta(minutes=3),
                "level": "info",
                "service": "api",
                "event": marker,
                "request_id": None,
                "job_id": None,
                "program_id": None,
                "worker_id": None,
                "context": {"path": "/api/v1/jobs"},
            },
            {
                "logged_at": now - timedelta(minutes=2),
                "level": "error",
                "service": "worker",
                "event": marker,
                "request_id": None,
                "job_id": job_id,
                "program_id": mine.id,
                "worker_id": None,
                "context": {"engine": "osmedeus"},
            },
            {
                "logged_at": now - timedelta(minutes=1),
                "level": "warning",
                "service": "worker",
                "event": marker,
                "request_id": None,
                "job_id": uuid.uuid4(),
                "program_id": other.id,
                "worker_id": None,
                "context": {},
            },
        ]
    )
    yield {"mine": mine.id, "other": other.id, "job": job_id, "marker": marker}
    async with get_log_engine().begin() as connection:
        await connection.execute(sa.text("DELETE FROM app_log WHERE event = :e"), {"e": marker})


async def test_logs_filter_and_page_for_an_admin(
    client: AsyncClient, logged_in: Login, log_rows: dict[str, Any]
) -> None:
    await logged_in(UserRole.ADMIN)
    event = log_rows["marker"]
    body = (await client.get("/api/v1/logs", params={"event": event})).json()
    assert [row["level"] for row in body["items"]] == ["warning", "error", "info"]
    assert body["total"] == 3
    errors = (await client.get("/api/v1/logs", params={"event": event, "level": "error"})).json()
    assert [row["job_id"] for row in errors["items"]] == [str(log_rows["job"])]
    engine = (
        await client.get("/api/v1/logs", params={"event": event, "engine": "osmedeus"})
    ).json()
    assert engine["total"] == 1
    page = (await client.get("/api/v1/logs", params={"event": event, "limit": 2})).json()
    rest = (
        await client.get(
            "/api/v1/logs", params={"event": event, "limit": 2, "cursor": page["next_cursor"]}
        )
    ).json()
    assert len(page["items"]) == 2 and len(rest["items"]) == 1
    oldest = (await client.get("/api/v1/logs", params={"event": event, "sort": "logged_at"})).json()
    assert oldest["items"][0]["level"] == "info"
    naive = await client.get("/api/v1/logs", params={"logged_at_from": "2026-11-01T00:00:00"})
    assert naive.status_code == 422


async def test_a_user_reads_only_job_logs_of_assigned_programs(
    client: AsyncClient,
    db_session: AsyncSession,
    logged_in: Login,
    log_rows: dict[str, Any],
) -> None:
    user = await logged_in(UserRole.USER)
    program = await db_session.get(Program, log_rows["mine"])
    assert program is not None
    await assign(db_session, program, user.id)
    event = log_rows["marker"]
    body = (await client.get("/api/v1/logs", params={"event": event})).json()
    assert [row["job_id"] for row in body["items"]] == [str(log_rows["job"])]
    hidden = await client.get("/api/v1/logs", params={"program_id": str(log_rows["other"])})
    assert hidden.status_code == 404


async def test_only_superadmin_deletes_logs(
    client: AsyncClient, db_session: AsyncSession, logged_in: Login
) -> None:
    await logged_in(UserRole.ADMIN)
    response = await client.delete(
        "/api/v1/logs", params={"before": "2000-01-01"}, headers=SAME_ORIGIN
    )
    assert response.status_code == 403


async def test_superadmin_deletes_logs_before_a_day(
    client: AsyncClient, db_session: AsyncSession, logged_in: Login
) -> None:
    actor = await logged_in(UserRole.SUPERADMIN)
    tomorrow = (datetime.now(UTC).date() + timedelta(days=1)).isoformat()
    future = await client.delete("/api/v1/logs", params={"before": tomorrow}, headers=SAME_ORIGIN)
    assert future.status_code == 422

    marker = f"test_{uuid.uuid4().hex}"
    ancient = datetime(2001, 1, 2, tzinfo=UTC)
    await write_app_log_rows(
        [
            {
                "logged_at": ancient,
                "level": "info",
                "service": "api",
                "event": marker,
                "request_id": None,
                "job_id": None,
                "program_id": None,
                "worker_id": None,
                "context": {},
            }
        ]
    )
    response = await client.delete(
        "/api/v1/logs", params={"before": date(2001, 1, 3).isoformat()}, headers=SAME_ORIGIN
    )
    assert response.status_code == 204
    async with get_log_engine().connect() as connection:
        left = await connection.scalar(
            sa.text("SELECT count(*) FROM app_log WHERE event = :e"), {"e": marker}
        )
    assert left == 0
    entry = await db_session.scalar(select(AuditLog).where(AuditLog.action == "app_log_deleted"))
    assert entry is not None and entry.user_id == actor.id
    assert entry.detail is not None and entry.detail["before"] == "2001-01-03"
