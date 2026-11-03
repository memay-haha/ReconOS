"""Shared test setup: point every core setting at the test databases and bucket.

Running against the development stores is forbidden: .claude/rules/testing.md
"""

import os
from collections.abc import Callable
from pathlib import Path

import pytest

from app.core.config import Settings

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
