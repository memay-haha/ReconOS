"""Report endpoints: roles, drafting rules, submit moving findings to `reported`,
export with escaped evidence (G6, G7, G8): .claude/rules/testing.md.
"""

import csv
import io
import json
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
from app.program.models import Program, ProgramStatus
from app.raw_output.models import RawOutput
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
async def raw(db_session: AsyncSession, program: Program) -> RawOutput:
    job = await make_job(db_session, program, await nuclei(db_session), status="completed")
    return await make_raw_output(db_session, job, filename="nuclei.jsonl")


@pytest_asyncio.fixture
async def findings(db_session: AsyncSession, program: Program, raw: RawOutput) -> list[Finding]:
    """Two confirmed findings and one new one."""
    rows = await make_findings(
        db_session,
        program,
        [
            nuclei_line("git-config", "https://a.example.com/.git/config", "medium"),
            nuclei_line("CVE-2021-44228", "https://a.example.com/login", "critical"),
            nuclei_line("dns-caa", "b.example.com", "low"),
        ],
        raw_output=raw,
    )
    order = ["git-config", "CVE-2021-44228", "dns-caa"]
    rows.sort(key=lambda row: order.index(row.template_id or ""))
    for row in rows[:2]:
        row.triage_status = TriageStatus.CONFIRMED.value
    await db_session.flush()
    return rows


def _ids(rows: list[Finding]) -> list[str]:
    return [str(row.id) for row in rows]


async def _create(
    client: AsyncClient, program: Program, rows: list[Finding], **extra: object
) -> dict[str, object]:
    response = await client.post(
        f"{API}/reports",
        json={"program_id": str(program.id), "title": "Exposed git", "finding_ids": _ids(rows)}
        | extra,
        headers=HEADERS,
    )
    assert response.status_code == 201, response.text
    body: dict[str, object] = response.json()
    return body


async def _status(session: AsyncSession, finding: Finding) -> str:
    value = await session.scalar(select(Finding.triage_status).where(Finding.id == finding.id))
    assert value is not None
    return value


# ---------------------------------------------------------------- create, read


@pytest.mark.parametrize("role", [UserRole.SUPERADMIN, UserRole.ADMIN])
async def test_create_and_read_with_evidence(
    client: AsyncClient,
    logged_in: LoggedIn,
    findings: list[Finding],
    program: Program,
    raw: RawOutput,
    db_session: AsyncSession,
    role: UserRole,
) -> None:
    actor = await logged_in(role)
    created = await _create(
        client, program, findings[:2], body="## Impact\n\nRead the repo.", platform_report_ref=""
    )
    assert created["status"] == "draft"
    assert created["platform_report_ref"] is None
    assert created["finding_count"] == 2
    assert created["severity_counts"] == {
        "critical": 1,
        "high": 0,
        "medium": 1,
        "low": 0,
        "info": 0,
    }
    assert created["created_by_username"] == actor.username
    items = created["findings"]
    assert isinstance(items, list)
    # Worst severity first; each carries its evidence file, metadata only (G8).
    assert [item["severity"] for item in items] == ["critical", "medium"]
    assert items[0]["raw_output"]["id"] == str(raw.id)
    assert items[0]["raw_output"]["sha256"] == raw.sha256

    listed = (await client.get(f"{API}/reports", params={"program_id": str(program.id)})).json()
    assert listed["total"] == 1
    assert listed["items"][0]["title"] == "Exposed git"
    assert "body" not in listed["items"][0]
    detail = (await client.get(f"{API}/reports/{created['id']}")).json()
    assert detail["body"] == "## Impact\n\nRead the repo."

    audit = await db_session.scalar(
        select(AuditLog.action).where(AuditLog.resource_id == uuid.UUID(str(created["id"])))
    )
    assert audit == "report_created"


