"""Programs, the Users assigned to them and their proxies: docs/architecture/modules.md.

Other modules reach a program through `get_program` and `get_writable_program`,
which apply the assignment filter and the read-only rule of archived programs,
so a module never re-implements either: docs/security/authorization.md.
"""

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Literal

from sqlalchemy import (
    ColumnElement,
    DateTime,
    Integer,
    ScalarSelect,
    Select,
    and_,
    cast,
    column,
    func,
    literal,
    null,
    or_,
    select,
    table,
    tuple_,
    update,
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute

from app.core import audit
from app.core.audit import AuditLog
from app.core.crypto import decrypt, encrypt
from app.core.errors import BadRequestError, ConflictError, NotFoundError, ValidationFailedError
from app.core.identity import User, UserRole
from app.core.pagination import (
    MAX_LIMIT,
    Page,
    contains_ignore_case,
    decode_cursor,
    decode_time_cursor,
    encode_cursor,
)
from app.core.security import program_visible_to
from app.program.models import Program, ProgramStatus, ProgramUser, Proxy
from app.program.schemas import (
    ProgramAction,
    ProgramListStatus,
    ProgramResponse,
    ProgramRowResponse,
    ProgramSort,
    ProgramUserResponse,
    ProxyResponse,
)

# Associated data of every proxy ciphertext: app/core/crypto.py.
PROXY_URL_CONTEXT = "proxy.url_encrypted"

# scope_rule belongs to scope, one tier up. It is read by table name and its
# model is never imported: docs/architecture/dependency-graph.md.
_scope_rule = table("scope_rule", column("program_id"), column("scope_type"))
# job is two tiers up; the same rule applies.
_job = table("job", column("id"), column("proxy_id"), column("status"))
_UNFINISHED_JOB_STATUSES = ("pending_approval", "queued", "dispatched", "running")


def _rule_count(scope_type: str) -> ScalarSelect[int]:
    return (
        select(func.count())
        .select_from(_scope_rule)
        .where(_scope_rule.c.program_id == Program.id, _scope_rule.c.scope_type == scope_type)
        .correlate(Program)
        .scalar_subquery()
    )


_IN_SCOPE_RULE_COUNT = _rule_count("in_scope")
_OUT_OF_SCOPE_RULE_COUNT = _rule_count("out_of_scope")
# The domain, finding and job tables arrive in later batches. Until then the
# sort keys and filters built on them read as "nothing yet", so the endpoint
# already accepts every documented parameter: docs/api/openapi.yaml.
_DOMAIN_COUNT: ColumnElement[int] = literal(0, Integer)
_FINDING_CRITICAL_COUNT: ColumnElement[int] = literal(0, Integer)
_LAST_JOB_FINISHED_AT: ColumnElement[datetime] = cast(null(), DateTime(timezone=True))
# Stands in for "never" so a descending keyset over a nullable time stays total.
_NEVER = datetime(1, 1, 1, tzinfo=UTC)


@dataclass(frozen=True)
class _SortKey:
    expression: ColumnElement[Any] | InstrumentedAttribute[Any]
    descending: bool
    kind: Literal["text", "int", "time"]


_SORT_KEYS: dict[str, _SortKey] = {
    "name": _SortKey(Program.name, descending=False, kind="text"),
    "-domain_count": _SortKey(_DOMAIN_COUNT, descending=True, kind="int"),
    "-finding_critical_count": _SortKey(_FINDING_CRITICAL_COUNT, descending=True, kind="int"),
    "-last_job_finished_at": _SortKey(
        func.coalesce(_LAST_JOB_FINISHED_AT, literal(_NEVER, DateTime(timezone=True))),
        descending=True,
        kind="time",
    ),
}

# Allowed source statuses and the target of each status action:
# docs/architecture/business-flow.md.
_TRANSITIONS: dict[str, tuple[frozenset[str], ProgramStatus]] = {
    "pause": (frozenset({ProgramStatus.ACTIVE}), ProgramStatus.PAUSED),
    "resume": (frozenset({ProgramStatus.PAUSED}), ProgramStatus.ACTIVE),
    "archive": (frozenset({ProgramStatus.ACTIVE, ProgramStatus.PAUSED}), ProgramStatus.ARCHIVED),
}
_ACTION_AUDIT = {
    "pause": "program_paused",
    "resume": "program_resumed",
    "archive": "program_archived",
}


def _clamp(limit: int) -> int:
    return max(1, min(limit, MAX_LIMIT))


async def _flush_unique(
    session: AsyncSession,
    *,
    field: str,
    detail: str,
    clash: Select[uuid.UUID] | None,
) -> None:
    """Flush the pending write, answering 409 when it repeats a unique key.

    `clash` finds an existing row with the same key, so the common case is
    answered without a failed statement. The savepoint still covers a
    concurrent insert of the same key between that read and the flush.
    """
    conflict = ConflictError(detail=detail, errors=[{"field": field, "code": "already_exists"}])
    if clash is not None:
        with session.no_autoflush:
            if await session.scalar(clash.limit(1)) is not None:
                raise conflict
    try:
        async with session.begin_nested():
            await session.flush()
    except IntegrityError as err:
        raise conflict from err


# --- reading a program ----------------------------------------------------------


async def get_program(
    session: AsyncSession, *, viewer: User, program_id: uuid.UUID, lock: bool = False
) -> Program:
    """The program, or 404 when it does not exist or the viewer may not see it.

    Both cases answer the same error, so a User cannot probe which programs
    exist: docs/security/authorization.md.
    """
    stmt = select(Program).where(Program.id == program_id, program_visible_to(viewer, Program.id))
    program = await session.scalar(stmt.with_for_update() if lock else stmt)
    if program is None:
        raise NotFoundError(detail="program does not exist")
    return program


async def get_writable_program(
    session: AsyncSession, *, viewer: User, program_id: uuid.UUID
) -> Program:
    """The program, locked, refusing an archived one: its data is read only.

    The row lock keeps a concurrent archive from slipping in between this check
    and the caller's write.
    """
    program = await get_program(session, viewer=viewer, program_id=program_id, lock=True)
    if program.status == ProgramStatus.ARCHIVED:
        raise ConflictError(detail="program is archived and read only")
    return program


def _row_select() -> Select[Program, int, int, str]:
    return (
        select(
            Program,
            _IN_SCOPE_RULE_COUNT.label("in_scope_rule_count"),
            _OUT_OF_SCOPE_RULE_COUNT.label("out_of_scope_rule_count"),
            User.username.label("created_by_username"),
        )
        .select_from(Program)
        .outerjoin(User, User.id == Program.created_by)
    )


def _row(
    program: Program, in_scope: int, out_of_scope: int, username: str | None
) -> ProgramRowResponse:
    return ProgramRowResponse.model_validate(
        {
            **ProgramResponse.model_validate(program).model_dump(),
            "in_scope_rule_count": in_scope,
            "out_of_scope_rule_count": out_of_scope,
            "created_by_username": username,
        }
    )


async def get_program_row(
    session: AsyncSession, *, viewer: User, program_id: uuid.UUID
) -> ProgramRowResponse:
    row = (
        await session.execute(
            _row_select().where(Program.id == program_id, program_visible_to(viewer, Program.id))
        )
    ).first()
    if row is None:
        raise NotFoundError(detail="program does not exist")
    return _row(row[0], row[1], row[2], row[3])


def _list_filter(
    viewer: User,
    status: ProgramListStatus | None,
    q: str | None,
    has_in_scope_rule: bool | None,
    has_domain: bool | None,
) -> ColumnElement[bool]:
    clauses: list[ColumnElement[bool]] = [
        program_visible_to(viewer, Program.id),
        Program.status != ProgramStatus.ARCHIVED,
    ]
    if status is not None:
        clauses.append(Program.status == status)
    if q:
        clauses.append(
            or_(
                contains_ignore_case(Program.name, q),
                contains_ignore_case(Program.platform, q),
                contains_ignore_case(Program.platform_handle, q),
                contains_ignore_case(Program.description, q),
            )
        )
    if has_in_scope_rule is not None:
        clauses.append(_IN_SCOPE_RULE_COUNT > 0 if has_in_scope_rule else _IN_SCOPE_RULE_COUNT == 0)
    if has_domain is not None:
        clauses.append(_DOMAIN_COUNT > 0 if has_domain else _DOMAIN_COUNT == 0)
    return and_(*clauses)


def _decode_sort_cursor(cursor: str, key: _SortKey) -> tuple[Any, uuid.UUID]:
    """decode_cursor checks only the shape, so the value type is checked here."""
    if key.kind == "time":
        return decode_time_cursor(cursor)
    value, row_id = decode_cursor(cursor)
    expected_type = str if key.kind == "text" else int
    if not isinstance(value, expected_type) or isinstance(value, bool):
        raise BadRequestError(detail="cursor is not valid")
    return value, row_id


def _encode_sort_cursor(value: str | int | datetime, row_id: uuid.UUID) -> str:
    if isinstance(value, datetime):
        # asyncpg hands the year-1 stand-in back without a zone; it is UTC.
        moment = value if value.tzinfo is not None else value.replace(tzinfo=UTC)
        return encode_cursor(moment.isoformat(), row_id)
    return encode_cursor(value, row_id)


async def list_programs(
    session: AsyncSession,
    *,
    viewer: User,
    limit: int,
    cursor: str | None,
    sort: ProgramSort,
    status: ProgramListStatus | None = None,
    q: str | None = None,
    has_in_scope_rule: bool | None = None,
    has_domain: bool | None = None,
) -> Page[ProgramRowResponse]:
    size = _clamp(limit)
    where = _list_filter(viewer, status, q, has_in_scope_rule, has_domain)
    key = _SORT_KEYS[sort]
    keyset = tuple_(key.expression, Program.id)
    order = (
        (key.expression.desc(), Program.id.desc())
        if key.descending
        else (key.expression.asc(), Program.id.asc())
    )
    stmt = (
        _row_select().add_columns(key.expression.label("sort_value")).where(where).order_by(*order)
    )
    if cursor is not None:
        seen_value, seen_id = _decode_sort_cursor(cursor, key)
        stmt = stmt.where(
            keyset < (seen_value, seen_id) if key.descending else keyset > (seen_value, seen_id)
        )
    rows = list((await session.execute(stmt.limit(size + 1))).all())
    total = await session.scalar(select(func.count()).select_from(Program).where(where)) or 0
    page_rows = rows[:size]
    next_cursor = (
        _encode_sort_cursor(page_rows[-1][4], page_rows[-1][0].id) if len(rows) > size else None
    )
    return Page[ProgramRowResponse](
        items=[_row(r[0], r[1], r[2], r[3]) for r in page_rows],
        next_cursor=next_cursor,
        total=total,
    )


# --- writing a program ----------------------------------------------------------


async def create_program(session: AsyncSession, *, actor: User, fields: dict[str, Any]) -> Program:
    program = Program(**fields, created_by=actor.id)
    session.add(program)
    await _flush_unique(
        session,
        field="name",
        detail="program name is already taken",
        clash=select(Program.id).where(Program.name == program.name),
    )
    await session.refresh(program)
    await audit.record(
        session,
        action="program_created",
        user_id=actor.id,
        program_id=program.id,
        resource_type="program",
        resource_id=program.id,
    )
    return program


async def update_program(
    session: AsyncSession, *, actor: User, program_id: uuid.UUID, changes: dict[str, Any]
) -> Program:
    program = await get_writable_program(session, viewer=actor, program_id=program_id)
    for name, value in changes.items():
        setattr(program, name, value)
    await _flush_unique(
        session,
        field="name",
        detail="program name is already taken",
        clash=(
            select(Program.id).where(Program.name == program.name, Program.id != program.id)
            if "name" in changes
            else None
        ),
    )
    await session.refresh(program)
    await audit.record(
        session,
        action="program_updated",
        user_id=actor.id,
        program_id=program.id,
        resource_type="program",
        resource_id=program.id,
        detail={"fields": sorted(changes)},
    )
    return program


async def _locked_programs(
    session: AsyncSession, *, viewer: User, program_ids: Sequence[uuid.UUID]
) -> list[Program]:
    """Every listed program, locked, or 404 when any is missing: all or nothing."""
    wanted = set(program_ids)
    rows = list(
        (
            await session.scalars(
                select(Program)
                .where(Program.id.in_(wanted), program_visible_to(viewer, Program.id))
                .order_by(Program.id)
                .with_for_update()
            )
        ).all()
    )
    if len(rows) != len(wanted):
        raise NotFoundError(detail="program does not exist")
    return rows


async def change_status(
    session: AsyncSession,
    *,
    actor: User,
    program_ids: Sequence[uuid.UUID],
    action: ProgramAction,
) -> None:
    """Pause, resume or archive one program or many, all or nothing.

    Rows are locked before the status check, so two concurrent requests cannot
    both see the old status and both apply the change.
    """
    sources, target = _TRANSITIONS[action]
    programs = await _locked_programs(session, viewer=actor, program_ids=program_ids)
    if any(program.status not in sources for program in programs):
        raise ConflictError(detail=f"program status does not allow {action}")
    now = datetime.now(UTC)
    for program in programs:
        program.status = target.value
        if target is ProgramStatus.ARCHIVED:
            program.archived_at = now
        await audit.record(
            session,
            action=_ACTION_AUDIT[action],
            user_id=actor.id,
            program_id=program.id,
            resource_type="program",
            resource_id=program.id,
        )


async def delete_programs(
    session: AsyncSession, *, actor: User, program_ids: Sequence[uuid.UUID]
) -> None:
    """Hard delete. Rows with a program_id go with it through ON DELETE CASCADE.

    The audit trail stays, detached from the program: docs/data/database.md.
    """
    programs = await _locked_programs(session, viewer=actor, program_ids=program_ids)
    ids = [program.id for program in programs]
    await session.execute(
        update(AuditLog).where(AuditLog.program_id.in_(ids)).values(program_id=None)
    )
    for program in programs:
        await audit.record(
            session,
            action="program_deleted",
            user_id=actor.id,
            resource_type="program",
            resource_id=program.id,
            detail={"name": program.name},
        )
    for program in programs:
        await session.delete(program)
    await session.flush()


# --- assigned Users -------------------------------------------------------------


async def list_program_users(
    session: AsyncSession, *, viewer: User, program_id: uuid.UUID, limit: int, cursor: str | None
) -> Page[ProgramUserResponse]:
    await get_program(session, viewer=viewer, program_id=program_id)
    size = _clamp(limit)
    stmt = (
        select(ProgramUser)
        .where(ProgramUser.program_id == program_id)
        .order_by(ProgramUser.assigned_at.desc(), ProgramUser.user_id.desc())
    )
    if cursor is not None:
        seen_at, seen_id = decode_time_cursor(cursor)
        stmt = stmt.where(tuple_(ProgramUser.assigned_at, ProgramUser.user_id) < (seen_at, seen_id))
    rows = list((await session.scalars(stmt.limit(size + 1))).all())
    total = (
        await session.scalar(
            select(func.count())
            .select_from(ProgramUser)
            .where(ProgramUser.program_id == program_id)
        )
        or 0
    )
    page_rows = rows[:size]
    next_cursor = (
        encode_cursor(page_rows[-1].assigned_at.isoformat(), page_rows[-1].user_id)
        if len(rows) > size
        else None
    )
    return Page[ProgramUserResponse](
        items=[ProgramUserResponse.model_validate(row) for row in page_rows],
        next_cursor=next_cursor,
        total=total,
    )


async def assign_user(
    session: AsyncSession, *, actor: User, program_id: uuid.UUID, user_id: uuid.UUID
) -> None:
    # An archived program stays assignable: its data is still read, and this
    # decides who reads it.
    program = await get_program(session, viewer=actor, program_id=program_id)
    target = await session.get(User, user_id)
    if target is None:
        raise ValidationFailedError(
            detail="account does not exist", errors=[{"field": "user_id", "code": "not_found"}]
        )
    if target.role != UserRole.USER:
        # Admin and Superadmin already see every program: docs/data/schema.md.
        raise ValidationFailedError(
            detail="only accounts with the user role are assigned to programs",
            errors=[{"field": "user_id", "code": "role_not_assignable"}],
        )
    session.add(ProgramUser(program_id=program.id, user_id=target.id, assigned_by=actor.id))
    await _flush_unique(
        session,
        field="user_id",
        detail="account is already assigned",
        clash=select(ProgramUser.user_id).where(
            ProgramUser.program_id == program.id, ProgramUser.user_id == target.id
        ),
    )
    await audit.record(
        session,
        action="program_user_assigned",
        user_id=actor.id,
        program_id=program.id,
        resource_type="user",
        resource_id=target.id,
    )


async def unassign_user(
    session: AsyncSession, *, actor: User, program_id: uuid.UUID, user_id: uuid.UUID
) -> None:
    program = await get_program(session, viewer=actor, program_id=program_id)
    assignment = await session.get(ProgramUser, (program.id, user_id))
    if assignment is None:
        raise NotFoundError(detail="account is not assigned to this program")
    await session.delete(assignment)
    await audit.record(
        session,
        action="program_user_unassigned",
        user_id=actor.id,
        program_id=program.id,
        resource_type="user",
        resource_id=user_id,
    )


# --- proxies --------------------------------------------------------------------


async def list_proxies(
    session: AsyncSession, *, viewer: User, program_id: uuid.UUID, limit: int, cursor: str | None
) -> Page[ProxyResponse]:
    await get_program(session, viewer=viewer, program_id=program_id)
    size = _clamp(limit)
    stmt = (
        select(Proxy)
        .where(Proxy.program_id == program_id)
        .order_by(Proxy.created_at.desc(), Proxy.id.desc())
    )
    if cursor is not None:
        seen_at, seen_id = decode_time_cursor(cursor)
        stmt = stmt.where(tuple_(Proxy.created_at, Proxy.id) < (seen_at, seen_id))
    rows = list((await session.scalars(stmt.limit(size + 1))).all())
    total = (
        await session.scalar(
            select(func.count()).select_from(Proxy).where(Proxy.program_id == program_id)
        )
        or 0
    )
    page_rows = rows[:size]
    next_cursor = (
        encode_cursor(page_rows[-1].created_at.isoformat(), page_rows[-1].id)
        if len(rows) > size
        else None
    )
    return Page[ProxyResponse](
        items=[ProxyResponse.model_validate(row) for row in page_rows],
        next_cursor=next_cursor,
        total=total,
    )


async def create_proxy(
    session: AsyncSession,
    *,
    actor: User,
    program_id: uuid.UUID,
    name: str,
    url: str,
    is_enabled: bool,
) -> Proxy:
    program = await get_writable_program(session, viewer=actor, program_id=program_id)
    proxy = Proxy(
        program_id=program.id,
        name=name,
        url_encrypted=encrypt(url, context=PROXY_URL_CONTEXT),
        is_enabled=is_enabled,
    )
    session.add(proxy)
    await _flush_unique(
        session,
        field="name",
        detail="proxy name is already taken",
        clash=select(Proxy.id).where(Proxy.program_id == program.id, Proxy.name == name),
    )
    await session.refresh(proxy)
    # The detail names the proxy, never its URL: .claude/rules/security.md.
    await audit.record(
        session,
        action="proxy_created",
        user_id=actor.id,
        program_id=program.id,
        resource_type="proxy",
        resource_id=proxy.id,
        detail={"name": name},
    )
    return proxy


async def _writable_proxy(session: AsyncSession, *, actor: User, proxy_id: uuid.UUID) -> Proxy:
    proxy = await session.get(Proxy, proxy_id)
    if proxy is None:
        raise NotFoundError(detail="proxy does not exist")
    await get_writable_program(session, viewer=actor, program_id=proxy.program_id)
    return proxy


async def update_proxy(
    session: AsyncSession,
    *,
    actor: User,
    proxy_id: uuid.UUID,
    name: str | None = None,
    url: str | None = None,
    is_enabled: bool | None = None,
) -> Proxy:
    proxy = await _writable_proxy(session, actor=actor, proxy_id=proxy_id)
    changed: list[str] = []
    if name is not None:
        proxy.name = name
        changed.append("name")
    if url is not None:
        proxy.url_encrypted = encrypt(url, context=PROXY_URL_CONTEXT)
        changed.append("url")
    if is_enabled is not None:
        proxy.is_enabled = is_enabled
        changed.append("is_enabled")
    await _flush_unique(
        session,
        field="name",
        detail="proxy name is already taken",
        clash=(
            select(Proxy.id).where(
                Proxy.program_id == proxy.program_id, Proxy.name == name, Proxy.id != proxy.id
            )
            if name is not None
            else None
        ),
    )
    await session.refresh(proxy)
    # Only the names of changed fields: a credential never enters the audit log.
    await audit.record(
        session,
        action="proxy_updated",
        user_id=actor.id,
        program_id=proxy.program_id,
        resource_type="proxy",
        resource_id=proxy.id,
        detail={"fields": sorted(changed)},
    )
    return proxy


async def delete_proxy(session: AsyncSession, *, actor: User, proxy_id: uuid.UUID) -> None:
    proxy = await _writable_proxy(session, actor=actor, proxy_id=proxy_id)
    # A finished job keeps its history with proxy_id set to NULL; an unfinished
    # one would silently run without the proxy it was created with.
    in_use = await session.scalar(
        select(_job.c.id)
        .where(_job.c.proxy_id == proxy.id, _job.c.status.in_(_UNFINISHED_JOB_STATUSES))
        .limit(1)
    )
    if in_use is not None:
        raise ConflictError(detail="an unfinished job still uses this proxy")
    await session.delete(proxy)
    await audit.record(
        session,
        action="proxy_deleted",
        user_id=actor.id,
        program_id=proxy.program_id,
        resource_type="proxy",
        resource_id=proxy.id,
        detail={"name": proxy.name},
    )


# --- proxies used by jobs -------------------------------------------------------


async def require_job_proxy(
    session: AsyncSession, *, program_id: uuid.UUID, proxy_id: uuid.UUID, field: str
) -> None:
    """422 unless the proxy belongs to the program and is enabled."""
    proxy = await session.get(Proxy, proxy_id)
    if proxy is None or proxy.program_id != program_id:
        raise ValidationFailedError(
            detail="proxy does not exist in this program",
            errors=[{"field": field, "code": "not_found"}],
        )
    if not proxy.is_enabled:
        raise ValidationFailedError(
            detail="proxy is disabled", errors=[{"field": field, "code": "proxy_disabled"}]
        )


async def proxy_url_for_job(session: AsyncSession, proxy_id: uuid.UUID) -> str | None:
    """The decrypted proxy URL a claimed job runs through. Never logged (G7)."""
    proxy = await session.get(Proxy, proxy_id)
    if proxy is None:
        return None
    return decrypt(proxy.url_encrypted, context=PROXY_URL_CONTEXT)
