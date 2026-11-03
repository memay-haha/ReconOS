"""Read side of the operator action log. Superadmin and Admin only."""

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.audit_log import service
from app.audit_log.schemas import AuditLogResponse
from app.core.deps import CurrentUser, DbDep
from app.core.identity import User, UserRole
from app.core.pagination import DEFAULT_LIMIT, Page
from app.core.security import require_roles

router = APIRouter(prefix="/api/v1", tags=["audit_log"])

audit_reader = require_roles(UserRole.SUPERADMIN, UserRole.ADMIN)


async def audit_viewer(request: Request, user: CurrentUser) -> User:
    # The guard takes the request so a denial records the method, path and IP.
    return await audit_reader(user, request)


Reader = Annotated[User, Depends(audit_viewer)]


@router.get("/audit-logs", response_model=Page[AuditLogResponse])
async def list_audit_logs(
    actor: Reader,
    session: DbDep,
    limit: int = DEFAULT_LIMIT,
    cursor: str | None = None,
    user_id: uuid.UUID | None = None,
    action: str | None = None,
    created_at_from: datetime | None = None,
    created_at_to: datetime | None = None,
) -> Page[AuditLogResponse]:
    return await service.list_entries(
        session,
        limit=limit,
        cursor=cursor,
        user_id=user_id,
        action=action,
        created_at_from=created_at_from,
        created_at_to=created_at_to,
    )
