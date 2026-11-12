"""Request and response bodies of the alert module: docs/api/architecture.md."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.alert.models import AlertType

AlertSort = Literal["-created_at", "created_at"]


class AlertResponse(BaseModel):
    id: uuid.UUID
    alert_type: AlertType
    message: str
    program_id: uuid.UUID | None
    finding_id: uuid.UUID | None
    job_id: uuid.UUID | None
    created_at: datetime
    # Read state of the calling account, not of the alert.
    is_read: bool
