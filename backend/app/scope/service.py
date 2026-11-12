"""Scope rules of a program and the G5 check: docs/architecture/business-flow.md.

Public API for the modules above (job, dispatcher, asset): `load_rules`,
`decide_target`, `require_in_scope`. They take a program id, never a caller,
because the caller's access to the program is checked where the request
enters, and a scheduled job has no caller at all.
"""

import uuid
from collections.abc import Sequence
from typing import Any

import structlog
from sqlalchemy import delete, func, select, tuple_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import audit
from app.core.errors import (
    ConflictError,
    FieldError,
    NotFoundError,
    TargetOutOfScopeError,
    ValidationFailedError,
)
from app.core.identity import User
from app.core.pagination import MAX_LIMIT, Page, decode_time_cursor, encode_cursor
from app.core.security import program_visible_to
from app.program import service as program_service
from app.scope.matching import (
    InvalidScopeValueError,
    Rule,
    RuleType,
    ScopeDecision,
    ScopeType,
    Verdict,
    decide,
    parse_rule,
)
from app.scope.models import ScopeRule
from app.scope.schemas import (
    ScopeCheckItem,
    ScopeRuleCreateRequest,
    ScopeRuleResponse,
    ScopeRuleSort,
    ScopeRuleUpdateRequest,
)

log = structlog.get_logger()

RESOURCE = "scope_rule"


# ---------------------------------------------------------------- the G5 check


async def load_rules(session: AsyncSession, program_id: uuid.UUID) -> list[Rule]:
    """Every rule of the program, parsed. Fails closed on a stored value it cannot read.

    Values are canonicalised on write, so an unreadable one means the stored
    data predates a stricter parser. Dropping an unreadable In-Scope rule only
    narrows scope. An unreadable Out-of-Scope rule cannot be dropped, since its
    exclusion would vanish, so the program then admits nothing until the rule
    is fixed.
    """
    rows = await session.scalars(
        select(ScopeRule)
        .where(ScopeRule.program_id == program_id)
        .order_by(ScopeRule.created_at, ScopeRule.id)
    )
    rules: list[Rule] = []
    for row in rows:
        try:
            rules.append(parse_rule(ScopeType(row.scope_type), RuleType(row.rule_type), row.value))
        except InvalidScopeValueError as err:
            log.warning(
                "scope_rule_unreadable",
                scope_rule_id=str(row.id),
                program_id=str(program_id),
                code=err.code,
            )
            if row.scope_type == ScopeType.OUT_OF_SCOPE:
                return []
    return rules


async def decide_target(session: AsyncSession, program_id: uuid.UUID, target: str) -> ScopeDecision:
    """The verdict for one target against the program's current rules."""
    return decide(await load_rules(session, program_id), target)


async def require_in_scope(
    session: AsyncSession, program_id: uuid.UUID, targets: Sequence[str], *, field: str = "target"
) -> list[str]:
    """Return the canonical form of every target, or refuse them all (G5).

    The job module calls this before it writes a job, and the dispatcher
    before it hands one out. One refused target refuses the whole call, so a
    batch is never half created. Store the returned form, not the input: it
    is exactly what was checked.
    """
    rules = await load_rules(session, program_id)
    decisions = [decide(rules, target) for target in targets]
    errors: list[FieldError] = [
        {
            "field": f"{field}[{index}]",
            "code": "invalid_target"
            if decision.verdict is Verdict.INVALID_TARGET
            else "target_out_of_scope",
        }
        for index, decision in enumerate(decisions)
        if not decision.allowed
    ]
    if errors or not decisions:
        raise TargetOutOfScopeError(detail=_refusal_detail(decisions), errors=errors or None)
    return [str(decision.target) for decision in decisions]


def _refusal_detail(decisions: Sequence[ScopeDecision]) -> str:
    for decision in decisions:
        if decision.verdict is Verdict.INVALID_TARGET:
            return "target is not a valid domain, IP, CIDR or http(s) URL"
        if decision.verdict is Verdict.OUT_OF_SCOPE_MATCH:
            return f"{decision.target} matches an out-of-scope rule"
        if decision.verdict is Verdict.NO_IN_SCOPE_MATCH:
            return f"{decision.target} does not match any in-scope rule"
    return "no target was given"


