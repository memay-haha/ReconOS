"""Nuclei parser and the finding ingest: .claude/rules/testing.md, row Parser.

The sample raw output lives in tests/fixtures/raw_output/nuclei/. Parsing twice
adds no finding and keeps the triage state (business-flow.md, Vòng đời finding).
"""

import json
from collections.abc import AsyncIterator, Callable
from pathlib import Path

import pytest
import pytest_asyncio
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.asset.models import Domain, Ip, Service, Url
from app.asset.schemas import DomainRecord, IpRecord, ServiceRecord, UrlRecord
from app.core.realtime import take_pending_events
from app.finding.models import Finding
from app.finding.schemas import MAX_HTTP_MESSAGE, FindingBatch, FindingRecord
from app.job.models import Job
from app.parser import service as parser_service
from app.parser.base import ParseStats, dedup_key
from app.parser.nuclei import NucleiParser, finding_from_line
from app.parser.registry import parser_for
from app.program.models import Program
from app.raw_output import service as raw_output_service
from tests.factories import make_job, make_program, make_raw_output, make_scope_rule, nuclei

SAMPLE = Path(__file__).parent / "fixtures" / "raw_output" / "nuclei" / "nuclei.jsonl"


def _collect(path: Path = SAMPLE) -> tuple[list[FindingRecord], ParseStats]:
    stats = ParseStats()
    found: list[FindingRecord] = []
    for batch in NucleiParser().parse(path, stats, "nuclei"):
        assert isinstance(batch, FindingBatch)
        found.extend(batch.findings)
    return found, stats


def _line(**fields: object) -> str:
    base: dict[str, object] = {
        "template-id": "git-config",
        "info": {"name": "Git Config", "severity": "medium"},
        "matched-at": "https://a.example.com/.git/config",
    }
    return json.dumps({**base, **fields})


# ---------------------------------------------------------------- the parser alone


def test_nuclei_has_this_parser() -> None:
    assert isinstance(parser_for("nuclei"), NucleiParser)
    assert raw_output_service.has_parser("nuclei")


def test_sample_yields_findings_and_drops_bad_lines() -> None:
    found, stats = _collect()
    by_template: dict[str | None, FindingRecord] = {}
    for record in found:
        by_template.setdefault(record.template_id, record)
    # Seven results, one printed twice: the service merges that pair by key.
    assert len(found) == 7
    assert set(by_template) == {
        "git-config",
        "CVE-2021-44228",
        "openssh-detect",
        "dns-caa",
        "weak-cipher",
        "tech-detect",
    }
    # Broken JSON, a JSON array, no template-id, an ftp:// match, a log line.
    assert stats.dropped == 5

    git = by_template["git-config"]
    assert git.dedup_key == dedup_key("nuclei", "git-config", "https://a.example.com/.git/config")
    assert git.dedup_key.startswith("nuclei:")
    assert git.severity == "medium"
    assert git.asset == UrlRecord(url="https://a.example.com/.git/config")
    assert git.evidence == "[core]"
    assert git.detail["matcher"] == "status-and-body"
    assert git.detail["description"] == "Git configuration was detected."
    assert git.detail["remediation"] == "Block access to the .git directory."
    assert git.detail["request"].startswith("GET /.git/config")
    assert git.detail["response"].startswith("HTTP/1.1 200 OK")
    assert git.detail["cwe"] == ["cwe-200"]
    assert git.detail["tags"] == ["config", "git", "exposure"]

    log4j = by_template["CVE-2021-44228"]
    assert log4j.severity == "critical"
    assert log4j.cve == ["CVE-2021-44228"]
    assert log4j.detail["cvss_score"] == 10
    # The payload in the query keys the finding but never becomes an asset.
    assert "jndi" in (log4j.matched_at or "")
    assert log4j.asset == UrlRecord(url="https://a.example.com/api/login")
    # Five keys always present, None when nuclei did not report them.
    assert log4j.detail["description"] is None

    assert by_template["openssh-detect"].asset == ServiceRecord(address="192.0.2.10", port=22)
    assert by_template["weak-cipher"].asset == ServiceRecord(address="198.51.100.7", port=443)
    assert by_template["dns-caa"].asset == DomainRecord(name="b.example.com")
    # nuclei's `unknown` severity reads as info.
    assert by_template["tech-detect"].severity == "info"


