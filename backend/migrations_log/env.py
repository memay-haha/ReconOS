"""Alembic environment for the separate log database `reconos_log`.

`app_log` is partitioned by day, which autogenerate cannot express, so this tree
carries hand-written migrations and no metadata: docs/data/database.md.
"""

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import Connection

from app.core.db import build_log_engine

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)


def _run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=None)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_offline() -> None:
    context.configure(url=str(build_log_engine().url), target_metadata=None, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    engine = build_log_engine()
    async with engine.connect() as connection:
        await connection.run_sync(_run_migrations)
    await engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
