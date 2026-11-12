"""Accounts, sessions and the login flow: docs/security/authentication.md."""

import math
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, NamedTuple

from sqlalchemy import (
    ColumnElement,
    ScalarSelect,
    and_,
    delete,
    func,
    or_,
    select,
    text,
    true,
    tuple_,
)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute

from app.core import audit
from app.core.db import independent_session
from app.core.errors import (
    ConflictError,
    CurrentPasswordIncorrectError,
    ForbiddenError,
    NotFoundError,
    RateLimitedError,
    UnauthenticatedError,
)
from app.core.identity import User, UserRole, UserSession
from app.core.pagination import (
    MAX_LIMIT,
    Page,
    contains_ignore_case,
    decode_time_cursor,
    encode_cursor,
)
from app.core.security import (
    burn_password_comparison,
    check_password_policy,
    hash_password,
    hash_session_id,
    new_session_id,
    verify_password,
)
from app.core.system_setting import get_int_setting
from app.user.models import LoginAttempt
from app.user.schemas import (
    ActiveUserSessionPage,
    ActiveUserSessionResponse,
    UserBriefResponse,
    UserDetailResponse,
    UserPage,
    UserResponse,
    UserSessionResponse,
    UserSessionSort,
)


class LoginResult(NamedTuple):
    session_id: str
    max_age_seconds: int


async def _seconds_until_below(
    session: AsyncSession,
    column: InstrumentedAttribute[str],
    value: str,
    *,
    limit: int,
    since: datetime,
    window: timedelta,
) -> int:
    """Seconds until enough failures age out of the window to fall below `limit`."""
    drop = await session.scalar(
        select(func.count())
        .select_from(LoginAttempt)
        .where(column == value, LoginAttempt.attempted_at >= since)
    )
    # The lock lifts when the (count - limit + 1)th oldest failure leaves the window.
    pivot = await session.scalar(
        select(LoginAttempt.attempted_at)
        .where(column == value, LoginAttempt.attempted_at >= since)
        .order_by(LoginAttempt.attempted_at)
        # A concurrent success can clear rows between the two statements, and
        # asyncpg rejects a negative offset.
        .offset(max(0, (drop or 0) - limit))
        .limit(1)
    )
    if pivot is None:
        return int(window.total_seconds())
    return max(1, math.ceil((pivot + window - datetime.now(UTC)).total_seconds()))


# Namespace of the advisory lock below, so the key space cannot collide with a
# lock another part of the system takes later.
LOGIN_THROTTLE_LOCK = 1


async def check_login_allowed(session: AsyncSession, username: str, ip_address: str) -> None:
    # Counting the window and writing the attempt row are separate statements,
    # so without a lock N concurrent requests all read the same count and all
    # pass: a cap of 5 becomes 5 plus the attacker's concurrency. The lock is
    # transaction scoped, released when the request ends, and it also caps the
    # Argon2id hashes one account can hold at once, which is what makes this
    # endpoint cheap to answer under a flood.
    await session.execute(
        text("SELECT pg_advisory_xact_lock(:namespace, hashtext(:username))").bindparams(
            namespace=LOGIN_THROTTLE_LOCK, username=username
        )
    )
    minutes = await get_int_setting(session, "login_failure_window_minutes")
    max_account = await get_int_setting(session, "login_max_failures_per_account")
    max_ip = await get_int_setting(session, "login_max_failures_per_ip")
    window = timedelta(minutes=minutes)
    since = datetime.now(UTC) - window
    by_account = await session.scalar(
        select(func.count())
        .select_from(LoginAttempt)
        .where(LoginAttempt.username == username, LoginAttempt.attempted_at >= since)
    )
    by_ip = await session.scalar(
        select(func.count())
        .select_from(LoginAttempt)
        .where(LoginAttempt.ip_address == ip_address, LoginAttempt.attempted_at >= since)
    )
    waits: list[int] = []
    if (by_account or 0) >= max_account:
        waits.append(
            await _seconds_until_below(
                session,
                LoginAttempt.username,
                username,
                limit=max_account,
                since=since,
                window=window,
            )
        )
    if (by_ip or 0) >= max_ip:
        waits.append(
            await _seconds_until_below(
                session,
                LoginAttempt.ip_address,
                ip_address,
                limit=max_ip,
                since=since,
                window=window,
            )
        )
    if waits:
        raise RateLimitedError(
            detail=f"too many failed logins, retry in {minutes} minutes",
            retry_after_seconds=max(waits),
        )


