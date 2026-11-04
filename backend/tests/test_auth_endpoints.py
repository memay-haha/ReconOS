import asyncio
from collections.abc import Awaitable, Callable

from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.core.audit import AuditLog
from app.core.db import session_scope
from app.core.errors import RateLimitedError
from app.core.identity import User, UserRole, UserSession
from app.core.system_setting import DEFAULT_SETTINGS
from app.user import service
from app.user.models import LoginAttempt

PASSWORD = "troutmoonlit7Ladder!quay"
HEADERS = {"origin": "https://reconos.example.com", "sec-fetch-site": "same-origin"}


async def test_login_sets_cookie_and_records_audit(
    client: AsyncClient, db_session: AsyncSession, user_factory: Callable[..., Awaitable[User]]
) -> None:
    user = await user_factory(role=UserRole.ADMIN, password=PASSWORD)
    response = await client.post(
        "/api/v1/auth/login",
        json={"username": user.username, "password": PASSWORD},
        headers=HEADERS,
    )
    assert response.status_code == 204
    assert any("reconos_session" in name for name in response.cookies)
    actions = (await db_session.execute(select(AuditLog.action))).scalars().all()
    assert "login_succeeded" in actions


async def test_wrong_password_and_unknown_user_answer_the_same(
    client: AsyncClient, user_factory: Callable[..., Awaitable[User]]
) -> None:
    user = await user_factory(password=PASSWORD)
    wrong = await client.post(
        "/api/v1/auth/login",
        json={"username": user.username, "password": "definitely wrong here"},
        headers=HEADERS,
    )
    unknown = await client.post(
        "/api/v1/auth/login",
        json={"username": "nobody-at-all", "password": PASSWORD},
        headers=HEADERS,
    )
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json()["code"] == unknown.json()["code"] == "unauthenticated"


async def test_locked_account_cannot_log_in(
    client: AsyncClient, user_factory: Callable[..., Awaitable[User]]
) -> None:
    user = await user_factory(is_locked=True, password=PASSWORD)
    response = await client.post(
        "/api/v1/auth/login",
        json={"username": user.username, "password": PASSWORD},
        headers=HEADERS,
    )
    assert response.status_code == 401


async def test_failed_login_is_recorded_even_though_the_request_fails(
    client: AsyncClient,
    db_engine: AsyncEngine,
    user_factory: Callable[..., Awaitable[User]],
) -> None:
    user = await user_factory(password=PASSWORD)
    await client.post(
        "/api/v1/auth/login",
        json={"username": user.username, "password": "definitely wrong here"},
        headers=HEADERS,
    )
    # A second connection sees only committed rows, so this fails if the row
    # were added to the request session that the failed request rolls back.
    async with db_engine.connect() as other:
        total = await other.scalar(
            select(func.count())
            .select_from(LoginAttempt)
            .where(LoginAttempt.username == user.username)
        )
    assert total == 1


async def test_too_many_failures_returns_429(
    client: AsyncClient, user_factory: Callable[..., Awaitable[User]]
) -> None:
    user = await user_factory(password=PASSWORD)
    for _ in range(5):
        await client.post(
            "/api/v1/auth/login",
            json={"username": user.username, "password": "definitely wrong here"},
            headers=HEADERS,
        )
    blocked = await client.post(
        "/api/v1/auth/login",
        json={"username": user.username, "password": PASSWORD},
        headers=HEADERS,
    )
    assert blocked.status_code == 429
    assert blocked.headers["retry-after"]


async def test_cross_site_login_is_rejected(
    client: AsyncClient, user_factory: Callable[..., Awaitable[User]]
) -> None:
    user = await user_factory(password=PASSWORD)
    response = await client.post(
        "/api/v1/auth/login",
        json={"username": user.username, "password": PASSWORD},
        headers={"origin": "https://evil.example"},
    )
    assert response.status_code == 403


