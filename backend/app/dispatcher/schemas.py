"""Response bodies of the dispatcher module: docs/api/architecture.md."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

DispatcherHealth = Literal["ok", "degraded", "down"]


class DispatcherStatusResponse(BaseModel):
    status: DispatcherHealth
    last_heartbeat_at: datetime | None
    queued_total: int
    queued_by_tool_module: dict[uuid.UUID, int]
    queued_by_program: dict[uuid.UUID, int]
    queue_capacity: int
    workers_online: int
    running_total: int
    slot_capacity: int
    jobs_per_minute: float
    avg_wait_seconds: float | None
    redis_used_bytes: int | None
    last_dispatched_at: datetime | None
    last_dispatched_tool_module: str | None