async def test_create_takes_only_confirmed_findings_of_the_program(
    client: AsyncClient,
    logged_in: LoggedIn,
    findings: list[Finding],
    program: Program,
    db_session: AsyncSession,
) -> None:
    await logged_in(UserRole.ADMIN)

    async def code(ids: list[str], program_id: uuid.UUID = program.id) -> tuple[int, str]:
        response = await client.post(
            f"{API}/reports",
            json={"program_id": str(program_id), "title": "t", "finding_ids": ids},
            headers=HEADERS,
        )
        body = response.json()
        return response.status_code, (body.get("errors") or [{"code": body.get("code")}])[0]["code"]

    assert await code(_ids(findings)) == (422, "not_confirmed")
    assert await code([str(uuid.uuid4())]) == (422, "not_found")
    other = await make_program(db_session)
    assert await code(_ids(findings[:1]), other.id) == (422, "not_found")
    assert await code([]) == (422, "too_short")
    assert await code(_ids(findings[:1]), uuid.uuid4()) == (404, "not_found")
    program.status = ProgramStatus.ARCHIVED.value
    program.archived_at = func.now()
    await db_session.flush()
    assert await code(_ids(findings[:1])) == (409, "conflict")


async def test_user_reaches_only_assigned_programs(
    client: AsyncClient,
    logged_in: LoggedIn,
    findings: list[Finding],
    program: Program,
    db_session: AsyncSession,
) -> None:
    admin = await logged_in(UserRole.ADMIN)
    created = await _create(client, program, findings[:1])
    report_url = f"{API}/reports/{created['id']}"
    assert admin.id

    user = await logged_in(UserRole.USER)
    assert (await client.get(f"{API}/reports")).json()["total"] == 0
    assert (await client.get(report_url)).status_code == 404
    assert (await client.get(f"{report_url}/export")).status_code == 404
    patched = await client.patch(report_url, json={"title": "x"}, headers=HEADERS)
    assert patched.status_code == 404
    assert (await client.post(f"{report_url}/submit", headers=HEADERS)).status_code == 404
    assert (await client.delete(report_url, headers=HEADERS)).status_code == 404
    refused = await client.post(
        f"{API}/reports",
        json={"program_id": str(program.id), "title": "t", "finding_ids": _ids(findings[:1])},
        headers=HEADERS,
    )
    assert refused.status_code == 404

    await assign(db_session, program, user.id)
    assert (await client.get(f"{API}/reports")).json()["total"] == 1
    assert (await client.get(report_url)).status_code == 200
    mine = await _create(client, program, findings[1:2])
    submitted = await client.post(f"{API}/reports/{mine['id']}/submit", headers=HEADERS)
    assert submitted.status_code == 200
    assert await _status(db_session, findings[1]) == "reported"


async def test_list_filters_and_pages(
    client: AsyncClient,
    logged_in: LoggedIn,
    findings: list[Finding],
    program: Program,
) -> None:
    await logged_in(UserRole.ADMIN)
    first = await _create(client, program, findings[:1], title="alpha")
    await _create(client, program, findings[:1], title="beta")
    await client.post(f"{API}/reports/{first['id']}/submit", headers=HEADERS)
    page = (await client.get(f"{API}/reports", params={"limit": 1})).json()
    assert page["total"] == 2
    assert page["items"][0]["title"] == "beta"
    rest = (
        await client.get(f"{API}/reports", params={"limit": 1, "cursor": page["next_cursor"]})
    ).json()
    assert [item["title"] for item in rest["items"]] == ["alpha"]
    assert rest["next_cursor"] is None
    drafts = (await client.get(f"{API}/reports", params={"status": "draft"})).json()
    assert [item["title"] for item in drafts["items"]] == ["beta"]
    found = (await client.get(f"{API}/reports", params={"q": "ALP"})).json()
    assert [item["title"] for item in found["items"]] == ["alpha"]


# ---------------------------------------------------------------- edit, delete


