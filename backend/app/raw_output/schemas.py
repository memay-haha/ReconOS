"""Response bodies of the raw_output module: docs/api/architecture.md."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

from contracts.raw_output import ParseStatus

RawOutputSort = Literal["created_at", "-created_at"]


class RawOutputResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    job_id: uuid.UUID
    filename: str
    content_type: str
    size_bytes: int
    sha256: str
    parse_status: ParseStatus
    parse_error: str | None
    created_at: datetime
    parsed_at: datetime | None
