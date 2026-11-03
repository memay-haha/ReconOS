"""Shared test setup: point every core setting at the test databases and bucket.

Running against the development stores is forbidden: .claude/rules/testing.md
"""

import os
from collections.abc import AsyncIterator, Callable
from pathlib import Path

import pytest
import pytest_asyncio
from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.core.config import Settings
from app.core.db import build_engine

REPO_ROOT = Path(__file__).resolve().parents[2]


def _load_dotenv() -> dict[str, str]:
    env_file = REPO_ROOT / ".env"
    if not env_file.exists():
        return {}
    values: dict[str, str] = {}
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip()
    return values


def pytest_configure(config: pytest.Config) -> None:
    for key, value in _load_dotenv().items():
        os.environ.setdefault(key, value)

    # Redirect to the test stores, whatever .env says.
    for key, suffix in (("RECONOS_DATABASE_URL", "_test"), ("RECONOS_LOG_DATABASE_URL", "_test")):
        url = os.environ.get(key)
        if url and not url.endswith(suffix):
            os.environ[key] = url + suffix
    # Pinned so the cookie policy and the CSRF origin check are deterministic.
    os.environ["RECONOS_PUBLIC_ORIGIN"] = "https://reconos.example.com"
    bucket = os.environ.get("RECONOS_S3_BUCKET")
    if bucket and not bucket.endswith("-test"):
        os.environ["RECONOS_S3_BUCKET"] = f"{bucket}-test"


@pytest.fixture
def settings_factory() -> Callable[..., Settings]:
    def build(**overrides: object) -> Settings:
        values: dict[str, object] = {
            "database_url": "postgresql+asyncpg://reconos@localhost/reconos_test",
            "db_password": "x",
            "log_database_url": "postgresql+asyncpg://reconos@localhost/reconos_log_test",
            "log_db_password": "x",
            "redis_url": "redis://localhost:6379/0",
            "s3_endpoint": "http://localhost:9000",
            "s3_bucket": "reconos-test",
            "s3_access_key": "x",
            "s3_secret_key": "x",
            "encryption_keys": "k1:" + "0" * 44,
            "public_origin": "https://reconos.example.com",
        }
        values.update(overrides)
        return Settings(**values)  # type: ignore[arg-type]  # dict built from known field names

    return build


@pytest.fixture(scope="session", autouse=True)
def _migrated_test_database() -> None:
    """Build the test schema with Alembic, as production does.

    Absolute paths keep this independent of the directory pytest runs from.
    """
    config = Config(str(REPO_ROOT / "backend" / "alembic.ini"))
    config.set_main_option("script_location", str(REPO_ROOT / "backend" / "migrations"))
    command.upgrade(config, "head")


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def db_engine(_migrated_test_database: None) -> AsyncIterator[AsyncEngine]:
    engine = build_engine()
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture(autouse=True)
async def _clean_detached_rows(db_engine: AsyncEngine) -> None:
    """Clear rows an earlier test committed outside its own transaction.

    record_detached and record_failed_login write on their own connection, so
    the per-test rollback does not remove them. Cleaning at the start, not at
    teardown, keeps a test that fails midway from poisoning the next one.
    """
    async with db_engine.begin() as connection:
        await connection.execute(text("DELETE FROM login_attempt"))
        await connection.execute(text("DELETE FROM audit_log"))


@pytest_asyncio.fixture
async def db_session(db_engine: AsyncEngine) -> AsyncIterator[AsyncSession]:
    """One transaction per test, rolled back at the end: .claude/rules/testing.md"""
    connection = await db_engine.connect()
    transaction = await connection.begin()
    session = AsyncSession(bind=connection, expire_on_commit=False)
    try:
        yield session
    finally:
        await session.close()
        await transaction.rollback()
        await connection.close()
