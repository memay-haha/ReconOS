"""Osmedeus parser and the parse service: .claude/rules/testing.md, row Parser.

The sample raw output lives in tests/fixtures/raw_output/osmedeus-general/ and
is zipped here the way the runner packs it. Parsing twice adds no row.
"""

import uuid
import zipfile
from collections.abc import AsyncIterator, Callable
from pathlib import Path

import pytest
import pytest_asyncio
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.asset.models import AssetEvent, Domain, DomainIp, Ip, Service, Technology, Url
from app.asset.schemas import IngestBatch
from app.core.realtime import take_pending_events
from app.finding.models import Finding
from app.finding.schemas import FindingBatch
from app.job.models import Job
from app.parser import base, osmedeus
from app.parser import service as parser_service
from app.parser.base import ParseDataError, ParseStats, dedup_key
from app.parser.osmedeus import OsmedeusParser
from app.parser.osmedeus_general import OsmedeusGeneralParser
from app.parser.registry import parser_for
from app.program.models import Program
from app.raw_output import service as raw_output_service
from app.raw_output.models import RawOutput
from tests.factories import (
    make_job,
    make_program,
    make_raw_output,
    make_scope_rule,
    tool_module_named,
    tool_module_without_parser,
    zip_directory,
)

SAMPLE = Path(__file__).parent / "fixtures" / "raw_output" / "osmedeus-general" / "osmedeus"


@pytest.fixture
def sample_zip(tmp_path: Path) -> Path:
    return zip_directory(SAMPLE, tmp_path / "osmedeus.zip")


def _collect(path: Path) -> tuple[IngestBatch, ParseStats]:
    stats = ParseStats()
    merged = IngestBatch()
    for batch in OsmedeusGeneralParser().parse(path, stats, "osmedeus-general"):
        if isinstance(batch, FindingBatch):
            continue
        merged.domains.extend(batch.domains)
        merged.ips.extend(batch.ips)
        merged.services.extend(batch.services)
        merged.urls.extend(batch.urls)
    return merged, stats


# ---------------------------------------------------------------- the parser alone


def test_every_osmedeus_tool_module_has_this_parser() -> None:
    for name in ("osmedeus-domain-lite", "osmedeus-general", "osmedeus-domain-extensive"):
        assert isinstance(parser_for(name), OsmedeusParser)
        assert raw_output_service.has_parser(name)
    assert not isinstance(parser_for("nuclei"), OsmedeusParser)


def test_sample_package_yields_records_and_drops_bad_lines(sample_zip: Path) -> None:
    found, stats = _collect(sample_zip)
    names = {record.name for record in found.domains}
    assert {"example.com", "a.example.com", "b.example.com", "outside.example.org"} <= names
    dnsx = {record.name: record for record in found.domains if record.dns_status is not None}
    assert dnsx["b.example.com"].dns_status == "nxdomain"
    assert dnsx["outside.example.org"].cname == "edge.example.net"
    assert [(a.address, a.record_type) for a in dnsx["a.example.com"].addresses] == [
        ("192.0.2.10", "a")
    ]
    assert {(record.address, record.port) for record in found.services} == {
        ("192.0.2.10", 443),
        ("192.0.2.10", 8080),
    }
    httpx = next(record for record in found.urls if record.title == "Example A")
    assert httpx.status_code == 200
    assert [(tech.name, tech.version) for tech in httpx.technologies] == [
        ("Nginx", "1.25.3"),
        ("HSTS", None),
    ]
    assert httpx.tls_not_after is not None
    asn = next(record for record in found.ips if record.asn is not None)
    assert (asn.address, asn.asn, asn.asn_org) == ("192.0.2.10", 64500, "EXAMPLE-NET")
    # Broken JSON, a JSON array, an httpx line without url, a port line with a
    # name or no number: each dropped, none fatal.
    assert stats.dropped == 5
    # The nuclei line of the package is a finding now, not a skip.
    assert stats.skipped_kinds == {}


