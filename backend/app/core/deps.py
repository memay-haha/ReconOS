"""FastAPI dependencies every module shares: the request session and the caller.

They live in `core` because a module at any tier declares them, and no module
may call a module above it: docs/architecture/dependency-graph.md.
"""

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.db import get_engine, session_scope
from app.core.identity import User
from app.core.security import enforce_csrf, load_current_user


async def get_db() -> AsyncIterator[AsyncSession]:
    """One transaction per request, on the engine shared by the process."""
    async with session_scope(get_engine()) as session:
        yield session


SettingsDep = Annotated[Settings, Depends(get_settings)]
DbDep = Annotated[AsyncSession, Depends(get_db)]


async def csrf_guard(request: Request, settings: SettingsDep) -> None:
    """Reject a cross-site mutating request, for every route the app serves.

    Declared on the application so a handler added later inherits it. A
    hand-written call per handler is one line a new handler can forget, and a
    forgotten one is CSRF-open with nothing to catch it: docs/api/architecture.md.
    """
    enforce_csrf(request, settings)


async def current_user(request: Request, session: DbDep, settings: SettingsDep) -> User:
    return await load_current_user(request, session, settings)


CurrentUser = Annotated[User, Depends(current_user)]
