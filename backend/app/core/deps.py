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
from app.core.security import load_current_user


async def get_db() -> AsyncIterator[AsyncSession]:
    """One transaction per request, on the engine shared by the process."""
    async with session_scope(get_engine()) as session:
        yield session


SettingsDep = Annotated[Settings, Depends(get_settings)]
DbDep = Annotated[AsyncSession, Depends(get_db)]


async def current_user(request: Request, session: DbDep, settings: SettingsDep) -> User:
    return await load_current_user(request, session, settings)


CurrentUser = Annotated[User, Depends(current_user)]
