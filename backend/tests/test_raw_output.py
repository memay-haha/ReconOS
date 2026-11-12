"""Raw output: stored untouched in MinIO first, then metadata (G8), served as attachment."""

import hashlib
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import storage
from app.core.audit import AuditLog
from app.core.identity import User, UserRole
from app.core.storage import ObjectTooLargeError, delete_object, put_object_from_stream
from app.core.system_setting import SystemSetting
from app.job.models import Job
from app.program.models import Program
from app.raw_output import service
from app.raw_output.models import RawOutput
from app.tool_module.models import ToolModule
from app.user.models import Worker
from tests.factories import assign, make_job, make_program, make_worker, nuclei

API = "/api/v1"
HEADERS = {"origin": "https://reconos.example.com", "sec-fetch-site": "same-origin"}
PAYLOAD = b'{"template-id":"tech-detect","matched-at":"https://a.example.com"}\n'


@pytest_asyncio.fixture
async def program(db_session: AsyncSession) -> Program:
    return await make_program(db_session)


@pytest_asyncio.fixture
async def tool(db_session: AsyncSession) -> ToolModule:
    return await nuclei(db_session)


@pytest_asyncio.fixture
async def worker(db_session: AsyncSession) -> tuple[Worker, str]:
    return await make_worker(db_session)


@pytest_asyncio.fixture
async def stored_keys() -> AsyncIterator[list[str]]:
    """Object keys the test wrote, removed from the test bucket afterwards."""
    keys: list[str] = []
    yield keys
    for key in keys:
        await delete_object(key)


@pytest_asyncio.fixture
async def running(
    db_session: AsyncSession, program: Program, tool: ToolModule, worker: tuple[Worker, str]
) -> Job:
    return await make_job(db_session, program, tool, status="running", worker_id=worker[0].id)


def _upload_url(job: Job, name: str) -> str:
    return f"{API}/worker/jobs/{job.id}/raw-outputs/{name}"


async def test_upload_stores_bytes_then_metadata_without_a_parser(
    client: AsyncClient,
    db_session: AsyncSession,
    running: Job,
    worker: tuple[Worker, str],
    stored_keys: list[str],
) -> None:
    auth = {"authorization": f"Bearer {worker[1]}", "content-type": "application/x-ndjson"}
    response = await client.put(_upload_url(running, "nuclei.jsonl"), content=PAYLOAD, headers=auth)
    assert response.status_code == 201
    body = response.json()
    row = await db_session.scalar(select(RawOutput).where(RawOutput.id == uuid.UUID(body["id"])))
    assert row is not None
    stored_keys.append(row.object_key)
    assert row.object_key == f"{running.program_id}/{running.id}/nuclei.jsonl"
    assert row.sha256 == hashlib.sha256(PAYLOAD).hexdigest()
    assert row.size_bytes == len(PAYLOAD)
    assert row.content_type == "application/x-ndjson"
    # No parser is registered for nuclei yet, so no parse task is due (G8).
    assert row.parse_status == "no_parser"

    # The same name again: 200, nothing overwritten.
    again = await client.put(
        _upload_url(running, "nuclei.jsonl"), content=b"different\n", headers=auth
    )
    assert again.status_code == 200
    assert again.json()["sha256"] == row.sha256
    read_back = b""
    async for chunk in storage.get_object_stream(row.object_key):
        read_back += chunk
    assert read_back == PAYLOAD


async def test_cancelled_running_job_may_still_upload(
    client: AsyncClient,
    db_session: AsyncSession,
    running: Job,
    worker: tuple[Worker, str],
    stored_keys: list[str],
) -> None:
    running.status = "cancelled"
    await db_session.flush()
    response = await client.put(
        _upload_url(running, "stdout.txt"),
        content=b"partial\n",
        headers={"authorization": f"Bearer {worker[1]}"},
    )
    assert response.status_code == 201
    stored_keys.append(f"{running.program_id}/{running.id}/stdout.txt")
    assert response.json()["content_type"] == "application/octet-stream"


@pytest.mark.parametrize("name", ["bad name.txt", "a..b", "%2E%2E"])
async def test_unsafe_file_names_are_refused(
    client: AsyncClient, running: Job, worker: tuple[Worker, str], name: str
) -> None:
    response = await client.put(
        _upload_url(running, name), content=b"x", headers={"authorization": f"Bearer {worker[1]}"}
    )
    assert response.status_code == 422
    assert response.json()["errors"] == [{"field": "filename", "code": "filename_invalid"}]


async def test_upload_needs_a_running_job_of_this_worker(
    client: AsyncClient,
    db_session: AsyncSession,
    program: Program,
    tool: ToolModule,
    worker: tuple[Worker, str],
    running: Job,
) -> None:
    auth = {"authorization": f"Bearer {worker[1]}"}
    queued = await make_job(db_session, program, tool)
    assert (
        await client.put(_upload_url(queued, "a.txt"), content=b"x", headers=auth)
    ).status_code == 409
    _, other = await make_worker(db_session)
    response = await client.put(
        _upload_url(running, "a.txt"), content=b"x", headers={"authorization": f"Bearer {other}"}
    )
    assert response.status_code == 409


