"""HTTP surface of the dispatcher module: Dispatch All and the status of S10, S15."""

from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.core.db import notify_dispatcher
from app.core.deps import CurrentUser, DbDep
from app.core.identity import User, UserRole
from app.core.security import require_roles
from app.dispatcher import service
from app.dispatcher.schemas import DispatcherStatusResponse

router = APIRouter(prefix="/api/v1", tags=["dispatcher"])

_readers = require_roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER)
_operators = require_roles(UserRole.SUPERADMIN, UserRole.ADMIN)


async def reader(request: Request, user: CurrentUser) -> User:
    return await _readers(user, request)


async def operator(request: Request, user: CurrentUser) -> User:
    return await _operators(user, request)


@router.post("/dispatcher/wake", status_code=204)
async def wake_dispatcher(actor: Annotated[User, Depends(operator)], session: DbDep) -> None:
    # Dispatch All: one more round now; it skips no check: docs/architecture/business-flow.md.
    await notify_dispatcher(session, "wake")


@router.get("/dispatcher/status", response_model=DispatcherStatusResponse)
async def dispatcher_status(
    actor: Annotated[User, Depends(reader)], session: DbDep
) -> DispatcherStatusResponse:
    return await service.dispatcher_status(session, viewer=actor)
