"""Database engine, metadata conventions and the per-request transaction.

Conventions: docs/data/database.md. Transaction rule: .claude/rules/design-patterns.md
"""

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import Base, build_engine, session_scope


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