async def test_upload_over_the_limit_is_413(
    client: AsyncClient, db_session: AsyncSession, running: Job, worker: tuple[Worker, str]
) -> None:
    db_session.add(SystemSetting(key="upload_max_bytes", value=4))
    await db_session.flush()
    response = await client.put(
        _upload_url(running, "big.txt"),
        content=b"too large",
        headers={"authorization": f"Bearer {worker[1]}"},
    )
    assert response.status_code == 413
    assert await db_session.scalar(select(RawOutput).where(RawOutput.job_id == running.id)) is None


async def test_download_is_an_audited_attachment(
    client: AsyncClient,
    logged_in: Callable[..., Awaitable[User]],
    db_session: AsyncSession,
    running: Job,
    program: Program,
    worker: tuple[Worker, str],
    stored_keys: list[str],
) -> None:
    uploaded = await client.put(
        _upload_url(running, "nuclei.jsonl"),
        content=PAYLOAD,
        headers={"authorization": f"Bearer {worker[1]}"},
    )
    stored_keys.append(f"{running.program_id}/{running.id}/nuclei.jsonl")
    raw_id = uploaded.json()["id"]
    user = await logged_in(UserRole.USER)
    assert (await client.get(f"{API}/raw-outputs/{raw_id}")).status_code == 404
    assert (await client.get(f"{API}/raw-outputs/{raw_id}/content")).status_code == 404
    await assign(db_session, program, user.id)
    listed = (await client.get(f"{API}/jobs/{running.id}/raw-outputs")).json()
    assert [item["id"] for item in listed["items"]] == [raw_id]
    assert (await client.get(f"{API}/raw-outputs/{raw_id}")).json()["parse_status"] == "no_parser"
    response = await client.get(f"{API}/raw-outputs/{raw_id}/content")
    assert response.status_code == 200
    assert response.content == PAYLOAD
    assert response.headers["content-disposition"] == 'attachment; filename="nuclei.jsonl"'
    assert response.headers["content-type"] == "application/octet-stream"
    assert response.headers["x-content-type-options"] == "nosniff"
    audit = await db_session.scalar(
        select(AuditLog).where(AuditLog.action == "raw_output_downloaded")
    )
    assert audit is not None
    assert audit.user_id == user.id


async def test_raw_output_list_pages(
    client: AsyncClient,
    logged_in: Callable[..., Awaitable[User]],
    db_session: AsyncSession,
    running: Job,
) -> None:
    await logged_in(UserRole.ADMIN)
    for name in ("a.txt", "b.txt", "c.txt"):
        db_session.add(
            RawOutput(
                job_id=running.id,
                filename=name,
                object_key=f"{running.program_id}/{running.id}/{name}",
                content_type="text/plain",
                size_bytes=1,
                sha256="0" * 64,
                parse_status="no_parser",
            )
        )
    await db_session.flush()
    seen: list[str] = []
    for sort in ("created_at", "-created_at"):
        cursor = None
        names: list[str] = []
        while True:
            params = {"limit": 2, "sort": sort, **({"cursor": cursor} if cursor else {})}
            page = (await client.get(f"{API}/jobs/{running.id}/raw-outputs", params=params)).json()
            names += [item["filename"] for item in page["items"]]
            cursor = page["next_cursor"]
            if cursor is None:
                break
        seen.append(",".join(sorted(names)))
    assert seen == ["a.txt,b.txt,c.txt"] * 2


def test_parser_registry_decides_the_parse_status() -> None:
    assert service.has_parser("probe-tool") is False
    service.register_parser("probe-tool")
    try:
        assert service.has_parser("probe-tool") is True
    finally:
        service._parsers.discard("probe-tool")


async def _chunks(*parts: bytes) -> AsyncIterator[bytes]:
    for part in parts:
        yield part


async def test_large_body_goes_up_as_multipart(monkeypatch: pytest.MonkeyPatch) -> None:
    # A small part size exercises the multipart path without megabytes of test data.
    monkeypatch.setattr(storage, "PART_SIZE", 5 * 1024 * 1024)
    key = f"probe/{uuid.uuid4()}.bin"
    part = b"a" * (3 * 1024 * 1024)
    try:
        size, digest = await put_object_from_stream(
            key, _chunks(part, part, b"tail"), content_type="text/plain", max_bytes=10**9
        )
        read_back = b""
        async for chunk in storage.get_object_stream(key):
            read_back += chunk
    finally:
        await delete_object(key)
    assert size == 2 * len(part) + 4
    assert digest == hashlib.sha256(part + part + b"tail").hexdigest()
    assert read_back == part + part + b"tail"


async def test_size_limit_aborts_a_multipart_upload(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(storage, "PART_SIZE", 5 * 1024 * 1024)
    key = f"probe/{uuid.uuid4()}.bin"
    part = b"a" * (5 * 1024 * 1024)
    with pytest.raises(ObjectTooLargeError):
        await put_object_from_stream(
            key, _chunks(part, part), content_type="text/plain", max_bytes=len(part) + 1
        )
    async with storage.object_storage() as (client, bucket):
        uploads = await client.list_multipart_uploads(Bucket=bucket, Prefix=key)
    assert not uploads.get("Uploads")
