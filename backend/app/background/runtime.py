"""Run one unit of async work from a synchronous Celery task.

Each task call gets its own event loop and its own database engine, disposed at
the end: an asyncpg pool belongs to the loop that opened it, so the cached
engine of the API process cannot be shared across `asyncio.run` calls. One
`session_scope` per unit of work: .claude/rules/design-patterns.md.
"""

import asyncio
from collections.abc import Awaitable, Callable

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import build_engine, session_scope


def run_in_session[T](work: Callable[[AsyncSession], Awaitable[T]], **context: str) -> T:
    async def _run() -> T:
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(service="background", **context)
        engine = build_engine()
        try:
            async with session_scope(engine) as session:
                return await work(session)
        finally:
            await engine.dispose()

    return asyncio.run(_run())
