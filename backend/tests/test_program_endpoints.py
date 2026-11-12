"""Program endpoints, each against every role: .claude/rules/testing.md."""

import uuid
from collections.abc import Awaitable, Callable

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import AuditLog
from app.core.identity import User, UserRole
from app.core.pagination import encode_cursor
from app.program.models import Program, ProgramStatus, ProgramUser, Proxy
from app.scope.models import ScopeRule
from tests.factories import assign, make_program, make_proxy

HEADERS = {"origin": "https://reconos.example.com", "sec-fetch-site": "same-origin"}
LoggedIn = Callable[..., Awaitable[User]]
UserFactory = Callable[..., Awaitable[User]]
API = "/api/v1"
ADMINS = [UserRole.SUPERADMIN, UserRole.ADMIN]
NEW = {
    "name": "Example Corp",
    "platform": "HackerOne",
    "platform_url": "https://hackerone.com/example",
    "platform_handle": "example",
    "bounty_type": "bounty",
    "description": "Main web assets",
}


async def _audit(session: AsyncSession, action: str) -> list[AuditLog]:
    rows = await session.scalars(select(AuditLog).where(AuditLog.action == action))
    return list(rows.all())


# --- list and read ------------------------------------------------------------


@pytest.mark.parametrize("role", list(UserRole))
async def test_list_programs_by_role(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession, role: UserRole
) -> None:
    actor = await logged_in(role)
    mine = await make_program(db_session)
    other = await make_program(db_session)
    await assign(db_session, mine, actor.id)
    response = await client.get(f"{API}/programs", params={"limit": 200})
    assert response.status_code == 200
    ids = {item["id"] for item in response.json()["items"]}
    assert str(mine.id) in ids
    assert (str(other.id) in ids) is (role != UserRole.USER)


async def test_list_programs_without_session(client: AsyncClient) -> None:
    assert (await client.get(f"{API}/programs")).status_code == 401


