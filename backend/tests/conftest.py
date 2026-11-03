"""Shared test setup: point every core setting at the test databases and bucket.

Running against the development stores is forbidden: .claude/rules/testing.md
"""

import itertools
import os
from collections.abc import AsyncIterator, Awaitable, Callable, Iterator
from pathlib import Path

import pytest
import pytest_asyncio
from alembic import command
from alembic.config import Config
from fastapi import Request
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.core.config import Settings
from app.core.db import build_engine, get_engine, get_independent_engine
from app.core.identity import User, UserRole
from app.core.security import HOST_COOKIE_NAME, hash_password
from app.core.system_setting import clear_setting_cache

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


@pytest.fixture(autouse=True)
def _isolated_setting_cache() -> Iterator[None]:
    """Clear the process-wide setting cache around every test.

    A value cached by one test would otherwise outlive its rolled-back row and
    change what a later module reads, so results would depend on test order.
    """
    clear_setting_cache()
    yield
    clear_setting_cache()


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
            # Pinned so a developer's own .env cannot decide whether a test
            # sees the bootstrap variables as set.
            "bootstrap_admin_username": None,
            "bootstrap_admin_password": None,
        }
        values.update(overrides)
        return Settings(**values)  # type: ignore[arg-type]  # dict built from known field names

    return build


@pytest.fixture(scope="session", autouse=True)
def _migrated_test_database() -> None:
    """Build the test schema with Alembic, as production does.

    Rebuilt from base every session: a migration edited before it ever ran in
    production would otherwise leave the test database on the version Alembic
    had already stamped, and the tests would pass against a schema no fresh
    deployment produces.

    Absolute paths keep this independent of the directory pytest runs from.
    """
    config = Config(str(REPO_ROOT / "backend" / "alembic.ini"))
    config.set_main_option("script_location", str(REPO_ROOT / "backend" / "migrations"))
    command.downgrade(config, "base")
    command.upgrade(config, "head")


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def db_engine(_migrated_test_database: None) -> AsyncIterator[AsyncEngine]:
    engine = build_engine()
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture(scope="session", loop_scope="session", autouse=True)
async def _dispose_process_engine() -> AsyncIterator[None]:
    """Close the cached process engines, which nothing else disposes.

    Left open, asyncpg warns about unclosed connections at interpreter exit.
    """
    yield
    for cached in (get_engine, get_independent_engine):
        if cached.cache_info().currsize:
            await cached().dispose()
            cached.cache_clear()


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


@pytest.fixture
def request_factory() -> Callable[..., Request]:
    def build(session_id: str | None = None, method: str = "GET") -> Request:
        headers: list[tuple[bytes, bytes]] = []
        if session_id is not None:
            headers.append((b"cookie", f"{HOST_COOKIE_NAME}={session_id}".encode()))
        return Request({"type": "http", "method": method, "headers": headers, "path": "/"})

    return build


@pytest.fixture
def user_factory(db_session: AsyncSession) -> Callable[..., Awaitable[User]]:
    counter = itertools.count()

    async def build(
        role: UserRole = UserRole.USER,
        is_locked: bool = False,
        password: str = "troutmoonlit7Ladder!quay",  # noqa: S107  # throwaway test value
    ) -> User:
        user = User(
            username=f"account{next(counter)}",
            display_name="Test Account",
            password_hash=hash_password(password),
            role=role.value,
            is_locked=is_locked,
        )
        db_session.add(user)
        await db_session.flush()
        return user

    return build


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncIterator[AsyncClient]:
    """Drive the real app, but inside the transaction of the test."""
    from app.core.deps import get_db
    from app.main import app

    async def override_get_db() -> AsyncIterator[AsyncSession]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    # https keeps the Secure session cookie in the client between requests.
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://reconos.example.com"
    ) as http:
        yield http
    app.dependency_overrides.clear()


@pytest.fixture
def logged_in(
    client: AsyncClient, user_factory: Callable[..., Awaitable[User]]
) -> Callable[..., Awaitable[User]]:
    """Create an account and log the shared client in as that account."""
    password = "troutmoonlit7Ladder!quay"  # throwaway test value

    async def build(role: UserRole = UserRole.USER) -> User:
        user = await user_factory(role=role, password=password)
        response = await client.post(
            "/api/v1/auth/login",
            json={"username": user.username, "password": password},
            headers={
                "origin": "https://reconos.example.com",
                "sec-fetch-site": "same-origin",
            },
        )
        assert response.status_code == 204
        return user

    return build
