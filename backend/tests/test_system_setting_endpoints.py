"""Operational thresholds on S15: docs/ops/configuration.md, docs/security/authorization.md."""

from collections.abc import Awaitable, Callable

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import AuditLog
from app.core.identity import User, UserRole
from app.core.system_setting import SETTING_SPECS, get_int_setting

SAME_ORIGIN = {"origin": "https://reconos.example.com", "sec-fetch-site": "same-origin"}

Login = Callable[..., Awaitable[User]]


def test_every_documented_key_has_its_default() -> None:
    # The table of docs/ops/configuration.md, section Ngưỡng vận hành.
    assert {key: spec.default for key, spec in SETTING_SPECS.items()} == {
        "session_idle_timeout_minutes": 30,
        "session_absolute_timeout_hours": 12,
        "login_max_failures_per_account": 5,
        "login_max_failures_per_ip": 20,
        "login_failure_window_minutes": 15,
        "dispatcher_poll_seconds": 30,
        "job_heartbeat_seconds": 30,
        "job_heartbeat_timeout_minutes": 5,
        "upload_max_bytes": 10 * 1024**3,
        "parser_batch_size": 1000,
        "log_retention_days": 30,
        "finding_sla_days": 30,
        "queue_capacity": 1000,
        "user_idle_after_minutes": 15,
        "cert_expiring_days": 14,
    }
    assert {key for key, spec in SETTING_SPECS.items() if spec.public} == {
        "log_retention_days",
        "finding_sla_days",
        "queue_capacity",
        "cert_expiring_days",
    }
    for spec in SETTING_SPECS.values():
        assert spec.minimum <= spec.default <= spec.maximum


async def test_superadmin_lists_every_key_with_bounds(
    client: AsyncClient, logged_in: Login
) -> None:
    await logged_in(UserRole.SUPERADMIN)
    body = (await client.get("/api/v1/system-settings")).json()
    assert body["total"] == len(SETTING_SPECS)
    keys = [item["key"] for item in body["items"]]
    assert keys == sorted(SETTING_SPECS)
    first = body["items"][0]
    assert first == {
        "key": "cert_expiring_days",
        "value": 14,
        "default": 14,
        "minimum": 1,
        "maximum": 365,
        "is_public": True,
        "updated_by": None,
        "updated_at": None,
    }
    page = (await client.get("/api/v1/system-settings", params={"limit": 2})).json()
    rest = (
        await client.get(
            "/api/v1/system-settings", params={"limit": 2, "cursor": page["next_cursor"]}
        )
    ).json()
    assert [i["key"] for i in page["items"] + rest["items"]] == keys[:4]
    reverse = (await client.get("/api/v1/system-settings", params={"sort": "-key"})).json()
    assert [i["key"] for i in reverse["items"]] == keys[::-1]


@pytest.mark.parametrize("role", [UserRole.ADMIN, UserRole.USER])
async def test_only_superadmin_lists_and_edits(
    client: AsyncClient, logged_in: Login, role: UserRole
) -> None:
    await logged_in(role)
    assert (await client.get("/api/v1/system-settings")).status_code == 403
    response = await client.patch(
        "/api/v1/system-settings/queue_capacity", json={"value": 50}, headers=SAME_ORIGIN
    )
    assert response.status_code == 403


@pytest.mark.parametrize("role", [UserRole.ADMIN, UserRole.USER])
async def test_other_roles_read_public_keys_only(
    client: AsyncClient, logged_in: Login, role: UserRole
) -> None:
    await logged_in(role)
    public = await client.get("/api/v1/system-settings/finding_sla_days")
    assert public.status_code == 200
    assert public.json()["value"] == 30
    assert (await client.get("/api/v1/system-settings/upload_max_bytes")).status_code == 403
    assert (await client.get("/api/v1/system-settings/no_such_key")).status_code == 404


async def test_superadmin_edits_a_threshold_with_audit(
    client: AsyncClient, db_session: AsyncSession, logged_in: Login
) -> None:
    actor = await logged_in(UserRole.SUPERADMIN)
    response = await client.patch(
        "/api/v1/system-settings/queue_capacity", json={"value": 250}, headers=SAME_ORIGIN
    )
    assert response.status_code == 200
    body = response.json()
    assert body["value"] == 250
    assert body["updated_by"] == str(actor.id)
    assert body["updated_at"] is not None
    # This process reads the new value at once; others within 60 seconds.
    assert await get_int_setting(db_session, "queue_capacity") == 250
    entry = await db_session.scalar(
        select(AuditLog).where(AuditLog.action == "system_setting_updated")
    )
    assert entry is not None
    assert entry.user_id == actor.id
    assert entry.detail == {"key": "queue_capacity", "old": 1000, "new": 250}


@pytest.mark.parametrize(
    ("key", "body", "code"),
    [
        ("queue_capacity", {"value": 0}, "out_of_range"),
        ("queue_capacity", {"value": 2_000_000}, "out_of_range"),
        ("finding_sla_days", {"value": "30"}, "int_type"),
        ("finding_sla_days", {"value": True}, "int_type"),
        ("finding_sla_days", {"value": 3.5}, "int_type"),
        # 5 minutes cannot cover two heartbeats of 600 seconds.
        ("job_heartbeat_seconds", {"value": 600}, "setting_conflict"),
        # 13 hours of idle time beyond a 12 hour session.
        ("session_idle_timeout_minutes", {"value": 780}, "setting_conflict"),
    ],
)
async def test_invalid_values_are_refused(
    client: AsyncClient, logged_in: Login, key: str, body: dict[str, object], code: str
) -> None:
    await logged_in(UserRole.SUPERADMIN)
    response = await client.patch(f"/api/v1/system-settings/{key}", json=body, headers=SAME_ORIGIN)
    assert response.status_code == 422
    assert code in {error["code"] for error in response.json()["errors"]}


async def test_unknown_key_and_extra_fields(client: AsyncClient, logged_in: Login) -> None:
    await logged_in(UserRole.SUPERADMIN)
    missing = await client.patch(
        "/api/v1/system-settings/no_such_key", json={"value": 1}, headers=SAME_ORIGIN
    )
    assert missing.status_code == 404
    extra = await client.patch(
        "/api/v1/system-settings/queue_capacity",
        json={"value": 10, "key": "x"},
        headers=SAME_ORIGIN,
    )
    assert extra.status_code == 422
