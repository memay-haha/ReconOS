"""Screenshots: gowitness parse to rows, reads per role, image, HTML, HAR, soft delete.

.claude/rules/testing.md, rows Parser and Phân quyền. The PNG objects go to the
test bucket; the JSONL reaches the parser through a stub stream.
"""

import json
from collections.abc import AsyncIterator, Awaitable, Callable
from pathlib import Path
from typing import Any

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import AuditLog
from app.core.identity import User, UserRole
from app.core.storage import delete_object, put_object_stream
from app.job.models import Job
from app.parser import service as parser_service
from app.program.models import Program, ProgramStatus
from app.raw_output.models import RawOutput
from app.screenshot.models import Screenshot
from tests.factories import (
    assign,
    make_job,
    make_program,
    make_raw_output,
    make_scope_rule,
    make_worker,
    tool_module_named,
)

API = "/api/v1"
HEADERS = {"origin": "https://reconos.example.com", "sec-fetch-site": "same-origin"}
SAMPLE = Path(__file__).parent / "fixtures" / "raw_output" / "gowitness" / "gowitness.jsonl"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
LoggedIn = Callable[..., Awaitable[User]]


def _opener(data: bytes) -> Callable[[str], AsyncIterator[bytes]]:
    async def open_stream(_: str) -> AsyncIterator[bytes]:
        for start in range(0, len(data), 4096):
            yield data[start : start + 4096]

    return open_stream


@pytest_asyncio.fixture
async def program(db_session: AsyncSession) -> Program:
    program = await make_program(db_session)
    await make_scope_rule(db_session, program, rule_type="wildcard", value="*.example.com")
    return program


@pytest_asyncio.fixture
async def stored_keys() -> AsyncIterator[list[str]]:
    keys: list[str] = []
    yield keys
    for key in keys:
        await delete_object(key)


async def _image(
    session: AsyncSession, job: Job, filename: str, body: bytes, keys: list[str]
) -> RawOutput:
    row = await make_raw_output(session, job, filename=filename, parse_status="no_parser")
    await put_object_stream(row.object_key, body)
    keys.append(row.object_key)
    return row


@pytest_asyncio.fixture
async def gowitness_job(db_session: AsyncSession, program: Program, stored_keys: list[str]) -> Job:
    """A finished gowitness job with its images stored and its JSONL parsed."""
    worker, _ = await make_worker(db_session, name="wk-shots", tool_modules=["gowitness"])
    job = await make_job(
        db_session,
        program,
        await tool_module_named(db_session, "gowitness"),
        status="completed",
        target=["https://app.example.com"],
        worker_id=worker.id,
    )
    job.params = {"threads": 4, "window_width": 1440, "window_height": 900}
    await db_session.flush()
    await _image(db_session, job, "https---app.example.com.png", PNG, stored_keys)
    # Not an image whatever its name says: never served as one.
    await _image(db_session, job, "http---api.example.com-8080.png", b"<svg/>", stored_keys)
    raw = await make_raw_output(db_session, job, filename="gowitness.jsonl")
    outcome = await parser_service.parse_raw_output(
        db_session, raw.id, open_stream=_opener(SAMPLE.read_bytes())
    )
    assert outcome.status == "parsed"
    return job


async def _shots(session: AsyncSession, program: Program) -> dict[str, Screenshot]:
    rows = await session.scalars(select(Screenshot).where(Screenshot.program_id == program.id))
    return {row.final_url or "": row for row in rows}


# ---------------------------------------------------------------- parse


async def test_parse_links_images_and_is_idempotent(
    db_session: AsyncSession, program: Program, gowitness_job: Job
) -> None:
    shots = await _shots(db_session, program)
    assert set(shots) == {
        "https://app.example.com/",
        "https://api.example.com/docs",
        "https://down.example.com/",
        "",
    }
    app = shots["https://app.example.com/"]
    assert app.raw_output_id is not None
    assert app.html_raw_output_id is not None
    assert (app.width, app.height, app.device_scale) == (1440, 900, 1.0)
    assert str(app.remote_ip) == "192.0.2.10"
    assert not app.is_failed
    assert shots["https://down.example.com/"].is_failed
    # The ../ name links nothing and leaves a failed capture.
    evil = shots[""]
    assert evil.raw_output_id is None
    assert evil.is_failed
    jsonl = await db_session.scalar(
        select(RawOutput).where(
            RawOutput.job_id == gowitness_job.id, RawOutput.filename == "gowitness.jsonl"
        )
    )
    assert jsonl is not None
    jsonl.parse_status = "pending"
    await db_session.flush()
    again = await parser_service.parse_raw_output(
        db_session, jsonl.id, open_stream=_opener(SAMPLE.read_bytes())
    )
    assert (again.screenshots.created, again.screenshots.updated) == (0, 4)
    count = await db_session.scalar(
        select(func.count()).select_from(Screenshot).where(Screenshot.program_id == program.id)
    )
    assert count == 4


