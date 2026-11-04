"""Request and response bodies of the user module. No secret ever goes out."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.identity import UserRole


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