@pytest.mark.parametrize(
    ("matched_at", "ip", "asset"),
    [
        ("https://a.example.com/x?q=1#f", None, UrlRecord(url="https://a.example.com/x")),
        ("192.0.2.5", None, IpRecord(address="192.0.2.5")),
        ("[2001:db8::1]:8443", None, ServiceRecord(address="2001:db8::1", port=8443)),
        ("c.example.com:25", None, DomainRecord(name="c.example.com")),
        ("c.example.com:25", "192.0.2.9", ServiceRecord(address="192.0.2.9", port=25)),
        ("c.example.com", None, DomainRecord(name="c.example.com")),
    ],
)
def test_matched_at_names_the_asset(matched_at: str, ip: str | None, asset: object) -> None:
    fields: dict[str, object] = {"matched-at": matched_at}
    if ip is not None:
        fields["ip"] = ip
    assert finding_from_line(_line(**fields), "nuclei").asset == asset


def test_untrusted_values_are_bounded() -> None:
    huge = "A" * (MAX_HTTP_MESSAGE + 100)
    record = finding_from_line(
        _line(
            request=huge,
            **{"extracted-results": [f"value-{n}" for n in range(500)]},
            info={"name": "N" * 5000, "severity": "HIGH", "reference": "https://example.org/r"},
        ),
        "nuclei",
    )
    assert len(record.detail["request"]) == MAX_HTTP_MESSAGE
    assert len(record.detail["extracted_results"]) == 50
    assert len(record.name) == 512
    assert record.severity == "high"
    assert record.detail["reference"] == ["https://example.org/r"]
    # A matched-at too long to key a finding drops the line.
    with pytest.raises(ValueError):
        finding_from_line(_line(**{"matched-at": "https://a.example.com/" + "x" * 3000}), "nuclei")
    # Wrong types never crash the reader: they are ignored or drop the line.
    record = finding_from_line(
        _line(info="not an object", request=["x"], **{"extracted-results": "one"}), "nuclei"
    )
    assert record.name == "git-config"
    assert record.detail["request"] is None
    assert record.evidence == "one"
    with pytest.raises(ValueError):
        finding_from_line(_line(**{"template-id": 7}), "nuclei")


def test_an_oversized_line_is_dropped(tmp_path: Path) -> None:
    path = tmp_path / "nuclei.jsonl"
    path.write_text(_line(response="B" * (1024 * 1024 + 10)) + "\n" + _line() + "\n")
    found, stats = _collect(path)
    assert len(found) == 1
    assert stats.dropped == 1


def test_dedup_key_differs_by_tool_module() -> None:
    line = _line()
    assert (
        finding_from_line(line, "nuclei").dedup_key
        != finding_from_line(line, "osmedeus-general").dedup_key
    )


# ---------------------------------------------------------------- parse service and ingest


def _opener(path: Path) -> Callable[[str], AsyncIterator[bytes]]:
    data = path.read_bytes()

    async def open_stream(_: str) -> AsyncIterator[bytes]:
        # Small chunks, so a line split across chunks is read whole.
        for start in range(0, len(data), 100):
            yield data[start : start + 100]

    return open_stream


@pytest_asyncio.fixture
async def scoped_program(db_session: AsyncSession) -> Program:
    program = await make_program(db_session)
    await make_scope_rule(db_session, program, rule_type="wildcard", value="*.example.com")
    await make_scope_rule(db_session, program, rule_type="cidr", value="192.0.2.0/24")
    return program


@pytest_asyncio.fixture
async def nuclei_job(db_session: AsyncSession, scoped_program: Program) -> Job:
    return await make_job(db_session, scoped_program, await nuclei(db_session), status="completed")


async def _findings(session: AsyncSession, program: Program) -> dict[str, Finding]:
    rows = await session.scalars(select(Finding).where(Finding.program_id == program.id))
    return {row.template_id or "": row for row in rows}