async def check_targets(
    session: AsyncSession, *, viewer: User, program_id: uuid.UUID, targets: Sequence[str]
) -> list[ScopeCheckItem]:
    """The scope-check endpoint: a verdict per target, nothing refused or written."""
    await program_service.get_program(session, viewer=viewer, program_id=program_id)
    rules = await load_rules(session, program_id)
    items: list[ScopeCheckItem] = []
    for target in targets:
        decision = decide(rules, target)
        items.append(
            ScopeCheckItem(
                target=target,
                normalized_target=decision.target,
                in_scope=decision.allowed,
                verdict=decision.verdict,
                rule_value=decision.rule_value,
            )
        )
    return items


# ---------------------------------------------------------------- rule CRUD


def _clamp(limit: int) -> int:
    return max(1, min(limit, MAX_LIMIT))


async def list_rules(
    session: AsyncSession,
    *,
    viewer: User,
    program_id: uuid.UUID,
    limit: int,
    cursor: str | None,
    sort: ScopeRuleSort = "created_at",
) -> Page[ScopeRuleResponse]:
    await program_service.get_program(session, viewer=viewer, program_id=program_id)
    size = _clamp(limit)
    descending = sort.startswith("-")
    stmt = select(ScopeRule).where(ScopeRule.program_id == program_id)
    if descending:
        stmt = stmt.order_by(ScopeRule.created_at.desc(), ScopeRule.id.desc())
    else:
        stmt = stmt.order_by(ScopeRule.created_at.asc(), ScopeRule.id.asc())
    if cursor is not None:
        seen_at, seen_id = decode_time_cursor(cursor)
        key = tuple_(ScopeRule.created_at, ScopeRule.id)
        stmt = stmt.where(key < (seen_at, seen_id) if descending else key > (seen_at, seen_id))
    rows = list(await session.scalars(stmt.limit(size + 1)))
    total = await session.scalar(
        select(func.count()).select_from(ScopeRule).where(ScopeRule.program_id == program_id)
    )
    page_rows = rows[:size]
    next_cursor = (
        encode_cursor(page_rows[-1].created_at.isoformat(), page_rows[-1].id)
        if len(rows) > size
        else None
    )
    return Page[ScopeRuleResponse](
        items=[ScopeRuleResponse.model_validate(row) for row in page_rows],
        next_cursor=next_cursor,
        total=total or 0,
    )


def _validated(
    scope_type: ScopeType, rule_type: RuleType, value: str, reason: str | None, *, prefix: str
) -> tuple[str, str | None]:
    """Canonical value and trimmed reason, or a 422 naming the field at fault."""
    clean_reason = reason.strip() if reason is not None else None
    if not clean_reason:
        clean_reason = None
    errors: list[FieldError] = []
    canonical = value
    try:
        canonical = parse_rule(scope_type, rule_type, value).value
    except InvalidScopeValueError as err:
        errors.append({"field": f"{prefix}value", "code": err.code})
    if scope_type is ScopeType.OUT_OF_SCOPE and clean_reason is None:
        # An exclusion nobody can explain later cannot be reviewed.
        errors.append({"field": f"{prefix}reason", "code": "missing"})
    if errors:
        raise ValidationFailedError(detail="scope rule is not valid", errors=errors)
    return canonical, clean_reason


async def _flush_unique(session: AsyncSession) -> None:
    """Flush inside a savepoint so a duplicate surfaces as 409, not 500.

    The unique constraint decides, not a prior SELECT, so two concurrent
    requests adding the same rule cannot both pass.
    """
    try:
        async with session.begin_nested():
            await session.flush()
    except IntegrityError as err:
        raise ConflictError(detail="the program already has this scope rule") from err


type RuleKey = tuple[str, str, str]


def _key(rule: ScopeRule) -> RuleKey:
    return (rule.scope_type, rule.rule_type, rule.value)


async def _refuse_duplicates(
    session: AsyncSession,
    program_id: uuid.UUID,
    candidates: Sequence[tuple[str, RuleKey]],
    *,
    exclude_id: uuid.UUID | None = None,
) -> None:
    """409 naming each value already declared, in the program or earlier in the batch.

    This gives the form a field to point at. The unique constraint, through
    _flush_unique, still settles a race between two requests.
    """
    keys = [key for _, key in candidates]
    stmt = select(ScopeRule.scope_type, ScopeRule.rule_type, ScopeRule.value).where(
        ScopeRule.program_id == program_id,
        tuple_(ScopeRule.scope_type, ScopeRule.rule_type, ScopeRule.value).in_(keys),
    )
    if exclude_id is not None:
        stmt = stmt.where(ScopeRule.id != exclude_id)
    seen: set[RuleKey] = {(row[0], row[1], row[2]) for row in await session.execute(stmt)}
    errors: list[FieldError] = []
    for prefix, key in candidates:
        if key in seen:
            errors.append({"field": f"{prefix}value", "code": "already_exists"})
        seen.add(key)
    if errors:
        raise ConflictError(detail="the program already has this scope rule", errors=errors)


