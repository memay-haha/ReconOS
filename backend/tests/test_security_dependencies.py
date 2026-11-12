import json
import uuid
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import Request
from sqlalchemy import select, text, true
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
    program_visible_to,
    require_roles,
)
from app.program.models import Program, ProgramUser

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
    request_factory: RequestFactory, user_factory: UserFactory
) -> None:
    admin = await user_factory(role=UserRole.ADMIN)
    guard = require_roles(UserRole.SUPERADMIN)
    with pytest.raises(ForbiddenError):
        await guard(admin, request_factory())
    allow = require_roles(UserRole.ADMIN, UserRole.SUPERADMIN)
    assert (await allow(admin, request_factory())).id == admin.id


async def test_denial_is_audited_and_survives_rollback(
    db_engine: AsyncEngine, request_factory: RequestFactory, user_factory: UserFactory
) -> None:
    user = await user_factory(role=UserRole.USER)
    with pytest.raises(ForbiddenError):
        await require_roles(UserRole.SUPERADMIN)(user, request_factory(method="POST"))
    # A separate connection cannot see db_session's uncommitted work, so finding
    # the row proves it was committed on its own and survives the rollback.
    async with db_engine.connect() as connection:
        count = (
            await connection.execute(
                text("SELECT count(*) FROM audit_log WHERE action = 'permission_denied'")
            )
        ).scalar_one()
    assert count == 1


async def test_a_denied_read_is_refused_without_an_audit_row(
    db_engine: AsyncEngine, request_factory: RequestFactory, user_factory: UserFactory
) -> None:
    # A denied read changed nothing, and recording one would let any account
    # fill an append-only table by looping a forbidden GET.
    user = await user_factory(role=UserRole.USER)
    with pytest.raises(ForbiddenError):
        await require_roles(UserRole.SUPERADMIN)(user, request_factory(method="GET"))
    async with db_engine.connect() as connection:
        count = (
            await connection.execute(
                text("SELECT count(*) FROM audit_log WHERE action = 'permission_denied'")
            )
        ).scalar_one()
    assert count == 0


async def test_denial_records_where_it_came_from(
    db_engine: AsyncEngine, user_factory: UserFactory
) -> None:
    user = await user_factory(role=UserRole.USER)
    request = Request(
        {
            "type": "http",
            "method": "POST",
            "headers": [],
            "path": "/api/v1/users",
            "client": ("203.0.113.7", 40000),
        }
    )
    with pytest.raises(ForbiddenError):
        await require_roles(UserRole.SUPERADMIN)(user, request)
    async with db_engine.connect() as connection:
        row = (
            await connection.execute(
                text(
                    "SELECT host(ip_address), detail FROM audit_log"
                    " WHERE action = 'permission_denied'"
                )
            )
        ).one()
    assert row[0] == "203.0.113.7"
    assert row[1] == {"required": ["superadmin"], "method": "POST", "path": "/api/v1/users"}


@pytest.mark.parametrize("role", list(UserRole))
async def test_guard_without_roles_denies_everyone(
    role: UserRole, request_factory: RequestFactory, user_factory: UserFactory
) -> None:
    user = await user_factory(role=role)
    with pytest.raises(ForbiddenError):
        await require_roles()(user, request_factory())


async def test_rejection_causes_are_indistinguishable(
    db_session: AsyncSession,
    settings_factory: SettingsFactory,
    request_factory: RequestFactory,
    user_factory: UserFactory,
) -> None:
    locked = await user_factory(is_locked=True)
    locked_id = await make_session(db_session, locked)
    expired = await user_factory()
    expired_id = await make_session(db_session, expired, expired=True)
    bodies = []
    for request in (
        request_factory(),
        request_factory(session_id=new_session_id()),
        request_factory(session_id=expired_id),
        request_factory(session_id=locked_id),
    ):
        with pytest.raises(UnauthenticatedError) as caught:
            await load_current_user(request, db_session, settings_factory())
        bodies.append(json.dumps(caught.value.to_problem(), sort_keys=True))
    assert len(set(bodies)) == 1


async def test_admin_roles_see_every_program(
    db_session: AsyncSession, user_factory: UserFactory
) -> None:
    for role in (UserRole.SUPERADMIN, UserRole.ADMIN):
        account = await user_factory(role=role)
        assert await allowed_program_ids(db_session, account) is ALL_PROGRAMS
        assert program_visible_to(account, Program.id).compare(true())


async def test_user_sees_only_assigned_programs(
    db_session: AsyncSession, user_factory: UserFactory
) -> None:
    account = await user_factory(role=UserRole.USER)
    other = await user_factory(role=UserRole.USER)
    assigned = Program(name=f"assigned-{uuid.uuid4()}", bounty_type="bounty")
    hidden = Program(name=f"hidden-{uuid.uuid4()}", bounty_type="vdp")
    db_session.add_all([assigned, hidden])
    await db_session.flush()
    db_session.add_all(
        [
            ProgramUser(program_id=assigned.id, user_id=account.id),
            ProgramUser(program_id=hidden.id, user_id=other.id),
        ]
    )
    await db_session.flush()

    assert await allowed_program_ids(db_session, account) == frozenset({assigned.id})
    visible = await db_session.scalars(
        select(Program.id).where(
            Program.id.in_([assigned.id, hidden.id]), program_visible_to(account, Program.id)
        )
    )
    assert set(visible.all()) == {assigned.id}


async def test_user_without_assignment_sees_nothing(
    db_session: AsyncSession, user_factory: UserFactory
) -> None:
    account = await user_factory(role=UserRole.USER)
    assert await allowed_program_ids(db_session, account) == frozenset()
