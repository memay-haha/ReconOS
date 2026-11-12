"""Background tasks: sent after commit, parse retries, object purge (G8).

Rules: docs/architecture/system.md, task parse; docs/data/database.md, Lưu trữ và xóa.
"""

import uuid
from collections.abc import AsyncIterator, Awaitable, Callable, Iterator
from typing import Any

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.background import parse_tasks, program_tasks
from app.core import storage, tasks
from app.core.db import session_scope
from app.core.tasks import PendingTask
from app.parser.base import ParseDataError


@pytest.fixture
def sent() -> Iterator[list[PendingTask]]:
    captured: list[PendingTask] = []

    async def record(task: PendingTask) -> None:
        captured.append(task)

    previous = tasks.set_sender(record)
    yield captured
    tasks.set_sender(previous)


async def test_a_task_leaves_only_after_commit(
    db_engine: AsyncEngine, sent: list[PendingTask]
) -> None:
    async with session_scope(db_engine) as session:
        tasks.queue_task(session, "reconos.probe", queue="parse", kwargs={"id": "1"})
        assert tasks.pending_tasks(session) == [PendingTask("reconos.probe", "parse", {"id": "1"})]
        assert sent == []
    assert sent == [PendingTask("reconos.probe", "parse", {"id": "1"})]


async def test_a_rollback_drops_the_task(db_engine: AsyncEngine, sent: list[PendingTask]) -> None:
    with pytest.raises(RuntimeError):
        async with session_scope(db_engine) as session:
            tasks.queue_task(session, "reconos.probe", queue="parse", kwargs={})
            raise RuntimeError
    assert sent == []


async def test_a_broker_failure_is_logged_not_raised(db_engine: AsyncEngine) -> None:
    async def broken(_: PendingTask) -> None:
        raise ConnectionError

    previous = tasks.set_sender(broken)
    try:
        async with session_scope(db_engine) as session:
            tasks.queue_task(session, "reconos.probe", queue="parse", kwargs={})
    finally:
        tasks.set_sender(previous)


def test_broker_url_carries_the_password(settings_factory: Callable[..., Any]) -> None:
    plain = settings_factory(redis_url="redis://reconos@localhost:6379/0")
    assert tasks.broker_url(plain) == "redis://reconos@localhost:6379/0"
    with_password = settings_factory(
        redis_url="redis://reconos@localhost:6379/0", redis_password="s3cret-value"
    )
    assert tasks.broker_url(with_password) == "redis://reconos:s3cret-value@localhost:6379/0"


# ---------------------------------------------------------------- parse task


class _Request:
    def __init__(self, retries: int) -> None:
        self.retries = retries


class _RetryError(Exception):
    def __init__(self, countdown: int) -> None:
        self.countdown = countdown


class _FakeTask:
    def __init__(self, retries: int) -> None:
        self.request = _Request(retries)

    def retry(self, *, exc: Exception, countdown: int) -> _RetryError:
        return _RetryError(countdown)


@pytest.fixture
def failed(monkeypatch: pytest.MonkeyPatch) -> list[tuple[uuid.UUID, str]]:
    marked: list[tuple[uuid.UUID, str]] = []
    monkeypatch.setattr(
        parse_tasks, "_mark_failed", lambda raw_id, reason: marked.append((raw_id, reason))
    )
    return marked


def _run_raising(monkeypatch: pytest.MonkeyPatch, error: Exception) -> None:
    def run(_: Callable[[AsyncSession], Awaitable[object]], **__: str) -> object:
        raise error

    monkeypatch.setattr(parse_tasks, "run_in_session", run)


def test_backoff_is_exponential() -> None:
    assert [parse_tasks.backoff_seconds(n) for n in range(3)] == [10, 20, 40]


def test_a_transient_error_retries_with_backoff(
    monkeypatch: pytest.MonkeyPatch, failed: list[tuple[uuid.UUID, str]]
) -> None:
    _run_raising(monkeypatch, ConnectionError())
    with pytest.raises(_RetryError) as raised:
        parse_tasks._parse_raw_output(_FakeTask(retries=1), str(uuid.uuid4()))
    assert raised.value.countdown == 20
    assert failed == []


