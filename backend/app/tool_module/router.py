"""HTTP surface of the tool_module module: S15 tab Tools and S18.

Roles per endpoint: docs/security/authorization.md.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from app.core.deps import CurrentUser, DbDep
from app.core.identity import User, UserRole
from app.core.pagination import DEFAULT_LIMIT, Page
from app.core.security import require_roles
from app.tool_module import service
from app.tool_module.schemas import (
    StatsWindow,
    ToolModulePage,
    ToolModuleResponse,
    ToolModuleSort,
    ToolModuleStatsResponse,
    ToolModuleUpdateRequest,
    ToolResponse,
)
from contracts.tool_modules import ToolGroup

router = APIRouter(prefix="/api/v1", tags=["tool_module"])

_readers = require_roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER)
_operators = require_roles(UserRole.SUPERADMIN, UserRole.ADMIN)
_superadmins = require_roles(UserRole.SUPERADMIN)


async def reader(request: Request, user: CurrentUser) -> User:
    return await _readers(user, request)


async def operator(request: Request, user: CurrentUser) -> User:
    return await _operators(user, request)


async def superadmin(request: Request, user: CurrentUser) -> User:
    return await _superadmins(user, request)


Reader = Annotated[User, Depends(reader)]
Operator = Annotated[User, Depends(operator)]
Superadmin = Annotated[User, Depends(superadmin)]


@router.get("/tool-modules", response_model=ToolModulePage)
async def list_tool_modules(
    actor: Reader,
    session: DbDep,
    limit: int = DEFAULT_LIMIT,
    cursor: str | None = None,
    sort: ToolModuleSort = "name",
    q: Annotated[str | None, Query(max_length=255)] = None,
    group: ToolGroup | None = None,
    runs_on: Annotated[str | None, Query(max_length=100)] = None,
    is_enabled: bool | None = None,
) -> ToolModulePage:
    return await service.list_tool_modules(
        session,
        limit=limit,
        cursor=cursor,
        sort=sort,
        q=q,
        group=group,
        runs_on=runs_on,
        is_enabled=is_enabled,
    )


@router.get("/tool-modules/stats", response_model=ToolModuleStatsResponse)
async def tool_module_stats(
    actor: Reader, session: DbDep, window: StatsWindow = "24h"
) -> ToolModuleStatsResponse:
    return await service.stats(session, window=window)


@router.get("/tools", response_model=Page[ToolResponse])
async def list_tools(actor: Operator, session: DbDep) -> Page[ToolResponse]:
    items = await service.list_tools(session)
    return Page[ToolResponse](items=items, total=len(items))


@router.patch("/tool-modules/{tool_module_id}", response_model=ToolModuleResponse)
async def patch_tool_module(
    tool_module_id: uuid.UUID, body: ToolModuleUpdateRequest, actor: Superadmin, session: DbDep
) -> ToolModuleResponse:
    return await service.update_tool_module(
        session, actor=actor, tool_module_id=tool_module_id, changes=body
    )