async def record_failed_login(
    username: str,
    ip_address: str,
    *,
    action: str = "login_failed",
    user_id: uuid.UUID | None = None,
) -> None:
    """Separate transaction: the request itself ends in 401 and rolls back.

    The login_attempt row is the throttle counter, shared by every kind of
    wrong-password attempt. Only the audit action differs by caller.
    """
    async with independent_session() as session:
        session.add(LoginAttempt(username=username, ip_address=ip_address))
        await audit.record(
            session,
            action=action,
            user_id=user_id,
            detail={"username": username},
            ip_address=ip_address,
        )


async def login(
    session: AsyncSession, *, username: str, password: str, ip_address: str, user_agent: str | None
) -> LoginResult:
    await check_login_allowed(session, username, ip_address)
    user = await session.scalar(select(User).where(User.username == username))
    if user is None:
        burn_password_comparison()
        await record_failed_login(username, ip_address)
        raise UnauthenticatedError(detail="invalid username or password")
    if not verify_password(user.password_hash, password) or user.is_locked:
        await record_failed_login(username, ip_address)
        raise UnauthenticatedError(detail="invalid username or password")

    await session.execute(delete(LoginAttempt).where(LoginAttempt.username == username))
    session_id = new_session_id()
    hours = await get_int_setting(session, "session_absolute_timeout_hours")
    now = datetime.now(UTC)
    session.add(
        UserSession(
            user_id=user.id,
            session_hash=hash_session_id(session_id),
            ip_address=ip_address,
            user_agent=user_agent,
            expires_at=now + timedelta(hours=hours),
        )
    )
    user.last_login_at = now
    await audit.record(session, action="login_succeeded", user_id=user.id, ip_address=ip_address)
    return LoginResult(session_id, hours * 3600)


async def logout(session: AsyncSession, *, user: User, session_id: str) -> None:
    await session.execute(
        delete(UserSession).where(UserSession.session_hash == hash_session_id(session_id))
    )
    await audit.record(session, action="logout", user_id=user.id)


async def revoke_sessions_for_user(
    session: AsyncSession, user_id: uuid.UUID, *, keep_session_hash: str | None = None
) -> None:
    """Delete the sessions of an account, optionally sparing one.

    A kept hash that matches no row spares nothing, so the call fails closed.
    """
    statement = delete(UserSession).where(UserSession.user_id == user_id)
    if keep_session_hash is not None:
        statement = statement.where(UserSession.session_hash != keep_session_hash)
    await session.execute(statement)


async def change_password(
    session: AsyncSession,
    *,
    user: User,
    current_password: str,
    new_password: str,
    session_id: str,
    ip_address: str,
) -> None:
    # A stolen session cookie must not turn this endpoint into a password oracle,
    # so it shares the login throttle and the failed-login trail.
    await check_login_allowed(session, user.username, ip_address)
    if not verify_password(user.password_hash, current_password):
        await record_failed_login(
            user.username, ip_address, action="password_change_failed", user_id=user.id
        )
        # 422, not 401: the session is valid, and a 401 would sign the user out.
        raise CurrentPasswordIncorrectError(
            detail="current password does not match",
            errors=[{"field": "current_password", "code": "current_password_incorrect"}],
        )
    check_password_policy(
        new_password, user_inputs=[user.username, user.display_name], field="new_password"
    )
    user.password_hash = hash_password(new_password)
    # Clear the shared counter as login does, so mistyping the current password
    # a few times before succeeding does not lock the account out of login.
    await session.execute(delete(LoginAttempt).where(LoginAttempt.username == user.username))
    await revoke_sessions_for_user(session, user.id, keep_session_hash=hash_session_id(session_id))
    await audit.record(session, action="password_changed", user_id=user.id)


async def get_user(session: AsyncSession, user_id: uuid.UUID) -> User:
    user = await session.get(User, user_id)
    if user is None:
        raise NotFoundError(detail="account does not exist")
    return user


async def create_user(
    session: AsyncSession,
    *,
    actor: User,
    username: str,
    display_name: str,
    password: str,
    role: UserRole,
) -> User:
    taken = await session.scalar(select(User.id).where(User.username == username))
    if taken is not None:
        raise ConflictError(detail="username is already taken")
    check_password_policy(password, user_inputs=[username, display_name])
    user = User(
        username=username,
        display_name=display_name,
        password_hash=hash_password(password),
        role=role.value,
    )
    session.add(user)
    await session.flush()
    await audit.record(
        session, action="user_created", user_id=actor.id, resource_type="user", resource_id=user.id
    )
    return user


