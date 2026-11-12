"""Request, response and ingest models of the asset module: docs/api/architecture.md.

The ingest records are what a parser hands to the asset service. Raw output is
untrusted, so each record bounds its types and lengths and a parser drops a
line that does not fit: .claude/rules/security.md.
"""

import uuid
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from app.asset.models import AssetEventType, AssetType, DnsStatus, RecordType, Transport
from app.program.schemas import FindingCounts

# Long enough for real values, short enough that a hostile file cannot bloat a row.
ShortText = Annotated[str, Field(min_length=1, max_length=255)]
MediumText = Annotated[str, Field(min_length=1, max_length=1024)]
UrlText = Annotated[str, Field(min_length=1, max_length=2048)]
BannerText = Annotated[str, Field(max_length=4096)]

ExportFormat = Literal["csv", "jsonl", "md"]
DomainSort = Literal[
    "name", "-name", "first_seen_at", "-first_seen_at", "last_seen_at", "-last_seen_at"
]
AssetSort = Literal["first_seen_at", "-first_seen_at", "last_seen_at", "-last_seen_at"]
EventSort = Literal["created_at", "-created_at"]
TechnologySort = Literal["name", "-name"]
ProgramStatusFilter = Literal["active", "paused"]

MAX_IDS = 500


# ---------------------------------------------------------------- ingest records


class _Record(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True, str_strip_whitespace=True)


class AddressRecord(_Record):
    address: ShortText
    record_type: RecordType


class DomainRecord(_Record):
    name: ShortText
    cname: ShortText | None = None
    dns_status: DnsStatus | None = None
    is_wildcard: bool | None = None
    addresses: list[AddressRecord] = Field(default_factory=list, max_length=256)


class IpRecord(_Record):
    address: ShortText
    asn: Annotated[int, Field(ge=0, le=4_294_967_295)] | None = None
    asn_org: ShortText | None = None
    country: ShortText | None = None
    cdn_name: ShortText | None = None
    ptr: ShortText | None = None


class ServiceRecord(_Record):
    address: ShortText
    port: Annotated[int, Field(ge=0, le=65535)]
    transport: Transport = Transport.TCP
    name: ShortText | None = None
    product: ShortText | None = None
    version: ShortText | None = None
    banner: BannerText | None = None


class TechnologyRecord(_Record):
    name: ShortText
    version: ShortText | None = None
    category: ShortText | None = None


class UrlRecord(_Record):
    url: UrlText
    status_code: Annotated[int, Field(ge=100, le=999)] | None = None
    title: MediumText | None = None
    content_length: Annotated[int, Field(ge=0)] | None = None
    content_type: ShortText | None = None
    webserver: ShortText | None = None
    favicon_hash: ShortText | None = None
    tls_not_after: datetime | None = None
    technologies: list[TechnologyRecord] = Field(default_factory=list, max_length=128)


class IngestBatch(BaseModel):
    """What one parser call found. Order of writing: IPs, domains, services, URLs."""

    domains: list[DomainRecord] = Field(default_factory=list)
    ips: list[IpRecord] = Field(default_factory=list)
    services: list[ServiceRecord] = Field(default_factory=list)
    urls: list[UrlRecord] = Field(default_factory=list)

    def __len__(self) -> int:
        return len(self.domains) + len(self.ips) + len(self.services) + len(self.urls)


class IngestResult(BaseModel):
    """New assets per type, for the `asset.discovered` event and the parse log."""

    domain: int = 0
    ip: int = 0
    url: int = 0
    service: int = 0

    def add(self, other: IngestResult) -> IngestResult:
        return IngestResult(
            domain=self.domain + other.domain,
            ip=self.ip + other.ip,
            url=self.url + other.url,
            service=self.service + other.service,
        )

    @property
    def total(self) -> int:
        return self.domain + self.ip + self.url + self.service


# ---------------------------------------------------------------- responses


class DomainResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    program_id: uuid.UUID
    name: str
    apex: str
    is_wildcard: bool
    cname: str | None
    dns_status: DnsStatus
    in_scope: bool
    first_seen_at: datetime
    last_seen_at: datetime


class DomainRowResponse(DomainResponse):
    """A row of GET /domains: the columns plus fields computed on read."""

    ips: list[str]
    url_count: int
    service_count: int
    # The finding table arrives in batch 6: tech-debt.md, debt 47.
    finding_counts: FindingCounts = Field(default_factory=FindingCounts)
    has_findings: bool = False
    asn: int | None = None
    asn_org: str | None = None


class DomainTag(BaseModel):
    id: uuid.UUID
    tag_id: uuid.UUID
    key: str
    value: str


class IpRecordResponse(BaseModel):
    address: str
    record_type: RecordType


class DomainDetailResponse(DomainRowResponse):
    tags: list[DomainTag]
    ip_records: list[IpRecordResponse]
    service_ports: list[int]


class DomainSummaryResponse(BaseModel):
    total: int
    in_scope: int
    resolved: int
    resolved_new_24h: int
    unresolved: int
    with_findings: int
    with_critical: int
    new_24h: int
    new_daily_avg_7d: float


class IpResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    program_id: uuid.UUID
    address: str
    asn: int | None
    asn_org: str | None
    country: str | None
    is_private: bool
    cdn_name: str | None
    ptr: str | None
    in_scope: bool
    first_seen_at: datetime
    last_seen_at: datetime


class ServiceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    program_id: uuid.UUID
    ip_id: uuid.UUID
    port: int
    transport: Transport
    name: str | None
    product: str | None
    version: str | None
    banner: str | None
    in_scope: bool
    first_seen_at: datetime
    last_seen_at: datetime
    closed_at: datetime | None


class UrlResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    program_id: uuid.UUID
    domain_id: uuid.UUID | None
    ip_id: uuid.UUID | None
    url: str
    scheme: str
    host: str
    port: int
    path: str
    status_code: int | None
    title: str | None
    content_length: int | None
    content_type: str | None
    webserver: str | None
    favicon_hash: str | None
    tls_not_after: datetime | None
    in_scope: bool
    first_seen_at: datetime
    last_seen_at: datetime


class UrlTechnologyResponse(BaseModel):
    technology_id: uuid.UUID
    name: str
    category: str | None
    version: str | None


class UrlDetailResponse(UrlResponse):
    technologies: list[UrlTechnologyResponse]


class TechnologyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    category: str | None


class AssetEventResponse(BaseModel):
    id: uuid.UUID
    program_id: uuid.UUID
    domain_id: uuid.UUID | None
    ip_id: uuid.UUID | None
    url_id: uuid.UUID | None
    service_id: uuid.UUID | None
    event_type: AssetEventType
    job_id: uuid.UUID | None
    raw_output_id: uuid.UUID | None
    diff: dict[str, Any] | None
    created_at: datetime
    asset_type: AssetType
    asset_name: str
    program_name: str
    tool_module_name: str | None
    asn: int | None = None
    asn_org: str | None = None


class DomainActivityResponse(BaseModel):
    kind: Literal["asset_event", "finding", "screenshot"]
    id: uuid.UUID
    at: datetime
    title: str
    tool_module_name: str | None
    job_id: uuid.UUID | None


class DomainIdsRequest(BaseModel):
    ids: list[uuid.UUID] = Field(min_length=1, max_length=MAX_IDS)
