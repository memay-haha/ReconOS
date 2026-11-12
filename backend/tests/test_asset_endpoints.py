"""Asset endpoints: reads per role, filters, soft delete, export (G7):
.claude/rules/testing.md, row Phân quyền."""

import csv
import io
import json
import uuid
from collections.abc import Awaitable, Callable

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.asset import service as asset_service
from app.asset.ingest import Provenance
from app.asset.models import Domain
from app.asset.schemas import (
    AddressRecord,
    DomainRecord,
    IngestBatch,
    IpRecord,
    ServiceRecord,
    TechnologyRecord,
    UrlRecord,
)
from app.core.audit import AuditLog
from app.core.identity import User, UserRole
from app.program.models import Program, ProgramStatus
from tests.factories import assign, make_program, make_scope_rule

API = "/api/v1"
HEADERS = {"origin": "https://reconos.example.com", "sec-fetch-site": "same-origin"}

LoggedIn = Callable[..., Awaitable[User]]


async def _seed(session: AsyncSession, program: Program) -> None:
    rules = await asset_service.load_scope_rules(session, program.id)
    batch = IngestBatch(
        domains=[
            DomainRecord(
                name="a.example.com",
                addresses=[AddressRecord(address="192.0.2.10", record_type="a")],
            ),
            DomainRecord(name="b.example.com", dns_status="nxdomain"),
            DomainRecord(name="other.example.org"),
        ],
        ips=[IpRecord(address="192.0.2.10", asn=64500, asn_org="EXAMPLE-NET")],
        services=[
            ServiceRecord(address="192.0.2.10", port=443, name="https"),
            ServiceRecord(address="192.0.2.10", port=22, name="ssh"),
        ],
        urls=[
            UrlRecord(
                url="https://a.example.com/",
                title="=HYPERLINK(1)",
                technologies=[TechnologyRecord(name="nginx", version="1.25", category="web")],
            ),
        ],
    )
    await asset_service.ingest(session, batch, Provenance(program.id, None, None), rules)


@pytest_asyncio.fixture
async def program(db_session: AsyncSession) -> Program:
    program = await make_program(db_session)
    await make_scope_rule(db_session, program, "*.example.com", rule_type="wildcard")
    await _seed(db_session, program)
    return program


@pytest_asyncio.fixture
async def other_program(db_session: AsyncSession) -> Program:
    program = await make_program(db_session)
    rules = await asset_service.load_scope_rules(db_session, program.id)
    await asset_service.ingest(
        db_session,
        IngestBatch(domains=[DomainRecord(name="hidden.example.net")]),
        Provenance(program.id, None, None),
        rules,
    )
    return program


async def _domain_id(session: AsyncSession, program: Program, name: str) -> uuid.UUID:
    found = await session.scalar(
        select(Domain.id).where(Domain.program_id == program.id, Domain.name == name)
    )
    assert found is not None
    return found


@pytest.mark.parametrize("role", [UserRole.SUPERADMIN, UserRole.ADMIN])
async def test_operators_list_every_program(
    client: AsyncClient,
    logged_in: LoggedIn,
    program: Program,
    other_program: Program,
    role: UserRole,
) -> None:
    await logged_in(role)
    body = (await client.get(f"{API}/domains", params={"limit": 200})).json()
    names = {row["name"] for row in body["items"]}
    assert {"a.example.com", "hidden.example.net"} <= names


async def test_user_sees_only_assigned_programs(
    client: AsyncClient,
    db_session: AsyncSession,
    logged_in: LoggedIn,
    program: Program,
    other_program: Program,
) -> None:
    user = await logged_in(UserRole.USER)
    await assign(db_session, program, user.id)
    body = (await client.get(f"{API}/domains")).json()
    assert {row["name"] for row in body["items"]} == {
        "a.example.com",
        "b.example.com",
        "other.example.org",
    }
    hidden = await _domain_id(db_session, other_program, "hidden.example.net")
    assert (await client.get(f"{API}/domains/{hidden}")).status_code == 404
    assert (await client.get(f"{API}/domains/{hidden}/activity")).status_code == 404
    events = (await client.get(f"{API}/asset-events")).json()["items"]
    assert {event["program_id"] for event in events} == {str(program.id)}
    for path in ("/ips", "/urls", "/services"):
        rows = (await client.get(f"{API}{path}")).json()["items"]
        assert {row["program_id"] for row in rows} == {str(program.id)}


