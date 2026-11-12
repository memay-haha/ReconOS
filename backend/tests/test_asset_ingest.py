"""Asset upserts and scope marks: docs/data/database.md, sections Upsert và khử
trùng lặp, Đánh dấu scope."""

import pytest
import pytest_asyncio
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.asset import ingest
from app.asset import service as asset_service
from app.asset.ingest import Provenance
from app.asset.models import AssetEvent, Domain, Ip, Service, Url
from app.asset.schemas import (
    AddressRecord,
    DomainRecord,
    IngestBatch,
    ServiceRecord,
    UrlRecord,
)
from app.program.models import Program
from tests.factories import make_program, make_scope_rule


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("A.Example.COM.", "a.example.com"),
        ("*.example.com", "example.com"),
        ("example", None),
        ("bad_label-.example.com", None),
        ("192.0.2.1", None),
        ("exämple.com", None),
        ("a" * 64 + ".example.com", None),
    ],
)
def test_canonical_domain(raw: str, expected: str | None) -> None:
    assert ingest.canonical_domain(raw) == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("HTTPS://A.Example.com:443/#frag", "https://a.example.com/"),
        ("http://a.example.com:8080/x?y=1", "http://a.example.com:8080/x?y=1"),
        ("https://[2001:db8::1]:8443/", "https://[2001:db8::1]:8443/"),
        ("ftp://a.example.com/", None),
        ("https://a.example.com:99999/", None),
        ("https:///nohost", None),
    ],
)
def test_canonical_url(raw: str, expected: str | None) -> None:
    found = ingest.canonical_url(raw)
    assert (found.url if found else None) == expected


def test_canonical_ip_unmaps_ipv4() -> None:
    assert ingest.canonical_ip("::ffff:192.0.2.1") == "192.0.2.1"
    assert ingest.canonical_ip("[2001:db8::1]") == "2001:db8::1"
    assert ingest.canonical_ip("nope") is None


@pytest_asyncio.fixture
async def program(db_session: AsyncSession) -> Program:
    program = await make_program(db_session)
    await make_scope_rule(db_session, program, "*.example.com", rule_type="wildcard")
    return program


async def _ingest(session: AsyncSession, program: Program, batch: IngestBatch) -> None:
    rules = await asset_service.load_scope_rules(session, program.id)
    await asset_service.ingest(session, batch, Provenance(program.id, None, None), rules)


async def test_a_change_writes_one_changed_event_with_the_diff(
    db_session: AsyncSession, program: Program
) -> None:
    await _ingest(
        db_session,
        program,
        IngestBatch(domains=[DomainRecord(name="a.example.com", cname="old.example.net")]),
    )
    # A poorer tool that reports nothing about cname keeps the stored value.
    await _ingest(db_session, program, IngestBatch(domains=[DomainRecord(name="a.example.com")]))
    await _ingest(
        db_session,
        program,
        IngestBatch(domains=[DomainRecord(name="a.example.com", cname="new.example.net")]),
    )
    domain = await db_session.scalar(select(Domain).where(Domain.program_id == program.id))
    assert domain is not None and domain.cname == "new.example.net"
    assert domain.dns_status == "unknown"
    events = list(
        await db_session.scalars(
            select(AssetEvent).where(AssetEvent.domain_id == domain.id).order_by(AssetEvent.id)
        )
    )
    assert [event.event_type for event in events] == ["discovered", "changed"]
    assert events[1].diff == {"cname": {"old": "old.example.net", "new": "new.example.net"}}


async def test_unknown_dns_status_never_overwrites_a_known_one(
    db_session: AsyncSession, program: Program
) -> None:
    record = DomainRecord(
        name="a.example.com", addresses=[AddressRecord(address="192.0.2.1", record_type="a")]
    )
    await _ingest(db_session, program, IngestBatch(domains=[record]))
    await _ingest(db_session, program, IngestBatch(domains=[DomainRecord(name="a.example.com")]))
    domain = await db_session.scalar(select(Domain).where(Domain.program_id == program.id))
    assert domain is not None and domain.dns_status == "resolved"


async def test_a_soft_deleted_domain_stays_hidden(
    db_session: AsyncSession, program: Program
) -> None:
    await _ingest(db_session, program, IngestBatch(domains=[DomainRecord(name="a.example.com")]))
    await db_session.execute(
        update(Domain)
        .where(Domain.program_id == program.id)
        .values(deleted_at=Domain.first_seen_at)
    )
    await _ingest(
        db_session,
        program,
        IngestBatch(domains=[DomainRecord(name="a.example.com", cname="x.example.net")]),
    )
    domain = await db_session.scalar(select(Domain).where(Domain.program_id == program.id))
    assert domain is not None and domain.deleted_at is not None
    events = list(
        await db_session.scalars(
            select(AssetEvent.event_type).where(AssetEvent.domain_id == domain.id)
        )
    )
    assert events == ["discovered"]


async def test_duplicates_inside_one_batch_are_merged(
    db_session: AsyncSession, program: Program
) -> None:
    batch = IngestBatch(
        services=[
            ServiceRecord(address="192.0.2.1", port=443),
            ServiceRecord(address="192.0.2.1", port=443, name="https"),
        ],
        urls=[UrlRecord(url="https://a.example.com"), UrlRecord(url="HTTPS://a.example.com:443/")],
    )
    await _ingest(db_session, program, batch)
    services = list(
        await db_session.scalars(select(Service).where(Service.program_id == program.id))
    )
    assert [(service.port, service.name) for service in services] == [(443, "https")]
    urls = list(await db_session.scalars(select(Url).where(Url.program_id == program.id)))
    assert [url.url for url in urls] == ["https://a.example.com/"]


async def test_recompute_follows_a_rule_change(db_session: AsyncSession, program: Program) -> None:
    await _ingest(
        db_session,
        program,
        IngestBatch(
            domains=[DomainRecord(name="a.example.com"), DomainRecord(name="b.example.org")],
            services=[ServiceRecord(address="198.51.100.7", port=22)],
            urls=[UrlRecord(url="https://b.example.org/")],
        ),
    )
    await make_scope_rule(db_session, program, "*.example.org", rule_type="wildcard")
    await make_scope_rule(db_session, program, "198.51.100.0/24", rule_type="cidr")
    await make_scope_rule(
        db_session, program, "a.example.com", scope_type="out_of_scope", reason="excluded"
    )
    changed = await asset_service.recompute_in_scope(db_session, program.id)
    marks = {
        row.name: row.in_scope
        for row in await db_session.scalars(select(Domain).where(Domain.program_id == program.id))
    }
    assert marks == {"a.example.com": False, "b.example.org": True}
    ip = await db_session.scalar(select(Ip).where(Ip.program_id == program.id))
    service = await db_session.scalar(select(Service).where(Service.program_id == program.id))
    url = await db_session.scalar(select(Url).where(Url.program_id == program.id))
    assert ip is not None and ip.in_scope is True
    assert service is not None and service.in_scope is True
    assert url is not None and url.in_scope is True
    assert changed == 5
    # Nothing left to change: a second run is a no-op.
    assert await asset_service.recompute_in_scope(db_session, program.id) == 0
