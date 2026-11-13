"""Request and response bodies of the tool_module module: docs/api/architecture.md."""

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.core.pagination import Page
from contracts.tool_modules import OutputType, ToolGroup

ToolModuleSort = Literal["name", "-name"]
StatsWindow = Literal["24h", "7d", "30d"]
DisabledReason = Literal["off", "engine_disabled", "engine_down", "not_installed"]


class ToolModuleResponse(BaseModel):
    id: uuid.UUID
    name: str
    title: str
    description: str
    group: ToolGroup
    is_enabled: bool
    default_params: dict[str, Any]
    max_concurrency: int
    rate_limit_per_minute: int | None
    timeout_minutes: int
    updated_at: datetime
    runs_on: str | None
    tools: list[str]
    output_types: list[OutputType]
    accepts_wildcard: bool
    param_schema: dict[str, Any]
    last_job_at: datetime | None
    jobs_24h: int
    finding_count: int
    engine_status: Literal["ok", "degraded", "down"] | None
    disabled_reason: DisabledReason | None
    estimated_seconds: int | None


class GroupCounts(BaseModel):
    recon: int = 0
    scan: int = 0
    exploit: int = 0


class ToolModulePage(Page[ToolModuleResponse]):
    enabled_count: int
    disabled_count: int
    disabled_names: list[str]
    group_counts: GroupCounts
    engines_bound: int
    installed_count: int
    ready_count: int


class ToolModuleUpdateRequest(BaseModel):
    """Every field optional. The schema of `default_params` is checked by the service."""

    is_enabled: bool | None = None
    default_params: dict[str, Any] | None = None
    max_concurrency: int | None = Field(default=None, ge=1, le=1000)
    rate_limit_per_minute: int | None = Field(default=None, ge=1, le=100_000)
    timeout_minutes: int | None = Field(default=None, ge=1, le=7 * 24 * 60)


class ToolModuleStatsResponse(BaseModel):
    window: StatsWindow
    jobs: int
    jobs_prev: int
    stalled: int


class ToolInstall(BaseModel):
    worker_name: str
    version: str | None


class ToolResponse(BaseModel):
    name: str
    tool_modules: list[str]
    status: Literal["installed", "missing"]
    installed: list[ToolInstall]
