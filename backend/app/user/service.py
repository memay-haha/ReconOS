"""Accounts, sessions and the login flow: docs/security/authentication.md."""

import math
from datetime import UTC, datetime, timedelta
from typing import NamedTuple

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute

from app.audit_log import service as audit_service
from app.core.db import independent_session
from app.core.errors import RateLimitedError, UnauthenticatedError
from app.core.identity import User, UserSession
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
        .offset((drop or 0) - limit)
        .limit(1)
    )
    if pivot is None:
        return int(window.total_seconds())
    return max(1, math.ceil((pivot + window - datetime.now(UTC)).total_seconds()))


async def check_login_allowed(session: AsyncSession, username: str, ip_address: str) -> None:
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


async def record_failed_login(username: str, ip_address: str) -> None:
    """Separate transaction: the request itself ends in 401 and rolls back."""
    async with independent_session() as session:
        session.add(LoginAttempt(username=username, ip_address=ip_address))
        await audit_service.record(
            session, action="login_failed", detail={"username": username}, ip_address=ip_address
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
    await audit_service.record(
        session, action="login_succeeded", user_id=user.id, ip_address=ip_address
    )
    return LoginResult(session_id, hours * 3600)


async def logout(session: AsyncSession, *, user: User, session_id: str) -> None:
    await session.execute(
        delete(UserSession).where(UserSession.session_hash == hash_session_id(session_id))
    )
    await audit_service.record(session, action="logout", user_id=user.id)


async def change_password(
    session: AsyncSession, *, user: User, current_password: str, new_password: str, session_id: str
) -> None:
    if not verify_password(user.password_hash, current_password):
        raise UnauthenticatedError(detail="current password does not match")
    check_password_policy(new_password, user_inputs=[user.username, user.display_name])
    user.password_hash = hash_password(new_password)
    await session.execute(
        delete(UserSession).where(
            UserSession.user_id == user.id,
            UserSession.session_hash != hash_session_id(session_id),
        )
    )
    await audit_service.record(session, action="password_changed", user_id=user.id)
