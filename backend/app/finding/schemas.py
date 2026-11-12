"""Request, response and ingest models of the finding module: docs/api/architecture.md.

`FindingRecord` is what a parser hands to the finding service. Raw output is
untrusted: identifying fields have hard length bounds and a line that breaks
them is dropped, while long evidence (request, response, description) is cut
to a bound rather than dropped, since a finding without its evidence is still
worth triage: .claude/rules/security.md.
"""

import uuid
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field

from app.asset.schemas import (
    MAX_IDS,
    DomainRecord,
    IpRecord,
    ServiceRecord,
    UrlRecord,
)
from app.asset.schemas import ExportFormat as ExportFormat
from app.finding.models import Severity, TriageStatus

FindingSort = Literal[
    "-last_seen_at", "last_seen_at", "-first_seen_at", "first_seen_at", "-severity", "severity"
]
AssetKind = Literal["domain", "ip", "url", "service"]

# Bounds on what one finding may carry out of a raw output.
MAX_NAME = 512
MAX_TEMPLATE_ID = 255
MAX_MATCHED_AT = 2048
MAX_EVIDENCE = 4096
MAX_TEXT = 8 * 1024
MAX_HTTP_MESSAGE = 64 * 1024
MAX_LIST_ITEMS = 50
MAX_LIST_ITEM = 1024
MAX_CVE = 20


def _clip(limit: int) -> BeforeValidator:
    return BeforeValidator(lambda value: value[:limit] if isinstance(value, str) else value)


def clip(value: str | None, limit: int) -> str | None:
    """Cut untrusted text to `limit` characters; blank becomes None."""
    if value is None:
        return None
    value = value.strip()
    return value[:limit] or None


def clip_list(values: list[str]) -> list[str]:
    return [value[:MAX_LIST_ITEM] for value in values[:MAX_LIST_ITEMS]]


AssetRecord = DomainRecord | IpRecord | ServiceRecord | UrlRecord


class FindingRecord(BaseModel):
    """One finding parsed from a raw output, with the asset it was found on."""

    model_config = ConfigDict(extra="forbid", frozen=True, str_strip_whitespace=True)

    dedup_key: Annotated[str, Field(min_length=1, max_length=512)]
    name: Annotated[str, _clip(MAX_NAME), Field(min_length=1)]
    template_id: Annotated[str, Field(min_length=1, max_length=MAX_TEMPLATE_ID)] | None = None
    severity: Severity
    matched_at: Annotated[str, Field(min_length=1, max_length=MAX_MATCHED_AT)] | None = None
    evidence: Annotated[str, _clip(MAX_EVIDENCE)] | None = None
    cve: list[Annotated[str, Field(max_length=32)]] = Field(
        default_factory=list, max_length=MAX_CVE
    )
    # The five keys every parser writes, then tool-specific ones: docs/data/schema.md.
    detail: dict[str, Any] = Field(default_factory=dict)
    asset: AssetRecord


class FindingBatch(BaseModel):
    """Findings of one parser call, written together by the finding service."""

    findings: list[FindingRecord] = Field(default_factory=list)

    def __len__(self) -> int:
        return len(self.findings)


class FindingIngestResult(BaseModel):
    """New findings of one batch, for the `finding.created` event and the parse log."""

    created: int = 0
    seen_again: int = 0

    def add(self, other: FindingIngestResult) -> FindingIngestResult:
        return FindingIngestResult(
            created=self.created + other.created, seen_again=self.seen_again + other.seen_again
        )


# ---------------------------------------------------------------- responses


class SeverityCounts(BaseModel):
    critical: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0
    info: int = 0


class TriageCounts(BaseModel):
    new: int = 0
    confirmed: int = 0
    false_positive: int = 0
    duplicate: int = 0
    reported: int = 0
    resolved: int = 0


class ProgramCount(BaseModel):
    program_id: uuid.UUID
    name: str
    count: int


class FindingSummaryResponse(BaseModel):
    total: int
    by_severity: SeverityCounts
    by_triage_status: TriageCounts
    by_program: list[ProgramCount]
    new_24h_by_severity: SeverityCounts


class FindingAsset(BaseModel):
    type: AssetKind
    id: uuid.UUID
    name: str
    ip: str | None = None
    port: int | None = None
    service_name: str | None = None


class FindingTagResponse(BaseModel):
    tag_id: uuid.UUID
    key: str
    value: str


class FindingResponse(BaseModel):
    """A row of GET /findings. Every text field comes from raw output: show it as text."""

    id: uuid.UUID
    program_id: uuid.UUID
    program_name: str
    job_id: uuid.UUID | None
    raw_output_id: uuid.UUID | None
    tool_module_name: str | None
    dedup_key: str
    name: str
    template_id: str | None
    severity: Severity
    matched_at: str | None
    evidence: str | None
    cve: list[str]
    matcher: str | None
    asset: FindingAsset
    triage_status: TriageStatus
    duplicate_of_id: uuid.UUID | None
    triaged_by: uuid.UUID | None
    triaged_by_username: str | None
    triaged_at: datetime | None
    first_seen_at: datetime
    last_seen_at: datetime
    tags: list[FindingTagResponse]


class FindingDetailResponse(FindingResponse):
    description: str | None
    remediation: str | None
    request: str | None
    response: str | None
    detail: dict[str, Any]
    in_scope: bool
    scope_rule: str | None
    allowed_triage_statuses: list[TriageStatus]


# ---------------------------------------------------------------- requests


class FindingTriageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    triage_status: TriageStatus
    duplicate_of_id: uuid.UUID | None = None


BulkTriageStatus = Literal["new", "confirmed", "false_positive", "reported", "resolved"]


class FindingBulkTriageRequest(BaseModel):
    """`duplicate` is refused: each duplicate needs its own `duplicate_of_id`."""

    model_config = ConfigDict(extra="forbid")

    ids: list[uuid.UUID] = Field(min_length=1, max_length=MAX_IDS)
    triage_status: BulkTriageStatus
