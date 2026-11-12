"""Finding endpoints: reads per role, triage transitions, bulk, tags, export (G7):
.claude/rules/testing.md, rows Phân quyền and Lỗi.
"""

import csv
import io
import uuid
from collections.abc import Awaitable, Callable

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import AuditLog
from app.core.identity import User, UserRole
from app.finding.models import Finding, TriageStatus
from app.finding.service import TRANSITIONS
from app.program.models import Program, ProgramStatus
from app.tag.models import FindingTag, Tag
from tests.factories import (
    assign,
    make_findings,
    make_job,
    make_program,
    make_raw_output,
    make_scope_rule,
    nuclei,
    nuclei_line,
)

API = "/api/v1"
HEADERS = {"origin": "https://reconos.example.com", "sec-fetch-site": "same-origin"}

LoggedIn = Callable[..., Awaitable[User]]


@pytest_asyncio.fixture
async def program(db_session: AsyncSession) -> Program:
    program = await make_program(db_session)
    await make_scope_rule(db_session, program, rule_type="wildcard", value="*.example.com")
    return program


@pytest_asyncio.fixture
async def findings(db_session: AsyncSession, program: Program) -> list[Finding]:
    job = await make_job(db_session, program, await nuclei(db_session), status="completed")
    raw = await make_raw_output(db_session, job, filename="nuclei.jsonl")
    return await make_findings(
        db_session,
        program,
        [
            nuclei_line(
                "git-config",
                "https://a.example.com/.git/config",
                "medium",
                **{"matcher-name": "status", "request": "GET /.git/config HTTP/1.1"},
            ),
            nuclei_line(
                "CVE-2021-44228",
                "https://a.example.com/login",
                "critical",
                info={
                    "name": "Log4j RCE",
                    "severity": "critical",
                    "classification": {"cve-id": ["CVE-2021-44228"]},
                },
            ),
            nuclei_line("openssh-detect", "a.example.com:22", "info", ip="192.0.2.10"),
            nuclei_line("dns-caa", "b.example.com", "low"),
        ],
        job=job,
        raw_output=raw,
    )


async def _status(session: AsyncSession, finding: Finding) -> str:
    value = await session.scalar(select(Finding.triage_status).where(Finding.id == finding.id))
    assert value is not None
    return value


# ---------------------------------------------------------------- reads, roles


async def test_list_returns_rows_with_asset_and_tool_module(
    client: AsyncClient, logged_in: LoggedIn, findings: list[Finding]
) -> None:
    await logged_in(UserRole.ADMIN)
    body = (await client.get(f"{API}/findings", params={"sort": "-severity"})).json()
    assert body["total"] == 4
    names = [item["template_id"] for item in body["items"]]
    assert names == ["CVE-2021-44228", "git-config", "dns-caa", "openssh-detect"]
    first = body["items"][0]
    assert first["tool_module_name"] == "nuclei"
    assert first["severity"] == "critical"
    assert first["cve"] == ["CVE-2021-44228"]
    assert first["asset"]["type"] == "url"
    assert first["asset"]["name"] == "https://a.example.com/login"
    assert first["triage_status"] == "new"
    git = body["items"][1]
    assert git["matcher"] == "status"
    ssh = next(item for item in body["items"] if item["template_id"] == "openssh-detect")
    assert ssh["asset"] == {
        "type": "service",
        "id": ssh["asset"]["id"],
        "name": "192.0.2.10:22",
        "ip": "192.0.2.10",
        "port": 22,
        "service_name": None,
    }


async def test_list_pages_with_a_cursor(
    client: AsyncClient, logged_in: LoggedIn, findings: list[Finding]
) -> None:
    await logged_in(UserRole.ADMIN)
    for sort in ("-severity", "severity", "-last_seen_at", "first_seen_at"):
        seen: list[str] = []
        cursor = None
        while True:
            params: dict[str, str | int] = {"limit": 3, "sort": sort}
            if cursor:
                params["cursor"] = cursor
            page = (await client.get(f"{API}/findings", params=params)).json()
            seen += [item["id"] for item in page["items"]]
            cursor = page["next_cursor"]
            if cursor is None:
                break
        assert sorted(seen) == sorted(str(finding.id) for finding in findings)
    assert (await client.get(f"{API}/findings", params={"cursor": "junk"})).status_code == 400


