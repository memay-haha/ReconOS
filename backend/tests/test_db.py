"""Database engine, metadata conventions and the per-request transaction.

Conventions: docs/data/database.md. Transaction rule: .claude/rules/design-patterns.md
"""

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.pool import QueuePool

from app.core.db import (
    INDEPENDENT_POOL_SIZE,
    INDEPENDENT_POOL_TIMEOUT_SECONDS,
    Base,
    build_engine,
    get_independent_engine,
    session_scope,
)


def test_metadata_names_every_constraint_kind() -> None:
    convention = Base.metadata.naming_convention

    assert set(convention) == {"ix", "uq", "ck", "fk", "pk"}


def test_engine_url_carries_the_password_from_settings() -> None:
    engine = build_engine()

    # The URL in RECONOS_DATABASE_URL has no password; it is added from
    # RECONOS_DB_PASSWORD: docs/ops/configuration.md
    assert engine.url.password is not None
    assert engine.url.database is not None
    assert engine.url.database.endswith("_test")


async def test_database_is_reachable_and_speaks_uuidv7() -> None:
    engine = build_engine()
    async with engine.connect() as connection:
        value = await connection.scalar(text("select uuidv7()"))
    await engine.dispose()

    assert value is not None


async def test_session_scope_commits_on_success() -> None:
    engine = build_engine()
    async with session_scope(engine) as session:
        await session.execute(text("create temporary table probe (n int)"))
        await session.execute(text("insert into probe values (1)"))
        assert isinstance(session, AsyncSession)
    await engine.dispose()


async def test_session_scope_rolls_back_when_the_body_raises() -> None:
    engine = build_engine()

    with pytest.raises(RuntimeError):
        async with session_scope(engine) as session:
            await session.execute(text("create table rollback_probe (n int)"))
            raise RuntimeError("boom")

    async with engine.connect() as connection:
        exists = await connection.scalar(text("select to_regclass('rollback_probe')"))
    await engine.dispose()

    assert exists is None


def test_independent_pool_fails_fast_and_never_grows() -> None:
    # A burst of failed logins must not queue on SQLAlchemy's 30 s default and
    # surface as a 500 where the caller should have seen 401 or 429. No
    # overflow either: the write is short, and an unbounded pool hides the cost.
    get_independent_engine.cache_clear()
    try:
        pool = get_independent_engine().pool
        assert isinstance(pool, QueuePool)
        assert pool.timeout() == INDEPENDENT_POOL_TIMEOUT_SECONDS
        assert INDEPENDENT_POOL_TIMEOUT_SECONDS < 5
        assert pool.size() == INDEPENDENT_POOL_SIZE
        assert pool._max_overflow == 0  # no public accessor
    finally:
        get_independent_engine.cache_clear()
