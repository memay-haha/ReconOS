"""HTTP surface of the operational thresholds on S15: docs/ops/configuration.md.

It lives in core, beside the table, because `system_setting` belongs to no
business module, like the WebSocket endpoint in `realtime_router.py`. Only a
Superadmin lists and edits; any role reads a public key:
docs/security/authorization.md.
"""

import uuid
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict, StrictInt

from app.core import system_setting as service
from app.core.deps import CurrentUser, DbDep
from app.core.errors import BadRequestError
from app.core.identity import User, UserRole
from app.core.pagination import DEFAULT_LIMIT, MAX_LIMIT, Page, decode_cursor, encode_cursor
from app.core.security import require_roles

router = APIRouter(prefix="/api/v1", tags=["system"])

_superadmin = require_roles(UserRole.SUPERADMIN)
_readers = require_roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER)


async def superadmin(request: Request, user: CurrentUser) -> User:
    return await _superadmin(user, request)


async def reader(request: Request, user: CurrentUser) -> User:
    return await _readers(user, request)


Superadmin = Annotated[User, Depends(superadmin)]
Reader = Annotated[User, Depends(reader)]

# Keys have no id; the cursor carries the last key with a fixed placeholder id.
_KEY_CURSOR_ID = uuid.UUID(int=0)


class SystemSettingResponse(BaseModel):
    key: str
    value: int
    default: int
    minimum: int
    maximum: int
    is_public: bool
    updated_by: uuid.UUID | None
    updated_at: datetime | None


class SystemSettingPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Strict: "30" or true is refused rather than coerced into a threshold.
    value: StrictInt


def _response(view: service.SettingView) -> SystemSettingResponse:
    return SystemSettingResponse(**view.__dict__)


@router.get("/system-settings", response_model=Page[SystemSettingResponse])
async def list_system_settings(
    actor: Superadmin,
    session: DbDep,
    limit: int = DEFAULT_LIMIT,
    cursor: str | None = None,
    sort: Literal["key", "-key"] = "key",
) -> Page[SystemSettingResponse]:
    views = await service.list_settings(session)
    if sort == "-key":
        views.reverse()
    if cursor is not None:
        after, _ = decode_cursor(cursor)
        if not isinstance(after, str):
            raise BadRequestError(detail="cursor is not valid")
        views = [v for v in views if (v.key > after if sort == "key" else v.key < after)]
    size = max(1, min(limit, MAX_LIMIT))
    page = views[:size]
    return Page[SystemSettingResponse](
        items=[_response(v) for v in page],
        next_cursor=encode_cursor(page[-1].key, _KEY_CURSOR_ID) if len(views) > size else None,
        total=len(service.SETTING_SPECS),
    )


@router.get("/system-settings/{key}", response_model=SystemSettingResponse)
async def read_system_setting(key: str, actor: Reader, session: DbDep) -> SystemSettingResponse:
    return _response(await service.read_setting(session, viewer=actor, key=key))


@router.patch("/system-settings/{key}", response_model=SystemSettingResponse)
async def update_system_setting(
    key: str, body: SystemSettingPatch, actor: Superadmin, session: DbDep
) -> SystemSettingResponse:
    return _response(await service.update_setting(session, actor=actor, key=key, value=body.value))
