"""Worker settings, read from RECONOS_* environment variables.

Variable list: docs/ops/configuration.md. Every credential also accepts a _FILE
suffix pointing at a file, which Docker secrets rely on.
"""

from functools import lru_cache
from pathlib import Path
from typing import Annotated, Any

from pydantic import Field, SecretStr, field_validator
from pydantic.fields import FieldInfo
from pydantic_settings import (
    BaseSettings,
    EnvSettingsSource,
    NoDecode,
    PydanticBaseSettingsSource,
    SettingsConfigDict,
)

ENV_PREFIX = "RECONOS_"
FILE_SUFFIX = "_FILE"


class FileSuffixSource(EnvSettingsSource):
    """Reads `<VAR>_FILE` and returns the file content as the value of `<VAR>`.

    Placed ahead of the plain environment source, so _FILE wins when both are set.
    """

    def get_field_value(self, field: FieldInfo, field_name: str) -> tuple[Any, str, bool]:
        env_name = f"{ENV_PREFIX}{field_name.upper()}{FILE_SUFFIX}"
        path = self.env_vars.get(env_name.lower())
        if path is None:
            return None, field_name, False
        # Trailing newlines come from `echo > file` and from Docker secrets.
        return Path(path).read_text(encoding="utf-8").strip(), field_name, False


class WorkerSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix=ENV_PREFIX, extra="ignore")

    api_url: str
    worker_token: SecretStr
    # Holds the Redis account name, `worker`, never the password.
    redis_url: str
    redis_password: SecretStr | None = None
    worker_tool_modules: Annotated[list[str], NoDecode] = Field(min_length=1)
    worker_workdir: Path = Path("/var/lib/reconos/jobs")
    worker_concurrency: int = Field(default=1, ge=1)
    worker_heartbeat_seconds: int = Field(default=30, ge=5)
    log_level: str = "info"

    @field_validator("worker_tool_modules", mode="before")
    @classmethod
    def _split_comma_list(cls, value: object) -> object:
        if isinstance(value, str):
            return [part.strip() for part in value.split(",") if part.strip()]
        return value

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
def get_settings() -> WorkerSettings:
    """One instance per process. A missing variable stops the worker at start."""
    return WorkerSettings()
