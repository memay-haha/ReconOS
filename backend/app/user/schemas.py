"""Request and response bodies of the user module. No secret ever goes out."""

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from app.core.identity import UserRole
from app.core.pagination import Page


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=256)


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=1, max_length=256)


class UserCreateRequest(BaseModel):
    username: str = Field(min_length=1, max_length=255)
    display_name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=256)
    role: UserRole


class UserUpdateRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=255)
    role: UserRole | None = None


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str
    display_name: str
    role: UserRole
    is_locked: bool
    last_login_at: datetime | None
    created_at: datetime


class UserDetailResponse(UserResponse):
    """An account with its computed session count, served by the list and detail reads.

    The count is an aggregate over user_session, not a column of user, so only
    the endpoints that compute it return this shape.
    """

    active_user_session_count: int
    # The newest live session, null when the account has none.
    last_session_ip: str | None
    last_seen_at: datetime | None

    @field_validator("last_session_ip", mode="before")
    @classmethod
    def _address_as_text(cls, value: object) -> object:
        # The INET column hands back an ipaddress object, not a string.
        return None if value is None else str(value)


class UserBriefResponse(BaseModel):
    """The account list as an Admin sees it: enough to pick a User for a program."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str
    role: UserRole


class UserPage(Page[UserDetailResponse]):
    """The Superadmin list. Both aggregates cover every account and ignore the filters."""

    role_counts: dict[UserRole, int]
    locked_count: int


class UserSessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    ip_address: str | None
    user_agent: str | None
    created_at: datetime
    last_seen_at: datetime
    expires_at: datetime

    @field_validator("ip_address", mode="before")
    @classmethod
    def _address_as_text(cls, value: object) -> object:
        # The INET column hands back an ipaddress object, not a string.
        return None if value is None else str(value)


# Sort keys GET /user-sessions accepts. A leading '-' sorts newest first.
UserSessionSort = Literal["created_at", "-created_at", "last_seen_at", "-last_seen_at"]


class ActiveUserSessionResponse(UserSessionResponse):
    """A row of GET /user-sessions, which names the account the session belongs to."""

    username: str
    display_name: str


class ActiveUserSessionPage(Page[ActiveUserSessionResponse]):
    """account_count covers every live session and ignores paging."""

    account_count: int


WorkerName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100, pattern=r"^\S+$")
]
WorkerSort = Literal["name", "-last_heartbeat_at", "created_at"]


class WorkerCreateRequest(BaseModel):
    """Name of the worker machine: docs/security/authentication.md, section Token worker."""

    name: WorkerName


class WorkerToolVersion(BaseModel):
    name: str
    version: str | None


class WorkerResponse(BaseModel):
    id: uuid.UUID
    name: str
    tool_modules: list[str]
    tool_versions: list[WorkerToolVersion]
    cpu_percent: float | None
    last_heartbeat_at: datetime | None
    created_at: datetime
    is_online: bool
    running_job_count: int
    running_tool_module_ids: list[uuid.UUID]


class WorkerTokenCreatedResponse(BaseModel):
    """The only response that ever carries the token: it is shown once (G7)."""

    id: uuid.UUID
    worker_id: uuid.UUID
    token: str
    created_at: datetime
