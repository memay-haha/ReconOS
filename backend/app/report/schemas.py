"""Request and response models of the report module: docs/api/architecture.md.

`body` is Markdown written by a person, but it may quote raw output, so the
frontend renders it without HTML: .claude/rules/security.md.
"""

import uuid
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator
from pydantic_core import PydanticCustomError

from app.asset.schemas import MAX_IDS
from app.finding.schemas import FindingResponse
from app.raw_output.schemas import RawOutputResponse
from app.report.models import ReportStatus

MAX_BODY = 200_000

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
Body = Annotated[str, StringConstraints(max_length=MAX_BODY)]
PlatformRef = Annotated[str, StringConstraints(strip_whitespace=True, max_length=255)]
FindingIds = Annotated[list[uuid.UUID], Field(min_length=1, max_length=MAX_IDS)]

ReportSort = Literal["-created_at", "created_at"]
ReportExportFormat = Literal["md", "csv", "jsonl"]


def _not_null(value: object) -> object:
    """PATCH may leave a field out, but may not clear a required one."""
    if value is None:
        raise PydanticCustomError("null_not_allowed", "field cannot be null")
    return value


def _blank_is_none(value: str | None) -> str | None:
    return value or None


class ReportCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    program_id: uuid.UUID
    title: Title
    body: Body = ""
    platform_report_ref: PlatformRef | None = None
    finding_ids: FindingIds

    _blank_ref = field_validator("platform_report_ref")(_blank_is_none)


class ReportUpdateRequest(BaseModel):
    """A draft takes every field. A submitted report takes `platform_report_ref` only."""

    model_config = ConfigDict(extra="forbid")

    title: Title | None = None
    body: Body | None = None
    platform_report_ref: PlatformRef | None = None
    finding_ids: FindingIds | None = None

    _required_stays_set = field_validator("title", "body", "finding_ids", mode="before")(_not_null)
    _blank_ref = field_validator("platform_report_ref")(_blank_is_none)

    def changes(self) -> dict[str, Any]:
        return self.model_dump(exclude_unset=True)


class ReportSubmitRequest(BaseModel):
    """The platform reference is often known only once the report is filed there."""

    model_config = ConfigDict(extra="forbid")

    platform_report_ref: PlatformRef | None = None

    _blank_ref = field_validator("platform_report_ref")(_blank_is_none)


class SeverityCounts(BaseModel):
    critical: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0
    info: int = 0


class ReportResponse(BaseModel):
    """A row of GET /reports."""

    id: uuid.UUID
    program_id: uuid.UUID
    program_name: str
    title: str
    status: ReportStatus
    platform_report_ref: str | None
    finding_count: int
    severity_counts: SeverityCounts
    created_by: uuid.UUID | None
    created_by_username: str | None
    created_at: datetime
    updated_at: datetime
    submitted_at: datetime | None


class ReportFindingResponse(FindingResponse):
    """A finding of the report with its evidence file: metadata only, never the bytes (G8)."""

    raw_output: RawOutputResponse | None


class ReportDetailResponse(ReportResponse):
    body: str
    findings: list[ReportFindingResponse]