async def test_filters(
    client: AsyncClient, logged_in: LoggedIn, findings: list[Finding], db_session: AsyncSession
) -> None:
    await logged_in(UserRole.ADMIN)

    async def ids(**params: object) -> set[str]:
        page = (await client.get(f"{API}/findings", params=params)).json()  # type: ignore[arg-type]
        return {item["template_id"] for item in page["items"]}

    assert await ids(severity=["critical", "low"]) == {"CVE-2021-44228", "dns-caa"}
    assert await ids(q="log4j") == {"CVE-2021-44228"}
    assert await ids(q="cve-2021") == {"CVE-2021-44228"}
    assert await ids(q="b.example") == {"dns-caa"}
    assert await ids(triage_status="confirmed") == set()
    assert await ids(job_id=str(findings[0].job_id)) == {
        "git-config",
        "CVE-2021-44228",
        "openssh-detect",
        "dns-caa",
    }
    tool = await nuclei(db_session)
    assert len(await ids(tool_module_id=str(tool.id))) == 4
    assert await ids(tool_module_id=str(uuid.uuid4())) == set()
    domain_id = (await client.get(f"{API}/domains", params={"q": "a.example.com"})).json()["items"][
        0
    ]["id"]
    # A domain's findings: on its URLs and on services of the IPs it resolves to.
    assert await ids(domain_id=domain_id) == {"git-config", "CVE-2021-44228"}


async def test_user_sees_only_assigned_programs(
    client: AsyncClient,
    logged_in: LoggedIn,
    findings: list[Finding],
    program: Program,
    db_session: AsyncSession,
) -> None:
    user = await logged_in(UserRole.USER)
    target = findings[0]
    assert (await client.get(f"{API}/findings")).json()["total"] == 0
    assert (await client.get(f"{API}/findings/{target.id}")).status_code == 404
    patched = await client.patch(
        f"{API}/findings/{target.id}", json={"triage_status": "confirmed"}, headers=HEADERS
    )
    assert patched.status_code == 404
    bulk = await client.post(
        f"{API}/findings/bulk-triage",
        json={"ids": [str(target.id)], "triage_status": "confirmed"},
        headers=HEADERS,
    )
    assert bulk.status_code == 404
    tags = await client.put(
        f"{API}/findings/{target.id}/tags", json={"tag_ids": []}, headers=HEADERS
    )
    assert tags.status_code == 404
    assert (await client.get(f"{API}/findings/summary")).json()["total"] == 0
    exported = await client.get(f"{API}/findings/export", params={"format": "jsonl"})
    assert exported.text == ""
    assert await _status(db_session, target) == "new"

    await assign(db_session, program, user.id)
    assert (await client.get(f"{API}/findings")).json()["total"] == 4
    patched = await client.patch(
        f"{API}/findings/{target.id}", json={"triage_status": "confirmed"}, headers=HEADERS
    )
    assert patched.status_code == 200


async def test_detail_carries_evidence_and_scope(
    client: AsyncClient, logged_in: LoggedIn, findings: list[Finding]
) -> None:
    await logged_in(UserRole.ADMIN)
    body = (await client.get(f"{API}/findings/{findings[0].id}")).json()
    assert body["request"] == "GET /.git/config HTTP/1.1"
    assert body["response"] is None
    assert body["description"] is None
    assert body["remediation"] is None
    assert body["in_scope"] is True
    assert body["scope_rule"] == "*.example.com"
    assert body["raw_output_id"] == str(findings[0].raw_output_id)
    assert set(body["detail"]) >= {"matcher", "description", "remediation", "request", "response"}
    assert body["allowed_triage_statuses"] == ["confirmed", "duplicate", "false_positive"]
    assert (await client.get(f"{API}/findings/{uuid.uuid4()}")).status_code == 404


async def test_summary_counts_by_filter(
    client: AsyncClient, logged_in: LoggedIn, findings: list[Finding], program: Program
) -> None:
    await logged_in(UserRole.ADMIN)
    body = (
        await client.get(f"{API}/findings/summary", params={"program_id": str(program.id)})
    ).json()
    assert body["total"] == 4
    assert body["by_severity"] == {"critical": 1, "high": 0, "medium": 1, "low": 1, "info": 1}
    assert body["by_triage_status"]["new"] == 4
    assert body["by_program"] == [{"program_id": str(program.id), "name": program.name, "count": 4}]
    assert body["new_24h_by_severity"]["critical"] == 1
    narrowed = (await client.get(f"{API}/findings/summary", params={"severity": "critical"})).json()
    assert narrowed["total"] == 1


