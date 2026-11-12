"""Proxies of a program. The URL is a credential: stored encrypted, never returned (G7)."""

import json
import uuid
from collections.abc import Awaitable, Callable

import pytest
import structlog
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import AuditLog
from app.core.crypto import decrypt, key_id_of
from app.core.identity import User, UserRole
from app.program.models import ProgramStatus, Proxy
from tests.factories import assign, make_program, make_proxy

HEADERS = {"origin": "https://reconos.example.com", "sec-fetch-site": "same-origin"}
LoggedIn = Callable[..., Awaitable[User]]
API = "/api/v1"
BY_ROLE = [(UserRole.SUPERADMIN, True), (UserRole.ADMIN, True), (UserRole.USER, False)]
SECRET_URL = "http://proxyuser:Sup3rS3cretPw@198.51.100.20:3128"
CONTEXT = "proxy.url_encrypted"
PROXY_FIELDS = {"id", "program_id", "name", "is_enabled", "created_at", "updated_at"}


def _leaks(text: str) -> bool:
    return "Sup3rS3cretPw" in text or "proxyuser" in text


@pytest.mark.parametrize(("role", "allowed"), BY_ROLE)
async def test_list_proxies_by_role(
    client: AsyncClient,
    logged_in: LoggedIn,
    db_session: AsyncSession,
    role: UserRole,
    allowed: bool,
) -> None:
    actor = await logged_in(role)
    program = await make_program(db_session)
    await assign(db_session, program, actor.id)
    await make_proxy(db_session, program, name="egress", url=SECRET_URL)
    response = await client.get(f"{API}/programs/{program.id}/proxies")
    assert response.status_code == (200 if allowed else 403)
    if allowed:
        [row] = response.json()["items"]
        assert set(row) == PROXY_FIELDS
        assert not _leaks(response.text)