def test_a_run_without_output_is_skipped(tmp_path: Path) -> None:
    target = zip_directory(SAMPLE, tmp_path / "osmedeus.zip")
    with zipfile.ZipFile(target, "a") as archive:
        archive.writestr("2/subdomain/final-x.txt", "skipped.example.com\n")
    found, _ = _collect(target)
    assert "skipped.example.com" not in {record.name for record in found.domains}


def test_hostile_member_names_are_never_opened(tmp_path: Path) -> None:
    target = zip_directory(SAMPLE, tmp_path / "osmedeus.zip")
    with zipfile.ZipFile(target, "a") as archive:
        archive.writestr("../escape.txt", "evil.example.com\n")
        archive.writestr("/abs/final.txt", "evil.example.com\n")
    found, _ = _collect(target)
    assert "evil.example.com" not in {record.name for record in found.domains}
    assert not (tmp_path.parent / "escape.txt").exists()


def test_not_a_zip_is_a_data_error(tmp_path: Path) -> None:
    path = tmp_path / "osmedeus.zip"
    path.write_bytes(b"plain text, not an archive")
    with pytest.raises(ParseDataError, match="not a zip"):
        _collect(path)


def test_missing_or_invalid_manifest_is_a_data_error(tmp_path: Path) -> None:
    empty = tmp_path / "empty.zip"
    with zipfile.ZipFile(empty, "w") as archive:
        archive.writestr("1/subdomain/final-x.txt", "a.example.com\n")
    with pytest.raises(ParseDataError, match="no manifest"):
        _collect(empty)
    invalid = tmp_path / "invalid.zip"
    with zipfile.ZipFile(invalid, "w") as archive:
        archive.writestr("manifest.json", '{"tool_module": "x"}')
    with pytest.raises(ParseDataError, match="not valid"):
        _collect(invalid)


