"""HTTP surface of the tag module. No query and no business rule lives here.

Roles per endpoint: docs/security/authorization.md.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.core.deps import CurrentUser, DbDep
from app.core.identity import User, UserRole
from app.core.pagination import DEFAULT_LIMIT, Page
from app.core.security import require_roles
from app.tag import service
from app.tag.models import Tag
from app.tag.schemas import (
    AssetTagBulkCreateRequest,
    AssetTagCreateRequest,
    AssetTagResponse,
    TagCreateRequest,
    TagResponse,
    TagSort,
)

router = APIRouter(prefix="/api/v1", tags=["tag"])

_readers = require_roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER)
_operators = require_roles(UserRole.SUPERADMIN, UserRole.ADMIN)


async def reader(request: Request, user: CurrentUser) -> User:
    return await _readers(user, request)


async def operator(request: Request, user: CurrentUser) -> User:
    return await _operators(user, request)


Reader = Annotated[User, Depends(reader)]
Operator = Annotated[User, Depends(operator)]


@router.get("/tags", response_model=Page[TagResponse])
async def list_tags(
    _: Reader,
    session: DbDep,
    limit: int = DEFAULT_LIMIT,
    cursor: str | None = None,
    sort: TagSort = "key",
) -> Page[TagResponse]:
    return await service.list_tags(session, limit=limit, cursor=cursor, sort=sort)


@router.post("/tags", response_model=TagResponse)
async def create_tag(body: TagCreateRequest, actor: Reader, session: DbDep) -> Tag:
    return await service.create_tag(session, actor=actor, key=body.key, value=body.value)


@router.delete("/tags/{tag_id}", status_code=204)
async def delete_tag(tag_id: uuid.UUID, actor: Operator, session: DbDep) -> None:
    await service.delete_tag(session, actor=actor, tag_id=tag_id)


@router.post("/asset-tags", response_model=AssetTagResponse)
async def tag_asset(body: AssetTagCreateRequest, actor: Reader, session: DbDep) -> AssetTagResponse:
    asset_type, asset_id = body.target()
    row = await service.tag_asset(
        session, actor=actor, tag_id=body.tag_id, asset_type=asset_type, asset_id=asset_id
    )
    return service.asset_tag_response(row)


@router.post("/asset-tags/bulk-create", status_code=204)
async def bulk_tag_assets(body: AssetTagBulkCreateRequest, actor: Reader, session: DbDep) -> None:
    await service.bulk_tag_assets(
        session, actor=actor, tag_id=body.tag_id, asset_type=body.asset_type, ids=body.ids
    )


@router.delete("/asset-tags/{asset_tag_id}", status_code=204)
async def untag_asset(asset_tag_id: uuid.UUID, actor: Reader, session: DbDep) -> None:
    await service.untag_asset(session, actor=actor, asset_tag_id=asset_tag_id)
