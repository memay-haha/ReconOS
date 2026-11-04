"""Core settings: docs/ops/configuration.md."""

from pathlib import Path

import pytest
from pydantic import ValidationError

from app.core.config import Settings

REQUIRED = {
    "RECONOS_DATABASE_URL": "postgresql+asyncpg://reconos_app@127.0.0.1:5432/reconos",
    "RECONOS_DB_PASSWORD": "db-pass",
    "RECONOS_LOG_DATABASE_URL": "postgresql+asyncpg://reconos_log_app@127.0.0.1:5432/reconos_log",
    "RECONOS_LOG_DB_PASSWORD": "log-pass",
    "RECONOS_REDIS_URL": "redis://127.0.0.1:6379/0",
    "RECONOS_S3_ENDPOINT": "http://127.0.0.1:9000",
    "RECONOS_S3_BUCKET": "reconos-raw-output",
    "RECONOS_S3_ACCESS_KEY": "access",
    "RECONOS_S3_SECRET_KEY": "secret",
    "RECONOS_ENCRYPTION_KEYS": "k1:aGVsbG8=",
    "RECONOS_PUBLIC_ORIGIN": "http://127.0.0.1:3000",
}


@pytest.fixture
def env(monkeypatch: pytest.MonkeyPatch) -> pytest.MonkeyPatch:
    for key, value in REQUIRED.items():
        monkeypatch.setenv(key, value)
    return monkeypatch


def test_reads_every_documented_variable(env: pytest.MonkeyPatch) -> None:
    settings = Settings()

    assert settings.database_url == REQUIRED["RECONOS_DATABASE_URL"]
    assert settings.s3_bucket == "reconos-raw-output"
    assert settings.db_password.get_secret_value() == "db-pass"


def test_applies_documented_defaults(env: pytest.MonkeyPatch) -> None:
    # The developer's own .env may set these; defaults only show without them.
    env.delenv("RECONOS_LOG_LEVEL", raising=False)
    env.delenv("RECONOS_DB_POOL_SIZE", raising=False)

    settings = Settings()

    assert settings.log_level == "info"
    assert settings.db_pool_size == 10


def test_file_suffix_wins_over_the_direct_value(env: pytest.MonkeyPatch, tmp_path: Path) -> None:
    secret_file = tmp_path / "db_password"
    # A trailing newline is what `echo > file` and Docker secrets produce.
    secret_file.write_text("from-file\n", encoding="utf-8")
    env.setenv("RECONOS_DB_PASSWORD_FILE", str(secret_file))

    settings = Settings()

    assert settings.db_password.get_secret_value() == "from-file"


def test_file_suffix_works_without_the_direct_value(
    env: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    secret_file = tmp_path / "s3_secret"
    secret_file.write_text("file-only", encoding="utf-8")
    env.delenv("RECONOS_S3_SECRET_KEY")
    env.setenv("RECONOS_S3_SECRET_KEY_FILE", str(secret_file))

    assert Settings().s3_secret_key.get_secret_value() == "file-only"


def test_missing_required_variable_is_rejected(env: pytest.MonkeyPatch) -> None:
    env.delenv("RECONOS_DATABASE_URL")

    with pytest.raises(ValidationError) as excinfo:
        Settings()

    assert "database_url" in str(excinfo.value)


def test_credentials_stay_masked_when_printed(env: pytest.MonkeyPatch) -> None:
    settings = Settings()

    assert "db-pass" not in repr(settings)
    assert "secret" not in repr(settings.s3_secret_key)


def test_bootstrap_variables_are_optional(env: pytest.MonkeyPatch) -> None:
    env.delenv("RECONOS_BOOTSTRAP_ADMIN_USERNAME", raising=False)
    env.delenv("RECONOS_BOOTSTRAP_ADMIN_PASSWORD", raising=False)

    settings = Settings()

    assert settings.bootstrap_admin_username is None
    assert settings.bootstrap_admin_password is None


def test_bootstrap_variables_are_read(env: pytest.MonkeyPatch) -> None:
    env.setenv("RECONOS_BOOTSTRAP_ADMIN_USERNAME", "rootadmin")
    env.setenv("RECONOS_BOOTSTRAP_ADMIN_PASSWORD", "troutmoonlit7Ladder")

    settings = Settings()

    assert settings.bootstrap_admin_username == "rootadmin"
    assert settings.bootstrap_admin_password is not None
    assert settings.bootstrap_admin_password.get_secret_value() == "troutmoonlit7Ladder"


def test_bootstrap_password_reads_file_suffix(env: pytest.MonkeyPatch, tmp_path: Path) -> None:
    secret_file = tmp_path / "admin_password"
    secret_file.write_text("troutmoonlit7Ladder\n", encoding="utf-8")
    env.setenv("RECONOS_BOOTSTRAP_ADMIN_PASSWORD_FILE", str(secret_file))

    settings = Settings()

    assert settings.bootstrap_admin_password is not None
    assert settings.bootstrap_admin_password.get_secret_value() == "troutmoonlit7Ladder"


def test_public_origin_keeps_scheme_and_host_only(env: pytest.MonkeyPatch) -> None:
    # A trailing slash would make the CSRF comparison fail on every mutating
    # request, login included, while the cookie policy still looked right.
    env.setenv("RECONOS_PUBLIC_ORIGIN", "https://reconos.example.com/")

    assert Settings().public_origin == "https://reconos.example.com"


def test_public_origin_keeps_an_explicit_port(env: pytest.MonkeyPatch) -> None:
    env.setenv("RECONOS_PUBLIC_ORIGIN", "http://127.0.0.1:3000/app")

    assert Settings().public_origin == "http://127.0.0.1:3000"


@pytest.mark.parametrize(
    "value", ["reconos.example.com", "ftp://reconos.example.com", "https://", ""]
)
def test_a_malformed_public_origin_stops_the_process(env: pytest.MonkeyPatch, value: str) -> None:
    env.setenv("RECONOS_PUBLIC_ORIGIN", value)

    with pytest.raises(ValidationError) as excinfo:
        Settings()

    assert "public_origin" in str(excinfo.value)
