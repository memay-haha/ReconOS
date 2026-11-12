"""Request and response bodies of the engine module: docs/api/architecture.md.

`engine.settings` keys per engine: docs/data/schema.md. Credentials are
write-only: no response model has a field for an API key or a variable value (G7).
"""

import uuid
from datetime import datetime
from typing import Annotated, Any, ClassVar, Final, Literal

from pydantic import (
    AnyHttpUrl,
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    StringConstraints,
)

from app.core.pagination import Page
from app.engine.adapters import (
    EngineCheckResult,
    EngineModule,
    EngineWorkflowDetail,
    EngineWorkflowItem,
)

EngineSort = Literal["name", "-name"]
VariableSort = Literal["key", "-key"]

# Variable keys travel as run parameter names to the engine.
VARIABLE_KEY_PATTERN: Final = r"^[A-Za-z_][A-Za-z0-9_]{0,63}$"
SECRET_MAX: Final = 4096

Secret = Annotated[str, StringConstraints(min_length=1, max_length=SECRET_MAX)]


def _blank_to_none(value: object) -> object:
    # The screen sends an empty field as "": store it as an unset key.
    return None if isinstance(value, str) and not value.strip() else value


BlankIsNone = BeforeValidator(_blank_to_none)


class EngineSettings(BaseModel):
    """Base of the per-engine `settings` schema. Unknown keys are refused."""

    model_config = ConfigDict(extra="forbid")

    accepts_llm_api_key: ClassVar[bool] = False


class OsmedeusSettings(EngineSettings):
    # Mapped to the Osmedeus run tactic by the runner.
    scan_preset: Literal["quick", "balanced", "deep"] = "balanced"


class VigoliumSettings(EngineSettings):
    accepts_llm_api_key: ClassVar[bool] = True

    llm_provider: Annotated[str | None, StringConstraints(max_length=100), BlankIsNone] = None
    llm_model: Annotated[str | None, StringConstraints(max_length=200), BlankIsNone] = None
    llm_base_url: Annotated[AnyHttpUrl | None, BlankIsNone] = None


ENGINE_SETTINGS: Final[dict[str, type[EngineSettings]]] = {
    "osmedeus": OsmedeusSettings,
    "vigolium": VigoliumSettings,
}


class EngineResponse(BaseModel):
    id: uuid.UUID
    name: str
    base_url: str
    is_enabled: bool
    settings: dict[str, Any]
    updated_by: uuid.UUID | None
    updated_at: datetime
    version: str | None
    last_tested_at: datetime | None
    last_test_ok: bool | None
    api_key_updated_at: datetime | None
    has_api_key: bool
    has_llm_api_key: bool
    uptime_seconds: int | None
    slots_used: int
    slots_total: int


class EngineUpdateRequest(BaseModel):
    """Every field optional. An omitted key keeps the stored one."""

    model_config = ConfigDict(extra="forbid")

    base_url: AnyHttpUrl | None = None
    api_key: Secret | None = None
    is_enabled: bool | None = None
    settings: dict[str, Any] | None = None
    llm_api_key: Secret | None = None


class EngineTestResponse(BaseModel):
    version: str | None


class EngineVariableResponse(BaseModel):
    id: uuid.UUID
    engine_id: uuid.UUID
    key: str
    updated_by: uuid.UUID | None
    updated_at: datetime


class EngineVariablePut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    value: Secret


class EngineModuleChange(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Annotated[str, StringConstraints(min_length=1, max_length=255)]
    is_enabled: bool


class EngineModulesPatch(BaseModel):
    """Native modules to switch; a module left out keeps its state."""

    model_config = ConfigDict(extra="forbid")

    modules: Annotated[list[EngineModuleChange], Field(min_length=1, max_length=1000)]


EnginePage = Page[EngineResponse]
EngineVariablePage = Page[EngineVariableResponse]
EngineWorkflowPage = Page[EngineWorkflowItem]
EngineModulePage = Page[EngineModule]

__all__ = [
    "ENGINE_SETTINGS",
    "VARIABLE_KEY_PATTERN",
    "EngineCheckResult",
    "EngineModule",
    "EngineModuleChange",
    "EngineModulePage",
    "EngineModulesPatch",
    "EnginePage",
    "EngineResponse",
    "EngineSettings",
    "EngineSort",
    "EngineTestResponse",
    "EngineUpdateRequest",
    "EngineVariablePage",
    "EngineVariablePut",
    "EngineVariableResponse",
    "EngineWorkflowDetail",
    "EngineWorkflowItem",
    "EngineWorkflowPage",
    "VariableSort",
]
