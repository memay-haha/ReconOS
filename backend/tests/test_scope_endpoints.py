"""Scope rule endpoints and the scope check, per role: docs/security/authorization.md."""

import uuid
from collections.abc import Awaitable, Callable

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import AuditLog
from app.core.identity import User, UserRole
from app.program.models import Program, ProgramStatus
from app.scope.models import ScopeRule
from tests.factories import assign, make_program
from tests.factories import make_scope_rule as add_rule

HEADERS = {"origin": "https://reconos.example.com", "sec-fetch-site": "same-origin"}
LoggedIn = Callable[..., Awaitable[User]]
EDITORS = [UserRole.SUPERADMIN, UserRole.ADMIN]

IN_DOMAIN = {"scope_type": "in_scope", "rule_type": "domain", "value": "example.com"}
OUT_ADMIN = {
    "scope_type": "out_of_scope",
    "rule_type": "domain",
    "value": "admin.example.com",
    "reason": "Hosts the payment back office.",
}


def rules_url(program: Program) -> str:
    return f"/api/v1/programs/{program.id}/scope-rules"


async def rule_count(db_session: AsyncSession, program: Program) -> int:
    return int(
        await db_session.scalar(
            select(func.count()).select_from(ScopeRule).where(ScopeRule.program_id == program.id)
        )
        or 0
    )


async def audit_rows(db_session: AsyncSession, action: str) -> list[AuditLog]:
    return list(await db_session.scalars(select(AuditLog).where(AuditLog.action == action)))


# ---------------------------------------------------------------- reading


@pytest.mark.parametrize("role", EDITORS)
async def test_editors_list_any_program(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession, role: UserRole
) -> None:
    await logged_in(role=role)
    program = await make_program(db_session)
    await add_rule(db_session, program)
    response = await client.get(rules_url(program))
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["value"] == "example.com"
    assert body["next_cursor"] is None


