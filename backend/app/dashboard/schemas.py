"""Response bodies of the dashboard module: docs/api/architecture.md, section on
aggregate responses."""

import uuid
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel

DashboardWindow = Literal["24h", "7d", "30d"]
LogSort = Literal["-logged_at", "logged_at"]
LogLevel = Literal["info", "warning", "error", "critical"]
EngineName = Literal["osmedeus", "vigolium"]
ComponentName = Literal[
    "api",
    "dispatcher",
    "background",
    "beat",
    "postgres",
    "reconos_log",
    "redis",
    "minio",
    "osmedeus",
    "vigolium",
]


class AssetCounts(BaseModel):
    domain: int = 0
    ip: int = 0
    url: int = 0
    service: int = 0


class DailyAssets(BaseModel):
    date: date
    domain: int
    url: int
    ip: int


class TopProgram(BaseModel):
    id: uuid.UUID
    name: str
    domain_count: int


class TopPort(BaseModel):
    port: int
    transport: str
    name: str | None
    count: int


class TopServiceName(BaseModel):
    name: str
    ratio: float


class ClosedAssets(BaseModel):
    service: int


class SeverityCounts(BaseModel):
    critical: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0
    info: int = 0


class DashboardSummaryResponse(BaseModel):
    programs: int
    programs_active: int
    active_sync_ratio: float | None
    programs_new: int
    assets: AssetCounts
    assets_new: AssetCounts
    assets_closed: ClosedAssets
    new_assets_daily: list[DailyAssets]
    top_programs: list[TopProgram]
    scope_coverage: float | None
    top_ports: list[TopPort]
    top_service_name: TopServiceName | None
    findings_by_severity: SeverityCounts
    # Findings still in `new`: the S20 badge of the sidebar (debt 35).
    findings_triage_new: int
    findings_near_sla: int
    confirmed_cve_findings_24h: int
    jobs_by_status: dict[str, int]
    jobs_per_minute: float
    workers_online: int


class SearchItem(BaseModel):
    type: Literal["program", "domain", "url", "finding", "tool_module"]
    id: uuid.UUID
    # Target data: rendered as text.
    label: str
    program_id: uuid.UUID | None


class SearchResponse(BaseModel):
    items: list[SearchItem]


class ComponentResponse(BaseModel):
    name: str
    status: Literal["ok", "degraded", "down"]
    latency_ms: int | None
    checked_at: datetime
    version: str | None
    detail: str | None
    message: str | None


class ToolsInstalled(BaseModel):
    installed: int
    total: int


class SystemHealthResponse(BaseModel):
    components: list[ComponentResponse]
    queue_length: int
    workers_online: int
    tools_installed: ToolsInstalled
    fleet_load: float | None


class DiagnosticRunCreated(BaseModel):
    id: uuid.UUID
    status: Literal["running", "passed", "failed"]


class DiagnosticRunResponse(BaseModel):
    id: uuid.UUID
    status: Literal["running", "passed", "failed"]
    exit_code: int | None
    output: str | None
    created_at: datetime
    finished_at: datetime | None


class AppLogResponse(BaseModel):
    id: uuid.UUID
    logged_at: datetime
    level: str
    service: str
    event: str
    request_id: uuid.UUID | None
    job_id: uuid.UUID | None
    program_id: uuid.UUID | None
    worker_id: uuid.UUID | None
    # Untrusted: the browser renders it as text.
    context: dict[str, Any] | None