async def update_user(
    session: AsyncSession,
    *,
    actor: User,
    user_id: uuid.UUID,
    display_name: str | None,
    role: UserRole | None,
) -> User:
    user = await get_user(session, user_id)
    previous_role = user.role
    if role is not None and user.id == actor.id:
        # Keeping at least one Superadmin: docs/security/authorization.md
        raise ForbiddenError(detail="an account cannot change its own role")
    if display_name is not None:
        user.display_name = display_name
    if role is not None:
        user.role = role.value
        await audit.record(
            session,
            action="user_role_changed",
            user_id=actor.id,
            resource_type="user",
            resource_id=user.id,
            detail={"from": previous_role, "to": role.value},
        )
    await audit.record(
        session, action="user_updated", user_id=actor.id, resource_type="user", resource_id=user.id
    )
    return user


async def set_locked(
    session: AsyncSession, *, actor: User, user_id: uuid.UUID, locked: bool
) -> None:
    user = await get_user(session, user_id)
    if locked and user.id == actor.id:
        raise ForbiddenError(detail="an account cannot lock itself")
    user.is_locked = locked
    if locked:
        await revoke_sessions_for_user(session, user.id)
    await audit.record(
        session,
        action="user_locked" if locked else "user_unlocked",
        user_id=actor.id,
        resource_type="user",
        resource_id=user.id,
    )


def _clamp(limit: int) -> int:
    return max(1, min(limit, MAX_LIMIT))


def _detail(user: User, active: int, ip: object, seen_at: datetime | None) -> UserDetailResponse:
    return UserDetailResponse.model_validate(
        {
            **UserResponse.model_validate(user, from_attributes=True).model_dump(),
            "active_user_session_count": active,
            "last_session_ip": ip,
            "last_seen_at": seen_at,
        }
    )


async def _session_columns(session: AsyncSession) -> tuple[ScalarSelect[Any], ...]:
    """Correlated computed fields of the enclosing user row, all over live sessions.

    They are scalar subqueries in the select list, so Postgres evaluates them
    only for the rows that survive the page LIMIT, through the user_id index.
    """
    live = await _live_session_filter(session)
    own_live = and_(UserSession.user_id == User.id, live)
    count = select(func.count()).select_from(UserSession).where(own_live)

    def newest(column: InstrumentedAttribute[Any]) -> ScalarSelect[Any]:
        return (
            select(column)
            .where(own_live)
            .order_by(UserSession.last_seen_at.desc(), UserSession.id.desc())
            .limit(1)
            .correlate(User)
            .scalar_subquery()
        )

    return (
        count.correlate(User).scalar_subquery(),
        newest(UserSession.ip_address),
        newest(UserSession.last_seen_at),
    )


async def get_user_detail(session: AsyncSession, user_id: uuid.UUID) -> UserDetailResponse:
    columns = await _session_columns(session)
    row = (await session.execute(select(User, *columns).where(User.id == user_id))).first()
    if row is None:
        raise NotFoundError(detail="account does not exist")
    return _detail(row[0], row[1], row[2], row[3])


def _account_filter(q: str | None, role: UserRole | None) -> ColumnElement[bool]:
    clauses: list[ColumnElement[bool]] = [true()]
    if q:
        clauses.append(
            or_(contains_ignore_case(User.username, q), contains_ignore_case(User.display_name, q))
        )
    if role is not None:
        clauses.append(User.role == role.value)
    return and_(*clauses)


async def list_users(
    session: AsyncSession,
    *,
    viewer: User,
    limit: int,
    cursor: str | None,
    q: str | None = None,
    role: UserRole | None = None,
) -> UserPage | Page[UserBriefResponse]:
    """Superadmin gets the full rows and the aggregates, Admin only id, username, role.

    The projection is chosen here, not in the router, because which fields a
    role may read is an authorization rule: docs/security/authorization.md.
    """
    size = _clamp(limit)
    where = _account_filter(q, role)
    full = viewer.role == UserRole.SUPERADMIN
    columns = await _session_columns(session) if full else ()
    stmt = select(User, *columns).where(where).order_by(User.created_at.desc(), User.id.desc())
    if cursor is not None:
        seen_at, seen_id = decode_time_cursor(cursor)
        stmt = stmt.where(tuple_(User.created_at, User.id) < (seen_at, seen_id))
    rows = list((await session.execute(stmt.limit(size + 1))).all())
    total = await session.scalar(select(func.count()).select_from(User).where(where)) or 0
    page_rows = rows[:size]
    next_cursor = (
        encode_cursor(page_rows[-1][0].created_at.isoformat(), page_rows[-1][0].id)
        if len(rows) > size
        else None
    )
    if not full:
        return Page[UserBriefResponse](
            items=[UserBriefResponse.model_validate(row[0]) for row in page_rows],
            next_cursor=next_cursor,
            total=total,
        )
    grouped = await session.execute(select(User.role, func.count()).group_by(User.role))
    by_role: dict[str, int] = dict(grouped.all())
    locked = await session.scalar(select(func.count()).select_from(User).where(User.is_locked))
    return UserPage(
        items=[_detail(*row) for row in page_rows],
        next_cursor=next_cursor,
        total=total,
        role_counts={member: by_role.get(member.value, 0) for member in UserRole},
        locked_count=locked or 0,
    )