async def test_user_lists_assigned_program(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    me = await logged_in(role=UserRole.USER)
    program = await make_program(db_session)
    await assign(db_session, program, me.id)
    await add_rule(db_session, program)
    response = await client.get(rules_url(program))
    assert response.status_code == 200
    assert response.json()["total"] == 1


async def test_user_gets_404_on_unassigned_program(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    await logged_in(role=UserRole.USER)
    program = await make_program(db_session)
    await add_rule(db_session, program)
    assert (await client.get(rules_url(program))).status_code == 404
    check = await client.post(
        f"/api/v1/programs/{program.id}/scope-check",
        json={"targets": ["example.com"]},
        headers=HEADERS,
    )
    assert check.status_code == 404


async def test_unknown_program_is_404(client: AsyncClient, logged_in: LoggedIn) -> None:
    await logged_in(role=UserRole.SUPERADMIN)
    missing = f"/api/v1/programs/{uuid.uuid4()}"
    assert (await client.get(f"{missing}/scope-rules")).status_code == 404
    response = await client.post(f"{missing}/scope-rules", json=IN_DOMAIN, headers=HEADERS)
    assert response.status_code == 404


async def test_no_session_is_401(client: AsyncClient) -> None:
    program_url = f"/api/v1/programs/{uuid.uuid4()}"
    rule_url = f"/api/v1/scope-rules/{uuid.uuid4()}"
    assert (await client.get(f"{program_url}/scope-rules")).status_code == 401
    assert (
        await client.post(f"{program_url}/scope-rules", json=IN_DOMAIN, headers=HEADERS)
    ).status_code == 401
    assert (await client.patch(rule_url, json={}, headers=HEADERS)).status_code == 401
    assert (await client.delete(rule_url, headers=HEADERS)).status_code == 401


async def test_list_pages_by_created_at(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    await logged_in(role=UserRole.ADMIN)
    program = await make_program(db_session)
    other = await make_program(db_session)
    await add_rule(db_session, other, value="example.org")
    values = ["a.example.com", "b.example.com", "c.example.com"]
    for value in values:
        await add_rule(db_session, program, value=value)

    first = (await client.get(rules_url(program), params={"limit": 2})).json()
    assert [row["value"] for row in first["items"]] == values[:2]
    assert first["total"] == 3
    second = (
        await client.get(rules_url(program), params={"limit": 2, "cursor": first["next_cursor"]})
    ).json()
    assert [row["value"] for row in second["items"]] == values[2:]
    assert second["next_cursor"] is None

    newest = (
        await client.get(rules_url(program), params={"sort": "-created_at", "limit": 2})
    ).json()
    assert [row["value"] for row in newest["items"]] == values[:0:-1]
    rest = (
        await client.get(
            rules_url(program),
            params={"sort": "-created_at", "limit": 2, "cursor": newest["next_cursor"]},
        )
    ).json()
    assert [row["value"] for row in rest["items"]] == values[:1]


async def test_bad_cursor_is_400(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    await logged_in(role=UserRole.ADMIN)
    program = await make_program(db_session)
    response = await client.get(rules_url(program), params={"cursor": "not-a-cursor"})
    assert response.status_code == 400


# ---------------------------------------------------------------- creating


@pytest.mark.parametrize("role", EDITORS)
async def test_editors_create_canonical_rule(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession, role: UserRole
) -> None:
    me = await logged_in(role=role)
    program = await make_program(db_session)
    response = await client.post(
        rules_url(program),
        json={"scope_type": "in_scope", "rule_type": "wildcard", "value": "*.Example.COM."},
        headers=HEADERS,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["value"] == "*.example.com"
    assert body["program_id"] == str(program.id)
    assert body["created_by"] == str(me.id)
    assert body["reason"] is None
    (row,) = await audit_rows(db_session, "scope_rule_created")
    assert row.user_id == me.id
    assert row.program_id == program.id
    assert row.resource_type == "scope_rule"
    assert str(row.resource_id) == body["id"]
    assert row.detail is not None
    assert row.detail["value"] == "*.example.com"


async def test_user_cannot_write_even_on_assigned_program(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    me = await logged_in(role=UserRole.USER)
    program = await make_program(db_session)
    await assign(db_session, program, me.id)
    rule = await add_rule(db_session, program)
    assert (
        await client.post(rules_url(program), json=IN_DOMAIN, headers=HEADERS)
    ).status_code == 403
    assert (
        await client.post(
            f"{rules_url(program)}/bulk-create", json={"items": [IN_DOMAIN]}, headers=HEADERS
        )
    ).status_code == 403
    rule_url = f"/api/v1/scope-rules/{rule.id}"
    assert (
        await client.patch(rule_url, json={"value": "x.example.com"}, headers=HEADERS)
    ).status_code == 403
    assert (await client.delete(rule_url, headers=HEADERS)).status_code == 403
    assert await rule_count(db_session, program) == 1


async def test_out_of_scope_needs_reason(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    await logged_in(role=UserRole.ADMIN)
    program = await make_program(db_session)
    for reason in (None, "", "   "):
        response = await client.post(
            rules_url(program), json={**OUT_ADMIN, "reason": reason}, headers=HEADERS
        )
        assert response.status_code == 422
        assert {"field": "reason", "code": "missing"} in response.json()["errors"]
    created = await client.post(rules_url(program), json=OUT_ADMIN, headers=HEADERS)
    assert created.status_code == 200
    assert created.json()["reason"] == OUT_ADMIN["reason"]


async def test_in_scope_blank_reason_is_stored_as_null(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    await logged_in(role=UserRole.ADMIN)
    program = await make_program(db_session)
    response = await client.post(
        rules_url(program), json={**IN_DOMAIN, "reason": "  "}, headers=HEADERS
    )
    assert response.json()["reason"] is None


@pytest.mark.parametrize(
    ("rule_type", "value", "code"),
    [
        ("domain", "*.example.com", "wrong_rule_form"),
        ("wildcard", "example.com", "wrong_rule_form"),
        ("cidr", "198.51.100.7/24", "invalid_ip"),
        ("url", "ftp://example.com/", "unsupported_scheme"),
        ("domain", "bücher.example", "not_ascii"),
    ],
)
async def test_invalid_value_names_the_field(
    client: AsyncClient,
    logged_in: LoggedIn,
    db_session: AsyncSession,
    rule_type: str,
    value: str,
    code: str,
) -> None:
    await logged_in(role=UserRole.ADMIN)
    program = await make_program(db_session)
    response = await client.post(
        rules_url(program),
        json={"scope_type": "in_scope", "rule_type": rule_type, "value": value},
        headers=HEADERS,
    )
    assert response.status_code == 422
    assert response.json()["errors"] == [{"field": "value", "code": code}]


async def test_unknown_rule_type_is_422(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    await logged_in(role=UserRole.ADMIN)
    program = await make_program(db_session)
    response = await client.post(
        rules_url(program), json={**IN_DOMAIN, "rule_type": "regex"}, headers=HEADERS
    )
    assert response.status_code == 422


async def test_duplicate_after_canonicalisation_is_409(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    await logged_in(role=UserRole.ADMIN)
    program = await make_program(db_session)
    assert (
        await client.post(rules_url(program), json=IN_DOMAIN, headers=HEADERS)
    ).status_code == 200
    again = await client.post(
        rules_url(program), json={**IN_DOMAIN, "value": "EXAMPLE.com."}, headers=HEADERS
    )
    assert again.status_code == 409
    assert again.json()["code"] == "conflict"
    assert again.json()["errors"] == [{"field": "value", "code": "already_exists"}]
    # The same value on the other side of the scope is a different rule.
    out = await client.post(
        rules_url(program),
        json={**IN_DOMAIN, "scope_type": "out_of_scope", "reason": "Retired."},
        headers=HEADERS,
    )
    assert out.status_code == 200


async def test_archived_program_is_read_only(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    await logged_in(role=UserRole.SUPERADMIN)
    program = await make_program(db_session, status=ProgramStatus.ARCHIVED)
    rule = await add_rule(db_session, program)
    assert (await client.get(rules_url(program))).status_code == 200
    assert (
        await client.post(rules_url(program), json=OUT_ADMIN, headers=HEADERS)
    ).status_code == 409
    rule_url = f"/api/v1/scope-rules/{rule.id}"
    assert (
        await client.patch(rule_url, json={"value": "x.example.com"}, headers=HEADERS)
    ).status_code == 409
    assert (await client.delete(rule_url, headers=HEADERS)).status_code == 409
    assert await rule_count(db_session, program) == 1


async def test_paused_program_accepts_rule_changes(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    await logged_in(role=UserRole.ADMIN)
    program = await make_program(db_session, status=ProgramStatus.PAUSED)
    assert (
        await client.post(rules_url(program), json=IN_DOMAIN, headers=HEADERS)
    ).status_code == 200


# ---------------------------------------------------------------- bulk create


async def test_bulk_create_returns_rules_in_body_order(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    await logged_in(role=UserRole.ADMIN)
    program = await make_program(db_session)
    items = [
        IN_DOMAIN,
        {"scope_type": "in_scope", "rule_type": "cidr", "value": "198.51.100.0/24"},
        OUT_ADMIN,
    ]
    response = await client.post(
        f"{rules_url(program)}/bulk-create", json={"items": items}, headers=HEADERS
    )
    assert response.status_code == 200
    assert [row["value"] for row in response.json()["items"]] == [
        "example.com",
        "198.51.100.0/24",
        "admin.example.com",
    ]
    assert len(await audit_rows(db_session, "scope_rule_created")) == 3


async def test_bulk_create_is_all_or_nothing_on_invalid_item(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    await logged_in(role=UserRole.ADMIN)
    program = await make_program(db_session)
    items = [IN_DOMAIN, {**OUT_ADMIN, "reason": None}, {**IN_DOMAIN, "value": "*.x"}]
    response = await client.post(
        f"{rules_url(program)}/bulk-create", json={"items": items}, headers=HEADERS
    )
    assert response.status_code == 422
    assert response.json()["errors"] == [
        {"field": "items.1.reason", "code": "missing"},
        {"field": "items.2.value", "code": "wrong_rule_form"},
    ]
    assert await rule_count(db_session, program) == 0


async def test_bulk_create_is_all_or_nothing_on_duplicate(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    await logged_in(role=UserRole.ADMIN)
    program = await make_program(db_session)
    items = [
        {**IN_DOMAIN, "value": "a.example.com"},
        IN_DOMAIN,
        {**IN_DOMAIN, "value": "Example.com"},
    ]
    response = await client.post(
        f"{rules_url(program)}/bulk-create", json={"items": items}, headers=HEADERS
    )
    assert response.status_code == 409
    assert response.json()["errors"] == [{"field": "items.2.value", "code": "already_exists"}]
    assert await rule_count(db_session, program) == 0


async def test_bulk_create_needs_items(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    await logged_in(role=UserRole.ADMIN)
    program = await make_program(db_session)
    response = await client.post(
        f"{rules_url(program)}/bulk-create", json={"items": []}, headers=HEADERS
    )
    assert response.status_code == 422


# ---------------------------------------------------------------- updating, deleting


async def test_patch_rule_records_before_and_after(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    me = await logged_in(role=UserRole.ADMIN)
    program = await make_program(db_session)
    rule = await add_rule(db_session, program)
    response = await client.patch(
        f"/api/v1/scope-rules/{rule.id}",
        json={"scope_type": "out_of_scope", "reason": "Moved out of the program."},
        headers=HEADERS,
    )
    assert response.status_code == 200
    assert response.json()["scope_type"] == "out_of_scope"
    assert response.json()["value"] == "example.com"
    (row,) = await audit_rows(db_session, "scope_rule_updated")
    assert row.user_id == me.id
    assert row.program_id == program.id
    assert row.detail is not None
    assert row.detail["before"]["scope_type"] == "in_scope"
    assert row.detail["after"]["scope_type"] == "out_of_scope"


async def test_patch_value_is_validated_against_its_type(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    await logged_in(role=UserRole.ADMIN)
    program = await make_program(db_session)
    rule = await add_rule(db_session, program)
    url = f"/api/v1/scope-rules/{rule.id}"
    bad = await client.patch(url, json={"rule_type": "cidr"}, headers=HEADERS)
    assert bad.status_code == 422
    assert bad.json()["errors"] == [{"field": "value", "code": "wrong_rule_form"}]
    good = await client.patch(
        url, json={"rule_type": "cidr", "value": "198.51.100.0/24"}, headers=HEADERS
    )
    assert good.status_code == 200
    assert good.json()["rule_type"] == "cidr"


async def test_patch_cannot_drop_the_reason_of_an_exclusion(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    await logged_in(role=UserRole.ADMIN)
    program = await make_program(db_session)
    rule = await add_rule(
        db_session, program, scope_type="out_of_scope", value="admin.example.com", reason="Why."
    )
    url = f"/api/v1/scope-rules/{rule.id}"
    response = await client.patch(url, json={"reason": None}, headers=HEADERS)
    assert response.status_code == 422
    kept = await client.patch(url, json={"value": "ops.example.com"}, headers=HEADERS)
    assert kept.json()["reason"] == "Why."


async def test_patch_into_a_duplicate_is_409(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    await logged_in(role=UserRole.ADMIN)
    program = await make_program(db_session)
    await add_rule(db_session, program, value="example.com")
    rule = await add_rule(db_session, program, value="example.org")
    response = await client.patch(
        f"/api/v1/scope-rules/{rule.id}", json={"value": "example.com"}, headers=HEADERS
    )
    assert response.status_code == 409
    assert response.json()["errors"] == [{"field": "value", "code": "already_exists"}]
    # Saving a rule unchanged is not a duplicate of itself.
    same = await client.patch(
        f"/api/v1/scope-rules/{rule.id}", json={"value": "example.org"}, headers=HEADERS
    )
    assert same.status_code == 200


async def test_delete_rule_is_hard_and_audited(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    me = await logged_in(role=UserRole.SUPERADMIN)
    program = await make_program(db_session)
    rule = await add_rule(db_session, program)
    response = await client.delete(f"/api/v1/scope-rules/{rule.id}", headers=HEADERS)
    assert response.status_code == 204
    assert await rule_count(db_session, program) == 0
    (row,) = await audit_rows(db_session, "scope_rule_deleted")
    assert row.user_id == me.id
    assert row.program_id == program.id
    assert row.resource_id == rule.id
    assert row.detail is not None
    assert row.detail["value"] == "example.com"


async def test_unknown_rule_is_404(client: AsyncClient, logged_in: LoggedIn) -> None:
    await logged_in(role=UserRole.ADMIN)
    url = f"/api/v1/scope-rules/{uuid.uuid4()}"
    assert (
        await client.patch(url, json={"value": "a.example.com"}, headers=HEADERS)
    ).status_code == 404
    assert (await client.delete(url, headers=HEADERS)).status_code == 404


# ---------------------------------------------------------------- scope check


@pytest.mark.parametrize("role", [UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER])
async def test_scope_check_reports_a_verdict_per_target(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession, role: UserRole
) -> None:
    me = await logged_in(role=role)
    program = await make_program(db_session)
    await assign(db_session, program, me.id)
    await add_rule(db_session, program, rule_type="wildcard", value="*.example.com")
    await add_rule(
        db_session, program, scope_type="out_of_scope", value="admin.example.com", reason="Why."
    )
    targets = ["A.example.com", "admin.example.com", "example.com", "not a target"]
    response = await client.post(
        f"/api/v1/programs/{program.id}/scope-check", json={"targets": targets}, headers=HEADERS
    )
    assert response.status_code == 200
    assert response.json()["items"] == [
        {
            "target": "A.example.com",
            "normalized_target": "a.example.com",
            "in_scope": True,
            "verdict": "in_scope",
            "rule_value": "*.example.com",
        },
        {
            "target": "admin.example.com",
            "normalized_target": "admin.example.com",
            "in_scope": False,
            "verdict": "out_of_scope_match",
            "rule_value": "admin.example.com",
        },
        {
            "target": "example.com",
            "normalized_target": "example.com",
            "in_scope": False,
            "verdict": "no_in_scope_match",
            "rule_value": None,
        },
        {
            "target": "not a target",
            "normalized_target": None,
            "in_scope": False,
            "verdict": "invalid_target",
            "rule_value": None,
        },
    ]
