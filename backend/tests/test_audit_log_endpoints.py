import uuid
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit_log.models import AuditLog
from app.core.identity import User, UserRole, UserSession
from app.core.pagination import encode_cursor
from app.core.security import hash_session_id, new_session_id

HEADERS = {"origin": "https://reconos.example.com", "sec-fetch-site": "same-origin"}
LoggedIn = Callable[..., Awaitable[User]]
UserFactory = Callable[..., Awaitable[User]]
BASE = datetime(2026, 1, 1, tzinfo=UTC)


async def _seed(
    db_session: AsyncSession,
    *,
    action: str,
    at: datetime,
    user_id: uuid.UUID | None = None,
    ip_address: str | None = None,
    detail: dict[str, Any] | None = None,
) -> AuditLog:
    row = AuditLog(
        action=action, created_at=at, user_id=user_id, ip_address=ip_address, detail=detail
    )
    db_session.add(row)
    await db_session.flush()
    return row


async def _victim_session(db_session: AsyncSession, user_factory: UserFactory) -> UserSession:
    victim = await user_factory(role=UserRole.USER)
    found = UserSession(
        user_id=victim.id,
        session_hash=hash_session_id(new_session_id()),
        expires_at=datetime.now(UTC) + timedelta(hours=12),
    )
    db_session.add(found)
    await db_session.flush()
    return found


@pytest.mark.parametrize(
    ("role", "expected"),
    [(UserRole.SUPERADMIN, 200), (UserRole.ADMIN, 200), (UserRole.USER, 403)],
)
async def test_audit_list_by_role(
    client: AsyncClient, logged_in: LoggedIn, role: UserRole, expected: int
) -> None:
    await logged_in(role=role)
    assert (await client.get("/api/v1/audit-logs")).status_code == expected


