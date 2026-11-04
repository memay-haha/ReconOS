import uuid
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import event, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import AuditLog
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


async def test_changing_an_account_moves_updated_at(
    client: AsyncClient, logged_in: LoggedIn, user_factory: UserFactory, db_session: AsyncSession
) -> None:
    # The column is maintained by the ORM, not by the caller, so every write
    # path moves it: app/core/identity.py.
    await logged_in(role=UserRole.SUPERADMIN)
    target = await user_factory(role=UserRole.USER)
    created_at = target.updated_at

    patched = await client.patch(
        f"/api/v1/users/{target.id}", json={"display_name": "Renamed"}, headers=HEADERS
    )
    assert patched.status_code == 200
    # The test overrides the request transaction, so nothing has committed yet.
    await db_session.flush()
    await db_session.refresh(target)
    after_patch = target.updated_at
    assert after_patch > created_at

    locked = await client.post(f"/api/v1/users/{target.id}/lock", headers=HEADERS)
    assert locked.status_code == 204
    await db_session.flush()
    await db_session.refresh(target)
    assert target.updated_at > after_patch


async def _session_row(
    db_session: AsyncSession,
    user: User,
    *,
    expires_in: timedelta = timedelta(hours=1),
    idle_for: timedelta = timedelta(0),
) -> UserSession:
    from app.core.security import hash_session_id, new_session_id

    now = datetime.now(UTC)
    row = UserSession(
        user_id=user.id,
        session_hash=hash_session_id(new_session_id()),
        expires_at=now + expires_in,
        last_seen_at=now - idle_for,
    )
    db_session.add(row)
    await db_session.flush()
    return row


@pytest.mark.parametrize(("role", "expected"), ROLE_CASES)
async def test_all_sessions_by_role(
    client: AsyncClient, logged_in: LoggedIn, role: UserRole, expected: int
) -> None:
    await logged_in(role=role)
    assert (await client.get("/api/v1/user-sessions")).status_code == expected


