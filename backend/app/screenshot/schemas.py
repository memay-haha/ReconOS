"""Request, response and ingest models of the screenshot module: docs/api/architecture.md.

`ScreenshotRecord` is what the gowitness parser hands to the screenshot service.
Raw output is untrusted: the parser cuts every text and list to the bounds
below before it builds a record, and a record that still breaks a bound is
dropped. Cookie values never reach a record (G7).
"""

import uuid
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.asset.schemas import UrlRecord
from contracts.job_status import JobStatus

ScreenshotSort = Literal["-captured_at", "captured_at", "perception_hash"]
StatusClass = Literal["2xx", "3xx", "4xx", "5xx"]

# Bounds on what one capture may carry out of a raw output.
MAX_HEADERS = 100
MAX_HEADER_VALUE = 8 * 1024
MAX_NETWORK_ENTRIES = 500
MAX_CONSOLE_ENTRIES = 200
MAX_COOKIES = 100
MAX_SAN = 100
MAX_TEXT = 2048
MAX_CONSOLE_MESSAGE = 4096
MAX_ERROR = 1024
MAX_HTML_BYTES = 2 * 1024 * 1024

# Headers counted by `security_headers`: docs/api/architecture.md (M19).
SECURITY_HEADERS = (
    "strict-transport-security",
    "content-security-policy",
    "x-frame-options",
    "x-content-type-options",
    "permissions-policy",
)


# ---------------------------------------------------------------- ingest records


class ScreenshotRecord(BaseModel):
    """One gowitness capture, already cut to bounds, with the URL it shows."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    url: UrlRecord
    # Name of the PNG raw output of the same job; None when no image was saved.
    image_filename: Annotated[str, Field(min_length=1, max_length=255)] | None = None
    final_url: Annotated[str, Field(max_length=MAX_TEXT)] | None = None
    status_code: Annotated[int, Field(ge=100, le=999)] | None = None
    title: Annotated[str, Field(max_length=1024)] | None = None
    perception_hash: Annotated[str, Field(max_length=255)] | None = None
    http_headers: dict[str, str] = Field(default_factory=dict, max_length=MAX_HEADERS)
    remote_ip: Annotated[str, Field(max_length=64)] | None = None
    duration_ms: Annotated[int, Field(ge=0)] | None = None
    tls: dict[str, Any] | None = None
    network_log: list[dict[str, Any]] = Field(default_factory=list, max_length=MAX_NETWORK_ENTRIES)
    console_log: list[dict[str, Any]] = Field(default_factory=list, max_length=MAX_CONSOLE_ENTRIES)
    cookies: list[dict[str, Any]] = Field(default_factory=list, max_length=MAX_COOKIES)
    html: str | None = None
    is_failed: bool = False
    error_message: Annotated[str, Field(max_length=MAX_ERROR)] | None = None
    captured_at: datetime | None = None


class ScreenshotBatch(BaseModel):
    """Captures of one parser call, written together by the screenshot service."""

    screenshots: list[ScreenshotRecord] = Field(default_factory=list)

    def __len__(self) -> int:
        return len(self.screenshots)


class ScreenshotIngestResult(BaseModel):
    created: int = 0
    updated: int = 0
    dropped: int = 0

    def add(self, other: ScreenshotIngestResult) -> ScreenshotIngestResult:
        return ScreenshotIngestResult(
            created=self.created + other.created,
            updated=self.updated + other.updated,
            dropped=self.dropped + other.dropped,
        )


# ---------------------------------------------------------------- responses


class ScreenshotTechnology(BaseModel):
    name: str
    category: str | None


class ScreenshotResponse(BaseModel):
    """A list row. Every text field comes from the target: shown as text only."""

    id: uuid.UUID
    program_id: uuid.UUID
    url_id: uuid.UUID
    job_id: uuid.UUID | None
    raw_output_id: uuid.UUID | None
    final_url: str | None
    status_code: int | None
    title: str | None
    perception_hash: str | None
    http_headers: dict[str, Any] | None
    is_failed: bool
    error_message: str | None
    captured_at: datetime
    similar_group: int | None = None
    similar_count: int = 1
    technologies: list[ScreenshotTechnology] = Field(default_factory=list)
    retry_job_status: JobStatus | None = None
    width: int | None
    height: int | None


class ScreenshotTls(BaseModel):
    protocol: str | None = None
    cipher: str | None = None
    issuer: str | None = None
    subject: str | None = None
    san: list[str] = Field(default_factory=list)
    not_before: datetime | None = None
    not_after: datetime | None = None


class ConsoleEntry(BaseModel):
    level: str
    message: str
    at: datetime | None = None


class ScreenshotCookie(BaseModel):
    """A cookie without its value (G7)."""

    name: str
    domain: str | None = None
    path: str | None = None
    expires: datetime | None = None
    secure: bool = False
    http_only: bool = False
    same_site: str | None = None


class ScreenshotDetailResponse(ScreenshotResponse):
    worker_name: str | None
    device_scale: float | None
    remote_ip: str | None
    duration_ms: int | None
    tls: ScreenshotTls | None
    console_log: list[ConsoleEntry]
    cookies: list[ScreenshotCookie]
    html_size: int | None
    html_sha256: str | None
    security_headers: dict[str, bool]
    security_headers_passed: int
    security_headers_total: int


class NetworkEntry(BaseModel):
    method: str | None = None
    url: str
    status_code: int | None = None
    content_type: str | None = None
    size_bytes: int | None = None
    duration_ms: int | None = None
    remote_ip: str | None = None


class ScreenshotNetworkResponse(BaseModel):
    network_log: list[NetworkEntry]


class StatusCodeCounts(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    c2xx: int = Field(0, alias="2xx")
    c3xx: int = Field(0, alias="3xx")
    c4xx: int = Field(0, alias="4xx")
    c5xx: int = Field(0, alias="5xx")


class ScreenshotSummaryResponse(BaseModel):
    by_status_code: StatusCodeCounts