async def test_parse_writes_findings_on_assets_and_is_idempotent(
    db_session: AsyncSession, scoped_program: Program, nuclei_job: Job
) -> None:
    raw = await make_raw_output(db_session, nuclei_job, filename="nuclei.jsonl")
    outcome = await parser_service.parse_raw_output(db_session, raw.id, open_stream=_opener(SAMPLE))
    assert outcome.status == "parsed"
    assert (outcome.findings.created, outcome.findings.seen_again) == (6, 0)

    found = await _findings(db_session, scoped_program)
    assert len(found) == 6
    for finding in found.values():
        assert finding.triage_status == "new"
        assert finding.job_id == nuclei_job.id
        assert finding.raw_output_id == raw.id
        assert finding.dedup_key.startswith("nuclei:")
        assert finding.first_seen_at == finding.last_seen_at
        assert set(finding.detail) >= {
            "matcher",
            "description",
            "remediation",
            "request",
            "response",
        }

    url = await db_session.scalar(select(Url).where(Url.url == "https://a.example.com/.git/config"))
    assert url is not None and found["git-config"].url_id == url.id
    assert found["git-config"].cve == []
    assert found["CVE-2021-44228"].cve == ["CVE-2021-44228"]
    ssh = await db_session.scalar(
        select(Service)
        .join(Ip, Ip.id == Service.ip_id)
        .where(Service.port == 22, func.host(Ip.address) == "192.0.2.10")
    )
    assert ssh is not None and found["openssh-detect"].service_id == ssh.id
    caa = await db_session.scalar(select(Domain).where(Domain.name == "b.example.com"))
    assert caa is not None and found["dns-caa"].domain_id == caa.id
    outside = await db_session.scalar(select(Url).where(Url.url == "https://outside.example.org/"))
    # Outside the scope, still written and marked so.
    assert outside is not None and outside.in_scope is False
    assert found["tech-detect"].url_id == outside.id

    sent = take_pending_events(db_session)
    assert [event["type"] for event in sent] == ["asset.discovered", "finding.created"]
    assert sent[1]["program_id"] == str(scoped_program.id)
    assert sent[1]["data"] == {
        "job_id": str(nuclei_job.id),
        "count": 6,
        "by_severity": {"medium": 1, "critical": 1, "info": 3, "low": 1},
    }

    # Triage one finding, then parse the same file again: no new row, no event,
    # the triage state stays and only last_seen_at moves.
    git = found["git-config"]
    await db_session.execute(
        update(Finding)
        .where(Finding.id == git.id)
        .values(triage_status="confirmed", last_seen_at=func.now() - func.make_interval(0, 0, 0, 1))
    )
    before = await db_session.scalar(select(Finding.last_seen_at).where(Finding.id == git.id))
    raw.parse_status = "pending"
    await db_session.flush()
    again = await parser_service.parse_raw_output(db_session, raw.id, open_stream=_opener(SAMPLE))
    assert (again.findings.created, again.findings.seen_again) == (0, 6)
    assert take_pending_events(db_session) == []
    assert (
        await db_session.scalar(
            select(func.count()).select_from(Finding).where(Finding.program_id == scoped_program.id)
        )
        == 6
    )
    after = (
        await db_session.execute(
            select(Finding.triage_status, Finding.last_seen_at, Finding.first_seen_at).where(
                Finding.id == git.id
            )
        )
    ).one()
    assert after.triage_status == "confirmed"
    assert before is not None and after.last_seen_at > before
    assert after.first_seen_at == git.first_seen_at


async def test_a_second_job_seeing_the_same_finding_keeps_the_first_evidence(
    db_session: AsyncSession, scoped_program: Program, nuclei_job: Job
) -> None:
    first = await make_raw_output(db_session, nuclei_job, filename="nuclei.jsonl")
    await parser_service.parse_raw_output(db_session, first.id, open_stream=_opener(SAMPLE))
    later_job = await make_job(
        db_session, scoped_program, await nuclei(db_session), status="completed"
    )
    later = await make_raw_output(db_session, later_job, filename="nuclei.jsonl")
    outcome = await parser_service.parse_raw_output(
        db_session, later.id, open_stream=_opener(SAMPLE)
    )
    assert outcome.findings.created == 0
    found = await _findings(db_session, scoped_program)
    assert {finding.raw_output_id for finding in found.values()} == {first.id}


async def test_findings_of_two_programs_never_merge(
    db_session: AsyncSession, scoped_program: Program, nuclei_job: Job
) -> None:
    raw = await make_raw_output(db_session, nuclei_job, filename="nuclei.jsonl")
    await parser_service.parse_raw_output(db_session, raw.id, open_stream=_opener(SAMPLE))
    other = await make_program(db_session)
    other_job = await make_job(db_session, other, await nuclei(db_session), status="completed")
    other_raw = await make_raw_output(db_session, other_job, filename="nuclei.jsonl")
    outcome = await parser_service.parse_raw_output(
        db_session, other_raw.id, open_stream=_opener(SAMPLE)
    )
    assert outcome.findings.created == 6
