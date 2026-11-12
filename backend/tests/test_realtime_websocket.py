"""`/api/v1/ws`: handshake checks and per-account filtering.

Rules: docs/architecture/request-flow.md, section WebSocket, and
docs/security/authorization.md, rule 8. The socket is driven in the test's own
event loop, so the checks run inside the test transaction.
"""

import asyncio
import json
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable, MutableMapping
from contextlib import asynccontextmanager
from typing import Any

import pytest
from fastapi import Depends, FastAPI
from httpx import AsyncClient
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import realtime_router
from app.core.deps import csrf_guard
from app.core.identity import User, UserRole, UserSession
from app.core.realtime import build_event, publish_event
from app.core.realtime_router import (
    POLICY_VIOLATION_CLOSE_CODE,
    SESSION_ENDED_CLOSE_CODE,
    event_visible,
    get_session_opener,
)
from app.core.security import ALL_PROGRAMS, HOST_COOKIE_NAME
from tests.factories import assign, make_program

ORIGIN = "https://reconos.example.com"


class Socket:
    """A browser end of one WebSocket, speaking ASGI to the app directly."""

    def __init__(self, app: FastAPI, headers: dict[str, str]) -> None:
        self.inbox: asyncio.Queue[MutableMapping[str, Any]] = asyncio.Queue()
        self.outbox: asyncio.Queue[MutableMapping[str, Any]] = asyncio.Queue()
        scope = {
            "type": "websocket",
            "asgi": {"version": "3.0"},
            "scheme": "wss",
            "path": "/api/v1/ws",
            "raw_path": b"/api/v1/ws",
            "root_path": "",
            "query_string": b"",
            "headers": [(k.encode(), v.encode()) for k, v in headers.items()],
            "server": ("reconos.example.com", 443),
            "client": ("192.0.2.10", 50000),
            "subprotocols": [],
        }
        self.inbox.put_nowait({"type": "websocket.connect"})
        self.task = asyncio.create_task(app(scope, self.inbox.get, self.outbox.put))

    async def next(self) -> MutableMapping[str, Any]:
        return await asyncio.wait_for(self.outbox.get(), 5)

    async def next_event(self, marker: str) -> MutableMapping[str, Any]:
        """Skip events of other tests sharing the channel."""
        while True:
            message = await self.next()
            if message["type"] != "websocket.send" or marker in message["text"]:
                return message

    async def leave(self) -> None:
        self.inbox.put_nowait({"type": "websocket.disconnect", "code": 1000})
        await asyncio.wait_for(self.task, 5)


@pytest.fixture
def ws_app(db_session: AsyncSession) -> FastAPI:
    app = FastAPI(dependencies=[Depends(csrf_guard)])
    app.include_router(realtime_router.router)

    @asynccontextmanager
    async def in_test_transaction() -> AsyncIterator[AsyncSession]:
        yield db_session

    app.dependency_overrides[get_session_opener] = lambda: in_test_transaction
    return app


@pytest.fixture
def session_cookie(
    client: AsyncClient, logged_in: Callable[..., Awaitable[User]]
) -> Callable[..., Awaitable[tuple[User, str]]]:
    async def build(role: UserRole = UserRole.USER) -> tuple[User, str]:
        user = await logged_in(role)
        return user, f"{HOST_COOKIE_NAME}={client.cookies[HOST_COOKIE_NAME]}"

    return build


async def _open(app: FastAPI, cookie: str) -> Socket:
    socket = Socket(app, {"origin": ORIGIN, "cookie": cookie})
    assert (await socket.next())["type"] == "websocket.accept"
    await asyncio.sleep(0.3)  # let the Redis subscription register
    return socket


async def test_wrong_origin_is_refused_before_accept(
    ws_app: FastAPI, session_cookie: Callable[..., Awaitable[tuple[User, str]]]
) -> None:
    _, cookie = await session_cookie()
    socket = Socket(ws_app, {"origin": "https://evil.example.org", "cookie": cookie})

    message = await socket.next()

    assert message == {"type": "websocket.close", "code": POLICY_VIOLATION_CLOSE_CODE, "reason": ""}


async def test_missing_origin_is_refused(ws_app: FastAPI) -> None:
    socket = Socket(ws_app, {})
    assert (await socket.next())["type"] == "websocket.close"


async def test_no_session_is_refused(ws_app: FastAPI) -> None:
    socket = Socket(ws_app, {"origin": ORIGIN, "cookie": f"{HOST_COOKIE_NAME}=unknown"})
    message = await socket.next()
    assert message["type"] == "websocket.close"
    assert message["code"] == POLICY_VIOLATION_CLOSE_CODE


