"""Request and response bodies of the tag module: docs/api/architecture.md."""

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

TagSort = Literal["key", "-key"]
AssetType = Literal["domain", "ip", "url", "service"]
MAX_IDS = 500
_ONE_ASSET = "exactly one of domain_id, ip_id, url_id, service_id is required"


class TagCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    key: Annotated[str, Field(min_length=1, max_length=100)]
    value: Annotated[str, Field(min_length=1, max_length=255)]


class TagResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    key: str
    value: str
    created_by: uuid.UUID | None
    created_at: datetime


class AssetTagCreateRequest(BaseModel):
    """One tag onto one asset: exactly one of the four asset ids."""

    model_config = ConfigDict(extra="forbid")

    tag_id: uuid.UUID
    domain_id: uuid.UUID | None = None
    ip_id: uuid.UUID | None = None
    url_id: uuid.UUID | None = None
    service_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def _one_asset(self) -> AssetTagCreateRequest:
        if len([value for _, value in self.asset_ids() if value is not None]) != 1:
            raise ValueError(_ONE_ASSET)
        return self

    def asset_ids(self) -> list[tuple[AssetType, uuid.UUID | None]]:
        return [
            ("domain", self.domain_id),
            ("ip", self.ip_id),
            ("url", self.url_id),
            ("service", self.service_id),
        ]

    def target(self) -> tuple[AssetType, uuid.UUID]:
        for asset_type, asset_id in self.asset_ids():
            if asset_id is not None:
                return asset_type, asset_id
        raise ValueError(_ONE_ASSET)  # unreachable after validation


class AssetTagBulkCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tag_id: uuid.UUID
    asset_type: AssetType
    ids: list[uuid.UUID] = Field(min_length=1, max_length=MAX_IDS)


class AssetTagResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tag_id: uuid.UUID
    domain_id: uuid.UUID | None
    ip_id: uuid.UUID | None
    url_id: uuid.UUID | None
    service_id: uuid.UUID | None
    created_by: uuid.UUID | None
    created_at: datetime


MAX_TAGS_PER_FINDING = 100


class FindingTagsRequest(BaseModel):
    """The whole tag list of one finding: what is not listed is removed."""

    model_config = ConfigDict(extra="forbid")

    tag_ids: list[uuid.UUID] = Field(max_length=MAX_TAGS_PER_FINDING)