def test_unpacked_size_is_capped(sample_zip: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(osmedeus, "MAX_UNPACKED_BYTES", 600)
    with pytest.raises(ParseDataError, match="size limit"):
        _collect(sample_zip)


def test_member_count_is_capped(sample_zip: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(osmedeus, "MAX_ARCHIVE_MEMBERS", 3)
    with pytest.raises(ParseDataError, match="too many members"):
        _collect(sample_zip)


def test_an_oversized_line_is_dropped(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(base, "MAX_LINE_BYTES", 64)
    source = tmp_path / "tree"
    workspace = "w1"
    (source / "1" / "subdomain").mkdir(parents=True)
    (source / "manifest.json").write_text(
        '{"tool_module":"osmedeus-general","flow":"general","runs":[{"index":1,'
        f'"target":"example.com","workspace":"{workspace}","status":"completed",'
        '"has_output":true}]}'
    )
    (source / "1" / "subdomain" / f"final-{workspace}.txt").write_text(
        "a" * 200 + ".example.com\nshort.example.com\n"
    )
    found, stats = _collect(zip_directory(source, tmp_path / "osmedeus.zip"))
    assert [record.name for record in found.domains] == ["short.example.com"]
    assert stats.dropped == 1


def test_dedup_key_starts_with_the_tool_module() -> None:
    key = dedup_key("osmedeus-general", "tech-detect", "https://a.example.com")
    assert key.startswith("osmedeus-general:")
    assert key == dedup_key("osmedeus-general", "tech-detect", "https://a.example.com")
    assert key != dedup_key("nuclei", "tech-detect", "https://a.example.com")


# ---------------------------------------------------------------- the parse service


@pytest_asyncio.fixture
async def scoped_program(db_session: AsyncSession) -> Program:
    program = await make_program(db_session)
    await make_scope_rule(db_session, program, "example.com")
    await make_scope_rule(db_session, program, "*.example.com", rule_type="wildcard")
    await make_scope_rule(db_session, program, "192.0.2.0/24", rule_type="cidr")
    await make_scope_rule(
        db_session,
        program,
        "b.example.com",
        scope_type="out_of_scope",
        reason="third party",
    )
    return program


@pytest_asyncio.fixture
async def osmedeus_job(db_session: AsyncSession, scoped_program: Program) -> Job:
    tool = await tool_module_named(db_session, "osmedeus-general")
    return await make_job(db_session, scoped_program, tool, status="completed")


def _opener(path: Path) -> Callable[[str], AsyncIterator[bytes]]:
    data = path.read_bytes()

    async def open_stream(_: str) -> AsyncIterator[bytes]:
        for start in range(0, len(data), 1000):
            yield data[start : start + 1000]

    return open_stream


async def _count(session: AsyncSession, model: type[object], program: Program) -> int:
    column = model.program_id  # type: ignore[attr-defined]  # every asset table has it
    return await session.scalar(select(func.count()).where(column == program.id)) or 0


async def test_parse_writes_assets_marks_scope_and_is_idempotent(
    db_session: AsyncSession, scoped_program: Program, osmedeus_job: Job, sample_zip: Path
) -> None:
    raw = await make_raw_output(db_session, osmedeus_job)
    outcome = await parser_service.parse_raw_output(
        db_session, raw.id, open_stream=_opener(sample_zip)
    )
    assert outcome.status == "parsed"
    assert outcome.found.model_dump() == {"domain": 4, "ip": 3, "url": 3, "service": 2}
    await db_session.refresh(raw)
    assert raw.parse_status == "parsed"
    assert raw.parsed_at is not None
    assert raw.parse_error is None

    domains = {
        row.name: row
        for row in await db_session.scalars(
            select(Domain).where(Domain.program_id == scoped_program.id)
        )
    }
    assert set(domains) == {"example.com", "a.example.com", "b.example.com", "outside.example.org"}
    # Out-of-scope assets are stored and marked, never dropped.
    assert domains["a.example.com"].in_scope is True
    assert domains["example.com"].in_scope is True
    assert domains["b.example.com"].in_scope is False
    assert domains["outside.example.org"].in_scope is False
    assert domains["a.example.com"].dns_status == "resolved"
    assert domains["b.example.com"].dns_status == "nxdomain"
    assert domains["outside.example.org"].apex == "example.org"
    assert domains["a.example.com"].apex == "example.com"

    ip = await db_session.scalar(
        select(Ip).where(Ip.program_id == scoped_program.id, Ip.asn == 64500)
    )
    assert ip is not None and ip.in_scope is True and ip.asn_org == "EXAMPLE-NET"
    links = await db_session.scalar(
        select(func.count())
        .select_from(DomainIp)
        .where(DomainIp.domain_id.in_([d.id for d in domains.values()]))
    )
    assert links == 2
    services = list(
        await db_session.scalars(select(Service).where(Service.program_id == scoped_program.id))
    )
    assert {service.port for service in services} == {443, 8080}
    assert all(service.in_scope for service in services)
    urls = {
        row.url: row
        for row in await db_session.scalars(select(Url).where(Url.program_id == scoped_program.id))
    }
    assert set(urls) == {
        "https://a.example.com/",
        "http://a.example.com:8080/login",
        "https://192.0.2.10:8443/",
    }
    assert urls["https://a.example.com/"].domain_id == domains["a.example.com"].id
    assert urls["https://192.0.2.10:8443/"].ip_id == ip.id
    assert urls["http://a.example.com:8080/login"].status_code == 302
    assert await db_session.scalar(select(Technology.id).where(Technology.name == "Nginx"))

    events = await db_session.scalar(
        select(func.count())
        .select_from(AssetEvent)
        .where(AssetEvent.program_id == scoped_program.id, AssetEvent.event_type == "discovered")
    )
    assert events == 12
    sent = take_pending_events(db_session)
    # The only finding is info, so no finding_new; one asset_new for the job:
    # docs/data/schema.md, alert.alert_type.
    assert [event["type"] for event in sent] == [
        "asset.discovered",
        "finding.created",
        "alert.created",
    ]
    assert sent[2]["data"]["alert_type"] == "asset_new"
    assert sent[0]["data"]["job_id"] == str(osmedeus_job.id)
    # The nuclei result of the package, keyed by this Osmedeus tool module.
    finding = await db_session.scalar(
        select(Finding).where(Finding.program_id == scoped_program.id)
    )
    assert finding is not None
    assert finding.dedup_key == dedup_key(
        "osmedeus-general", "tech-detect", "https://a.example.com"
    )
    assert finding.url_id == urls["https://a.example.com/"].id
    assert finding.raw_output_id == raw.id
    assert sent[1]["data"] == {
        "job_id": str(osmedeus_job.id),
        "count": 1,
        "by_severity": {"info": 1},
    }

    # Parse the same file again, as a reparse does: no new row, no new event.
    raw.parse_status = "pending"
    await db_session.flush()
    again = await parser_service.parse_raw_output(
        db_session, raw.id, open_stream=_opener(sample_zip)
    )
    assert again.found.total == 0
    assert (again.findings.created, again.findings.seen_again) == (0, 1)
    for model, expected in ((Domain, 4), (Ip, 3), (Service, 2), (Url, 3), (Finding, 1)):
        assert await _count(db_session, model, scoped_program) == expected
    assert (
        await db_session.scalar(
            select(func.count())
            .select_from(AssetEvent)
            .where(AssetEvent.program_id == scoped_program.id)
        )
        == 12
    )
    assert take_pending_events(db_session) == []


async def test_a_raw_output_not_pending_is_left_alone(
    db_session: AsyncSession, osmedeus_job: Job, sample_zip: Path
) -> None:
    raw = await make_raw_output(db_session, osmedeus_job, parse_status="parsed")
    outcome = await parser_service.parse_raw_output(
        db_session, raw.id, open_stream=_opener(sample_zip)
    )
    assert outcome.status is None


async def test_a_tool_module_without_parser_is_marked_no_parser(
    db_session: AsyncSession, scoped_program: Program, sample_zip: Path
) -> None:
    tool = await tool_module_without_parser(db_session)
    job = await make_job(db_session, scoped_program, tool, status="completed")
    raw = await make_raw_output(db_session, job, filename="output.txt")
    outcome = await parser_service.parse_raw_output(
        db_session, raw.id, open_stream=_opener(sample_zip)
    )
    assert outcome.status == "no_parser"
    await db_session.refresh(raw)
    assert raw.parse_status == "no_parser"


async def test_a_data_error_leaves_no_asset_and_mark_failed_keeps_a_short_reason(
    db_session: AsyncSession, scoped_program: Program, osmedeus_job: Job, tmp_path: Path
) -> None:
    raw = await make_raw_output(db_session, osmedeus_job)
    bad = tmp_path / "bad.zip"
    bad.write_bytes(b"not a zip")
    with pytest.raises(ParseDataError):
        await parser_service.parse_raw_output(db_session, raw.id, open_stream=_opener(bad))
    await parser_service.mark_failed(db_session, raw.id, "raw output is not a zip archive")
    await db_session.refresh(raw)
    assert raw.parse_status == "failed"
    assert raw.parse_error == "raw output is not a zip archive"
    assert await _count(db_session, Domain, scoped_program) == 0
    # A late duplicate cannot move a finished row.
    await parser_service.mark_failed(db_session, raw.id, "other")
    await db_session.refresh(raw)
    assert raw.parse_error == "raw output is not a zip archive"


async def test_the_parser_never_writes_the_stored_object(
    db_session: AsyncSession, osmedeus_job: Job, sample_zip: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """G8: the parse reads through `open_stored` only; no storage write is reachable."""
    from app.core import storage

    def forbidden(*_: object, **__: object) -> None:
        raise AssertionError("the parser touched object storage for writing")

    for name in ("put_object_stream", "put_object_from_stream", "delete_object", "delete_prefix"):
        monkeypatch.setattr(storage, name, forbidden)
    raw = await make_raw_output(db_session, osmedeus_job)
    outcome = await parser_service.parse_raw_output(
        db_session, raw.id, open_stream=_opener(sample_zip)
    )
    assert outcome.status == "parsed"
    stored = await db_session.get(RawOutput, raw.id)
    assert stored is not None and stored.sha256 == "0" * 64


async def test_unknown_raw_output_is_nothing_to_do(db_session: AsyncSession) -> None:
    outcome = await parser_service.parse_raw_output(db_session, uuid.uuid4())
    assert outcome.status is None