async def test_user_receives_only_events_of_assigned_programs(
    ws_app: FastAPI,
    db_session: AsyncSession,
    session_cookie: Callable[..., Awaitable[tuple[User, str]]],
) -> None:
    user, cookie = await session_cookie()
    assigned = await make_program(db_session)
    other = await make_program(db_session)
    await assign(db_session, assigned, user.id)
    marker = str(uuid.uuid4())
    socket = await _open(ws_app, cookie)

    await publish_event(build_event("job.status_changed", other.id, {"m": marker, "n": 1}))
    await publish_event(build_event("worker.status_changed", None, {"m": marker, "n": 2}))
    await publish_event(build_event("job.status_changed", assigned.id, {"m": marker, "n": 3}))

    message = await socket.next_event(marker)
    assert json.loads(message["text"])["data"] == {"m": marker, "n": 3}
    await socket.leave()


async def test_admin_receives_system_wide_events(
    ws_app: FastAPI, session_cookie: Callable[..., Awaitable[tuple[User, str]]]
) -> None:
    _, cookie = await session_cookie(UserRole.ADMIN)
    marker = str(uuid.uuid4())
    socket = await _open(ws_app, cookie)

    await publish_event(build_event("worker.status_changed", None, {"m": marker}))

    message = await socket.next_event(marker)
    assert json.loads(message["text"])["type"] == "worker.status_changed"
    await socket.leave()


async def test_assignment_applies_from_the_next_event(
    ws_app: FastAPI,
    db_session: AsyncSession,
    session_cookie: Callable[..., Awaitable[tuple[User, str]]],
) -> None:
    user, cookie = await session_cookie()
    program = await make_program(db_session)
    already = await make_program(db_session)
    await assign(db_session, already, user.id)
    marker = str(uuid.uuid4())
    socket = await _open(ws_app, cookie)

    await publish_event(build_event("job.status_changed", program.id, {"m": marker, "n": 1}))
    # Events keep their order, so receiving this one proves the first was already filtered.
    await publish_event(build_event("job.status_changed", already.id, {"m": marker, "n": 2}))
    assert json.loads((await socket.next_event(marker))["text"])["data"]["n"] == 2
    await assign(db_session, program, user.id)
    await publish_event(build_event("job.status_changed", program.id, {"m": marker, "n": 3}))

    message = await socket.next_event(marker)
    assert json.loads(message["text"])["data"]["n"] == 3
    await socket.leave()


async def test_revoked_session_closes_on_the_next_event(
    ws_app: FastAPI,
    db_session: AsyncSession,
    session_cookie: Callable[..., Awaitable[tuple[User, str]]],
) -> None:
    user, cookie = await session_cookie(UserRole.ADMIN)
    marker = str(uuid.uuid4())
    socket = await _open(ws_app, cookie)

    await db_session.execute(delete(UserSession).where(UserSession.user_id == user.id))
    await publish_event(build_event("alert.created", None, {"m": marker}))

    message = await socket.next_event(marker)
    assert message == {"type": "websocket.close", "code": SESSION_ENDED_CLOSE_CODE, "reason": ""}
    await asyncio.wait_for(socket.task, 5)


async def test_expired_session_closes_while_idle(
    ws_app: FastAPI,
    db_session: AsyncSession,
    session_cookie: Callable[..., Awaitable[tuple[User, str]]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(realtime_router, "SESSION_RECHECK_SECONDS", 0.2)
    monkeypatch.setattr(realtime_router, "POLL_SECONDS", 0.1)
    user, cookie = await session_cookie()
    socket = await _open(ws_app, cookie)

    await db_session.execute(delete(UserSession).where(UserSession.user_id == user.id))

    message = await socket.next()
    assert message["code"] == SESSION_ENDED_CLOSE_CODE
    await asyncio.wait_for(socket.task, 5)


@pytest.mark.parametrize(
    ("program_id", "expected"),
    [
        (None, False),
        ("not-a-uuid", False),
        (str(uuid.UUID(int=1)), True),
        (str(uuid.uuid4()), False),
    ],
)
def test_event_visible_for_a_user(program_id: str | None, expected: bool) -> None:
    access = frozenset({uuid.UUID(int=1)})
    assert event_visible({"program_id": program_id}, access) is expected


def test_event_visible_for_every_program() -> None:
    assert event_visible({"program_id": None}, ALL_PROGRAMS)


async def test_the_api_serves_the_socket() -> None:
    from app.main import app

    socket = Socket(app, {"origin": "https://evil.example.org"})
    message = await socket.next()
    assert message == {"type": "websocket.close", "code": POLICY_VIOLATION_CLOSE_CODE, "reason": ""}