async def _live_session_filter(session: AsyncSession) -> ColumnElement[bool]:
    """A session is live while both clocks still allow it.

    The same two rules load_current_user applies: the absolute lifetime in
    expires_at, and the idle window counted from last_seen_at.
    """
    idle_minutes = await get_int_setting(session, "session_idle_timeout_minutes")
    now = datetime.now(UTC)
    return and_(
        UserSession.expires_at > now,
        UserSession.last_seen_at > now - timedelta(minutes=idle_minutes),
    )


async def list_sessions_for_user(
    session: AsyncSession, *, user_id: uuid.UUID, limit: int, cursor: str | None
) -> Page[UserSessionResponse]:
    await get_user(session, user_id)
    live = await _live_session_filter(session)
    where = and_(UserSession.user_id == user_id, live)
    size = _clamp(limit)
    stmt = select(UserSession).where(where)
    stmt = stmt.order_by(UserSession.created_at.desc(), UserSession.id.desc())
    if cursor is not None:
        seen_at, seen_id = decode_time_cursor(cursor)
        stmt = stmt.where(tuple_(UserSession.created_at, UserSession.id) < (seen_at, seen_id))
    rows = list((await session.execute(stmt.limit(size + 1))).scalars().all())
    total = await session.scalar(select(func.count()).select_from(UserSession).where(where)) or 0
    page_rows = rows[:size]
    next_cursor = (
        encode_cursor(page_rows[-1].created_at.isoformat(), page_rows[-1].id)
        if len(rows) > size
        else None
    )
    return Page[UserSessionResponse](
        items=[UserSessionResponse.model_validate(row, from_attributes=True) for row in page_rows],
        next_cursor=next_cursor,
        total=total,
    )


async def list_active_sessions(
    session: AsyncSession, *, limit: int, cursor: str | None, sort: UserSessionSort = "-created_at"
) -> ActiveUserSessionPage:
    size = _clamp(limit)
    live = await _live_session_filter(session)
    column = (
        UserSession.last_seen_at if sort.lstrip("-") == "last_seen_at" else UserSession.created_at
    )
    descending = sort.startswith("-")
    stmt = (
        select(UserSession, User.username, User.display_name)
        .join(User, User.id == UserSession.user_id)
        .where(live)
        .order_by(
            *(
                (column.desc(), UserSession.id.desc())
                if descending
                else (column.asc(), UserSession.id.asc())
            )
        )
    )
    if cursor is not None:
        seen_at, seen_id = decode_time_cursor(cursor)
        key = tuple_(column, UserSession.id)
        stmt = stmt.where(key < (seen_at, seen_id) if descending else key > (seen_at, seen_id))
    rows = list((await session.execute(stmt.limit(size + 1))).all())
    total, accounts = (
        await session.execute(
            select(func.count(), func.count(UserSession.user_id.distinct())).where(live)
        )
    ).one()
    page_rows = rows[:size]
    last = page_rows[-1][0] if page_rows else None
    next_cursor = (
        encode_cursor(getattr(last, column.key).isoformat(), last.id)
        if last is not None and len(rows) > size
        else None
    )
    return ActiveUserSessionPage(
        items=[
            ActiveUserSessionResponse.model_validate(
                {
                    **UserSessionResponse.model_validate(row, from_attributes=True).model_dump(),
                    "username": username,
                    "display_name": display_name,
                }
            )
            for row, username, display_name in page_rows
        ],
        next_cursor=next_cursor,
        total=total,
        account_count=accounts,
    )


async def revoke_session(session: AsyncSession, *, actor: User, user_session_id: uuid.UUID) -> None:
    found = await session.get(UserSession, user_session_id)
    if found is None:
        raise NotFoundError(detail="session does not exist")
    await session.delete(found)
    await audit.record(
        session,
        action="session_revoked",
        user_id=actor.id,
        resource_type="user_session",
        resource_id=user_session_id,
    )
