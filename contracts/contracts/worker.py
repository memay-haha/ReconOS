"""Worker-level messages: worker heartbeat and log batches.

Contract: docs/integrations/external-services.md. Log fields:
.claude/rules/logging.md.
"""

from datetime import datetime
from enum import StrEnum
from typing import Annotated, Any, Final
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

LOG_BATCH_MAX_RECORDS: Final = 1000


class ToolVersion(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: Annotated[str, Field(min_length=1, max_length=100)]
    # NULL when the tool does not report a version.
    version: Annotated[str, Field(min_length=1, max_length=100)] | None


class WorkerHeartbeat(BaseModel):
    """Body of `POST /worker/heartbeat`."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    tool_modules: list[Annotated[str, Field(min_length=1, max_length=100)]]
    tools: list[ToolVersion]
    # Average machine CPU load since the previous heartbeat.
    cpu_percent: Annotated[float, Field(ge=0, le=100)] | None = None


class WorkerLogLevel(StrEnum):
    # `debug` stays on stdout and never reaches the log database.
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class WorkerLogRecord(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    logged_at: datetime
    level: WorkerLogLevel
    event: Annotated[str, Field(pattern=r"^[a-z][a-z0-9_]{0,99}$")]
    job_id: UUID | None = None
    context: dict[str, Any] = Field(default_factory=dict)


class WorkerLogBatch(BaseModel):
    """Body of `POST /worker/logs`. The token identifies the worker."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    records: Annotated[list[WorkerLogRecord], Field(min_length=1, max_length=LOG_BATCH_MAX_RECORDS)]