def test_out_of_retries_marks_failed(
    monkeypatch: pytest.MonkeyPatch, failed: list[tuple[uuid.UUID, str]]
) -> None:
    _run_raising(monkeypatch, ConnectionError())
    raw_id = uuid.uuid4()
    parse_tasks._parse_raw_output(_FakeTask(retries=parse_tasks.MAX_RETRIES), str(raw_id))
    assert failed == [(raw_id, parse_tasks.FAILED_AFTER_RETRIES)]


def test_a_data_error_fails_at_once(
    monkeypatch: pytest.MonkeyPatch, failed: list[tuple[uuid.UUID, str]]
) -> None:
    _run_raising(monkeypatch, ParseDataError("raw output is not a zip archive"))
    raw_id = uuid.uuid4()
    parse_tasks._parse_raw_output(_FakeTask(retries=0), str(raw_id))
    assert failed == [(raw_id, "raw output is not a zip archive")]


def test_a_successful_parse_marks_nothing(
    monkeypatch: pytest.MonkeyPatch, failed: list[tuple[uuid.UUID, str]]
) -> None:
    monkeypatch.setattr(parse_tasks, "run_in_session", lambda *_, **__: None)
    parse_tasks._parse_raw_output(_FakeTask(retries=0), str(uuid.uuid4()))
    assert failed == []


# ---------------------------------------------------------------- object purge


async def _body(data: bytes) -> AsyncIterator[bytes]:
    yield data


async def test_delete_prefix_removes_only_that_program() -> None:
    keep_prefix = f"{uuid.uuid4()}/"
    drop_prefix = f"{uuid.uuid4()}/"
    for key in (f"{drop_prefix}j/a.txt", f"{drop_prefix}j/b.txt", f"{keep_prefix}j/c.txt"):
        await storage.put_object_from_stream(
            key, _body(b"x"), content_type="text/plain", max_bytes=10
        )
    try:
        assert await storage.delete_prefix(drop_prefix) == 2
        assert await storage.delete_prefix(drop_prefix) == 0
        kept = b""
        async for chunk in storage.get_object_stream(f"{keep_prefix}j/c.txt"):
            kept += chunk
        assert kept == b"x"
    finally:
        await storage.delete_prefix(keep_prefix)
    with pytest.raises(ValueError, match="one folder"):
        await storage.delete_prefix("no-slash")


def test_purge_retries_then_gives_up(monkeypatch: pytest.MonkeyPatch) -> None:
    async def broken(_: str) -> int:
        raise ConnectionError

    monkeypatch.setattr(program_tasks, "delete_prefix", broken)
    with pytest.raises(_RetryError) as raised:
        program_tasks._purge_program_objects(_FakeTask(retries=1), str(uuid.uuid4()))
    assert raised.value.countdown == 60
    program_tasks._purge_program_objects(
        _FakeTask(retries=program_tasks.MAX_RETRIES), str(uuid.uuid4())
    )


def test_every_task_is_registered_on_the_background_app() -> None:
    from app.background.celery_app import app as celery

    # What the worker does at start: import every module in `include`.
    celery.loader.import_default_modules()
    for name in (
        tasks.PARSE_RAW_OUTPUT_TASK,
        tasks.RECOMPUTE_IN_SCOPE_TASK,
        tasks.PURGE_PROGRAM_OBJECTS_TASK,
        tasks.RUN_DIAGNOSTICS_TASK,
        tasks.BEAT_HEARTBEAT_TASK,
    ):
        assert name in celery.tasks


def test_beat_sends_its_heartbeat_to_the_schedule_queue() -> None:
    from app.background.celery_app import app as celery

    entry = celery.conf.beat_schedule["beat-heartbeat"]
    assert entry["task"] == tasks.BEAT_HEARTBEAT_TASK
    assert entry["options"]["queue"] == tasks.SCHEDULE_QUEUE
