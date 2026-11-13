"""Vigolium parser: .claude/rules/testing.md, row Parser.

The sample raw output in tests/fixtures/raw_output/vigolium/ is the file a real
job wrote against Vigolium v0.5.6 (lab target, host replaced by 192.0.2.10).
Lines the engine does not produce, kept to check how the parser treats odd
input, live in EDGE_LINES below. Parsing twice adds no finding.
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
# Not from the engine: one odd line per case the parser must survive.
EDGE_LINES = (
    '{"module_id":"log4shell-check","module_name":"Log4Shell","severity":"critical",'
    '"tags":["rce","cve-2021-44228"],"matched_at":"https://b.example.com/",'
    '"finding_hash":"1111222233334444"}',
    '{"module_id":"header-audit","module_name":"Missing security headers","severity":"info",'
    '"matched_at":["https://outside.example.org/"]}',
    '{"module_id":"weird-severity","severity":"unknown","matched_at":["https://a.example.com/x"],'
    '"finding_hash":"5555666677778888"}',
    "not json",
    '{"scan_uuid":"scan-0001","severity":"high"}',
    '["array"]',
    '{"module_id":"ftp","matched_at":["ftp://a.example.com/"],"finding_hash":"9999"}',
)


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


def test_sample_yields_findings() -> None:
    found, stats = _collect()
    assert [f.template_id for f in found] == [
        "cors-headers-detect",
        "express-debug-probe",
        "aspnet-health-exposure",
        "sensitive-file-discovery",
    ]
    assert stats.dropped == 0
    cors = found[0]
    assert cors.name == "CORS Headers Detect"
    assert cors.severity.value == "low"
    assert cors.matched_at == "http://192.0.2.10/"
    assert cors.asset == UrlRecord(url="http://192.0.2.10/")
    assert cors.dedup_key == dedup_key("vigolium", "f173cc999874fa11fa5106fe8f6b59949f7d6b98")
    assert cors.evidence is not None and cors.evidence.startswith("ACAO: *")
    assert set(cors.detail) >= {"matcher", "description", "remediation", "request", "response"}
    assert cors.detail["finding_source"] == "dynamic-assessment"
    assert cors.detail["module_type"] == "passive"
    # GET /api/findings carries no request or response: they stay empty.
    assert cors.detail["request"] is None
    assert found[2].severity.value == "medium"
    assert found[2].matched_at == "http://192.0.2.10/metrics"


def test_edge_lines_are_read_or_dropped(tmp_path: Path) -> None:
    path = tmp_path / "vigolium-findings.jsonl"
    path.write_text("\n".join(EDGE_LINES) + "\n", encoding="utf-8")
    found, stats = _collect(path)
    assert [f.template_id for f in found] == ["log4shell-check", "header-audit", "weird-severity"]
    assert stats.dropped == 4
    assert found[0].cve == ["CVE-2021-44228"]
    # A string matched_at reads as a one-item list.
    assert found[0].matched_at == "https://b.example.com/"
    # No finding_hash: the key falls back to the fields Vigolium merges on.
    assert found[1].dedup_key == dedup_key(
        "vigolium", "header-audit", "info", "https://outside.example.org/"
    )
    assert found[2].severity.value == "info"
    assert found[2].name == "weird-severity"


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
    await make_scope_rule(db_session, program, rule_type="cidr", value="192.0.2.0/24")
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
    assert (outcome.findings.created, outcome.findings.seen_again) == (4, 0)

    rows = list(
        await db_session.scalars(select(Finding).where(Finding.program_id == scoped_program.id))
    )
    assert len(rows) == 4
    assert all(row.dedup_key.startswith("vigolium:") for row in rows)
    assert all(row.job_id == vigolium_job.id for row in rows)
    metrics = await db_session.scalar(select(Url).where(Url.url == "http://192.0.2.10/metrics"))
    assert metrics is not None and metrics.in_scope is True

    # The same findings read again, as from a second upload of the job.
    again = await make_raw_output(db_session, vigolium_job, filename="stdout.txt")
    second = await parser_service.parse_raw_output(
        db_session, again.id, open_stream=_opener(SAMPLE)
    )
    assert (second.findings.created, second.findings.seen_again) == (0, 4)