def _snapshot(rule: ScopeRule) -> dict[str, Any]:
    return {
        "scope_type": rule.scope_type,
        "rule_type": rule.rule_type,
        "value": rule.value,
        "reason": rule.reason,
    }


async def create_rules(
    session: AsyncSession,
    *,
    actor: User,
    program_id: uuid.UUID,
    items: Sequence[ScopeRuleCreateRequest],
    field_prefix: str = "",
) -> list[ScopeRule]:
    """Add rules, all or nothing. One item failing refuses the whole batch."""
    await program_service.get_writable_program(session, viewer=actor, program_id=program_id)
    errors: list[FieldError] = []
    rules: list[tuple[str, ScopeRule]] = []
    for index, item in enumerate(items):
        prefix = f"{field_prefix}{index}." if field_prefix else ""
        try:
            value, reason = _validated(
                item.scope_type, item.rule_type, item.value, item.reason, prefix=prefix
            )
        except ValidationFailedError as err:
            errors.extend(err.errors or [])
            continue
        rule = ScopeRule(
            program_id=program_id,
            scope_type=item.scope_type.value,
            rule_type=item.rule_type.value,
            value=value,
            reason=reason,
            created_by=actor.id,
        )
        rules.append((prefix, rule))
    if errors:
        raise ValidationFailedError(detail="scope rule is not valid", errors=errors)
    await _refuse_duplicates(session, program_id, [(prefix, _key(rule)) for prefix, rule in rules])
    session.add_all([rule for _, rule in rules])
    await _flush_unique(session)
    for _, rule in rules:
        await audit.record(
            session,
            action="scope_rule_created",
            user_id=actor.id,
            program_id=program_id,
            resource_type=RESOURCE,
            resource_id=rule.id,
            detail=_snapshot(rule),
        )
    return [rule for _, rule in rules]


async def _visible_rule(session: AsyncSession, viewer: User, scope_rule_id: uuid.UUID) -> ScopeRule:
    rule = await session.scalar(
        select(ScopeRule).where(
            ScopeRule.id == scope_rule_id,
            program_visible_to(viewer, ScopeRule.program_id.expression),
        )
    )
    if rule is None:
        raise NotFoundError(detail="scope rule does not exist")
    return rule


async def update_rule(
    session: AsyncSession,
    *,
    actor: User,
    scope_rule_id: uuid.UUID,
    changes: ScopeRuleUpdateRequest,
) -> ScopeRule:
    rule = await _visible_rule(session, actor, scope_rule_id)
    await program_service.get_writable_program(session, viewer=actor, program_id=rule.program_id)
    before = _snapshot(rule)
    sent = changes.model_fields_set
    scope_type = changes.scope_type or ScopeType(rule.scope_type)
    rule_type = changes.rule_type or RuleType(rule.rule_type)
    value = changes.value or rule.value
    reason = changes.reason if "reason" in sent else rule.reason
    value, reason = _validated(scope_type, rule_type, value, reason, prefix="")
    # Checked before the row changes, so a refused edit leaves nothing dirty.
    key = (scope_type.value, rule_type.value, value)
    await _refuse_duplicates(session, rule.program_id, [("", key)], exclude_id=rule.id)
    rule.scope_type, rule.rule_type, rule.value = key
    rule.reason = reason
    await _flush_unique(session)
    await audit.record(
        session,
        action="scope_rule_updated",
        user_id=actor.id,
        program_id=rule.program_id,
        resource_type=RESOURCE,
        resource_id=rule.id,
        detail={"before": before, "after": _snapshot(rule)},
    )
    return rule


async def delete_rule(session: AsyncSession, *, actor: User, scope_rule_id: uuid.UUID) -> None:
    rule = await _visible_rule(session, actor, scope_rule_id)
    await program_service.get_writable_program(session, viewer=actor, program_id=rule.program_id)
    snapshot = _snapshot(rule)
    await session.execute(delete(ScopeRule).where(ScopeRule.id == rule.id))
    await audit.record(
        session,
        action="scope_rule_deleted",
        user_id=actor.id,
        program_id=rule.program_id,
        resource_type=RESOURCE,
        resource_id=rule.id,
        detail=snapshot,
    )
