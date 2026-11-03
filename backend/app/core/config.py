"""Core process settings, read from RECONOS_* environment variables.

Variable list and defaults: docs/ops/configuration.md. Every credential also
accepts a _FILE suffix pointing at a file, which Docker secrets rely on.
"""

from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import SecretStr
from pydantic.fields import FieldInfo
from pydantic_settings import (
    BaseSettings,
    EnvSettingsSource,
    PydanticBaseSettingsSource,
    SettingsConfigDict,
)

ENV_PREFIX = "RECONOS_"
FILE_SUFFIX = "_FILE"


class FileSuffixSource(EnvSettingsSource):
    """Reads `<VAR>_FILE` and returns the file content as the value of `<VAR>`.

    It is placed ahead of the plain environment source, so a _FILE variable wins
    when both forms are set.
    """

    def get_field_value(self, field: FieldInfo, field_name: str) -> tuple[Any, str, bool]:
        env_name = f"{ENV_PREFIX}{field_name.upper()}{FILE_SUFFIX}"
        path = self.env_vars.get(env_name.lower())
        if path is None:
            return None, field_name, False
        # Trailing newlines come from `echo > file` and from Docker secrets.
        return Path(path).read_text(encoding="utf-8").strip(), field_name, False


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix=ENV_PREFIX, extra="ignore")

    database_url: str
    db_password: SecretStr
    log_database_url: str
    log_db_password: SecretStr
    redis_url: str
    redis_password: SecretStr | None = None
    s3_endpoint: str
    s3_bucket: str
    s3_access_key: SecretStr
    s3_secret_key: SecretStr
    encryption_keys: SecretStr
    public_origin: str
    log_level: str = "info"
    db_pool_size: int = 10
    # Only the bootstrap command reads these, and only while the user
    # table is still empty: docs/security/authentication.md
    bootstrap_admin_username: str | None = None
    bootstrap_admin_password: SecretStr | None = None

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        return (
            init_settings,
            FileSuffixSource(settings_cls),
            env_settings,
            dotenv_settings,
            file_secret_settings,
        )


@lru_cache
def get_settings() -> Settings:
    """One instance per process. A missing variable stops the process at start."""
    return Settings()