async def test_edit_a_draft_and_its_findings(
    client: AsyncClient,
    logged_in: LoggedIn,
    findings: list[Finding],
    program: Program,
    db_session: AsyncSession,
) -> None:
    await logged_in(UserRole.ADMIN)
    created = await _create(client, program, findings[:1])
    url = f"{API}/reports/{created['id']}"
    # A finding that left confirmed stays listed while it is in the draft.
    findings[0].triage_status = TriageStatus.NEW.value
    await db_session.flush()
    response = await client.patch(
        url,
        json={"title": "New title", "body": "text", "finding_ids": _ids(findings[:2])},
        headers=HEADERS,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["title"] == "New title"
    assert body["finding_count"] == 2
    assert body["updated_at"] > created["updated_at"]
    dropped = await client.patch(url, json={"finding_ids": _ids(findings[1:2])}, headers=HEADERS)
    assert dropped.json()["finding_count"] == 1
    # Once out, the new finding counts as added again: it must be confirmed.
    again = await client.patch(url, json={"finding_ids": _ids(findings[:2])}, headers=HEADERS)
    assert again.status_code == 422
    assert again.json()["errors"] == [{"field": "finding_ids", "code": "not_confirmed"}]
    cleared = await client.patch(url, json={"title": None}, headers=HEADERS)
    assert cleared.status_code == 422
    assert cleared.json()["errors"][0]["code"] == "null_not_allowed"
    unknown = await client.patch(url, json={"status": "submitted"}, headers=HEADERS)
    assert unknown.status_code == 422


async def test_delete_a_draft_only(
    client: AsyncClient,
    logged_in: LoggedIn,
    findings: list[Finding],
    program: Program,
) -> None:
    await logged_in(UserRole.ADMIN)
    draft = await _create(client, program, findings[:1])
    submitted = await _create(client, program, findings[1:2])
    await client.post(f"{API}/reports/{submitted['id']}/submit", headers=HEADERS)
    refused = await client.delete(f"{API}/reports/{submitted['id']}", headers=HEADERS)
    assert refused.status_code == 409
    assert refused.json()["errors"] == [{"field": "status", "code": "report_submitted"}]
    deleted = await client.delete(f"{API}/reports/{draft['id']}", headers=HEADERS)
    assert deleted.status_code == 204
    assert (await client.get(f"{API}/reports/{draft['id']}")).status_code == 404


# ---------------------------------------------------------------- submit


async def test_submit_moves_findings_to_reported(
    client: AsyncClient,
    logged_in: LoggedIn,
    findings: list[Finding],
    program: Program,
    db_session: AsyncSession,
) -> None:
    actor = await logged_in(UserRole.ADMIN)
    created = await _create(client, program, findings[:2])
    url = f"{API}/reports/{created['id']}"
    response = await client.post(
        f"{url}/submit", json={"platform_report_ref": "H1-123456"}, headers=HEADERS
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "submitted"
    assert body["submitted_at"] is not None
    assert body["platform_report_ref"] == "H1-123456"
    for row in findings[:2]:
        assert await _status(db_session, row) == "reported"
    trail = list(
        (
            await db_session.execute(
                select(AuditLog.action, AuditLog.detail).where(AuditLog.user_id == actor.id)
            )
        ).all()
    )
    triaged = [detail for action, detail in trail if action == "finding_triaged"]
    assert len(triaged) == 2
    assert all(
        detail
        == {"from": "confirmed", "to": "reported", "duplicate_of_id": None}
        | {"report_id": created["id"]}
        for detail in triaged
    )
    assert "report_submitted" in [action for action, _ in trail]

    again = await client.post(f"{url}/submit", headers=HEADERS)
    assert again.status_code == 409
    assert again.json()["errors"] == [{"field": "status", "code": "invalid_transition"}]
    # Submitted: only the platform reference stays editable.
    ref = await client.patch(url, json={"platform_report_ref": "H1-999"}, headers=HEADERS)
    assert ref.status_code == 200
    assert ref.json()["platform_report_ref"] == "H1-999"
    title = await client.patch(url, json={"title": "x"}, headers=HEADERS)
    assert title.status_code == 409
    assert title.json()["errors"] == [{"field": "title", "code": "report_submitted"}]


async def test_submit_refuses_a_finding_no_longer_confirmed(
    client: AsyncClient,
    logged_in: LoggedIn,
    findings: list[Finding],
    program: Program,
    db_session: AsyncSession,
) -> None:
    await logged_in(UserRole.ADMIN)
    created = await _create(client, program, findings[:2])
    findings[0].triage_status = TriageStatus.FALSE_POSITIVE.value
    await db_session.flush()
    response = await client.post(f"{API}/reports/{created['id']}/submit", headers=HEADERS)
    assert response.status_code == 409
    assert response.json()["errors"] == [{"field": "finding_ids", "code": "not_confirmed"}]
    # All or none: the confirmed one did not move either.
    assert await _status(db_session, findings[1]) == "confirmed"
    detail = (await client.get(f"{API}/reports/{created['id']}")).json()
    assert detail["status"] == "draft"


async def test_archived_program_is_read_only(
    client: AsyncClient,
    logged_in: LoggedIn,
    findings: list[Finding],
    program: Program,
    db_session: AsyncSession,
) -> None:
    await logged_in(UserRole.ADMIN)
    created = await _create(client, program, findings[:1])
    url = f"{API}/reports/{created['id']}"
    program.status = ProgramStatus.ARCHIVED.value
    program.archived_at = func.now()
    await db_session.flush()
    assert (await client.get(url)).status_code == 200
    assert (await client.patch(url, json={"title": "x"}, headers=HEADERS)).status_code == 409
    assert (await client.post(f"{url}/submit", headers=HEADERS)).status_code == 409
    assert (await client.delete(url, headers=HEADERS)).status_code == 409


async def test_manual_triage_cannot_report(
    client: AsyncClient,
    logged_in: LoggedIn,
    findings: list[Finding],
    db_session: AsyncSession,
) -> None:
    await logged_in(UserRole.ADMIN)
    target = findings[0]
    detail = (await client.get(f"{API}/findings/{target.id}")).json()
    assert "reported" not in detail["allowed_triage_statuses"]
    one = await client.patch(
        f"{API}/findings/{target.id}", json={"triage_status": "reported"}, headers=HEADERS
    )
    assert one.status_code == 409
    assert one.json()["errors"] == [{"field": "triage_status", "code": "reported_by_report"}]
    bulk = await client.post(
        f"{API}/findings/bulk-triage",
        json={"ids": [str(target.id)], "triage_status": "reported"},
        headers=HEADERS,
    )
    assert bulk.status_code == 409
    assert await _status(db_session, target) == "confirmed"


# ---------------------------------------------------------------- export


async def test_export_markdown_escapes_raw_output(
    client: AsyncClient,
    logged_in: LoggedIn,
    findings: list[Finding],
    program: Program,
    raw: RawOutput,
    db_session: AsyncSession,
) -> None:
    await logged_in(UserRole.ADMIN)
    target = findings[0]
    target.name = "[click](javascript:alert(1)) <img src=x onerror=alert(1)>"
    target.evidence = "line one\n```\n<script>alert(1)</script>"
    await db_session.flush()
    created = await _create(client, program, [target], body="## Impact\n\nWritten here.")
    response = await client.get(f"{API}/reports/{created['id']}/export")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/markdown")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["content-disposition"] == (
        f'attachment; filename="report-{created["id"]}.md"'
    )
    text = response.text
    assert text.startswith("# Exposed git\n")
    assert "## Impact\n\nWritten here." in text
    assert "\\[click\\]\\(javascript:alert\\(1\\)\\) \\<img" in text
    # The evidence fence is longer than the backtick run inside it.
    assert "````text\nline one\n```\n<script>alert(1)</script>\n````" in text
    assert f"` {raw.sha256} `" in text


async def test_export_csv_escapes_formulas(
    client: AsyncClient,
    logged_in: LoggedIn,
    findings: list[Finding],
    program: Program,
    raw: RawOutput,
    db_session: AsyncSession,
) -> None:
    await logged_in(UserRole.ADMIN)
    target = findings[0]
    target.name = "=HYPERLINK(1)"
    target.matched_at = "@SUM(A1)"
    await db_session.flush()
    created = await _create(client, program, findings[:2], title="-cmd")
    response = await client.get(f"{API}/reports/{created['id']}/export", params={"format": "csv"})
    assert response.status_code == 200
    lines = {line["id"]: line for line in csv.DictReader(io.StringIO(response.text))}
    row = lines[str(target.id)]
    assert row["name"] == "'=HYPERLINK(1)"
    assert row["matched_at"] == "'@SUM(A1)"
    assert row["raw_output_filename"] == raw.filename
    jsonl = await client.get(f"{API}/reports/{created['id']}/export", params={"format": "jsonl"})
    assert len([json.loads(line) for line in jsonl.text.splitlines()]) == 2