# ---------------------------------------------------------------- triage


@pytest.mark.parametrize("role", [UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER])
async def test_every_role_triages_and_each_change_is_audited(
    client: AsyncClient,
    logged_in: LoggedIn,
    findings: list[Finding],
    program: Program,
    db_session: AsyncSession,
    role: UserRole,
) -> None:
    actor = await logged_in(role)
    if role is UserRole.USER:
        await assign(db_session, program, actor.id)
    target = findings[0]
    response = await client.patch(
        f"{API}/findings/{target.id}", json={"triage_status": "confirmed"}, headers=HEADERS
    )
    assert response.status_code == 200
    body = response.json()
    assert body["triage_status"] == "confirmed"
    assert body["triaged_by"] == str(actor.id)
    assert body["triaged_by_username"] == actor.username
    assert body["triaged_at"] is not None
    rows = list(
        await db_session.scalars(
            select(AuditLog).where(
                AuditLog.action == "finding_triaged", AuditLog.resource_id == target.id
            )
        )
    )
    assert len(rows) == 1
    assert rows[0].user_id == actor.id
    assert rows[0].program_id == program.id
    assert rows[0].detail == {"from": "new", "to": "confirmed", "duplicate_of_id": None}

    # The same status again changes nothing and writes no audit row.
    again = await client.patch(
        f"{API}/findings/{target.id}", json={"triage_status": "confirmed"}, headers=HEADERS
    )
    assert again.status_code == 200
    assert (
        await db_session.scalar(
            select(func.count())
            .select_from(AuditLog)
            .where(AuditLog.action == "finding_triaged", AuditLog.resource_id == target.id)
        )
        == 1
    )


ALL = list(TriageStatus)


@pytest.mark.parametrize(
    ("source", "target"),
    [(source, target) for source in ALL for target in ALL if target != TriageStatus.DUPLICATE],
)
async def test_transition_table(
    client: AsyncClient,
    logged_in: LoggedIn,
    findings: list[Finding],
    db_session: AsyncSession,
    source: TriageStatus,
    target: TriageStatus,
) -> None:
    await logged_in(UserRole.ADMIN)
    finding, original = findings[0], findings[1]
    finding.triage_status = source.value
    finding.duplicate_of_id = original.id if source == TriageStatus.DUPLICATE else None
    await db_session.flush()
    response = await client.patch(
        f"{API}/findings/{finding.id}", json={"triage_status": target.value}, headers=HEADERS
    )
    allowed = source == target or target in TRANSITIONS[source]
    if allowed:
        assert response.status_code == 200
        assert response.json()["triage_status"] == target.value
        if source == TriageStatus.DUPLICATE and target != source:
            assert response.json()["duplicate_of_id"] is None
    else:
        assert response.status_code == 409
        problem = response.json()
        assert problem["code"] == "conflict"
        assert problem["errors"] == [{"field": "triage_status", "code": "invalid_transition"}]
        assert response.headers["content-type"].startswith("application/problem+json")
        await db_session.refresh(finding)
        assert finding.triage_status == source.value


async def test_duplicate_needs_another_finding_of_the_program(
    client: AsyncClient,
    logged_in: LoggedIn,
    findings: list[Finding],
    db_session: AsyncSession,
) -> None:
    await logged_in(UserRole.ADMIN)
    first, second, third = findings[0], findings[1], findings[2]
    url = f"{API}/findings/{first.id}"

    async def code(body: dict[str, object]) -> tuple[int, str | None]:
        response = await client.patch(url, json=body, headers=HEADERS)
        errors = response.json().get("errors") or [{}]
        return response.status_code, errors[0].get("code")

    assert await code({"triage_status": "duplicate"}) == (422, "missing")
    assert await code({"triage_status": "duplicate", "duplicate_of_id": str(first.id)}) == (
        422,
        "same_finding",
    )
    assert await code({"triage_status": "duplicate", "duplicate_of_id": str(uuid.uuid4())}) == (
        422,
        "not_found",
    )
    other_program = await make_program(db_session)
    (stranger,) = await make_findings(db_session, other_program, [nuclei_line()])
    assert await code({"triage_status": "duplicate", "duplicate_of_id": str(stranger.id)}) == (
        422,
        "not_found",
    )
    assert await code({"triage_status": "confirmed", "duplicate_of_id": str(second.id)}) == (
        422,
        "not_allowed",
    )
    ok = await client.patch(
        url, json={"triage_status": "duplicate", "duplicate_of_id": str(second.id)}, headers=HEADERS
    )
    assert ok.status_code == 200
    assert ok.json()["duplicate_of_id"] == str(second.id)
    # No chains: a duplicate cannot be the original, and an original cannot
    # become a duplicate while others point at it.
    chained = await client.patch(
        f"{API}/findings/{third.id}",
        json={"triage_status": "duplicate", "duplicate_of_id": str(first.id)},
        headers=HEADERS,
    )
    assert chained.json()["errors"][0]["code"] == "duplicate_chain"
    pointed = await client.patch(
        f"{API}/findings/{second.id}",
        json={"triage_status": "duplicate", "duplicate_of_id": str(third.id)},
        headers=HEADERS,
    )
    assert pointed.status_code == 409
    assert pointed.json()["errors"][0]["code"] == "has_duplicates"
    # Unknown fields are refused.
    extra = await client.patch(
        url, json={"triage_status": "new", "severity": "low"}, headers=HEADERS
    )
    assert extra.status_code == 422


