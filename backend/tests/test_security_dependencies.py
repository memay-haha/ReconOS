from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import Request
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.core.config import Settings
from app.core.errors import ForbiddenError, UnauthenticatedError
from app.core.identity import User, UserRole, UserSession
from app.core.security import (
    ALL_PROGRAMS,
    allowed_program_ids,
    hash_session_id,
    load_current_user,
    new_session_id,
    require_roles,
)

SettingsFactory = Callable[..., Settings]
RequestFactory = Callable[..., Request]
UserFactory = Callable[..., Awaitable[User]]


async def make_session(
    db_session: AsyncSession, user: User, *, idle_minutes: int = 0, expired: bool = False
) -> str:
    session_id = new_session_id()
    now = datetime.now(UTC)
    db_session.add(
        UserSession(
            user_id=user.id,
            session_hash=hash_session_id(session_id),
            last_seen_at=now - timedelta(minutes=idle_minutes),
            expires_at=now - timedelta(hours=1) if expired else now + timedelta(hours=12),
        )
    )
    await db_session.flush()
    return session_id


async def test_no_cookie_is_unauthenticated(
    db_session: AsyncSession, settings_factory: SettingsFactory, request_factory: RequestFactory
) -> None:
    with pytest.raises(UnauthenticatedError):
        await load_current_user(request_factory(), db_session, settings_factory())


async def test_valid_cookie_returns_the_account(
    db_session: AsyncSession,
    settings_factory: SettingsFactory,
    request_factory: RequestFactory,
    user_factory: UserFactory,
) -> None:
    user = await user_factory(role=UserRole.ADMIN)
    session_id = await make_session(db_session, user)
    found = await load_current_user(
        request_factory(session_id=session_id), db_session, settings_factory()
    )
    assert found.id == user.id


async def test_absolute_expiry_rejects(
    db_session: AsyncSession,
    settings_factory: SettingsFactory,
    request_factory: RequestFactory,
    user_factory: UserFactory,
) -> None:
    user = await user_factory()
    session_id = await make_session(db_session, user, expired=True)
    with pytest.raises(UnauthenticatedError):
        await load_current_user(
            request_factory(session_id=session_id), db_session, settings_factory()
        )


async def test_idle_expiry_rejects(
    db_session: AsyncSession,
    settings_factory: SettingsFactory,
    request_factory: RequestFactory,
    user_factory: UserFactory,
) -> None:
    user = await user_factory()
    session_id = await make_session(db_session, user, idle_minutes=31)
    with pytest.raises(UnauthenticatedError):
        await load_current_user(
            request_factory(session_id=session_id), db_session, settings_factory()
        )


async def test_locked_account_rejects(
    db_session: AsyncSession,
    settings_factory: SettingsFactory,
    request_factory: RequestFactory,
    user_factory: UserFactory,
) -> None:
    user = await user_factory(is_locked=True)
    session_id = await make_session(db_session, user)
    with pytest.raises(UnauthenticatedError):
        await load_current_user(
            request_factory(session_id=session_id), db_session, settings_factory()
        )


async def test_unknown_cookie_rejects(
    db_session: AsyncSession, settings_factory: SettingsFactory, request_factory: RequestFactory
) -> None:
    with pytest.raises(UnauthenticatedError):
        await load_current_user(
            request_factory(session_id=new_session_id()), db_session, settings_factory()
        )


async def test_valid_request_refreshes_last_seen(
    db_session: AsyncSession,
    settings_factory: SettingsFactory,
    request_factory: RequestFactory,
    user_factory: UserFactory,
) -> None:
    user = await user_factory()
    session_id = await make_session(db_session, user, idle_minutes=10)
    before = datetime.now(UTC) - timedelta(minutes=1)
    await load_current_user(request_factory(session_id=session_id), db_session, settings_factory())
    stored = (
        await db_session.execute(
            select(UserSession).where(UserSession.session_hash == hash_session_id(session_id))
        )
    ).scalar_one()
    assert stored.last_seen_at > before


async def test_role_guard_allows_and_denies(
    db_session: AsyncSession, user_factory: UserFactory
) -> None:
    admin = await user_factory(role=UserRole.ADMIN)
    guard = require_roles(UserRole.SUPERADMIN)
    with pytest.raises(ForbiddenError):
        await guard(admin, db_session)
    allow = require_roles(UserRole.ADMIN, UserRole.SUPERADMIN)
    assert (await allow(admin, db_session)).id == admin.id


async def test_denial_is_audited_and_survives_rollback(
    db_engine: AsyncEngine, db_session: AsyncSession, user_factory: UserFactory
) -> None:
    user = await user_factory(role=UserRole.USER)
    with pytest.raises(ForbiddenError):
        await require_roles(UserRole.SUPERADMIN)(user, db_session)
    # A separate connection cannot see db_session's uncommitted work, so finding
    # the row proves it was committed on its own and survives the rollback.
    async with db_engine.connect() as connection:
        count = (
            await connection.execute(
                text("SELECT count(*) FROM audit_log WHERE action = 'permission_denied'")
            )
        ).scalar_one()
    assert count == 1


async def test_program_filter_skeleton(user_factory: UserFactory) -> None:
    assert await allowed_program_ids(await user_factory(role=UserRole.SUPERADMIN)) is ALL_PROGRAMS
    assert await allowed_program_ids(await user_factory(role=UserRole.ADMIN)) is ALL_PROGRAMS
    assert await allowed_program_ids(await user_factory(role=UserRole.USER)) == frozenset()