async def test_list_proxies_pages(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    await logged_in(UserRole.ADMIN)
    program = await make_program(db_session)
    made = {str((await make_proxy(db_session, program)).id) for _ in range(3)}
    seen: list[str] = []
    cursor = None
    while True:
        params: dict[str, str | int] = {"limit": 2, **({"cursor": cursor} if cursor else {})}
        body = (await client.get(f"{API}/programs/{program.id}/proxies", params=params)).json()
        seen += [row["id"] for row in body["items"]]
        cursor = body["next_cursor"]
        if cursor is None:
            break
    assert sorted(seen) == sorted(made)


async def test_list_proxies_of_missing_program_is_404(
    client: AsyncClient, logged_in: LoggedIn
) -> None:
    await logged_in(UserRole.ADMIN)
    assert (await client.get(f"{API}/programs/{uuid.uuid4()}/proxies")).status_code == 404


@pytest.mark.parametrize(("role", "allowed"), BY_ROLE)
async def test_create_proxy_by_role(
    client: AsyncClient,
    logged_in: LoggedIn,
    db_session: AsyncSession,
    role: UserRole,
    allowed: bool,
) -> None:
    actor = await logged_in(role)
    program = await make_program(db_session)
    await assign(db_session, program, actor.id)
    response = await client.post(
        f"{API}/programs/{program.id}/proxies",
        json={"name": "egress", "url": SECRET_URL},
        headers=HEADERS,
    )
    assert response.status_code == (200 if allowed else 403)
    assert not _leaks(response.text)
    if allowed:
        body = response.json()
        assert set(body) == PROXY_FIELDS
        assert body["is_enabled"] is True
        stored = await db_session.get(Proxy, uuid.UUID(body["id"]))
        assert stored is not None
        assert b"Sup3rS3cretPw" not in stored.url_encrypted
        assert decrypt(stored.url_encrypted, context=CONTEXT) == SECRET_URL
        assert key_id_of(stored.url_encrypted)
        entries = (
            await db_session.scalars(select(AuditLog).where(AuditLog.action == "proxy_created"))
        ).all()
        [entry] = entries
        assert entry.program_id == program.id
        assert not _leaks(json.dumps(entry.detail))


async def test_proxy_url_never_reaches_the_log(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    await logged_in(UserRole.ADMIN)
    program = await make_program(db_session)
    with structlog.testing.capture_logs() as captured:
        created = await client.post(
            f"{API}/programs/{program.id}/proxies",
            json={"name": "egress", "url": SECRET_URL},
            headers=HEADERS,
        )
        await client.patch(
            f"{API}/proxies/{created.json()['id']}", json={"url": SECRET_URL}, headers=HEADERS
        )
        await client.post(
            f"{API}/programs/{program.id}/proxies",
            json={"name": "bad", "url": "gopher://proxyuser:Sup3rS3cretPw@198.51.100.1"},
            headers=HEADERS,
        )
    assert not _leaks(json.dumps(captured, default=str))


@pytest.mark.parametrize(
    "url",
    [
        "socks5://198.51.100.1:1080",
        "socks5h://user:pw@proxy.test:1080",
        "socks4://198.51.100.1:1080",
        "https://[2001:db8::1]:8443",
        "http://proxy.test",
    ],
)
async def test_accepted_proxy_schemes(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession, url: str
) -> None:
    await logged_in(UserRole.ADMIN)
    program = await make_program(db_session)
    response = await client.post(
        f"{API}/programs/{program.id}/proxies", json={"name": "p", "url": url}, headers=HEADERS
    )
    assert response.status_code == 200


@pytest.mark.parametrize(
    "url",
    [
        "",
        "198.51.100.1:3128",
        "gopher://198.51.100.1",
        "http://",
        "http://198.51.100.1:99999",
        "http://198.51.100.1:0",
        "http://198.51.100.1:3128/path",
        "http://198.51.100.1 :3128",
        "http://" + "a" * 2100 + ".test",
    ],
)
async def test_rejected_proxy_urls_do_not_echo_the_value(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession, url: str
) -> None:
    await logged_in(UserRole.ADMIN)
    program = await make_program(db_session)
    response = await client.post(
        f"{API}/programs/{program.id}/proxies", json={"name": "p", "url": url}, headers=HEADERS
    )
    assert response.status_code == 422
    assert response.json()["errors"][0]["field"] == "url"
    if len(url) > 8:
        assert url not in response.text


async def test_duplicate_proxy_name_conflicts(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    await logged_in(UserRole.ADMIN)
    program = await make_program(db_session)
    await make_proxy(db_session, program, name="egress")
    response = await client.post(
        f"{API}/programs/{program.id}/proxies",
        json={"name": "egress", "url": SECRET_URL},
        headers=HEADERS,
    )
    assert response.status_code == 409
    assert response.json()["errors"] == [{"field": "name", "code": "already_exists"}]


async def test_same_proxy_name_in_another_program_is_fine(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    await logged_in(UserRole.ADMIN)
    await make_proxy(db_session, await make_program(db_session), name="egress")
    program = await make_program(db_session)
    response = await client.post(
        f"{API}/programs/{program.id}/proxies",
        json={"name": "egress", "url": SECRET_URL},
        headers=HEADERS,
    )
    assert response.status_code == 200


async def test_create_proxy_on_archived_program_conflicts(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    await logged_in(UserRole.ADMIN)
    program = await make_program(db_session, status=ProgramStatus.ARCHIVED)
    response = await client.post(
        f"{API}/programs/{program.id}/proxies",
        json={"name": "egress", "url": SECRET_URL},
        headers=HEADERS,
    )
    assert response.status_code == 409


async def test_create_proxy_on_missing_program_is_404(
    client: AsyncClient, logged_in: LoggedIn
) -> None:
    await logged_in(UserRole.ADMIN)
    response = await client.post(
        f"{API}/programs/{uuid.uuid4()}/proxies",
        json={"name": "egress", "url": SECRET_URL},
        headers=HEADERS,
    )
    assert response.status_code == 404


@pytest.mark.parametrize(("role", "allowed"), BY_ROLE)
async def test_patch_proxy_by_role(
    client: AsyncClient,
    logged_in: LoggedIn,
    db_session: AsyncSession,
    role: UserRole,
    allowed: bool,
) -> None:
    actor = await logged_in(role)
    program = await make_program(db_session)
    await assign(db_session, program, actor.id)
    proxy = await make_proxy(db_session, program, name="egress")
    response = await client.patch(
        f"{API}/proxies/{proxy.id}", json={"is_enabled": False, "name": "renamed"}, headers=HEADERS
    )
    assert response.status_code == (200 if allowed else 403)
    if allowed:
        assert response.json()["is_enabled"] is False
        assert response.json()["name"] == "renamed"


async def test_patch_replaces_url_and_logs_only_the_column_name(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    await logged_in(UserRole.ADMIN)
    program = await make_program(db_session)
    proxy = await make_proxy(db_session, program)
    response = await client.patch(
        f"{API}/proxies/{proxy.id}", json={"url": SECRET_URL}, headers=HEADERS
    )
    assert response.status_code == 200
    assert not _leaks(response.text)
    await db_session.flush()
    await db_session.refresh(proxy)
    assert decrypt(proxy.url_encrypted, context=CONTEXT) == SECRET_URL
    [entry] = (
        await db_session.scalars(select(AuditLog).where(AuditLog.action == "proxy_updated"))
    ).all()
    assert entry.detail == {"fields": ["url"]}
    assert entry.program_id == program.id


async def test_patch_proxy_rejects_null_url_and_name(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    await logged_in(UserRole.ADMIN)
    proxy = await make_proxy(db_session, await make_program(db_session))
    for body in ({"url": None}, {"name": None}, {"is_enabled": None}):
        response = await client.patch(f"{API}/proxies/{proxy.id}", json=body, headers=HEADERS)
        assert response.status_code == 422


async def test_patch_proxy_rename_onto_existing_conflicts(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    await logged_in(UserRole.ADMIN)
    program = await make_program(db_session)
    await make_proxy(db_session, program, name="taken")
    proxy = await make_proxy(db_session, program, name="mine")
    response = await client.patch(
        f"{API}/proxies/{proxy.id}", json={"name": "taken"}, headers=HEADERS
    )
    assert response.status_code == 409


async def test_patch_missing_proxy_is_404(client: AsyncClient, logged_in: LoggedIn) -> None:
    await logged_in(UserRole.ADMIN)
    response = await client.patch(
        f"{API}/proxies/{uuid.uuid4()}", json={"name": "x"}, headers=HEADERS
    )
    assert response.status_code == 404


async def test_patch_proxy_of_archived_program_conflicts(
    client: AsyncClient, logged_in: LoggedIn, db_session: AsyncSession
) -> None:
    await logged_in(UserRole.ADMIN)
    program = await make_program(db_session, status=ProgramStatus.ARCHIVED)
    proxy = await make_proxy(db_session, program)
    response = await client.patch(f"{API}/proxies/{proxy.id}", json={"name": "x"}, headers=HEADERS)
    assert response.status_code == 409


@pytest.mark.parametrize(("role", "allowed"), BY_ROLE)
async def test_delete_proxy_by_role(
    client: AsyncClient,
    logged_in: LoggedIn,
    db_session: AsyncSession,
    role: UserRole,
    allowed: bool,
) -> None:
    actor = await logged_in(role)
    program = await make_program(db_session)
    await assign(db_session, program, actor.id)
    proxy = await make_proxy(db_session, program)
    proxy_id = proxy.id
    response = await client.delete(f"{API}/proxies/{proxy_id}", headers=HEADERS)
    assert response.status_code == (204 if allowed else 403)
    await db_session.flush()
    db_session.expunge_all()
    assert (await db_session.get(Proxy, proxy_id) is None) is allowed
    if allowed:
        [entry] = (
            await db_session.scalars(select(AuditLog).where(AuditLog.action == "proxy_deleted"))
        ).all()
        assert entry.resource_id == proxy_id


async def test_delete_missing_proxy_is_404(client: AsyncClient, logged_in: LoggedIn) -> None:
    await logged_in(UserRole.ADMIN)
    assert (
        await client.delete(f"{API}/proxies/{uuid.uuid4()}", headers=HEADERS)
    ).status_code == 404
