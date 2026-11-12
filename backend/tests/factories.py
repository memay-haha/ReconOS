"""Factories for test rows: .claude/rules/testing.md.

Plain functions over the test session, so any test module can import them
without a fixture. Names use reserved documentation values only.
"""

import itertools
import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import encrypt
from app.program.models import Program, ProgramStatus, ProgramUser, Proxy
from app.scope.models import ScopeRule

_counter = itertools.count()


async def make_program(
    session: AsyncSession,
    *,
    name: str | None = None,
    status: ProgramStatus = ProgramStatus.ACTIVE,
    created_by: uuid.UUID | None = None,
    **columns: object,
) -> Program:
    program = Program(
        name=name or f"program-{next(_counter)}-{uuid.uuid4().hex[:8]}",
        bounty_type=str(columns.pop("bounty_type", "bounty")),
        status=status.value,
        created_by=created_by,
        **columns,
    )
    if status is ProgramStatus.ARCHIVED:
        program.archived_at = datetime.now(UTC)
    session.add(program)
    await session.flush()
    return program


async def assign(session: AsyncSession, program: Program, user_id: uuid.UUID) -> None:
    session.add(ProgramUser(program_id=program.id, user_id=user_id))
    await session.flush()


async def make_proxy(
    session: AsyncSession,
    program: Program,
    *,
    name: str | None = None,
    url: str = "http://198.51.100.10:3128",
    is_enabled: bool = True,
) -> Proxy:
    proxy = Proxy(
        program_id=program.id,
        name=name or f"proxy-{next(_counter)}",
        url_encrypted=encrypt(url, context="proxy.url_encrypted"),
        is_enabled=is_enabled,
    )
    session.add(proxy)
    await session.flush()
    return proxy


async def make_scope_rule(
    session: AsyncSession,
    program: Program,
    value: str = "example.com",
    *,
    scope_type: str = "in_scope",
    rule_type: str = "domain",
    reason: str | None = None,
) -> ScopeRule:
    """A rule written as given, without the service's canonicalisation."""
    rule = ScopeRule(
        program_id=program.id,
        scope_type=scope_type,
        rule_type=rule_type,
        value=value,
        reason=reason,
    )
    session.add(rule)
    await session.flush()
    return rule
