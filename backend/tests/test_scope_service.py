"""The scope API the job module and the dispatcher call (G5)."""

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, TargetOutOfScopeError, ValidationFailedError
from app.program.models import Program
from app.scope import service
from app.scope.matching import Verdict
from app.scope.models import ScopeRule
from tests.factories import make_program
from tests.factories import make_scope_rule as add_rule


@pytest_asyncio.fixture
async def program(db_session: AsyncSession) -> Program:
    program = await make_program(db_session)
    await add_rule(db_session, program, "*.example.com", rule_type="wildcard")
    await add_rule(db_session, program, "198.51.100.0/24", rule_type="cidr")
    await add_rule(
        db_session,
        program,
        "198.51.100.128/25",
        rule_type="cidr",
        scope_type="out_of_scope",
        reason="Shared hosting.",
    )
    return program


async def test_require_in_scope_returns_canonical_targets(
    db_session: AsyncSession, program: Program
) -> None:
    targets = await service.require_in_scope(
        db_session,
        program.id,
        ["A.Example.com.", "198.51.100.0/25", "https://a.example.com:443/x"],
        accepts_wildcard=False,
    )
    assert targets == ["a.example.com", "198.51.100.0/25", "https://a.example.com/x"]


async def test_require_in_scope_refuses_the_whole_batch(
    db_session: AsyncSession, program: Program
) -> None:
    with pytest.raises(TargetOutOfScopeError) as caught:
        await service.require_in_scope(
            db_session,
            program.id,
            ["a.example.com", "198.51.100.0/24", "example.com", "bad target"],
            accepts_wildcard=False,
        )
    assert caught.value.errors == [
        {"field": "target[1]", "code": "target_out_of_scope"},
        {"field": "target[2]", "code": "target_out_of_scope"},
        {"field": "target[3]", "code": "invalid_target"},
    ]
    assert caught.value.detail == "198.51.100.0/24 matches an out-of-scope rule"


@pytest.mark.parametrize(
    ("target", "detail"),
    [
        ("example.org", "example.org does not match any in-scope rule"),
        ("example .org", "target is not a valid domain, wildcard, IP, CIDR or http(s) URL"),
    ],
)
async def test_refusal_detail_names_the_first_failure(
    db_session: AsyncSession, program: Program, target: str, detail: str
) -> None:
    with pytest.raises(TargetOutOfScopeError) as caught:
        await service.require_in_scope(
            db_session, program.id, [target], accepts_wildcard=False, field="items"
        )
    assert caught.value.detail == detail
    assert caught.value.errors is not None
    assert caught.value.errors[0]["field"] == "items[0]"


async def test_require_in_scope_refuses_an_empty_list(
    db_session: AsyncSession, program: Program
) -> None:
    with pytest.raises(TargetOutOfScopeError) as caught:
        await service.require_in_scope(db_session, program.id, [], accepts_wildcard=False)
    assert caught.value.detail == "no target was given"
    assert caught.value.errors is None


async def test_wildcard_target_passes_for_a_tool_module_that_takes_it(
    db_session: AsyncSession, program: Program
) -> None:
    targets = await service.require_in_scope(
        db_session, program.id, ["*.A.Example.com."], accepts_wildcard=True
    )
    assert targets == ["*.a.example.com"]


async def test_wildcard_target_is_refused_for_a_tool_module_without_it(
    db_session: AsyncSession, program: Program
) -> None:
    with pytest.raises(ValidationFailedError) as caught:
        await service.require_in_scope(
            db_session, program.id, ["a.example.com", "*.example.com"], accepts_wildcard=False
        )
    assert caught.value.errors == [{"field": "target[1]", "code": "target_type_not_supported"}]


async def test_scope_refusal_comes_before_the_wildcard_refusal(
    db_session: AsyncSession, program: Program
) -> None:
    with pytest.raises(TargetOutOfScopeError):
        await service.require_in_scope(
            db_session, program.id, ["*.example.org"], accepts_wildcard=False
        )


async def test_decide_target_sees_only_its_program(
    db_session: AsyncSession, program: Program
) -> None:
    other = await make_program(db_session)
    assert (await service.decide_target(db_session, program.id, "a.example.com")).allowed
    decision = await service.decide_target(db_session, other.id, "a.example.com")
    assert decision.verdict is Verdict.NO_IN_SCOPE_MATCH


async def test_unreadable_in_scope_rule_is_skipped(db_session: AsyncSession) -> None:
    program = await make_program(db_session)
    await add_rule(db_session, program, "not a domain")
    await add_rule(db_session, program, "example.com")
    assert (await service.decide_target(db_session, program.id, "example.com")).allowed


async def test_unreadable_out_of_scope_rule_admits_nothing(db_session: AsyncSession) -> None:
    program = await make_program(db_session)
    await add_rule(db_session, program, "example.com")
    await add_rule(db_session, program, "not a domain", scope_type="out_of_scope", reason="Why.")
    decision = await service.decide_target(db_session, program.id, "example.com")
    assert decision.verdict is Verdict.NO_IN_SCOPE_MATCH


async def test_constraint_settles_a_race_the_precheck_missed(db_session: AsyncSession) -> None:
    """Two requests can both pass the duplicate SELECT; the unique constraint decides."""
    program = await make_program(db_session)
    await add_rule(db_session, program, "example.com")
    db_session.add(
        ScopeRule(
            program_id=program.id, scope_type="in_scope", rule_type="domain", value="example.com"
        )
    )
    with pytest.raises(ConflictError):
        await service._flush_unique(db_session)