async def test_audit_list_without_session(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/audit-logs")).status_code == 401


async def test_audit_list_locked_account_is_refused(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    user = await logged_in(role=UserRole.ADMIN)
    user.is_locked = True
    await db_session.flush()
    # load_current_user rejects a locked account like every other cause: 401.
    assert (await client.get("/api/v1/audit-logs")).status_code == 401


async def test_audit_list_contains_the_login(client: AsyncClient, logged_in: LoggedIn) -> None:
    await logged_in(role=UserRole.ADMIN)
    body = (await client.get("/api/v1/audit-logs")).json()
    assert any(item["action"] == "login_succeeded" for item in body["items"])
    assert body["total"] >= 1


async def test_audit_list_returns_detail_verbatim_and_address_as_text(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    await logged_in(role=UserRole.ADMIN)
    # The endpoint does not filter `detail`. The guarantee that no credential
    # ever lands in it lives at the write side (every audit writer), not here.
    await _seed(
        db_session,
        action="probe",
        at=BASE,
        ip_address="203.0.113.9",
        detail={"session_hash": "x"},
    )
    item = (await client.get("/api/v1/audit-logs?action=probe")).json()["items"][0]
    assert item["ip_address"] == "203.0.113.9"
    assert item["detail"] == {"session_hash": "x"}


async def test_bad_cursor_is_rejected(client: AsyncClient, logged_in: LoggedIn) -> None:
    await logged_in(role=UserRole.ADMIN)
    assert (await client.get("/api/v1/audit-logs?cursor=not-a-cursor")).status_code == 400


async def test_naive_cursor_is_rejected(client: AsyncClient, logged_in: LoggedIn) -> None:
    await logged_in(role=UserRole.ADMIN)
    cursor = encode_cursor("2026-01-01T00:00:00", uuid.uuid4())
    assert (await client.get("/api/v1/audit-logs", params={"cursor": cursor})).status_code == 400


async def test_audit_list_filters(
    client: AsyncClient, logged_in: LoggedIn, user_factory: UserFactory, db_session: AsyncSession
) -> None:
    await logged_in(role=UserRole.ADMIN)
    actor = await user_factory(role=UserRole.USER)
    await _seed(db_session, action="a_early", at=BASE, user_id=actor.id)
    await _seed(db_session, action="a_mid", at=BASE + timedelta(days=1), user_id=actor.id)
    await _seed(db_session, action="b_late", at=BASE + timedelta(days=2))

    async def actions(**params: str) -> list[str]:
        body = (await client.get("/api/v1/audit-logs", params=params)).json()
        return [i["action"] for i in body["items"] if i["action"].startswith(("a_", "b_"))]

    assert await actions(user_id=str(actor.id)) == ["a_mid", "a_early"]
    assert await actions(action="b_late") == ["b_late"]
    assert await actions(created_at_from=(BASE + timedelta(days=1)).isoformat()) == [
        "b_late",
        "a_mid",
    ]
    assert await actions(created_at_to=(BASE + timedelta(days=1)).isoformat()) == [
        "a_mid",
        "a_early",
    ]


async def test_audit_list_pages_newest_first(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    await logged_in(role=UserRole.ADMIN)
    for day in range(3):
        await _seed(db_session, action="paged", at=BASE + timedelta(days=day))
    first = (await client.get("/api/v1/audit-logs?action=paged&limit=2")).json()
    assert len(first["items"]) == 2
    assert first["total"] == 3
    assert first["next_cursor"] is not None
    second = (
        await client.get(
            "/api/v1/audit-logs",
            params={"action": "paged", "limit": 2, "cursor": first["next_cursor"]},
        )
    ).json()
    assert len(second["items"]) == 1
    assert second["next_cursor"] is None
    stamps = [i["created_at"] for i in first["items"] + second["items"]]
    assert stamps == sorted(stamps, reverse=True)


@pytest.mark.parametrize(
    ("role", "expected"),
    [(UserRole.SUPERADMIN, 204), (UserRole.ADMIN, 403), (UserRole.USER, 403)],
)
async def test_revoke_session_by_role(
    client: AsyncClient,
    logged_in: LoggedIn,
    user_factory: UserFactory,
    db_session: AsyncSession,
    role: UserRole,
    expected: int,
) -> None:
    await logged_in(role=role)
    victim_session = await _victim_session(db_session, user_factory)
    response = await client.delete(f"/api/v1/user-sessions/{victim_session.id}", headers=HEADERS)
    assert response.status_code == expected
    # A query autoflushes the pending delete, unlike session.get on the identity map.
    remaining = await db_session.scalar(
        select(func.count()).select_from(UserSession).where(UserSession.id == victim_session.id)
    )
    assert remaining == (0 if expected == 204 else 1)


async def test_revoke_session_without_session(
    client: AsyncClient, user_factory: UserFactory, db_session: AsyncSession
) -> None:
    victim_session = await _victim_session(db_session, user_factory)
    response = await client.delete(f"/api/v1/user-sessions/{victim_session.id}", headers=HEADERS)
    assert response.status_code == 401


async def test_revoke_session_records_actor_and_target(
    client: AsyncClient, logged_in: LoggedIn, user_factory: UserFactory, db_session: AsyncSession
) -> None:
    actor = await logged_in(role=UserRole.SUPERADMIN)
    victim_session = await _victim_session(db_session, user_factory)
    await client.delete(f"/api/v1/user-sessions/{victim_session.id}", headers=HEADERS)
    row = (
        await db_session.execute(select(AuditLog).where(AuditLog.action == "session_revoked"))
    ).scalar_one()
    assert row.user_id == actor.id
    assert row.resource_type == "user_session"
    assert row.resource_id == victim_session.id


async def test_revoke_unknown_session_is_404(client: AsyncClient, logged_in: LoggedIn) -> None:
    await logged_in(role=UserRole.SUPERADMIN)
    response = await client.delete(f"/api/v1/user-sessions/{uuid.uuid4()}", headers=HEADERS)
    assert response.status_code == 404


async def test_revoke_session_requires_csrf(
    client: AsyncClient, logged_in: LoggedIn, user_factory: UserFactory, db_session: AsyncSession
) -> None:
    await logged_in(role=UserRole.SUPERADMIN)
    victim_session = await _victim_session(db_session, user_factory)
    response = await client.delete(f"/api/v1/user-sessions/{victim_session.id}")
    assert response.status_code == 403
    count = await db_session.scalar(
        select(func.count()).select_from(UserSession).where(UserSession.id == victim_session.id)
    )
    assert count == 1


async def test_session_revoked_row_holds_no_session_secret(
    client: AsyncClient, logged_in: LoggedIn, user_factory: UserFactory, db_session: AsyncSession
) -> None:
    await logged_in(role=UserRole.SUPERADMIN)
    victim_session = await _victim_session(db_session, user_factory)
    await client.delete(f"/api/v1/user-sessions/{victim_session.id}", headers=HEADERS)
    row = (
        await db_session.execute(select(AuditLog).where(AuditLog.action == "session_revoked"))
    ).scalar_one()
    serialised = str(row.detail)
    assert victim_session.session_hash not in serialised
    assert str(victim_session.id) not in serialised
    assert "session_hash" not in serialised


@pytest.mark.parametrize("bound", ["created_at_from", "created_at_to"])
async def test_naive_time_bound_is_rejected(
    client: AsyncClient, logged_in: LoggedIn, bound: str
) -> None:
    await logged_in(role=UserRole.ADMIN)
    response = await client.get("/api/v1/audit-logs", params={bound: "2026-01-01T00:00:00"})
    assert response.status_code == 400