async def test_domain_row_detail_and_filters(
    client: AsyncClient, db_session: AsyncSession, logged_in: LoggedIn, program: Program
) -> None:
    await logged_in(UserRole.ADMIN)
    params = {"program_id": str(program.id)}
    rows = (await client.get(f"{API}/domains", params=params)).json()["items"]
    assert [row["name"] for row in rows] == ["a.example.com", "b.example.com", "other.example.org"]
    first = rows[0]
    assert first["ips"] == ["192.0.2.10"]
    assert (first["url_count"], first["service_count"]) == (1, 2)
    assert (first["asn"], first["asn_org"]) == (64500, "EXAMPLE-NET")
    assert first["finding_counts"] == {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
    assert first["in_scope"] is True
    assert rows[2]["in_scope"] is False

    def names(response_rows: list[dict[str, object]]) -> list[object]:
        return [row["name"] for row in response_rows]

    by_status = await client.get(
        f"{API}/domains", params={**params, "dns_status": ["nxdomain", "timeout"]}
    )
    assert names(by_status.json()["items"]) == ["b.example.com"]
    wildcard = await client.get(f"{API}/domains", params={**params, "q": "*.example.com"})
    assert names(wildcard.json()["items"]) == ["a.example.com", "b.example.com"]
    out = await client.get(f"{API}/domains", params={**params, "in_scope": "false"})
    assert names(out.json()["items"]) == ["other.example.org"]
    with_findings = await client.get(f"{API}/domains", params={**params, "has_findings": "true"})
    assert with_findings.json()["total"] == 0
    descending = await client.get(f"{API}/domains", params={**params, "sort": "-name", "limit": 2})
    page = descending.json()
    assert names(page["items"]) == ["other.example.org", "b.example.com"]
    rest = await client.get(
        f"{API}/domains",
        params={**params, "sort": "-name", "limit": 2, "cursor": page["next_cursor"]},
    )
    assert names(rest.json()["items"]) == ["a.example.com"]

    detail = (await client.get(f"{API}/domains/{first['id']}")).json()
    assert detail["ip_records"] == [{"address": "192.0.2.10", "record_type": "a"}]
    assert detail["service_ports"] == [22, 443]
    assert detail["tags"] == []

    summary = (await client.get(f"{API}/domains/summary", params=params)).json()
    assert summary["total"] == 3
    assert summary["in_scope"] == 2
    assert summary["resolved"] == 1
    assert summary["unresolved"] == 1
    assert summary["new_24h"] == 3

    activity = (await client.get(f"{API}/domains/{first['id']}/activity")).json()
    assert [item["title"] for item in activity["items"]] == ["Discovered"]


async def test_ips_urls_services_and_events(
    client: AsyncClient, db_session: AsyncSession, logged_in: LoggedIn, program: Program
) -> None:
    await logged_in(UserRole.ADMIN)
    params = {"program_id": str(program.id)}
    ips = (await client.get(f"{API}/ips", params=params)).json()["items"]
    assert [ip["address"] for ip in ips] == ["192.0.2.10"]
    assert (await client.get(f"{API}/ips/{ips[0]['id']}")).json()["asn"] == 64500
    by_q = await client.get(f"{API}/ips", params={**params, "q": "192.0.2.*"})
    assert by_q.json()["total"] == 1

    domain_id = await _domain_id(db_session, program, "a.example.com")
    urls = (await client.get(f"{API}/urls", params={"domain_id": str(domain_id)})).json()["items"]
    assert [url["url"] for url in urls] == ["https://a.example.com/"]
    detail = (await client.get(f"{API}/urls/{urls[0]['id']}")).json()
    assert detail["technologies"][0]["name"] == "nginx"
    assert detail["technologies"][0]["version"] == "1.25"

    services = (await client.get(f"{API}/services", params={"domain_id": str(domain_id)})).json()[
        "items"
    ]
    assert {service["port"] for service in services} == {22, 443}
    one = await client.get(f"{API}/services/{services[0]['id']}")
    assert one.status_code == 200

    events = (await client.get(f"{API}/asset-events", params=params)).json()
    assert events["total"] == 7
    ip_event = next(event for event in events["items"] if event["asset_type"] == "ip")
    assert (ip_event["asset_name"], ip_event["asn"]) == ("192.0.2.10", 64500)
    service_event = next(e for e in events["items"] if e["asset_type"] == "service")
    assert service_event["asset_name"].startswith("192.0.2.10:")
    oldest = await client.get(
        f"{API}/asset-events", params={"domain_id": str(domain_id), "sort": "created_at"}
    )
    kinds = [event["asset_type"] for event in oldest.json()["items"]]
    assert kinds == ["domain", "url"]

    technologies = (await client.get(f"{API}/technologies")).json()["items"]
    assert "nginx" in {row["name"] for row in technologies}

    missing = uuid.uuid4()
    for path in (f"/ips/{missing}", f"/urls/{missing}", f"/services/{missing}"):
        assert (await client.get(f"{API}{path}")).status_code == 404


async def test_export_formats_escape_untrusted_cells(
    client: AsyncClient, logged_in: LoggedIn, program: Program
) -> None:
    await logged_in(UserRole.ADMIN)
    params = {"program_id": str(program.id)}
    response = await client.get(f"{API}/urls/export", params={**params, "format": "csv"})
    assert response.status_code == 200
    assert response.headers["content-disposition"] == 'attachment; filename="urls.csv"'
    rows = list(csv.DictReader(io.StringIO(response.text)))
    assert rows[0]["title"] == "'=HYPERLINK(1)"
    jsonl = await client.get(f"{API}/domains/export", params={**params, "format": "jsonl"})
    lines = [json.loads(line) for line in jsonl.text.splitlines()]
    assert [line["name"] for line in lines] == [
        "a.example.com",
        "b.example.com",
        "other.example.org",
    ]
    picked = await client.get(
        f"{API}/domains/export", params={"format": "md", "ids": [lines[1]["id"]]}
    )
    assert picked.text.count("\n") == 3
    assert "b.example.com" in picked.text
    for path in ("/ips/export", "/services/export"):
        assert (await client.get(f"{API}{path}", params=params)).status_code == 200


async def test_soft_delete_by_operator(
    client: AsyncClient, db_session: AsyncSession, logged_in: LoggedIn, program: Program
) -> None:
    await logged_in(UserRole.ADMIN)
    target = await _domain_id(db_session, program, "b.example.com")
    response = await client.delete(f"{API}/domains/{target}", headers=HEADERS)
    assert response.status_code == 204
    assert (await client.get(f"{API}/domains/{target}")).status_code == 404
    names = {
        row["name"]
        for row in (
            await client.get(f"{API}/domains", params={"program_id": str(program.id)})
        ).json()["items"]
    }
    assert "b.example.com" not in names
    domain = await db_session.get(Domain, target)
    assert domain is not None and domain.deleted_at is not None
    audit = await db_session.scalar(
        select(AuditLog).where(AuditLog.action == "domain_deleted", AuditLog.resource_id == target)
    )
    assert audit is not None and audit.detail == {"name": "b.example.com"}
    # Deleting it again: it no longer exists.
    assert (await client.delete(f"{API}/domains/{target}", headers=HEADERS)).status_code == 404


async def test_bulk_delete_is_all_or_nothing(
    client: AsyncClient, db_session: AsyncSession, logged_in: LoggedIn, program: Program
) -> None:
    await logged_in(UserRole.SUPERADMIN)
    keep = await _domain_id(db_session, program, "a.example.com")
    response = await client.post(
        f"{API}/domains/bulk-delete", json={"ids": [str(keep), str(uuid.uuid4())]}, headers=HEADERS
    )
    assert response.status_code == 404
    assert (await client.get(f"{API}/domains/{keep}")).status_code == 200
    done = await client.post(
        f"{API}/domains/bulk-delete", json={"ids": [str(keep)]}, headers=HEADERS
    )
    assert done.status_code == 204


async def test_user_cannot_delete_and_archived_is_read_only(
    client: AsyncClient,
    db_session: AsyncSession,
    logged_in: LoggedIn,
    program: Program,
    user_factory: Callable[..., Awaitable[User]],
) -> None:
    user = await logged_in(UserRole.USER)
    await assign(db_session, program, user.id)
    target = await _domain_id(db_session, program, "a.example.com")
    assert (await client.delete(f"{API}/domains/{target}", headers=HEADERS)).status_code == 403

    archived = await make_program(db_session, status=ProgramStatus.ARCHIVED)
    rules = await asset_service.load_scope_rules(db_session, archived.id)
    await asset_service.ingest(
        db_session,
        IngestBatch(domains=[DomainRecord(name="z.example.com")]),
        Provenance(archived.id, None, None),
        rules,
    )
    await client.post(f"{API}/auth/logout", headers=HEADERS)
    await logged_in(UserRole.ADMIN)
    frozen = await _domain_id(db_session, archived, "z.example.com")
    assert (await client.delete(f"{API}/domains/{frozen}", headers=HEADERS)).status_code == 409


async def test_program_status_filter(
    client: AsyncClient, db_session: AsyncSession, logged_in: LoggedIn, program: Program
) -> None:
    await logged_in(UserRole.ADMIN)
    paused = await make_program(db_session, status=ProgramStatus.PAUSED)
    await asset_service.ingest(
        db_session,
        IngestBatch(domains=[DomainRecord(name="p.example.com")]),
        Provenance(paused.id, None, None),
        [],
    )
    body = (await client.get(f"{API}/domains", params={"program_status": "paused"})).json()
    assert str(paused.id) in {row["program_id"] for row in body["items"]}
    assert str(program.id) not in {row["program_id"] for row in body["items"]}


async def test_bad_cursor_is_400(client: AsyncClient, logged_in: LoggedIn) -> None:
    await logged_in(UserRole.ADMIN)
    assert (await client.get(f"{API}/domains", params={"cursor": "%%%"})).status_code == 400
    assert (await client.get(f"{API}/technologies", params={"cursor": "e30="})).status_code == 400