async def test_all_sessions_without_a_session(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/user-sessions")).status_code == 401


async def test_all_sessions_counts_only_live_ones(
    client: AsyncClient, logged_in: LoggedIn, user_factory: UserFactory, db_session: AsyncSession
) -> None:
    await logged_in(role=UserRole.SUPERADMIN)
    victim = await user_factory(role=UserRole.USER)
    await _session_row(db_session, victim, expires_in=-timedelta(hours=1))
    await _session_row(db_session, victim, idle_for=timedelta(days=30))
    live = await _session_row(db_session, victim)
    body = (await client.get("/api/v1/user-sessions")).json()
    # The Superadmin's own session and the one live session of the victim.
    assert body["total"] == 2
    assert str(live.id) in {item["id"] for item in body["items"]}


async def test_per_user_sessions_hide_dead_ones(
    client: AsyncClient, logged_in: LoggedIn, user_factory: UserFactory, db_session: AsyncSession
) -> None:
    await logged_in(role=UserRole.SUPERADMIN)
    victim = await user_factory(role=UserRole.USER)
    await _session_row(db_session, victim, expires_in=-timedelta(hours=1))
    await _session_row(db_session, victim, idle_for=timedelta(days=30))
    body = (await client.get(f"/api/v1/users/{victim.id}/sessions")).json()
    assert body["total"] == 0
    assert body["items"] == []


async def test_all_sessions_paginates(
    client: AsyncClient, logged_in: LoggedIn, user_factory: UserFactory, db_session: AsyncSession
) -> None:
    await logged_in(role=UserRole.SUPERADMIN)
    victim = await user_factory(role=UserRole.USER)
    await _session_row(db_session, victim)
    first = (await client.get("/api/v1/user-sessions", params={"limit": 1})).json()
    assert len(first["items"]) == 1
    assert first["total"] == 2
    assert first["next_cursor"] is not None
    second = (
        await client.get(
            "/api/v1/user-sessions", params={"limit": 1, "cursor": first["next_cursor"]}
        )
    ).json()
    assert len(second["items"]) == 1
    assert second["next_cursor"] is None
    assert second["items"][0]["id"] != first["items"][0]["id"]


async def test_all_sessions_rejects_a_bad_cursor(client: AsyncClient, logged_in: LoggedIn) -> None:
    await logged_in(role=UserRole.SUPERADMIN)
    assert (await client.get("/api/v1/user-sessions?cursor=not-a-cursor")).status_code == 400


def _item(body: dict[str, object], user: User) -> dict[str, object]:
    items = body["items"]
    assert isinstance(items, list)
    return next(item for item in items if item["id"] == str(user.id))


async def test_user_with_no_session_reads_zero(
    client: AsyncClient, logged_in: LoggedIn, user_factory: UserFactory
) -> None:
    await logged_in(role=UserRole.SUPERADMIN)
    idle_account = await user_factory(role=UserRole.USER)
    listed = _item((await client.get("/api/v1/users")).json(), idle_account)
    assert listed["active_user_session_count"] == 0
    detail = (await client.get(f"/api/v1/users/{idle_account.id}")).json()
    assert detail["active_user_session_count"] == 0


async def test_user_with_several_sessions_reads_the_number(
    client: AsyncClient, logged_in: LoggedIn, user_factory: UserFactory, db_session: AsyncSession
) -> None:
    await logged_in(role=UserRole.SUPERADMIN)
    busy = await user_factory(role=UserRole.USER)
    other = await user_factory(role=UserRole.USER)
    for _ in range(3):
        await _session_row(db_session, busy)
    await _session_row(db_session, other)
    body = (await client.get("/api/v1/users")).json()
    assert _item(body, busy)["active_user_session_count"] == 3
    assert _item(body, other)["active_user_session_count"] == 1
    detail = (await client.get(f"/api/v1/users/{busy.id}")).json()
    assert detail["active_user_session_count"] == 3


async def test_dead_sessions_are_not_counted(
    client: AsyncClient, logged_in: LoggedIn, user_factory: UserFactory, db_session: AsyncSession
) -> None:
    await logged_in(role=UserRole.SUPERADMIN)
    victim = await user_factory(role=UserRole.USER)
    expired = await _session_row(db_session, victim, expires_in=-timedelta(hours=1))
    await _session_row(db_session, victim, idle_for=timedelta(days=30))
    revoked = await _session_row(db_session, victim)
    await _session_row(db_session, victim)
    # Revocation deletes the row: there is no revoked flag to filter on.
    deleted = await client.delete(f"/api/v1/user-sessions/{revoked.id}", headers=HEADERS)
    assert deleted.status_code == 204
    assert expired.expires_at < datetime.now(UTC)
    body = (await client.get("/api/v1/users")).json()
    assert _item(body, victim)["active_user_session_count"] == 1
    detail = (await client.get(f"/api/v1/users/{victim.id}")).json()
    assert detail["active_user_session_count"] == 1


async def test_user_list_reads_sessions_in_one_statement(
    client: AsyncClient, logged_in: LoggedIn, user_factory: UserFactory, db_session: AsyncSession
) -> None:
    await logged_in(role=UserRole.SUPERADMIN)
    for _ in range(5):
        await _session_row(db_session, await user_factory(role=UserRole.USER))
    statements: list[str] = []

    def record(
        conn: object, cursor: object, statement: str, params: object, context: object, many: bool
    ) -> None:
        statements.append(statement)

    engine = db_session.get_bind().engine
    event.listen(engine, "before_cursor_execute", record)
    try:
        response = await client.get("/api/v1/users", params={"limit": 200})
    finally:
        event.remove(engine, "before_cursor_execute", record)
    assert response.status_code == 200
    assert len(response.json()["items"]) == 6
    # One statement carries the session count for every row: not one per account.
    # The request's own authentication reads user_session too, so count only the
    # statements that aggregate it.
    counting = [s for s in statements if "user_session" in s and "count(" in s]
    assert len(counting) == 1
    assert counting[0].lstrip().startswith('SELECT "user"')
