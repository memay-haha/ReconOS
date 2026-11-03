import uuid
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit_log.models import AuditLog
from app.core.identity import User, UserRole, UserSession
from app.core.pagination import encode_cursor

HEADERS = {"origin": "https://reconos.example.com", "sec-fetch-site": "same-origin"}
NEW = {
    "username": "newoperator",
    "display_name": "New Operator",
    "password": "bramble7Quartz!tide",
    "role": "user",
}
LoggedIn = Callable[..., Awaitable[User]]
UserFactory = Callable[..., Awaitable[User]]
ROLE_CASES = [(UserRole.SUPERADMIN, 200), (UserRole.ADMIN, 403), (UserRole.USER, 403)]


@pytest.mark.parametrize(("role", "expected"), ROLE_CASES)
async def test_list_users_by_role(
    client: AsyncClient, logged_in: LoggedIn, role: UserRole, expected: int
) -> None:
    await logged_in(role=role)
    assert (await client.get("/api/v1/users")).status_code == expected


async def test_list_users_without_session(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/users")).status_code == 401


@pytest.mark.parametrize(("role", "expected"), ROLE_CASES)
async def test_create_user_by_role(
    client: AsyncClient, logged_in: LoggedIn, role: UserRole, expected: int
) -> None:
    await logged_in(role=role)
    response = await client.post("/api/v1/users", json=NEW, headers=HEADERS)
    assert response.status_code == expected


async def test_create_user_without_session(client: AsyncClient) -> None:
    assert (await client.post("/api/v1/users", json=NEW, headers=HEADERS)).status_code == 401


async def test_created_user_hides_secrets(client: AsyncClient, logged_in: LoggedIn) -> None:
    await logged_in(role=UserRole.SUPERADMIN)
    body = (await client.post("/api/v1/users", json=NEW, headers=HEADERS)).json()
    assert "password_hash" not in body
    assert body["role"] == "user"


async def test_duplicate_username_conflicts(client: AsyncClient, logged_in: LoggedIn) -> None:
    await logged_in(role=UserRole.SUPERADMIN)
    await client.post("/api/v1/users", json=NEW, headers=HEADERS)
    again = await client.post("/api/v1/users", json=NEW, headers=HEADERS)
    assert again.status_code == 409


async def test_weak_password_is_rejected(client: AsyncClient, logged_in: LoggedIn) -> None:
    await logged_in(role=UserRole.SUPERADMIN)
    response = await client.post(
        "/api/v1/users", json={**NEW, "password": "password1234"}, headers=HEADERS
    )
    assert response.status_code == 422


async def test_superadmin_cannot_change_own_role(client: AsyncClient, logged_in: LoggedIn) -> None:
    me = await logged_in(role=UserRole.SUPERADMIN)
    response = await client.patch(f"/api/v1/users/{me.id}", json={"role": "user"}, headers=HEADERS)
    assert response.status_code == 403


async def test_superadmin_can_rename_itself(client: AsyncClient, logged_in: LoggedIn) -> None:
    me = await logged_in(role=UserRole.SUPERADMIN)
    response = await client.patch(
        f"/api/v1/users/{me.id}", json={"display_name": "Renamed"}, headers=HEADERS
    )
    assert response.status_code == 200
    assert response.json()["display_name"] == "Renamed"


async def test_superadmin_changes_another_role(
    client: AsyncClient, logged_in: LoggedIn, user_factory: UserFactory
) -> None:
    await logged_in(role=UserRole.SUPERADMIN)
    other = await user_factory(role=UserRole.USER)
    response = await client.patch(
        f"/api/v1/users/{other.id}", json={"role": "admin"}, headers=HEADERS
    )
    assert response.status_code == 200
    assert response.json()["role"] == "admin"


@pytest.mark.parametrize("role", [UserRole.ADMIN, UserRole.USER])
async def test_non_superadmin_cannot_patch_or_lock(
    client: AsyncClient, logged_in: LoggedIn, user_factory: UserFactory, role: UserRole
) -> None:
    await logged_in(role=role)
    other = await user_factory(role=UserRole.USER)
    base = f"/api/v1/users/{other.id}"
    assert (await client.get(base)).status_code == 403
    assert (await client.patch(base, json={"role": "admin"}, headers=HEADERS)).status_code == 403
    assert (await client.post(f"{base}/lock", headers=HEADERS)).status_code == 403
    assert (await client.post(f"{base}/unlock", headers=HEADERS)).status_code == 403
    assert (await client.get(f"{base}/sessions")).status_code == 403


async def test_no_session_cannot_reach_user_routes(client: AsyncClient) -> None:
    base = f"/api/v1/users/{uuid.uuid4()}"
    assert (await client.get(base)).status_code == 401
    assert (await client.patch(base, json={}, headers=HEADERS)).status_code == 401
    assert (await client.post(f"{base}/lock", headers=HEADERS)).status_code == 401
    assert (await client.post(f"{base}/unlock", headers=HEADERS)).status_code == 401
    assert (await client.get(f"{base}/sessions")).status_code == 401


async def test_superadmin_cannot_lock_itself(client: AsyncClient, logged_in: LoggedIn) -> None:
    me = await logged_in(role=UserRole.SUPERADMIN)
    response = await client.post(f"/api/v1/users/{me.id}/lock", headers=HEADERS)
    assert response.status_code == 403


async def test_lock_revokes_every_session_of_that_account(
    client: AsyncClient,
    logged_in: LoggedIn,
    user_factory: UserFactory,
    db_session: AsyncSession,
) -> None:
    await logged_in(role=UserRole.SUPERADMIN)
    victim = await user_factory(role=UserRole.USER)
    now = datetime.now(UTC)
    for index in range(2):
        db_session.add(
            UserSession(
                user_id=victim.id,
                session_hash=f"hash-{index}-{victim.id}",
                expires_at=now + timedelta(hours=1),
            )
        )
    await db_session.flush()
    response = await client.post(f"/api/v1/users/{victim.id}/lock", headers=HEADERS)
    assert response.status_code == 204
    remaining = await db_session.scalar(
        select(func.count()).select_from(UserSession).where(UserSession.user_id == victim.id)
    )
    assert remaining == 0
    assert (await client.get(f"/api/v1/users/{victim.id}")).json()["is_locked"] is True


async def test_unlock_clears_the_flag(
    client: AsyncClient, logged_in: LoggedIn, user_factory: UserFactory
) -> None:
    await logged_in(role=UserRole.SUPERADMIN)
    victim = await user_factory(role=UserRole.USER, is_locked=True)
    response = await client.post(f"/api/v1/users/{victim.id}/unlock", headers=HEADERS)
    assert response.status_code == 204
    assert (await client.get(f"/api/v1/users/{victim.id}")).json()["is_locked"] is False


async def test_unknown_user_is_not_found(client: AsyncClient, logged_in: LoggedIn) -> None:
    await logged_in(role=UserRole.SUPERADMIN)
    assert (await client.get(f"/api/v1/users/{uuid.uuid4()}")).status_code == 404


async def test_state_changes_require_csrf_headers(
    client: AsyncClient, logged_in: LoggedIn, user_factory: UserFactory
) -> None:
    await logged_in(role=UserRole.SUPERADMIN)
    other = await user_factory(role=UserRole.USER)
    assert (await client.post("/api/v1/users", json=NEW)).status_code == 403
    assert (await client.patch(f"/api/v1/users/{other.id}", json={})).status_code == 403
    assert (await client.post(f"/api/v1/users/{other.id}/lock")).status_code == 403
    assert (await client.post(f"/api/v1/users/{other.id}/unlock")).status_code == 403


async def test_list_users_pages_newest_first_without_secrets(
    client: AsyncClient, logged_in: LoggedIn, user_factory: UserFactory
) -> None:
    await logged_in(role=UserRole.SUPERADMIN)
    for _ in range(3):
        await user_factory()
    first = (await client.get("/api/v1/users", params={"limit": 2})).json()
    assert len(first["items"]) == 2
    assert first["total"] == 4
    assert first["next_cursor"] is not None
    second = (
        await client.get("/api/v1/users", params={"limit": 2, "cursor": first["next_cursor"]})
    ).json()
    ids = [item["id"] for item in first["items"] + second["items"]]
    assert len(set(ids)) == len(ids) == 4
    assert second["next_cursor"] is None
    for item in first["items"] + second["items"]:
        assert "password_hash" not in item
        assert "session_hash" not in item


async def test_list_limit_is_clamped(client: AsyncClient, logged_in: LoggedIn) -> None:
    await logged_in(role=UserRole.SUPERADMIN)
    assert (await client.get("/api/v1/users", params={"limit": 0})).status_code == 200
    assert (await client.get("/api/v1/users", params={"limit": 9999})).status_code == 200


@pytest.mark.parametrize(
    "cursor",
    [
        "!!!",
        encode_cursor("not-a-timestamp", uuid.uuid4()),
        encode_cursor("2026-01-01T00:00:00", uuid.uuid4()),
        encode_cursor("0001-01-01T00:00:00+14:00", uuid.uuid4()),
        encode_cursor("9999-12-31T23:59:59-14:00", uuid.uuid4()),
    ],
)
async def test_malformed_cursor_is_a_bad_request(
    client: AsyncClient, logged_in: LoggedIn, cursor: str
) -> None:
    me = await logged_in(role=UserRole.SUPERADMIN)
    assert (await client.get("/api/v1/users", params={"cursor": cursor})).status_code == 400
    response = await client.get(f"/api/v1/users/{me.id}/sessions", params={"cursor": cursor})
    assert response.status_code == 400


async def test_sessions_list_hides_session_hash(client: AsyncClient, logged_in: LoggedIn) -> None:
    me = await logged_in(role=UserRole.SUPERADMIN)
    response = await client.get(f"/api/v1/users/{me.id}/sessions")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert "session_hash" not in body["items"][0]


async def test_sessions_of_unknown_user_is_not_found(
    client: AsyncClient, logged_in: LoggedIn
) -> None:
    await logged_in(role=UserRole.SUPERADMIN)
    assert (await client.get(f"/api/v1/users/{uuid.uuid4()}/sessions")).status_code == 404


async def _audit_rows(db_session: AsyncSession, action: str) -> list[AuditLog]:
    result = await db_session.execute(select(AuditLog).where(AuditLog.action == action))
    return list(result.scalars().all())


def _assert_clean_detail(row: AuditLog, *secrets: str) -> None:
    text = str(row.detail)
    for secret in ("password", "session", *secrets):
        assert secret not in text


async def test_create_records_user_created(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    actor = await logged_in(role=UserRole.SUPERADMIN)
    created_id = (await client.post("/api/v1/users", json=NEW, headers=HEADERS)).json()["id"]
    (row,) = await _audit_rows(db_session, "user_created")
    assert row.user_id == actor.id
    assert str(row.resource_id) == created_id
    assert row.resource_type == "user"
    _assert_clean_detail(row, NEW["password"])


async def test_update_records_user_updated_even_when_empty(
    client: AsyncClient, logged_in: LoggedIn, user_factory: UserFactory, db_session: AsyncSession
) -> None:
    actor = await logged_in(role=UserRole.SUPERADMIN)
    target = await user_factory(role=UserRole.USER)
    response = await client.patch(f"/api/v1/users/{target.id}", json={}, headers=HEADERS)
    assert response.status_code == 200
    (row,) = await _audit_rows(db_session, "user_updated")
    assert row.user_id == actor.id
    assert row.resource_id == target.id
    assert await _audit_rows(db_session, "user_role_changed") == []
    _assert_clean_detail(row)


async def test_role_change_records_old_and_new_role(
    client: AsyncClient, logged_in: LoggedIn, user_factory: UserFactory, db_session: AsyncSession
) -> None:
    actor = await logged_in(role=UserRole.SUPERADMIN)
    target = await user_factory(role=UserRole.USER)
    await client.patch(f"/api/v1/users/{target.id}", json={"role": "admin"}, headers=HEADERS)
    (changed,) = await _audit_rows(db_session, "user_role_changed")
    assert changed.user_id == actor.id
    assert changed.resource_id == target.id
    assert changed.detail == {"from": "user", "to": "admin"}
    _assert_clean_detail(changed)
    # The brief keeps the second row, so a role change writes both.
    (updated,) = await _audit_rows(db_session, "user_updated")
    assert updated.resource_id == target.id


async def test_lock_and_unlock_are_recorded(
    client: AsyncClient, logged_in: LoggedIn, user_factory: UserFactory, db_session: AsyncSession
) -> None:
    actor = await logged_in(role=UserRole.SUPERADMIN)
    target = await user_factory(role=UserRole.USER)
    await client.post(f"/api/v1/users/{target.id}/lock", headers=HEADERS)
    await client.post(f"/api/v1/users/{target.id}/unlock", headers=HEADERS)
    for action in ("user_locked", "user_unlocked"):
        (row,) = await _audit_rows(db_session, action)
        assert row.user_id == actor.id
        assert row.resource_id == target.id
        _assert_clean_detail(row)