async def test_user_total_counts_only_assigned(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    actor = await logged_in(UserRole.USER)
    await make_program(db_session)
    await assign(db_session, await make_program(db_session), actor.id)
    body = (await client.get(f"{API}/programs")).json()
    assert body["total"] == 1
    assert len(body["items"]) == 1


async def test_list_row_carries_computed_fields(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    actor = await logged_in(UserRole.ADMIN)
    program = await make_program(db_session, created_by=actor.id, name="computed-fields")
    db_session.add_all(
        [
            ScopeRule(
                program_id=program.id,
                scope_type="in_scope",
                rule_type="domain",
                value="example.com",
            ),
            ScopeRule(
                program_id=program.id,
                scope_type="in_scope",
                rule_type="wildcard",
                value="*.example.com",
            ),
            ScopeRule(
                program_id=program.id,
                scope_type="out_of_scope",
                rule_type="domain",
                value="admin.example.com",
                reason="Third-party admin panel",
            ),
        ]
    )
    await db_session.flush()
    body = (await client.get(f"{API}/programs", params={"q": "computed-fields"})).json()
    [row] = body["items"]
    assert row["in_scope_rule_count"] == 2
    assert row["out_of_scope_rule_count"] == 1
    assert row["created_by_username"] == actor.username
    assert row["finding_counts"] == {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
    assert row["assets_new_today"] == {"domain": 0, "url": 0}
    for key in (
        "domain_count",
        "ip_count",
        "url_count",
        "service_count",
        "ip_resolved_count",
        "service_port_count",
        "screenshot_count",
    ):
        assert row[key] == 0
    assert row["last_job_finished_at"] is None
    assert row["scope_coverage"] is None


async def test_list_excludes_archived_and_filters_status(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    await logged_in(UserRole.ADMIN)
    active = await make_program(db_session, name="filter-active")
    paused = await make_program(db_session, name="filter-paused", status=ProgramStatus.PAUSED)
    archived = await make_program(db_session, name="filter-archived", status=ProgramStatus.ARCHIVED)
    every = {
        i["id"]
        for i in (await client.get(f"{API}/programs", params={"q": "filter-"})).json()["items"]
    }
    assert every == {str(active.id), str(paused.id)}
    only_paused = (
        await client.get(f"{API}/programs", params={"q": "filter-", "status": "paused"})
    ).json()["items"]
    assert [i["id"] for i in only_paused] == [str(paused.id)]
    assert (await client.get(f"{API}/programs", params={"status": "archived"})).status_code == 422
    # Archived stays readable on its own: the data is kept, read only.
    assert (await client.get(f"{API}/programs/{archived.id}")).status_code == 200


async def test_q_searches_name_platform_handle_and_description(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    await logged_in(UserRole.ADMIN)
    by_name = await make_program(db_session, name="QSEARCH-name")
    by_platform = await make_program(db_session, platform="qsearch-platform")
    by_handle = await make_program(db_session, platform_handle="qsearch-handle")
    by_text = await make_program(db_session, description="about QSearch here")
    await make_program(db_session, name="unrelated")
    found = {
        i["id"]
        for i in (await client.get(f"{API}/programs", params={"q": "qsearch"})).json()["items"]
    }
    assert found == {str(p.id) for p in (by_name, by_platform, by_handle, by_text)}


async def test_has_in_scope_rule_and_has_domain_filters(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    await logged_in(UserRole.ADMIN)
    with_rule = await make_program(db_session, name="hasrule-yes")
    without = await make_program(db_session, name="hasrule-no")
    db_session.add(
        ScopeRule(
            program_id=with_rule.id, scope_type="in_scope", rule_type="domain", value="example.org"
        )
    )
    await db_session.flush()

    async def ids(**params: str) -> set[str]:
        response = await client.get(f"{API}/programs", params={"q": "hasrule-", **params})
        return {i["id"] for i in response.json()["items"]}

    assert await ids(has_in_scope_rule="true") == {str(with_rule.id)}
    assert await ids(has_in_scope_rule="false") == {str(without.id)}
    # No domain table yet: every program is unmapped.
    assert await ids(has_domain="false") == {str(with_rule.id), str(without.id)}
    assert await ids(has_domain="true") == set()


@pytest.mark.parametrize(
    "sort", ["name", "-domain_count", "-finding_critical_count", "-last_job_finished_at"]
)
async def test_keyset_pages_cover_every_row_once(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession, sort: str
) -> None:
    await logged_in(UserRole.ADMIN)
    made = {str((await make_program(db_session, name=f"page-{n:02d}")).id) for n in range(5)}
    seen: list[str] = []
    cursor = None
    while True:
        params: dict[str, str | int] = {"q": "page-", "limit": 2, "sort": sort}
        if cursor:
            params["cursor"] = cursor
        body = (await client.get(f"{API}/programs", params=params)).json()
        seen += [i["id"] for i in body["items"]]
        assert body["total"] == 5
        cursor = body["next_cursor"]
        if cursor is None:
            break
    assert sorted(seen) == sorted(made)
    assert len(seen) == len(set(seen))


async def test_name_sort_is_alphabetical(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    await logged_in(UserRole.ADMIN)
    for name in ("alpha-b", "alpha-c", "alpha-a"):
        await make_program(db_session, name=name)
    items = (await client.get(f"{API}/programs", params={"q": "alpha-", "sort": "name"})).json()[
        "items"
    ]
    assert [i["name"] for i in items] == ["alpha-a", "alpha-b", "alpha-c"]


@pytest.mark.parametrize(
    ("sort", "cursor"),
    [
        ("name", encode_cursor(5, uuid.uuid4())),
        ("-domain_count", encode_cursor("x", uuid.uuid4())),
        ("-last_job_finished_at", encode_cursor("not-a-time", uuid.uuid4())),
        ("name", "%%%"),
    ],
)
async def test_bad_cursor_is_a_400(
    client: AsyncClient, logged_in: LoggedIn, sort: str, cursor: str
) -> None:
    await logged_in(UserRole.ADMIN)
    response = await client.get(f"{API}/programs", params={"sort": sort, "cursor": cursor})
    assert response.status_code == 400


async def test_unknown_sort_is_a_422(client: AsyncClient, logged_in: LoggedIn) -> None:
    await logged_in(UserRole.ADMIN)
    assert (await client.get(f"{API}/programs", params={"sort": "created_by"})).status_code == 422


@pytest.mark.parametrize("role", list(UserRole))
async def test_read_program_by_role(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession, role: UserRole
) -> None:
    actor = await logged_in(role)
    assigned = await make_program(db_session)
    await assign(db_session, assigned, actor.id)
    unassigned = await make_program(db_session)
    ok = await client.get(f"{API}/programs/{assigned.id}")
    assert ok.status_code == 200
    assert ok.json()["in_scope_rule_count"] == 0
    hidden = await client.get(f"{API}/programs/{unassigned.id}")
    assert hidden.status_code == (404 if role == UserRole.USER else 200)


async def test_unassigned_and_missing_look_the_same(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    await logged_in(UserRole.USER)
    unassigned = await make_program(db_session)
    hidden = await client.get(f"{API}/programs/{unassigned.id}")
    missing = await client.get(f"{API}/programs/{uuid.uuid4()}")
    assert hidden.status_code == missing.status_code == 404
    assert hidden.json() == missing.json()


# --- create and edit ------------------------------------------------------------


@pytest.mark.parametrize(
    ("role", "expected"), [(UserRole.SUPERADMIN, 200), (UserRole.ADMIN, 200), (UserRole.USER, 403)]
)
async def test_create_program_by_role(
    client: AsyncClient,
    logged_in: LoggedIn,
    db_session: AsyncSession,
    role: UserRole,
    expected: int,
) -> None:
    actor = await logged_in(role)
    response = await client.post(f"{API}/programs", json=NEW, headers=HEADERS)
    assert response.status_code == expected
    if expected == 200:
        body = response.json()
        assert body["status"] == "active"
        assert body["created_by"] == str(actor.id)
        assert body["archived_at"] is None
        assert "in_scope_rule_count" not in body
        [entry] = await _audit(db_session, "program_created")
        assert entry.program_id == uuid.UUID(body["id"])
        assert entry.user_id == actor.id


async def test_create_program_without_session(client: AsyncClient) -> None:
    assert (await client.post(f"{API}/programs", json=NEW, headers=HEADERS)).status_code == 401


async def test_create_defaults_and_minimum_body(client: AsyncClient, logged_in: LoggedIn) -> None:
    await logged_in(UserRole.ADMIN)
    response = await client.post(f"{API}/programs", json={"name": "Minimal"}, headers=HEADERS)
    assert response.status_code == 200
    assert response.json()["bounty_type"] == "bounty"
    assert response.json()["platform"] is None


async def test_duplicate_program_name_conflicts(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    await logged_in(UserRole.ADMIN)
    await make_program(db_session, name="Taken")
    response = await client.post(f"{API}/programs", json={**NEW, "name": "Taken"}, headers=HEADERS)
    assert response.status_code == 409
    assert response.json()["errors"] == [{"field": "name", "code": "already_exists"}]


@pytest.mark.parametrize(
    "body",
    [
        {**NEW, "name": ""},
        {**NEW, "name": "   "},
        {**NEW, "bounty_type": "cash"},
        {**NEW, "platform_url": "javascript:alert(1)"},
        {**NEW, "platform_url": "ftp://example.com"},
        {**NEW, "status": "archived"},
    ],
)
async def test_create_rejects_invalid_body(
    client: AsyncClient, logged_in: LoggedIn, body: dict[str, object]
) -> None:
    await logged_in(UserRole.ADMIN)
    response = await client.post(f"{API}/programs", json=body, headers=HEADERS)
    assert response.status_code == 422


@pytest.mark.parametrize(
    ("role", "expected"), [(UserRole.SUPERADMIN, 200), (UserRole.ADMIN, 200), (UserRole.USER, 403)]
)
async def test_patch_program_by_role(
    client: AsyncClient,
    logged_in: LoggedIn,
    db_session: AsyncSession,
    role: UserRole,
    expected: int,
) -> None:
    actor = await logged_in(role)
    program = await make_program(db_session)
    await assign(db_session, program, actor.id)
    response = await client.patch(
        f"{API}/programs/{program.id}",
        json={"description": "Updated", "platform": None},
        headers=HEADERS,
    )
    assert response.status_code == expected
    if expected == 200:
        assert response.json()["description"] == "Updated"
        assert response.json()["platform"] is None
        [entry] = await _audit(db_session, "program_updated")
        assert entry.detail == {"fields": ["description", "platform"]}


async def test_patch_missing_program_is_404(client: AsyncClient, logged_in: LoggedIn) -> None:
    await logged_in(UserRole.ADMIN)
    response = await client.patch(
        f"{API}/programs/{uuid.uuid4()}", json={"name": "x"}, headers=HEADERS
    )
    assert response.status_code == 404


async def test_patch_rename_onto_existing_conflicts(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    await logged_in(UserRole.ADMIN)
    await make_program(db_session, name="Occupied")
    program = await make_program(db_session)
    response = await client.patch(
        f"{API}/programs/{program.id}", json={"name": "Occupied"}, headers=HEADERS
    )
    assert response.status_code == 409


async def test_patch_cannot_null_required_fields(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    await logged_in(UserRole.ADMIN)
    program = await make_program(db_session)
    for body in ({"name": None}, {"bounty_type": None}):
        response = await client.patch(f"{API}/programs/{program.id}", json=body, headers=HEADERS)
        assert response.status_code == 422


async def test_archived_program_is_read_only(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    await logged_in(UserRole.ADMIN)
    program = await make_program(db_session, status=ProgramStatus.ARCHIVED)
    response = await client.patch(
        f"{API}/programs/{program.id}", json={"description": "x"}, headers=HEADERS
    )
    assert response.status_code == 409


# --- pause, resume, archive -------------------------------------------------------


@pytest.mark.parametrize(
    ("action", "start", "end"),
    [
        ("pause", ProgramStatus.ACTIVE, ProgramStatus.PAUSED),
        ("resume", ProgramStatus.PAUSED, ProgramStatus.ACTIVE),
        ("archive", ProgramStatus.ACTIVE, ProgramStatus.ARCHIVED),
        ("archive", ProgramStatus.PAUSED, ProgramStatus.ARCHIVED),
    ],
)
@pytest.mark.parametrize("role", ADMINS)
async def test_valid_transition(
    client: AsyncClient,
    logged_in: LoggedIn,
    db_session: AsyncSession,
    role: UserRole,
    action: str,
    start: ProgramStatus,
    end: ProgramStatus,
) -> None:
    await logged_in(role)
    program = await make_program(db_session, status=start)
    response = await client.post(f"{API}/programs/{program.id}/{action}", headers=HEADERS)
    assert response.status_code == 204
    await db_session.flush()
    await db_session.refresh(program)
    assert program.status == end.value
    assert (program.archived_at is not None) is (end is ProgramStatus.ARCHIVED)
    [entry] = await _audit(db_session, f"program_{action.removesuffix('e')}ed")
    assert entry.program_id == program.id


@pytest.mark.parametrize(
    ("action", "start"),
    [
        ("pause", ProgramStatus.PAUSED),
        ("pause", ProgramStatus.ARCHIVED),
        ("resume", ProgramStatus.ACTIVE),
        ("resume", ProgramStatus.ARCHIVED),
        ("archive", ProgramStatus.ARCHIVED),
    ],
)
async def test_invalid_transition_conflicts(
    client: AsyncClient,
    logged_in: LoggedIn,
    db_session: AsyncSession,
    action: str,
    start: ProgramStatus,
) -> None:
    await logged_in(UserRole.ADMIN)
    program = await make_program(db_session, status=start)
    response = await client.post(f"{API}/programs/{program.id}/{action}", headers=HEADERS)
    assert response.status_code == 409
    assert response.json()["code"] == "conflict"


@pytest.mark.parametrize("action", ["pause", "resume", "archive"])
async def test_user_cannot_change_status(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession, action: str
) -> None:
    actor = await logged_in(UserRole.USER)
    program = await make_program(db_session)
    await assign(db_session, program, actor.id)
    response = await client.post(f"{API}/programs/{program.id}/{action}", headers=HEADERS)
    assert response.status_code == 403


@pytest.mark.parametrize("action", ["pause", "resume", "archive"])
async def test_status_change_on_missing_program_is_404(
    client: AsyncClient, logged_in: LoggedIn, action: str
) -> None:
    await logged_in(UserRole.ADMIN)
    response = await client.post(f"{API}/programs/{uuid.uuid4()}/{action}", headers=HEADERS)
    assert response.status_code == 404


# --- hard delete ------------------------------------------------------------------


@pytest.mark.parametrize(
    ("role", "expected"), [(UserRole.SUPERADMIN, 204), (UserRole.ADMIN, 403), (UserRole.USER, 403)]
)
async def test_delete_program_by_role(
    client: AsyncClient,
    logged_in: LoggedIn,
    db_session: AsyncSession,
    role: UserRole,
    expected: int,
) -> None:
    await logged_in(role)
    program = await make_program(db_session)
    response = await client.delete(f"{API}/programs/{program.id}", headers=HEADERS)
    assert response.status_code == expected


async def test_delete_cascades_and_detaches_the_audit_trail(
    client: AsyncClient,
    logged_in: LoggedIn,
    db_session: AsyncSession,
    user_factory: UserFactory,
) -> None:
    await logged_in(UserRole.SUPERADMIN)
    member = await user_factory(role=UserRole.USER)
    program = await make_program(db_session, name="Doomed")
    program_id = program.id
    await assign(db_session, program, member.id)
    await make_proxy(db_session, program)
    db_session.add(
        ScopeRule(
            program_id=program_id, scope_type="in_scope", rule_type="domain", value="example.com"
        )
    )
    db_session.add(AuditLog(action="program_paused", program_id=program_id))
    await db_session.flush()
    db_session.expunge_all()

    response = await client.delete(f"{API}/programs/{program_id}", headers=HEADERS)

    assert response.status_code == 204
    for column in (Program.id, ProgramUser.program_id, Proxy.program_id, ScopeRule.program_id):
        left = await db_session.scalar(select(func.count()).where(column == program_id))
        assert left == 0
    still_linked = await db_session.scalar(
        select(func.count()).select_from(AuditLog).where(AuditLog.program_id == program_id)
    )
    assert still_linked == 0
    [entry] = await _audit(db_session, "program_deleted")
    assert entry.resource_id == program_id
    assert entry.detail == {"name": "Doomed"}


async def test_delete_missing_program_is_404(client: AsyncClient, logged_in: LoggedIn) -> None:
    await logged_in(UserRole.SUPERADMIN)
    assert (
        await client.delete(f"{API}/programs/{uuid.uuid4()}", headers=HEADERS)
    ).status_code == 404


# --- bulk -------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("action", "start", "end"),
    [
        ("pause", ProgramStatus.ACTIVE, ProgramStatus.PAUSED),
        ("resume", ProgramStatus.PAUSED, ProgramStatus.ACTIVE),
        ("archive", ProgramStatus.ACTIVE, ProgramStatus.ARCHIVED),
    ],
)
async def test_bulk_transition(
    client: AsyncClient,
    logged_in: LoggedIn,
    db_session: AsyncSession,
    action: str,
    start: ProgramStatus,
    end: ProgramStatus,
) -> None:
    await logged_in(UserRole.ADMIN)
    programs = [await make_program(db_session, status=start) for _ in range(3)]
    ids = [str(p.id) for p in programs]
    response = await client.post(
        f"{API}/programs/bulk-{action}", json={"ids": ids}, headers=HEADERS
    )
    assert response.status_code == 204
    for program in programs:
        await db_session.flush()
        await db_session.refresh(program)
        assert program.status == end.value


async def test_bulk_is_all_or_nothing(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    await logged_in(UserRole.ADMIN)
    active = await make_program(db_session)
    already = await make_program(db_session, status=ProgramStatus.PAUSED)
    response = await client.post(
        f"{API}/programs/bulk-pause",
        json={"ids": [str(active.id), str(already.id)]},
        headers=HEADERS,
    )
    assert response.status_code == 409
    await db_session.flush()
    await db_session.refresh(active)
    assert active.status == "active"


async def test_bulk_with_unknown_id_is_404(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    await logged_in(UserRole.ADMIN)
    program = await make_program(db_session)
    response = await client.post(
        f"{API}/programs/bulk-archive",
        json={"ids": [str(program.id), str(uuid.uuid4())]},
        headers=HEADERS,
    )
    assert response.status_code == 404
    await db_session.flush()
    await db_session.refresh(program)
    assert program.status == "active"


@pytest.mark.parametrize("ids", [[], [str(uuid.uuid4()) for _ in range(501)], ["nope"]])
async def test_bulk_body_limits(client: AsyncClient, logged_in: LoggedIn, ids: list[str]) -> None:
    await logged_in(UserRole.ADMIN)
    response = await client.post(f"{API}/programs/bulk-pause", json={"ids": ids}, headers=HEADERS)
    assert response.status_code == 422


@pytest.mark.parametrize("action", ["pause", "resume", "archive"])
async def test_user_cannot_bulk_change_status(
    client: AsyncClient, logged_in: LoggedIn, action: str
) -> None:
    await logged_in(UserRole.USER)
    response = await client.post(
        f"{API}/programs/bulk-{action}", json={"ids": [str(uuid.uuid4())]}, headers=HEADERS
    )
    assert response.status_code == 403


@pytest.mark.parametrize(
    ("role", "expected"), [(UserRole.SUPERADMIN, 204), (UserRole.ADMIN, 403), (UserRole.USER, 403)]
)
async def test_bulk_delete_by_role(
    client: AsyncClient,
    logged_in: LoggedIn,
    db_session: AsyncSession,
    role: UserRole,
    expected: int,
) -> None:
    await logged_in(role)
    programs = [await make_program(db_session) for _ in range(2)]
    response = await client.post(
        f"{API}/programs/bulk-delete", json={"ids": [str(p.id) for p in programs]}, headers=HEADERS
    )
    assert response.status_code == expected
    if expected == 204:
        assert len(await _audit(db_session, "program_deleted")) == 2


async def test_bulk_delete_duplicate_ids_count_once(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    await logged_in(UserRole.SUPERADMIN)
    program = await make_program(db_session)
    response = await client.post(
        f"{API}/programs/bulk-delete", json={"ids": [str(program.id)] * 2}, headers=HEADERS
    )
    assert response.status_code == 204
