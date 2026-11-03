"""Database engine, declarative base and the per-request transaction.

Naming conventions and types: docs/data/database.md.
One transaction per request, no commit inside a service: .claude/rules/design-patterns.md
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from functools import lru_cache

from sqlalchemy import MetaData
from sqlalchemy.engine import URL, make_url
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import Settings, get_settings

# Alembic autogenerate produces stable constraint names only with a convention.
NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


def _url_with_password(url: str, password: str) -> URL:
    # The documented URL carries no password, so it can be logged as is.
    return make_url(url).set(password=password)


def build_engine(settings: Settings | None = None) -> AsyncEngine:
    """Engine for the main database."""
    settings = settings or get_settings()
    return create_async_engine(
        _url_with_password(settings.database_url, settings.db_password.get_secret_value()),
        pool_size=settings.db_pool_size,
        pool_pre_ping=True,
    )


def build_log_engine(settings: Settings | None = None) -> AsyncEngine:
    """Engine for the separate reconos_log database."""
    settings = settings or get_settings()
    return create_async_engine(
        _url_with_password(settings.log_database_url, settings.log_db_password.get_secret_value()),
        pool_size=settings.db_pool_size,
        pool_pre_ping=True,
    )


@asynccontextmanager
async def session_scope(engine: AsyncEngine) -> AsyncIterator[AsyncSession]:
    """One unit of work: commit when the body returns, roll back when it raises.

    Used by the request dependency, the dispatcher loop and background tasks.
    """
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        await session.commit()


@lru_cache
def get_engine() -> AsyncEngine:
    """One engine per process. Building an engine per call opens a new pool."""
    return build_engine()


# A failed login and a permission denial are one INSERT and a COMMIT, so two
# connections absorb the concurrency of a whole process.
INDEPENDENT_POOL_SIZE = 2


@lru_cache
def get_independent_engine() -> AsyncEngine:
    """One engine per process for the independent session, with its own pool.

    The caller already holds a connection from the request pool. Borrowing the
    second one from that same pool is the classic self-deadlock shape once the
    pool saturates, and a denied request is the fastest way to saturate it, so
    this engine never shares connections with the request flow. No overflow:
    the write is short, and queueing here is better than growing a pool nothing
    bounds.
    """
    settings = get_settings()
    return create_async_engine(
        _url_with_password(settings.database_url, settings.db_password.get_secret_value()),
        pool_size=INDEPENDENT_POOL_SIZE,
        max_overflow=0,
        pool_pre_ping=True,
    )


@asynccontextmanager
async def independent_session() -> AsyncIterator[AsyncSession]:
    """A transaction of its own, so the row survives a rolled back request.

    Failed logins and permission denials must stay on record even though the
    request itself returns an error: docs/security/authorization.md. The audit
    table carries no foreign key, so this write never waits on another
    transaction: docs/data/schema.md.
    """
    async with session_scope(get_independent_engine()) as session:
        yield session