async def test_me_requires_a_session(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/auth/me")).status_code == 401


async def test_me_returns_the_account_without_secrets(
    client: AsyncClient, logged_in: Callable[..., Awaitable[User]]
) -> None:
    user = await logged_in(role=UserRole.USER)
    body = (await client.get("/api/v1/auth/me")).json()
    assert body["username"] == user.username
    assert body["role"] == "user"
    assert "password_hash" not in body


async def test_logout_clears_the_session(
    client: AsyncClient, logged_in: Callable[..., Awaitable[User]]
) -> None:
    await logged_in()
    assert (await client.post("/api/v1/auth/logout", headers=HEADERS)).status_code == 204
    assert (await client.get("/api/v1/auth/me")).status_code == 401


async def test_password_change_requires_the_current_password(
    client: AsyncClient, logged_in: Callable[..., Awaitable[User]]
) -> None:
    await logged_in()
    response = await client.post(
        "/api/v1/auth/password",
        json={"current_password": "wrong one here", "new_password": "bramble7Quartz!tide"},
        headers=HEADERS,
    )
    assert response.status_code == 422
    assert response.json()["code"] == "current_password_incorrect"


async def test_password_change_rejects_a_weak_password(
    client: AsyncClient, logged_in: Callable[..., Awaitable[User]]
) -> None:
    await logged_in()
    response = await client.post(
        "/api/v1/auth/password",
        json={"current_password": PASSWORD, "new_password": "password1234"},
        headers=HEADERS,
    )
    assert response.status_code == 422
    assert response.json()["errors"][0]["code"] == "password_too_weak"


async def _fail(client: AsyncClient, username: str, times: int) -> None:
    for _ in range(times):
        await client.post(
            "/api/v1/auth/login",
            json={"username": username, "password": "definitely wrong here"},
            headers=HEADERS,
        )


async def test_the_three_failure_modes_are_indistinguishable(
    client: AsyncClient, user_factory: Callable[..., Awaitable[User]]
) -> None:
    real = await user_factory(password=PASSWORD)
    locked = await user_factory(is_locked=True, password=PASSWORD)
    wrong_password = await client.post(
        "/api/v1/auth/login",
        json={"username": real.username, "password": "definitely wrong here"},
        headers=HEADERS,
    )
    unknown = await client.post(
        "/api/v1/auth/login",
        json={"username": "nobody-at-all", "password": PASSWORD},
        headers=HEADERS,
    )
    locked_response = await client.post(
        "/api/v1/auth/login",
        json={"username": locked.username, "password": PASSWORD},
        headers=HEADERS,
    )
    responses = [wrong_password, unknown, locked_response]
    assert {r.status_code for r in responses} == {401}
    assert len({r.content for r in responses}) == 1
    assert (
        len(
            {
                tuple(sorted((k, v) for k, v in r.headers.items() if k != "content-length"))
                for r in responses
            }
        )
        == 1
    )
    assert all("set-cookie" not in r.headers for r in responses)


async def test_first_login_without_origin_headers_is_allowed(
    client: AsyncClient, user_factory: Callable[..., Awaitable[User]]
) -> None:
    # No session cookie yet, so the "both headers missing" rule must not apply.
    user = await user_factory(password=PASSWORD)
    response = await client.post(
        "/api/v1/auth/login", json={"username": user.username, "password": PASSWORD}
    )
    assert response.status_code == 204


async def test_cookie_attributes_and_lifetime(
    client: AsyncClient, user_factory: Callable[..., Awaitable[User]]
) -> None:
    user = await user_factory(password=PASSWORD)
    response = await client.post(
        "/api/v1/auth/login",
        json={"username": user.username, "password": PASSWORD},
        headers=HEADERS,
    )
    cookie = response.headers["set-cookie"]
    assert cookie.startswith("__Host-reconos_session=")
    assert "HttpOnly" in cookie
    assert "Secure" in cookie
    assert "SameSite=lax" in cookie
    assert "Path=/" in cookie
    assert "Max-Age=" in cookie
    assert PASSWORD not in response.text


async def test_retry_after_is_the_remaining_lockout_time(
    client: AsyncClient, user_factory: Callable[..., Awaitable[User]]
) -> None:
    user = await user_factory(password=PASSWORD)
    await _fail(client, user.username, 5)
    blocked = await client.post(
        "/api/v1/auth/login",
        json={"username": user.username, "password": PASSWORD},
        headers=HEADERS,
    )
    assert blocked.status_code == 429
    # Default window is 15 minutes and the failures just happened.
    assert 800 < int(blocked.headers["retry-after"]) <= 900
    assert blocked.headers["content-type"].startswith("application/problem+json")


async def test_throttle_counts_by_ip_across_usernames(
    client: AsyncClient,
    db_session: AsyncSession,
    user_factory: Callable[..., Awaitable[User]],
) -> None:
    user = await user_factory(password=PASSWORD)
    for index in range(20):
        db_session.add(LoginAttempt(username=f"spray{index}", ip_address="127.0.0.1"))
    await db_session.flush()
    response = await client.post(
        "/api/v1/auth/login",
        json={"username": user.username, "password": PASSWORD},
        headers=HEADERS,
    )
    assert response.status_code == 429


async def test_success_clears_the_failures_of_the_account(
    client: AsyncClient,
    db_session: AsyncSession,
    user_factory: Callable[..., Awaitable[User]],
) -> None:
    user = await user_factory(password=PASSWORD)
    await _fail(client, user.username, 2)
    ok = await client.post(
        "/api/v1/auth/login",
        json={"username": user.username, "password": PASSWORD},
        headers=HEADERS,
    )
    assert ok.status_code == 204
    total = await db_session.scalar(
        select(func.count()).select_from(LoginAttempt).where(LoginAttempt.username == user.username)
    )
    assert total == 0


async def test_failed_login_is_audited_without_the_password(
    client: AsyncClient,
    db_session: AsyncSession,
    user_factory: Callable[..., Awaitable[User]],
) -> None:
    user = await user_factory(password=PASSWORD)
    await _fail(client, user.username, 1)
    rows = (
        (await db_session.execute(select(AuditLog).where(AuditLog.action == "login_failed")))
        .scalars()
        .all()
    )
    assert len(rows) == 1
    assert "definitely wrong here" not in str(rows[0].detail)


async def test_me_has_no_session_hash(
    client: AsyncClient, logged_in: Callable[..., Awaitable[User]]
) -> None:
    await logged_in()
    text = (await client.get("/api/v1/auth/me")).text
    assert "session_hash" not in text
    assert "password" not in text


async def test_password_change_revokes_other_sessions_and_keeps_current(
    client: AsyncClient,
    db_session: AsyncSession,
    logged_in: Callable[..., Awaitable[User]],
) -> None:
    user = await logged_in()
    other = await client.post(
        "/api/v1/auth/login",
        json={"username": user.username, "password": PASSWORD},
        headers=HEADERS,
    )
    assert other.status_code == 204
    # The shared client now holds the second session; the first is "other".
    before = await db_session.scalar(
        select(func.count()).select_from(UserSession).where(UserSession.user_id == user.id)
    )
    assert before == 2
    response = await client.post(
        "/api/v1/auth/password",
        json={"current_password": PASSWORD, "new_password": "bramble7Quartz!tide"},
        headers=HEADERS,
    )
    assert response.status_code == 204
    after = await db_session.scalar(
        select(func.count()).select_from(UserSession).where(UserSession.user_id == user.id)
    )
    assert after == 1
    assert (await client.get("/api/v1/auth/me")).status_code == 200
    actions = (await db_session.execute(select(AuditLog.action))).scalars().all()
    assert "password_changed" in actions


async def test_logout_cookie_deletion_carries_the_attributes_browsers_require(
    client: AsyncClient, logged_in: Callable[..., Awaitable[User]]
) -> None:
    # A __Host- cookie without Secure is ignored by browsers, so the stale
    # cookie would stay. The httpx jar has no prefix rules: check the header.
    await logged_in()
    response = await client.post("/api/v1/auth/logout", headers=HEADERS)
    header = response.headers["set-cookie"]
    assert header.startswith("__Host-reconos_session=")
    assert "Secure" in header
    assert "Max-Age=0" in header


async def test_password_change_is_throttled_and_audited_like_login(
    client: AsyncClient,
    db_engine: AsyncEngine,
    logged_in: Callable[..., Awaitable[User]],
) -> None:
    user = await logged_in()
    for _ in range(5):
        wrong = await client.post(
            "/api/v1/auth/password",
            json={"current_password": "wrong one here", "new_password": "bramble7Quartz!tide"},
            headers=HEADERS,
        )
        assert wrong.status_code == 422
        assert wrong.json()["code"] == "current_password_incorrect"
        assert wrong.json()["errors"] == [
            {"field": "current_password", "code": "current_password_incorrect"}
        ]
    async with db_engine.connect() as other:
        attempts = await other.scalar(
            select(func.count())
            .select_from(LoginAttempt)
            .where(LoginAttempt.username == user.username)
        )
        audited = await other.scalar(
            select(func.count())
            .select_from(AuditLog)
            .where(AuditLog.action == "password_change_failed", AuditLog.user_id == user.id)
        )
        login_failures = await other.scalar(
            select(func.count()).select_from(AuditLog).where(AuditLog.action == "login_failed")
        )
    assert attempts == 5
    assert audited == 5
    assert login_failures == 0
    # Even the correct password is refused once the account is throttled.
    blocked = await client.post(
        "/api/v1/auth/password",
        json={"current_password": PASSWORD, "new_password": "bramble7Quartz!tide"},
        headers=HEADERS,
    )
    assert blocked.status_code == 429
    assert blocked.headers["retry-after"]


async def test_concurrent_attempts_cannot_exceed_the_cap(db_engine: AsyncEngine) -> None:
    """The cap holds under concurrency, not just one request at a time.

    Counting the window and writing the attempt row are separate statements, so
    without the advisory lock in check_login_allowed every one of these would
    read the same count of zero and pass.
    """
    username = "concurrent-probe"
    address = "203.0.113.11"
    cap = DEFAULT_SETTINGS["login_max_failures_per_account"]

    async def attempt() -> bool:
        """True when the throttle let this attempt reach the password check."""
        async with session_scope(db_engine) as session:
            try:
                await service.check_login_allowed(session, username, address)
            except RateLimitedError:
                return False
            # Where login() records it: inside the request transaction, so the
            # row is committed before the lock on the window is released.
            await service.record_failed_login(username, address)
            return True

    allowed = await asyncio.gather(*(attempt() for _ in range(cap + 3)))

    assert sum(allowed) == cap


async def test_password_change_clears_the_shared_counter(
    client: AsyncClient,
    db_session: AsyncSession,
    logged_in: Callable[..., Awaitable[User]],
) -> None:
    # Login clears the counter on success, so password change must too:
    # mistyping the current password a few times would otherwise lock the
    # account owner out of login for the rest of the window.
    user = await logged_in()
    for _ in range(2):
        await client.post(
            "/api/v1/auth/password",
            json={"current_password": "wrong one here", "new_password": "bramble7Quartz!tide"},
            headers=HEADERS,
        )
    changed = await client.post(
        "/api/v1/auth/password",
        json={"current_password": PASSWORD, "new_password": "bramble7Quartz!tide"},
        headers=HEADERS,
    )
    assert changed.status_code == 204
    remaining = await db_session.scalar(
        select(func.count()).select_from(LoginAttempt).where(LoginAttempt.username == user.username)
    )
    assert remaining == 0


async def test_a_weak_new_password_names_the_field_the_form_sent(
    client: AsyncClient, logged_in: Callable[..., Awaitable[User]]
) -> None:
    await logged_in()
    response = await client.post(
        "/api/v1/auth/password",
        json={"current_password": PASSWORD, "new_password": "password1234"},
        headers=HEADERS,
    )
    assert response.status_code == 422
    assert response.json()["errors"][0]["field"] == "new_password"


async def test_password_change_with_no_session_is_still_a_401(client: AsyncClient) -> None:
    # Only a wrong current password moved to 422. A missing or expired session
    # must stay 401: that status is what signs the user out.
    response = await client.post(
        "/api/v1/auth/password",
        json={"current_password": PASSWORD, "new_password": "bramble7Quartz!tide"},
        headers=HEADERS,
    )
    assert response.status_code == 401
    assert response.json()["code"] == "unauthenticated"
