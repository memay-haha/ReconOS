"""Request and response bodies of the program module.

A proxy URL may hold a user name and password, so it is accepted on write and
never sent back, not even masked (G7).
"""

import uuid
from datetime import datetime
from typing import Annotated, Any, Literal
from urllib.parse import urlsplit

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    SecretStr,
    StringConstraints,
    field_validator,
)
from pydantic_core import PydanticCustomError

from app.core.pagination import Page
from app.program.models import BountyType, ProgramStatus

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=255)]
LongText = Annotated[str, StringConstraints(max_length=10_000)]

MAX_URL_LENGTH = 2048
PROXY_SCHEMES = frozenset({"http", "https", "socks4", "socks4a", "socks5", "socks5h"})


def _platform_url(value: object) -> object:
    # Rendered as a link on S09: anything but http(s) could run script on click.
    if isinstance(value, str) and value:
        parts = urlsplit(value)
        if parts.scheme not in {"http", "https"} or not parts.netloc or len(value) > MAX_URL_LENGTH:
            raise PydanticCustomError("url_invalid", "platform URL must be an http(s) URL")
    return value


PlatformUrl = Annotated[str, BeforeValidator(_platform_url)]


def _proxy_url(value: object) -> SecretStr:
    """Check the shape of a proxy URL. The error never repeats the value."""
    raw = value.get_secret_value() if isinstance(value, SecretStr) else value
    invalid = PydanticCustomError("proxy_url_invalid", "proxy URL is not valid")
    if not isinstance(raw, str) or not raw or len(raw) > MAX_URL_LENGTH:
        raise invalid
    if any(char.isspace() or not char.isprintable() for char in raw):
        raise invalid
    try:
        parts = urlsplit(raw)
        port = parts.port
    except ValueError as err:
        raise invalid from err
    if parts.scheme not in PROXY_SCHEMES or not parts.hostname:
        raise invalid
    if parts.path not in {"", "/"} or parts.query or parts.fragment:
        raise invalid
    if port is not None and port == 0:
        raise invalid
    return SecretStr(raw)


ProxyUrl = Annotated[SecretStr, BeforeValidator(_proxy_url)]


def _not_null(value: object) -> object:
    """PATCH may leave a field out, but may not clear a required one."""
    if value is None:
        raise PydanticCustomError("null_not_allowed", "field cannot be null")
    return value


class ProgramCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Name
    platform: ShortText | None = None
    platform_url: PlatformUrl | None = None
    platform_handle: ShortText | None = None
    bounty_type: BountyType = BountyType.BOUNTY
    description: LongText | None = None


class ProgramUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Name | None = None
    platform: ShortText | None = None
    platform_url: PlatformUrl | None = None
    platform_handle: ShortText | None = None
    bounty_type: BountyType | None = None
    description: LongText | None = None

    _required_stays_set = field_validator("name", "bounty_type", mode="before")(_not_null)

    def changes(self) -> dict[str, Any]:
        return self.model_dump(exclude_unset=True)


class ProgramResponse(BaseModel):
    """The program row itself, answered by every write."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    platform: str | None
    platform_url: str | None
    platform_handle: str | None
    bounty_type: BountyType
    description: str | None
    status: ProgramStatus
    created_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None


class FindingCounts(BaseModel):
    critical: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0
    info: int = 0


class AssetsNewToday(BaseModel):
    domain: int = 0
    url: int = 0


class ProgramRowResponse(ProgramResponse):
    """A row of GET /programs and GET /programs/{id}: the program plus computed fields.

    The asset, finding and job tables arrive in later batches, so their fields
    keep these defaults until the batch that owns the table computes them:
    docs/api/architecture.md, section on computed fields.
    """

    in_scope_rule_count: int
    out_of_scope_rule_count: int
    created_by_username: str | None
    domain_count: int = 0
    ip_count: int = 0
    url_count: int = 0
    service_count: int = 0
    finding_counts: FindingCounts = Field(default_factory=FindingCounts)
    last_job_finished_at: datetime | None = None
    scope_coverage: float | None = None
    assets_new_today: AssetsNewToday = Field(default_factory=AssetsNewToday)
    ip_resolved_count: int = 0
    service_port_count: int = 0
    screenshot_count: int = 0


# Sort keys GET /programs accepts: docs/api/openapi.yaml.
ProgramSort = Literal["name", "-domain_count", "-finding_critical_count", "-last_job_finished_at"]
# Archived programs leave the list, so they are not a filter value.
ProgramListStatus = Literal["active", "paused"]
ProgramAction = Literal["pause", "resume", "archive"]


class IdsRequest(BaseModel):
    """Body of every bulk endpoint: docs/api/architecture.md."""

    ids: list[uuid.UUID] = Field(min_length=1, max_length=500)


class ProgramUserAssignRequest(BaseModel):
    user_id: uuid.UUID


class ProgramUserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    program_id: uuid.UUID
    user_id: uuid.UUID
    assigned_by: uuid.UUID | None
    assigned_at: datetime


class ProxyCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Name
    url: ProxyUrl
    is_enabled: bool = True


class ProxyUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Name | None = None
    url: ProxyUrl | None = None
    is_enabled: bool | None = None

    _required_stays_set = field_validator("name", "url", "is_enabled", mode="before")(_not_null)


class ProxyResponse(BaseModel):
    """No URL field, masked or not: the URL is write only (G7)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    program_id: uuid.UUID
    name: str
    is_enabled: bool
    created_at: datetime
    updated_at: datetime


ProgramPage = Page[ProgramRowResponse]
