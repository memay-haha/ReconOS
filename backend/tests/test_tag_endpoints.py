"""Tag catalogue and tags on assets: docs/security/authorization.md, row Gắn, gỡ tag."""

import uuid
from collections.abc import Awaitable, Callable

import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.asset import service as asset_service
from app.asset.ingest import Provenance
from app.asset.models import Domain, Ip
from app.asset.schemas import DomainRecord, IngestBatch, IpRecord
from app.core.identity import User, UserRole
from app.program.models import Program, ProgramStatus
from tests.factories import assign, make_program

API = "/api/v1"
HEADERS = {"origin": "https://reconos.example.com", "sec-fetch-site": "same-origin"}
LoggedIn = Callable[..., Awaitable[User]]


async def _program_with_assets(session: AsyncSession, **columns: object) -> Program:
    program = await make_program(session, **columns)  # type: ignore[arg-type]  # status passthrough
    await asset_service.ingest(
        session,
        IngestBatch(
            domains=[DomainRecord(name="a.example.com"), DomainRecord(name="b.example.com")],
            ips=[IpRecord(address="192.0.2.1")],
        ),
        Provenance(program.id, None, None),
        [],
    )
    return program


@pytest_asyncio.fixture
async def program(db_session: AsyncSession) -> Program:
    return await _program_with_assets(db_session)


async def _ids(session: AsyncSession, program: Program) -> list[uuid.UUID]:
    return list(
        await session.scalars(
            select(Domain.id).where(Domain.program_id == program.id).order_by(Domain.name)
        )
    )


async def _tag(client: AsyncClient, key: str = "env", value: str = "prod") -> str:
    response = await client.post(f"{API}/tags", json={"key": key, "value": value}, headers=HEADERS)
    assert response.status_code == 200
    tag_id: str = response.json()["id"]
    return tag_id


async def test_catalogue_create_list_and_duplicate(
    client: AsyncClient, logged_in: LoggedIn
) -> None:
    await logged_in(UserRole.USER)
    await _tag(client, "env", "prod")
    await _tag(client, "env", "dev")
    duplicate = await client.post(
        f"{API}/tags", json={"key": " env ", "value": "prod"}, headers=HEADERS
    )
    assert duplicate.status_code == 409
    first = (await client.get(f"{API}/tags", params={"limit": 1})).json()
    assert first["items"][0]["value"] == "dev"
    second = (
        await client.get(f"{API}/tags", params={"limit": 1, "cursor": first["next_cursor"]})
    ).json()
    assert second["items"][0]["value"] == "prod"
    assert (await client.get(f"{API}/tags", params={"cursor": "e30="})).status_code == 400


async def test_tag_untag_and_detail(
    client: AsyncClient, db_session: AsyncSession, logged_in: LoggedIn, program: Program
) -> None:
    user = await logged_in(UserRole.USER)
    await assign(db_session, program, user.id)
    tag_id = await _tag(client)
    domain_id = (await _ids(db_session, program))[0]
    created = await client.post(
        f"{API}/asset-tags", json={"tag_id": tag_id, "domain_id": str(domain_id)}, headers=HEADERS
    )
    assert created.status_code == 200
    assert created.json()["domain_id"] == str(domain_id)
    again = await client.post(
        f"{API}/asset-tags", json={"tag_id": tag_id, "domain_id": str(domain_id)}, headers=HEADERS
    )
    assert again.status_code == 409
    detail = (await client.get(f"{API}/domains/{domain_id}")).json()
    assert detail["tags"] == [
        {"id": created.json()["id"], "tag_id": tag_id, "key": "env", "value": "prod"}
    ]
    removed = await client.delete(f"{API}/asset-tags/{created.json()['id']}", headers=HEADERS)
    assert removed.status_code == 204
    assert (await client.get(f"{API}/domains/{domain_id}")).json()["tags"] == []
    two = await client.post(
        f"{API}/asset-tags",
        json={"tag_id": tag_id, "domain_id": str(domain_id), "ip_id": str(domain_id)},
        headers=HEADERS,
    )
    assert two.status_code == 422


async def test_bulk_tag_is_all_or_nothing_and_idempotent(
    client: AsyncClient, db_session: AsyncSession, logged_in: LoggedIn, program: Program
) -> None:
    await logged_in(UserRole.ADMIN)
    tag_id = await _tag(client)
    ids = [str(value) for value in await _ids(db_session, program)]
    missing = await client.post(
        f"{API}/asset-tags/bulk-create",
        json={"tag_id": tag_id, "asset_type": "domain", "ids": [*ids, str(uuid.uuid4())]},
        headers=HEADERS,
    )
    assert missing.status_code == 404
    for _ in range(2):
        response = await client.post(
            f"{API}/asset-tags/bulk-create",
            json={"tag_id": tag_id, "asset_type": "domain", "ids": ids},
            headers=HEADERS,
        )
        assert response.status_code == 204
    for domain_id in ids:
        tags = (await client.get(f"{API}/domains/{domain_id}")).json()["tags"]
        assert len(tags) == 1
    ip_id = await db_session.scalar(select(Ip.id).where(Ip.program_id == program.id))
    ip_tag = await client.post(
        f"{API}/asset-tags/bulk-create",
        json={"tag_id": tag_id, "asset_type": "ip", "ids": [str(ip_id)]},
        headers=HEADERS,
    )
    assert ip_tag.status_code == 204


async def test_unassigned_user_gets_404_and_archived_is_409(
    client: AsyncClient, db_session: AsyncSession, logged_in: LoggedIn, program: Program
) -> None:
    await logged_in(UserRole.USER)
    tag_id = await _tag(client)
    domain_id = (await _ids(db_session, program))[0]
    hidden = await client.post(
        f"{API}/asset-tags", json={"tag_id": tag_id, "domain_id": str(domain_id)}, headers=HEADERS
    )
    assert hidden.status_code == 404
    archived = await _program_with_assets(db_session, status=ProgramStatus.ARCHIVED)
    await client.post(f"{API}/auth/logout", headers=HEADERS)
    await logged_in(UserRole.ADMIN)
    frozen = (await _ids(db_session, archived))[0]
    response = await client.post(
        f"{API}/asset-tags", json={"tag_id": tag_id, "domain_id": str(frozen)}, headers=HEADERS
    )
    assert response.status_code == 409
    unknown_tag = await client.post(
        f"{API}/asset-tags",
        json={"tag_id": str(uuid.uuid4()), "domain_id": str(domain_id)},
        headers=HEADERS,
    )
    assert unknown_tag.status_code == 404
    assert (
        await client.delete(f"{API}/asset-tags/{uuid.uuid4()}", headers=HEADERS)
    ).status_code == 404


async def test_only_operators_delete_a_tag(
    client: AsyncClient, db_session: AsyncSession, logged_in: LoggedIn, program: Program
) -> None:
    await logged_in(UserRole.USER)
    tag_id = await _tag(client)
    assert (await client.delete(f"{API}/tags/{tag_id}", headers=HEADERS)).status_code == 403
    await client.post(f"{API}/auth/logout", headers=HEADERS)
    await logged_in(UserRole.ADMIN)
    domain_id = (await _ids(db_session, program))[0]
    await client.post(
        f"{API}/asset-tags", json={"tag_id": tag_id, "domain_id": str(domain_id)}, headers=HEADERS
    )
    assert (await client.delete(f"{API}/tags/{tag_id}", headers=HEADERS)).status_code == 204
    assert (await client.get(f"{API}/domains/{domain_id}")).json()["tags"] == []
    assert (await client.delete(f"{API}/tags/{tag_id}", headers=HEADERS)).status_code == 404
