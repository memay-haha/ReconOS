"""Vigolium parser: .claude/rules/testing.md, row Parser.

The sample raw output in tests/fixtures/raw_output/vigolium/ follows the
finding object of the Vigolium REST docs (`GET /api/findings`): no real engine
run was available to copy, tech debt 12. Parsing twice adds no finding.
"""

import json
from collections.abc import AsyncIterator, Callable
from pathlib import Path

import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.asset.models import Url
from app.asset.schemas import UrlRecord
from app.finding.models import Finding
from app.finding.schemas import MAX_HTTP_MESSAGE, FindingBatch, FindingRecord
from app.job.models import Job
from app.parser import service as parser_service
from app.parser.base import ParseStats, dedup_key
from app.parser.registry import parser_for
from app.parser.vigolium import VigoliumParser, finding_from_line
from app.program.models import Program
from app.raw_output import service as raw_output_service
from app.tool_module.models import ToolModule
from tests.factories import make_job, make_program, make_raw_output, make_scope_rule

SAMPLE = Path(__file__).parent / "fixtures" / "raw_output" / "vigolium" / "vigolium-findings.jsonl"


def _collect(path: Path = SAMPLE) -> tuple[list[FindingRecord], ParseStats]:
    stats = ParseStats()
    found: list[FindingRecord] = []
    for batch in VigoliumParser().parse(path, stats, "vigolium"):
        assert isinstance(batch, FindingBatch)
        found.extend(batch.findings)
    return found, stats


def _line(**fields: object) -> str:
    base: dict[str, object] = {
        "module_id": "xss-light",
        "severity": "high",
        "matched_at": ["https://a.example.com/search?q=1"],
        "finding_hash": "e3b0c44298fc1c14",
    }
    return json.dumps({**base, **fields})


def test_vigolium_has_this_parser() -> None:
    assert isinstance(parser_for("vigolium"), VigoliumParser)
    assert raw_output_service.has_parser("vigolium")


def test_sample_yields_findings_and_drops_bad_lines() -> None:
    found, stats = _collect()
    assert [f.template_id for f in found] == [
        "xss-light",
        "spring-actuator-misconfig",
        "log4shell-check",
        "header-audit",
        "weird-severity",
    ]
    assert stats.dropped == 4
    xss = found[0]
    assert xss.name == "XSS Light Scanner"
    assert xss.severity.value == "high"
    assert xss.matched_at == "https://a.example.com/search?q=test"
    # The query carries the payload: the asset is the URL without it.
    assert xss.asset == UrlRecord(url="https://a.example.com/search")
    assert xss.dedup_key == dedup_key("vigolium", "e3b0c44298fc1c14")
    assert xss.evidence == "<script>alert(1)</script>"
    assert set(xss.detail) >= {"matcher", "description", "remediation", "request", "response"}
    assert xss.detail["finding_source"] == "dynamic-assessment"
    assert xss.detail["additional_evidence"][0].startswith("GET /search")
    assert found[2].cve == ["CVE-2021-44228"]
    # A string matched_at reads as a one-item list.
    assert found[2].matched_at == "https://b.example.com/"
    # No finding_hash: the key falls back to the fields Vigolium merges on.
    assert found[3].dedup_key == dedup_key(
        "vigolium", "header-audit", "info", "https://outside.example.org/"
    )
    assert found[4].severity.value == "info"
    assert found[4].name == "weird-severity"


def test_untrusted_values_are_bounded() -> None:
    finding = finding_from_line(
        _line(request="A" * (MAX_HTTP_MESSAGE + 10), description="  "), "vigolium"
    )
    assert len(finding.detail["request"]) == MAX_HTTP_MESSAGE
    assert finding.detail["description"] is None
    long_hash = _line(finding_hash="f" * 200)
    try:
        finding_from_line(long_hash, "vigolium")
    except ValueError:
        pass
    else:  # pragma: no cover - the assertion below explains the failure
        raise AssertionError("an oversized finding_hash must drop the line")


def test_dedup_key_opens_with_the_tool_module() -> None:
    assert finding_from_line(_line(), "vigolium").dedup_key.startswith("vigolium:")


# ---------------------------------------------------------------- parse service and ingest


def _opener(path: Path) -> Callable[[str], AsyncIterator[bytes]]:
    data = path.read_bytes()

    async def open_stream(_: str) -> AsyncIterator[bytes]:
        for start in range(0, len(data), 100):
            yield data[start : start + 100]

    return open_stream


@pytest_asyncio.fixture
async def scoped_program(db_session: AsyncSession) -> Program:
    program = await make_program(db_session)
    await make_scope_rule(db_session, program, rule_type="wildcard", value="*.example.com")
    return program


@pytest_asyncio.fixture
async def vigolium_job(db_session: AsyncSession, scoped_program: Program) -> Job:
    tool = await db_session.scalar(select(ToolModule).where(ToolModule.name == "vigolium"))
    assert tool is not None, "seeded by migration 0010"
    return await make_job(db_session, scoped_program, tool, status="completed")


async def test_parse_writes_findings_and_is_idempotent(
    db_session: AsyncSession, scoped_program: Program, vigolium_job: Job
) -> None:
    raw = await make_raw_output(db_session, vigolium_job, filename="vigolium-findings.jsonl")
    outcome = await parser_service.parse_raw_output(db_session, raw.id, open_stream=_opener(SAMPLE))
    assert outcome.status == "parsed"
    assert (outcome.findings.created, outcome.findings.seen_again) == (5, 0)

    rows = list(
        await db_session.scalars(select(Finding).where(Finding.program_id == scoped_program.id))
    )
    assert len(rows) == 5
    assert all(row.dedup_key.startswith("vigolium:") for row in rows)
    assert all(row.job_id == vigolium_job.id for row in rows)
    outside = await db_session.scalar(select(Url).where(Url.url == "https://outside.example.org/"))
    assert outside is not None and outside.in_scope is False

    # The same findings read again, as from a second upload of the job.
    again = await make_raw_output(db_session, vigolium_job, filename="stdout.txt")
    second = await parser_service.parse_raw_output(
        db_session, again.id, open_stream=_opener(SAMPLE)
    )
    assert (second.findings.created, second.findings.seen_again) == (0, 5)
