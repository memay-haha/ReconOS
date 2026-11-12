"""Assigning Users to a program, each endpoint against every role."""

import uuid
from collections.abc import Awaitable, Callable

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import AuditLog
from app.core.identity import User, UserRole
from app.program.models import ProgramStatus, ProgramUser
from tests.factories import assign, make_program

HEADERS = {"origin": "https://reconos.example.com", "sec-fetch-site": "same-origin"}
LoggedIn = Callable[..., Awaitable[User]]
UserFactory = Callable[..., Awaitable[User]]
API = "/api/v1"
BY_ROLE = [(UserRole.SUPERADMIN, True), (UserRole.ADMIN, True), (UserRole.USER, False)]


async def _actions(session: AsyncSession) -> list[AuditLog]:
    return list((await session.scalars(select(AuditLog).order_by(AuditLog.created_at))).all())


@pytest.mark.parametrize(("role", "allowed"), BY_ROLE)
async def test_list_assignments_by_role(
    client: AsyncClient,
    logged_in: LoggedIn,
    db_session: AsyncSession,
    user_factory: UserFactory,
    role: UserRole,
    allowed: bool,
) -> None:
    actor = await logged_in(role)
    program = await make_program(db_session)
    member = await user_factory()
    await assign(db_session, program, member.id)
    if role == UserRole.USER:
        await assign(db_session, program, actor.id)
    response = await client.get(f"{API}/programs/{program.id}/users")
    assert response.status_code == (200 if allowed else 403)
    if allowed:
        [row] = response.json()["items"]
        assert row["user_id"] == str(member.id)
        assert row["program_id"] == str(program.id)
        assert set(row) == {"program_id", "user_id", "assigned_by", "assigned_at"}


async def test_list_assignments_pages(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession, user_factory: UserFactory
) -> None:
    await logged_in(UserRole.ADMIN)
    program = await make_program(db_session)
    members = [await user_factory() for _ in range(3)]
    for member in members:
        await assign(db_session, program, member.id)
    seen: list[str] = []
    cursor = None
    while True:
        params: dict[str, str | int] = {"limit": 2, **({"cursor": cursor} if cursor else {})}
        body = (await client.get(f"{API}/programs/{program.id}/users", params=params)).json()
        seen += [row["user_id"] for row in body["items"]]
        cursor = body["next_cursor"]
        if cursor is None:
            break
    assert sorted(seen) == sorted(str(m.id) for m in members)


async def test_list_assignments_of_missing_program_is_404(
    client: AsyncClient, logged_in: LoggedIn
) -> None:
    await logged_in(UserRole.ADMIN)
    assert (await client.get(f"{API}/programs/{uuid.uuid4()}/users")).status_code == 404


@pytest.mark.parametrize(("role", "allowed"), BY_ROLE)
async def test_assign_by_role(
    client: AsyncClient,
    logged_in: LoggedIn,
    db_session: AsyncSession,
    user_factory: UserFactory,
    role: UserRole,
    allowed: bool,
) -> None:
    actor = await logged_in(role)
    program = await make_program(db_session)
    member = await user_factory()
    response = await client.post(
        f"{API}/programs/{program.id}/users", json={"user_id": str(member.id)}, headers=HEADERS
    )
    assert response.status_code == (204 if allowed else 403)
    row = await db_session.get(ProgramUser, (program.id, member.id))
    assert (row is not None) is allowed
    if allowed:
        assert row is not None
        assert row.assigned_by == actor.id
        [entry] = [e for e in await _actions(db_session) if e.action == "program_user_assigned"]
        assert entry.program_id == program.id
        assert entry.resource_id == member.id


async def test_assigned_user_then_sees_the_program(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession, user_factory: UserFactory
) -> None:
    viewer = await logged_in(UserRole.USER)
    program = await make_program(db_session)
    assert (await client.get(f"{API}/programs/{program.id}")).status_code == 404
    await assign(db_session, program, viewer.id)
    assert (await client.get(f"{API}/programs/{program.id}")).status_code == 200


async def test_assign_twice_conflicts(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession, user_factory: UserFactory
) -> None:
    await logged_in(UserRole.ADMIN)
    program = await make_program(db_session)
    member = await user_factory()
    await assign(db_session, program, member.id)
    response = await client.post(
        f"{API}/programs/{program.id}/users", json={"user_id": str(member.id)}, headers=HEADERS
    )
    assert response.status_code == 409
    assert response.json()["errors"] == [{"field": "user_id", "code": "already_exists"}]


@pytest.mark.parametrize("role", [UserRole.SUPERADMIN, UserRole.ADMIN])
async def test_only_user_accounts_are_assignable(
    client: AsyncClient,
    logged_in: LoggedIn,
    db_session: AsyncSession,
    user_factory: UserFactory,
    role: UserRole,
) -> None:
    await logged_in(UserRole.ADMIN)
    program = await make_program(db_session)
    target = await user_factory(role=role)
    response = await client.post(
        f"{API}/programs/{program.id}/users", json={"user_id": str(target.id)}, headers=HEADERS
    )
    assert response.status_code == 422
    assert response.json()["errors"] == [{"field": "user_id", "code": "role_not_assignable"}]


async def test_assign_unknown_account_is_422(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    await logged_in(UserRole.ADMIN)
    program = await make_program(db_session)
    response = await client.post(
        f"{API}/programs/{program.id}/users", json={"user_id": str(uuid.uuid4())}, headers=HEADERS
    )
    assert response.status_code == 422
    assert response.json()["errors"] == [{"field": "user_id", "code": "not_found"}]


async def test_assign_to_missing_program_is_404(
    client: AsyncClient, logged_in: LoggedIn, user_factory: UserFactory
) -> None:
    await logged_in(UserRole.ADMIN)
    member = await user_factory()
    response = await client.post(
        f"{API}/programs/{uuid.uuid4()}/users", json={"user_id": str(member.id)}, headers=HEADERS
    )
    assert response.status_code == 404


async def test_assignment_allowed_on_archived_program(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession, user_factory: UserFactory
) -> None:
    # Archived data stays readable, so who may read it can still change.
    await logged_in(UserRole.ADMIN)
    program = await make_program(db_session, status=ProgramStatus.ARCHIVED)
    member = await user_factory()
    response = await client.post(
        f"{API}/programs/{program.id}/users", json={"user_id": str(member.id)}, headers=HEADERS
    )
    assert response.status_code == 204


@pytest.mark.parametrize(("role", "allowed"), BY_ROLE)
async def test_unassign_by_role(
    client: AsyncClient,
    logged_in: LoggedIn,
    db_session: AsyncSession,
    user_factory: UserFactory,
    role: UserRole,
    allowed: bool,
) -> None:
    await logged_in(role)
    program = await make_program(db_session)
    member = await user_factory()
    await assign(db_session, program, member.id)
    response = await client.delete(
        f"{API}/programs/{program.id}/users/{member.id}", headers=HEADERS
    )
    assert response.status_code == (204 if allowed else 403)
    await db_session.flush()
    db_session.expunge_all()
    still = await db_session.get(ProgramUser, (program.id, member.id))
    assert (still is None) is allowed
    if allowed:
        actions = [e.action for e in await _actions(db_session)]
        assert actions.count("program_user_unassigned") == 1


async def test_unassign_not_assigned_is_404(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession, user_factory: UserFactory
) -> None:
    await logged_in(UserRole.ADMIN)
    program = await make_program(db_session)
    member = await user_factory()
    response = await client.delete(
        f"{API}/programs/{program.id}/users/{member.id}", headers=HEADERS
    )
    assert response.status_code == 404
