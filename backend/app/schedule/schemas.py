"""Request and response bodies of the schedule module: docs/api/architecture.md."""

import uuid
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic_core import PydanticCustomError

from app.job.schemas import Targets
from app.schedule.models import MAX_INTERVAL_MINUTES, MIN_INTERVAL_MINUTES

ScheduleSort = Literal["-created_at"]

IntervalMinutes = Annotated[int, Field(ge=MIN_INTERVAL_MINUTES, le=MAX_INTERVAL_MINUTES)]


def _not_null(value: object) -> object:
    """PATCH may leave a field out, but may not clear a required one."""
    if value is None:
        raise PydanticCustomError("null_not_allowed", "field cannot be null")
    return value


class ScheduleCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tool_module_id: uuid.UUID
    target: Targets
    params: dict[str, Any] = Field(default_factory=dict)
    interval_minutes: IntervalMinutes
    is_enabled: bool = True


class ScheduleUpdateRequest(BaseModel):
    """The tool module stays: a different tool is a different schedule."""

    model_config = ConfigDict(extra="forbid")

    target: Targets | None = None
    params: dict[str, Any] | None = None
    interval_minutes: IntervalMinutes | None = None
    is_enabled: bool | None = None

    _required_stays_set = field_validator(
        "target", "params", "interval_minutes", "is_enabled", mode="before"
    )(_not_null)


class ScheduleResponse(BaseModel):
    id: uuid.UUID
    program_id: uuid.UUID
    program_name: str
    tool_module_id: uuid.UUID
    tool_module_name: str
    target: list[str]
    params: dict[str, Any]
    interval_minutes: int
    is_enabled: bool
    created_by: uuid.UUID | None
    last_run_at: datetime | None
    next_run_at: datetime
    created_at: datetime