async def test_archived_program_is_read_only(
    client: AsyncClient,
    logged_in: LoggedIn,
    findings: list[Finding],
    program: Program,
    db_session: AsyncSession,
) -> None:
    await logged_in(UserRole.ADMIN)
    program.status = ProgramStatus.ARCHIVED
    program.archived_at = func.now()
    await db_session.flush()
    response = await client.patch(
        f"{API}/findings/{findings[0].id}", json={"triage_status": "confirmed"}, headers=HEADERS
    )
    assert response.status_code == 409
    assert (await client.get(f"{API}/findings/{findings[0].id}")).status_code == 200


async def test_bulk_triage_is_all_or_none(
    client: AsyncClient,
    logged_in: LoggedIn,
    findings: list[Finding],
    db_session: AsyncSession,
) -> None:
    await logged_in(UserRole.ADMIN)
    ids = [str(finding.id) for finding in findings]
    findings[3].triage_status = "resolved"
    await db_session.flush()
    # resolved -> false_positive is not allowed: nothing changes.
    refused = await client.post(
        f"{API}/findings/bulk-triage",
        json={"ids": ids, "triage_status": "false_positive"},
        headers=HEADERS,
    )
    assert refused.status_code == 409
    for finding in findings[:3]:
        assert await _status(db_session, finding) == "new"
    missing = await client.post(
        f"{API}/findings/bulk-triage",
        json={"ids": [*ids[:3], str(uuid.uuid4())], "triage_status": "confirmed"},
        headers=HEADERS,
    )
    assert missing.status_code == 404
    duplicate = await client.post(
        f"{API}/findings/bulk-triage",
        json={"ids": ids[:3], "triage_status": "duplicate"},
        headers=HEADERS,
    )
    assert duplicate.status_code == 422
    done = await client.post(
        f"{API}/findings/bulk-triage",
        json={"ids": ids[:3], "triage_status": "confirmed"},
        headers=HEADERS,
    )
    assert done.status_code == 204
    for finding in findings[:3]:
        assert await _status(db_session, finding) == "confirmed"
    assert (
        await db_session.scalar(
            select(func.count()).select_from(AuditLog).where(AuditLog.action == "finding_triaged")
        )
        == 3
    )
    too_many = await client.post(
        f"{API}/findings/bulk-triage",
        json={"ids": [str(uuid.uuid4()) for _ in range(501)], "triage_status": "new"},
        headers=HEADERS,
    )
    assert too_many.status_code == 422


# ---------------------------------------------------------------- tags, export


