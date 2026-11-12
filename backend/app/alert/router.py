"""HTTP surface of the alert module: the bell on the header.

Every role reads and marks its own alerts; a User sees only the programs
assigned to it: docs/security/authorization.md.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from app.alert import service
from app.alert.models import AlertType
from app.alert.schemas import AlertResponse, AlertSort
from app.core.deps import CurrentUser, DbDep
from app.core.identity import User, UserRole
from app.core.pagination import DEFAULT_LIMIT, Page
from app.core.security import require_roles

router = APIRouter(prefix="/api/v1", tags=["alert"])

_readers = require_roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER)


async def reader(request: Request, user: CurrentUser) -> User:
    return await _readers(user, request)


Reader = Annotated[User, Depends(reader)]


@router.get("/alerts", response_model=Page[AlertResponse])
async def list_alerts(
    actor: Reader,
    session: DbDep,
    limit: int = DEFAULT_LIMIT,
    cursor: str | None = None,
    sort: AlertSort = "-created_at",
    is_read: bool | None = None,
    alert_type: Annotated[list[AlertType] | None, Query()] = None,
) -> Page[AlertResponse]:
    return await service.list_alerts(
        session,
        viewer=actor,
        limit=limit,
        cursor=cursor,
        sort=sort,
        is_read=is_read,
        alert_types=alert_type,
    )


@router.post("/alerts/read-all", status_code=204)
async def mark_all_read(actor: Reader, session: DbDep) -> None:
    await service.mark_all_read(session, viewer=actor)


@router.post("/alerts/{alert_id}/read", status_code=204)
async def mark_read(alert_id: uuid.UUID, actor: Reader, session: DbDep) -> None:
    await service.mark_read(session, viewer=actor, alert_id=alert_id)
