"""`/api/v1/ws`: pushes realtime events to the browser, filtered by what the account may see.

Handshake, filtering and closing rules: docs/architecture/request-flow.md, section
WebSocket, and docs/security/authorization.md, rule 8.

- The handshake is refused, before accept, when `Origin` is not the ReconOS
  origin or the session cookie is not usable. The browser sees HTTP 403.
- The session and the programs the account may read are checked again before
  every event, so a role or assignment change applies from the next event, and
  at least every `SESSION_RECHECK_SECONDS` while idle. A session that has ended
  closes the socket with `SESSION_ENDED_CLOSE_CODE`; the browser goes to S01.
- These checks never commit, so an open socket does not keep a session alive
  past its idle timeout: docs/security/authentication.md.
"""

import time
import uuid
from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from typing import Annotated, Any, Final

import anyio
import redis.asyncio as redis
import structlog
from fastapi import APIRouter, Depends, WebSocket
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from starlette.websockets import WebSocketDisconnect

from app.core import realtime
from app.core.config import Settings, get_settings
from app.core.db import get_engine
from app.core.errors import UnauthenticatedError
from app.core.security import AllPrograms, allowed_program_ids, load_current_user

# Close codes in the 4000 range belong to the application (RFC 6455, section 7.4.2).
SESSION_ENDED_CLOSE_CODE: Final = 4401
POLICY_VIOLATION_CLOSE_CODE: Final = 1008
INTERNAL_ERROR_CLOSE_CODE: Final = 1011
SESSION_RECHECK_SECONDS: Final = 30.0
# How long one wait on Redis lasts before the loop looks at the recheck deadline.
POLL_SECONDS: Final = 1.0

log = structlog.get_logger()

router = APIRouter(prefix="/api/v1", tags=["realtime"])

Access = frozenset[uuid.UUID] | AllPrograms
SessionOpener = Callable[[], AbstractAsyncContextManager[AsyncSession]]


@asynccontextmanager
async def _read_only_session() -> AsyncIterator[AsyncSession]:
    """A short session that is closed without commit: reading never extends the session."""
    factory = async_sessionmaker(get_engine(), expire_on_commit=False)
    async with factory() as session:
        yield session


def get_session_opener() -> SessionOpener:
    """Dependency, so a test can run the checks inside its own transaction."""
    return _read_only_session


async def check_access(
    websocket: WebSocket, settings: Settings, open_session: SessionOpener
) -> Access | None:
    """Programs the caller may read now, or None when its session is no longer usable."""
    async with open_session() as session:
        try:
            user = await load_current_user(websocket, session, settings)
        except UnauthenticatedError:
            return None
        return await allowed_program_ids(session, user)


def event_visible(event: dict[str, Any], access: Access) -> bool:
    """An event of a program goes to accounts that read that program.

    An event with no program is system-wide data, such as a worker going
    offline, and only accounts that read every program receive it.
    """
    if isinstance(access, AllPrograms):
        return True
    program_id = event.get("program_id")
    if program_id is None:
        return False
    try:
        return uuid.UUID(program_id) in access
    except ValueError:
        return False


@router.websocket("/ws")
async def events(
    websocket: WebSocket,
    settings: Annotated[Settings, Depends(get_settings)],
    open_session: Annotated[SessionOpener, Depends(get_session_opener)],
) -> None:
    if websocket.headers.get("origin") != settings.public_origin:
        log.info("websocket_rejected", cause="origin")
        await websocket.close(code=POLICY_VIOLATION_CLOSE_CODE)
        return
    access = await check_access(websocket, settings, open_session)
    if access is None:
        await websocket.close(code=POLICY_VIOLATION_CLOSE_CODE)
        return
    await websocket.accept()
    try:
        async with anyio.create_task_group() as group:
            group.start_soon(_wait_for_client_close, websocket, group.cancel_scope)
            await _pump(websocket, settings, open_session, access)
            group.cancel_scope.cancel()
    except* WebSocketDisconnect:
        # Sending to a browser that has just left: nothing to clean up.
        pass


async def _wait_for_client_close(websocket: WebSocket, scope: anyio.CancelScope) -> None:
    """The socket is server-push only: read until the browser leaves, ignore the rest."""
    while True:
        message = await websocket.receive()
        if message["type"] == "websocket.disconnect":
            scope.cancel()
            return


async def _pump(
    websocket: WebSocket, settings: Settings, open_session: SessionOpener, access: Access
) -> None:
    client = realtime.build_client(settings, socket_timeout=None)
    pubsub = client.pubsub()
    try:
        await pubsub.subscribe(realtime.EVENT_CHANNEL)
        recheck_at = time.monotonic() + SESSION_RECHECK_SECONDS
        while True:
            message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=POLL_SECONDS)
            event = realtime.parse_event(message["data"]) if message is not None else None
            if event is None and time.monotonic() < recheck_at:
                continue
            current = await check_access(websocket, settings, open_session)
            if current is None:
                await websocket.close(code=SESSION_ENDED_CLOSE_CODE)
                return
            access = current
            recheck_at = time.monotonic() + SESSION_RECHECK_SECONDS
            if event is not None and event_visible(event, access):
                await websocket.send_json(event)
    except (redis.RedisError, OSError) as error:
        # The browser reconnects and refreshes every open query.
        log.warning("websocket_stream_failed", error_type=type(error).__name__)
        await websocket.close(code=INTERNAL_ERROR_CLOSE_CODE)
    finally:
        # redis-py leaves PubSub.aclose unannotated.
        await pubsub.aclose()  # type: ignore[no-untyped-call]
        await client.aclose()