async def test_set_finding_tags_replaces_the_list(
    client: AsyncClient,
    logged_in: LoggedIn,
    findings: list[Finding],
    db_session: AsyncSession,
) -> None:
    actor = await logged_in(UserRole.ADMIN)
    first = Tag(key="team", value="red", created_by=actor.id)
    second = Tag(key="sla", value="p1", created_by=actor.id)
    db_session.add_all([first, second])
    await db_session.flush()
    target = findings[0]
    url = f"{API}/findings/{target.id}/tags"
    assert (
        await client.put(url, json={"tag_ids": [str(first.id), str(second.id)]}, headers=HEADERS)
    ).status_code == 204
    body = (await client.get(f"{API}/findings/{target.id}")).json()
    assert [(tag["key"], tag["value"]) for tag in body["tags"]] == [("sla", "p1"), ("team", "red")]
    filtered = (await client.get(f"{API}/findings", params={"tag_id": str(first.id)})).json()
    assert [item["id"] for item in filtered["items"]] == [str(target.id)]

    assert (
        await client.put(url, json={"tag_ids": [str(second.id)]}, headers=HEADERS)
    ).status_code == 204
    left = list(
        await db_session.scalars(
            select(FindingTag.tag_id).where(FindingTag.finding_id == target.id)
        )
    )
    assert left == [second.id]
    actions = sorted(
        await db_session.scalars(
            select(AuditLog.action).where(
                AuditLog.resource_type == "finding", AuditLog.resource_id == target.id
            )
        )
    )
    assert actions == ["finding_tagged", "finding_tagged", "finding_untagged"]
    unknown = await client.put(url, json={"tag_ids": [str(uuid.uuid4())]}, headers=HEADERS)
    assert unknown.status_code == 404


async def test_export_escapes_formulas_and_honours_ids(
    client: AsyncClient,
    logged_in: LoggedIn,
    program: Program,
    db_session: AsyncSession,
) -> None:
    await logged_in(UserRole.ADMIN)
    rows = await make_findings(
        db_session,
        program,
        [
            nuclei_line(
                "formula",
                "https://a.example.com/x",
                "high",
                info={"name": "=HYPERLINK(1)", "severity": "high"},
            ),
            nuclei_line("plain", "https://a.example.com/y", "low"),
        ],
    )
    response = await client.get(
        f"{API}/findings/export", params={"format": "csv", "ids": [str(rows[0].id)]}
    )
    assert response.status_code == 200
    assert response.headers["content-disposition"] == 'attachment; filename="findings.csv"'
    assert response.headers["x-content-type-options"] == "nosniff"
    lines = list(csv.DictReader(io.StringIO(response.text)))
    assert len(lines) == 1
    assert lines[0]["name"] == "'=HYPERLINK(1)"
    assert lines[0]["asset_type"] == "url"
    assert lines[0]["asset_name"] == "https://a.example.com/x"
    md = await client.get(f"{API}/findings/export", params={"format": "md"})
    assert md.text.count("\n") == 4


# ---------------------------------------------------------------- counts elsewhere


async def test_open_findings_feed_program_domain_and_tool_module_counts(
    client: AsyncClient,
    logged_in: LoggedIn,
    findings: list[Finding],
    program: Program,
    db_session: AsyncSession,
) -> None:
    await logged_in(UserRole.ADMIN)
    row = (await client.get(f"{API}/programs/{program.id}")).json()
    assert row["finding_counts"] == {"critical": 1, "high": 0, "medium": 1, "low": 1, "info": 1}
    # A false positive is closed: counted no more.
    critical = next(finding for finding in findings if finding.severity == "critical")
    await client.patch(
        f"{API}/findings/{critical.id}", json={"triage_status": "false_positive"}, headers=HEADERS
    )
    row = (await client.get(f"{API}/programs/{program.id}")).json()
    assert row["finding_counts"]["critical"] == 0

    domains = {
        item["name"]: item
        for item in (
            await client.get(f"{API}/domains", params={"program_id": str(program.id)})
        ).json()["items"]
    }
    assert domains["a.example.com"]["finding_counts"]["medium"] == 1
    assert domains["a.example.com"]["has_findings"] is True
    assert domains["b.example.com"]["finding_counts"]["low"] == 1
    with_findings = (await client.get(f"{API}/domains", params={"has_findings": "true"})).json()[
        "items"
    ]
    assert {item["name"] for item in with_findings} >= {"a.example.com", "b.example.com"}
    summary = (
        await client.get(f"{API}/domains/summary", params={"program_id": str(program.id)})
    ).json()
    assert summary["with_findings"] == 2
    assert summary["with_critical"] == 0

    activity = (await client.get(f"{API}/domains/{domains['a.example.com']['id']}/activity")).json()
    kinds = {item["kind"] for item in activity["items"]}
    assert kinds == {"asset_event", "finding"}
    titled = {item["title"] for item in activity["items"] if item["kind"] == "finding"}
    assert "git-config finding" in titled
    assert activity["total"] == len(activity["items"])

    tools = (await client.get(f"{API}/tool-modules", params={"q": "nuclei"})).json()["items"]
    assert tools[0]["finding_count"] >= 4