async def test_png_and_stdout_are_not_parsed(db_session: AsyncSession, program: Program) -> None:
    job = await make_job(
        db_session, program, await tool_module_named(db_session, "gowitness"), status="completed"
    )
    for name in ("https---app.example.com.png", "stdout.txt"):
        raw = await make_raw_output(db_session, job, filename=name)
        outcome = await parser_service.parse_raw_output(
            db_session, raw.id, open_stream=_opener(PNG)
        )
        assert outcome.status == "no_parser"


# ---------------------------------------------------------------- reads


async def test_list_rows_groups_and_technologies(
    client: AsyncClient, logged_in: LoggedIn, program: Program, gowitness_job: Job
) -> None:
    await logged_in(UserRole.ADMIN)
    response = await client.get(
        f"{API}/screenshots", params={"program_id": str(program.id), "sort": "perception_hash"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 4
    rows = {row["final_url"]: row for row in body["items"]}
    app = rows["https://app.example.com/"]
    api = rows["https://api.example.com/docs"]
    assert (app["similar_group"], app["similar_count"]) == (1, 2)
    assert (api["similar_group"], api["similar_count"]) == (1, 2)
    assert rows["https://down.example.com/"]["similar_count"] == 1
    assert rows["https://down.example.com/"]["similar_group"] is None
    assert {t["name"] for t in app["technologies"]} == {"Nginx", "React"}
    assert (app["width"], app["height"]) == (1440, 900)
    assert app["http_headers"]["set-cookie"] == "session, lang"
    assert "SECRETVALUE" not in response.text


async def test_filters_and_summary(
    client: AsyncClient, logged_in: LoggedIn, program: Program, gowitness_job: Job
) -> None:
    await logged_in(UserRole.ADMIN)
    base = {"program_id": str(program.id)}

    async def finals(params: dict[str, Any]) -> set[str | None]:
        response = await client.get(f"{API}/screenshots", params={**base, **params})
        assert response.status_code == 200
        return {row["final_url"] for row in response.json()["items"]}

    assert await finals({"status_code": "4xx"}) == {"https://api.example.com/docs"}
    # The evil.example.com line answered 200 with no usable image.
    assert await finals({"status_code": ["2xx", "5xx"]}) == {
        "https://app.example.com/",
        "https://down.example.com/",
        None,
    }
    assert await finals({"is_failed": "false"}) == {
        "https://app.example.com/",
        "https://api.example.com/docs",
    }
    assert await finals({"q": "login"}) == {"https://app.example.com/"}
    assert await finals({"job_id": str(gowitness_job.id), "q": "docs"}) == {
        "https://api.example.com/docs"
    }
    technologies = (await client.get(f"{API}/technologies", params={"q": "React"})).json()
    react = next(t["id"] for t in technologies["items"] if t["name"] == "React")
    assert await finals({"technology_id": react}) == {"https://app.example.com/"}
    summary = await client.get(f"{API}/screenshots/summary", params=base)
    assert summary.status_code == 200
    assert summary.json() == {"by_status_code": {"2xx": 2, "3xx": 0, "4xx": 1, "5xx": 1}}


async def test_pages_follow_the_cursor(
    client: AsyncClient, logged_in: LoggedIn, program: Program, gowitness_job: Job
) -> None:
    await logged_in(UserRole.ADMIN)
    for sort in ("-captured_at", "captured_at", "perception_hash"):
        seen: list[str] = []
        cursor = None
        while True:
            params: dict[str, Any] = {"program_id": str(program.id), "limit": 1, "sort": sort}
            if cursor:
                params["cursor"] = cursor
            body = (await client.get(f"{API}/screenshots", params=params)).json()
            seen.extend(row["id"] for row in body["items"])
            cursor = body["next_cursor"]
            if cursor is None:
                break
        assert len(seen) == len(set(seen)) == 4


async def test_detail_with_capture_data(
    client: AsyncClient,
    db_session: AsyncSession,
    logged_in: LoggedIn,
    program: Program,
    gowitness_job: Job,
) -> None:
    await logged_in(UserRole.SUPERADMIN)
    app = (await _shots(db_session, program))["https://app.example.com/"]
    response = await client.get(f"{API}/screenshots/{app.id}")
    assert response.status_code == 200
    body = response.json()
    assert body["worker_name"] == "wk-shots"
    assert body["remote_ip"] == "192.0.2.10"
    assert body["duration_ms"] == 2000
    assert body["tls"]["subject"] == "app.example.com"
    assert body["cookies"][0]["name"] == "session"
    assert "value" not in body["cookies"][0]
    assert body["security_headers"] == {
        "strict-transport-security": True,
        "content-security-policy": False,
        "x-frame-options": True,
        "x-content-type-options": False,
        "permissions-policy": False,
    }
    assert (body["security_headers_passed"], body["security_headers_total"]) == (2, 5)
    assert body["html_size"] == len(app.html.encode()) if app.html else False
    assert len(body["html_sha256"]) == 64
    assert "SECRETVALUE" not in response.text


async def test_image_is_checked_and_not_sniffed(
    client: AsyncClient,
    db_session: AsyncSession,
    logged_in: LoggedIn,
    program: Program,
    gowitness_job: Job,
) -> None:
    await logged_in(UserRole.USER)
    user = await db_session.scalar(select(User).order_by(User.created_at.desc()).limit(1))
    assert user is not None
    await assign(db_session, program, user.id)
    shots = await _shots(db_session, program)
    image = await client.get(f"{API}/screenshots/{shots['https://app.example.com/'].id}/image")
    assert image.status_code == 200
    assert image.headers["content-type"] == "image/png"
    assert image.headers["x-content-type-options"] == "nosniff"
    assert image.content == PNG
    # A stored file that is not an image is never served as one.
    svg = await client.get(f"{API}/screenshots/{shots['https://api.example.com/docs'].id}/image")
    assert svg.status_code == 404
    failed = await client.get(f"{API}/screenshots/{shots['https://down.example.com/'].id}/image")
    assert failed.status_code == 404


async def test_html_network_and_har(
    client: AsyncClient,
    db_session: AsyncSession,
    logged_in: LoggedIn,
    program: Program,
    gowitness_job: Job,
) -> None:
    await logged_in(UserRole.ADMIN)
    app = (await _shots(db_session, program))["https://app.example.com/"]
    html = await client.get(f"{API}/screenshots/{app.id}/html")
    assert html.status_code == 200
    assert html.headers["content-type"].startswith("text/plain")
    assert html.headers["x-content-type-options"] == "nosniff"
    assert "<script>alert(1)</script>" in html.text
    network = await client.get(f"{API}/screenshots/{app.id}/network")
    assert network.status_code == 200
    assert [entry["url"] for entry in network.json()["network_log"]] == [
        "https://app.example.com/",
        "https://app.example.com/app.js",
    ]
    har = await client.get(f"{API}/screenshots/{app.id}/har")
    assert har.status_code == 200
    assert har.headers["content-disposition"] == f'attachment; filename="screenshot-{app.id}.har"'
    log = json.loads(har.content)["log"]
    assert log["version"] == "1.2"
    assert len(log["entries"]) == 2
    assert log["entries"][0]["serverIPAddress"] == "192.0.2.10"


async def test_user_sees_only_assigned_programs(
    client: AsyncClient,
    db_session: AsyncSession,
    logged_in: LoggedIn,
    program: Program,
    gowitness_job: Job,
) -> None:
    await logged_in(UserRole.USER)
    app = (await _shots(db_session, program))["https://app.example.com/"]
    listed = await client.get(f"{API}/screenshots")
    assert listed.status_code == 200
    assert listed.json()["total"] == 0
    for suffix in ("", "/image", "/html", "/network", "/har"):
        response = await client.get(f"{API}/screenshots/{app.id}{suffix}")
        assert response.status_code == 404, suffix


# ---------------------------------------------------------------- delete


@pytest.mark.parametrize("role", [UserRole.SUPERADMIN, UserRole.ADMIN])
async def test_soft_delete_by_operator(
    client: AsyncClient,
    db_session: AsyncSession,
    logged_in: LoggedIn,
    program: Program,
    gowitness_job: Job,
    role: UserRole,
) -> None:
    actor = await logged_in(role)
    app = (await _shots(db_session, program))["https://app.example.com/"]
    response = await client.delete(f"{API}/screenshots/{app.id}", headers=HEADERS)
    assert response.status_code == 204
    await db_session.refresh(app)
    assert app.deleted_at is not None
    # The image raw output stays (G8).
    assert await db_session.get(RawOutput, app.raw_output_id) is not None
    assert (await client.get(f"{API}/screenshots/{app.id}")).status_code == 404
    listed = await client.get(f"{API}/screenshots", params={"program_id": str(program.id)})
    assert listed.json()["total"] == 3
    entry = await db_session.scalar(
        select(AuditLog).where(
            AuditLog.action == "screenshot_deleted", AuditLog.user_id == actor.id
        )
    )
    assert entry is not None
    assert entry.resource_id == app.id


async def test_user_cannot_delete(
    client: AsyncClient,
    db_session: AsyncSession,
    logged_in: LoggedIn,
    program: Program,
    gowitness_job: Job,
) -> None:
    user = await logged_in(UserRole.USER)
    await assign(db_session, program, user.id)
    app = (await _shots(db_session, program))["https://app.example.com/"]
    response = await client.delete(f"{API}/screenshots/{app.id}", headers=HEADERS)
    assert response.status_code == 403


async def test_archived_program_is_read_only(
    client: AsyncClient,
    db_session: AsyncSession,
    logged_in: LoggedIn,
    program: Program,
    gowitness_job: Job,
) -> None:
    await logged_in(UserRole.ADMIN)
    app = (await _shots(db_session, program))["https://app.example.com/"]
    program.status = ProgramStatus.ARCHIVED
    program.archived_at = func.now()
    await db_session.flush()
    response = await client.delete(f"{API}/screenshots/{app.id}", headers=HEADERS)
    assert response.status_code == 409


# ---------------------------------------------------------------- counts elsewhere


async def test_program_count_and_domain_activity(
    client: AsyncClient,
    db_session: AsyncSession,
    logged_in: LoggedIn,
    program: Program,
    gowitness_job: Job,
) -> None:
    await logged_in(UserRole.ADMIN)
    detail = await client.get(f"{API}/programs/{program.id}")
    assert detail.json()["screenshot_count"] == 4
    domains = await client.get(
        f"{API}/domains", params={"program_id": str(program.id), "q": "app.example.com"}
    )
    domain_id = next(
        row["id"] for row in domains.json()["items"] if row["name"] == "app.example.com"
    )
    activity = await client.get(f"{API}/domains/{domain_id}/activity")
    kinds = [(row["kind"], row["title"]) for row in activity.json()["items"]]
    assert ("screenshot", "Screenshot: App Login") in kinds
    by_domain = await client.get(f"{API}/screenshots", params={"domain_id": domain_id})
    assert [row["final_url"] for row in by_domain.json()["items"]] == ["https://app.example.com/"]


async def test_retry_job_status_follows_the_newest_job_on_the_final_url(
    client: AsyncClient,
    db_session: AsyncSession,
    logged_in: LoggedIn,
    program: Program,
    gowitness_job: Job,
) -> None:
    await logged_in(UserRole.ADMIN)
    await make_job(
        db_session,
        program,
        await tool_module_named(db_session, "gowitness"),
        status="queued",
        target=["https://down.example.com"],
    )
    rows = (await client.get(f"{API}/screenshots", params={"program_id": str(program.id)})).json()[
        "items"
    ]
    statuses = {row["final_url"]: row["retry_job_status"] for row in rows}
    assert statuses["https://down.example.com/"] == "queued"
    assert statuses["https://app.example.com/"] is None
