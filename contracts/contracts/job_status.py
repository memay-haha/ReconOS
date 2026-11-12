"""Job state reported by the worker: heartbeat answer and finish.

Contract: docs/integrations/external-services.md. State machine:
docs/architecture/business-flow.md.
"""

from enum import StrEnum
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field


class JobStatus(StrEnum):
    PENDING_APPROVAL = "pending_approval"
    QUEUED = "queued"
    DISPATCHED = "dispatched"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class JobHeartbeatAction(StrEnum):
    CONTINUE = "continue"
    CANCEL = "cancel"


class JobHeartbeatResponse(BaseModel):
    """Answer to `POST /worker/jobs/{job_id}/heartbeat`."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    action: JobHeartbeatAction


class FinishStatus(StrEnum):
    """Outcome a worker reports. `cancelled` acknowledges a cancel request:
    the job is already `cancelled` and keeps that status."""

    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


STATUS_REASON_MAX_LENGTH = 500
TOOL_VERSION_MAX_LENGTH = 100


class JobFinish(BaseModel):
    """Body of `POST /worker/jobs/{job_id}/finish`, sent after every upload."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    status: FinishStatus
    # Short English sentence, no credential, no system path: .claude/rules/error-handling.md
    status_reason: (
        Annotated[str, Field(min_length=1, max_length=STATUS_REASON_MAX_LENGTH)] | None
    ) = None
    tool_version: Annotated[str, Field(min_length=1, max_length=TOOL_VERSION_MAX_LENGTH)] | None = (
        None
    )
