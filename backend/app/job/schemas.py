"""Request and response bodies of the job module: docs/api/architecture.md."""

import uuid
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field

from app.core.pagination import Page
from app.job.models import JobPriority
from app.scope.matching import MAX_TARGET_LENGTH
from contracts.job_status import JobStatus

PriorityName = Literal["low", "normal", "high"]
PRIORITY_VALUES: dict[str, JobPriority] = {
    "low": JobPriority.LOW,
    "normal": JobPriority.NORMAL,
    "high": JobPriority.HIGH,
}
PRIORITY_NAMES: dict[int, PriorityName] = {
    JobPriority.LOW: "low",
    JobPriority.NORMAL: "normal",
    JobPriority.HIGH: "high",
}

# One job holds at most one page of targets; bulk ids follow api/architecture.md.
MAX_TARGETS = 200
MAX_BULK_IDS = 500
MAX_BULK_ITEMS = 50

JobSort = Literal["created_at", "-created_at", "-status_changed_at", "-priority"]

Target = Annotated[str, Field(min_length=1, max_length=MAX_TARGET_LENGTH)]
Targets = Annotated[list[Target], Field(min_length=1, max_length=MAX_TARGETS)]


class JobCreateRequest(BaseModel):
    program_id: uuid.UUID
    tool_module_id: uuid.UUID
    target: Targets
    params: dict[str, Any] = Field(default_factory=dict)
    priority: PriorityName = "normal"
    proxy_id: uuid.UUID | None = None


class JobBulkItem(BaseModel):
    tool_module_id: uuid.UUID
    params: dict[str, Any] = Field(default_factory=dict)


class JobBulkCreateRequest(BaseModel):
    program_id: uuid.UUID
    target: Targets
    priority: PriorityName = "normal"
    proxy_id: uuid.UUID | None = None
    items: list[JobBulkItem] = Field(min_length=1, max_length=MAX_BULK_ITEMS)


class JobIdsRequest(BaseModel):
    ids: list[uuid.UUID] = Field(min_length=1, max_length=MAX_BULK_IDS)


class JobResponse(BaseModel):
    id: uuid.UUID
    program_id: uuid.UUID
    tool_module_id: uuid.UUID
    tool_module_name: str
    status: JobStatus
    priority: PriorityName
    target: list[str]
    params: dict[str, Any]
    proxy_id: uuid.UUID | None
    schedule_id: uuid.UUID | None
    retry_of_job_id: uuid.UUID | None
    worker_id: uuid.UUID | None
    worker_name: str | None
    created_by: uuid.UUID | None
    created_by_username: str | None
    approved_by: uuid.UUID | None
    status_reason: str | None
    tool_version: str | None
    created_at: datetime
    approved_at: datetime | None
    dispatched_at: datetime | None
    started_at: datetime | None
    last_heartbeat_at: datetime | None
    finished_at: datetime | None
    status_changed_at: datetime


class JobListResponse(BaseModel):
    items: list[JobResponse]


JobPage = Page[JobResponse]


class JobCleanupResponse(BaseModel):
    cancelled: int
