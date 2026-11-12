"""HTTP surface of the dashboard module: S02, S15, the header search, the log panel.

Roles per endpoint: docs/security/authorization.md. Figures and logs are
limited to the caller's programs inside the service.
"""

import uuid
from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from app.core.deps import CurrentUser, DbDep
from app.core.identity import User, UserRole
from app.core.pagination import DEFAULT_LIMIT, Page
from app.core.security import require_roles
from app.dashboard import service
from app.dashboard.schemas import (
    AppLogResponse,
    ComponentName,
    DashboardSummaryResponse,
    DashboardWindow,
    DiagnosticRunCreated,
    DiagnosticRunResponse,
    EngineName,
    LogLevel,
    LogSort,
    SearchResponse,
    SystemHealthResponse,
)

router = APIRouter(prefix="/api/v1", tags=["dashboard"])

_everyone = require_roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER)
_operators = require_roles(UserRole.SUPERADMIN, UserRole.ADMIN)
_superadmin = require_roles(UserRole.SUPERADMIN)


async def everyone(request: Request, user: CurrentUser) -> User:
    return await _everyone(user, request)


async def operator(request: Request, user: CurrentUser) -> User:
    return await _operators(user, request)


async def superadmin(request: Request, user: CurrentUser) -> User:
    return await _superadmin(user, request)


Reader = Annotated[User, Depends(everyone)]
Operator = Annotated[User, Depends(operator)]
Superadmin = Annotated[User, Depends(superadmin)]


@router.get("/dashboard/summary", response_model=DashboardSummaryResponse)
async def dashboard_summary(
    actor: Reader, session: DbDep, window: DashboardWindow = "24h"
) -> DashboardSummaryResponse:
    return await service.summary(session, viewer=actor, window=window)


@router.get("/search", response_model=SearchResponse)
async def search(
    actor: Reader,
    session: DbDep,
    q: Annotated[str, Query(min_length=1, max_length=255)],
    limit: Annotated[int, Query(ge=1, le=service.SEARCH_MAX_LIMIT)] = service.SEARCH_DEFAULT_LIMIT,
) -> SearchResponse:
    return await service.search(session, viewer=actor, q=q, limit=limit)


@router.get("/system/health", response_model=SystemHealthResponse)
async def system_health(
    actor: Operator, session: DbDep, component: ComponentName | None = None
) -> SystemHealthResponse:
    return await service.system_health(session, component=component)


@router.post("/system/diagnostics", response_model=DiagnosticRunCreated)
async def create_diagnostic(actor: Operator, session: DbDep) -> DiagnosticRunCreated:
    return await service.create_diagnostic(session, actor=actor)


@router.get("/system/diagnostics/latest", response_model=DiagnosticRunResponse)
async def latest_diagnostic(actor: Operator, session: DbDep) -> DiagnosticRunResponse:
    return await service.latest_diagnostic(session)


@router.get("/system/diagnostics/{diagnostic_run_id}", response_model=DiagnosticRunResponse)
async def read_diagnostic(
    diagnostic_run_id: uuid.UUID, actor: Operator, session: DbDep
) -> DiagnosticRunResponse:
    return await service.get_diagnostic(session, diagnostic_run_id)


@router.get("/logs", response_model=Page[AppLogResponse], tags=["system"])
async def list_logs(
    actor: Reader,
    session: DbDep,
    limit: int = DEFAULT_LIMIT,
    cursor: str | None = None,
    sort: LogSort = "-logged_at",
    level: LogLevel | None = None,
    service_name: Annotated[str | None, Query(alias="service", max_length=32)] = None,
    logged_at_from: datetime | None = None,
    logged_at_to: datetime | None = None,
    program_id: uuid.UUID | None = None,
    event: Annotated[str | None, Query(max_length=128)] = None,
    engine: EngineName | None = None,
) -> Page[AppLogResponse]:
    return await service.list_logs(
        session,
        viewer=actor,
        limit=limit,
        cursor=cursor,
        sort=sort,
        level=level,
        service=service_name,
        logged_at_from=logged_at_from,
        logged_at_to=logged_at_to,
        program_id=program_id,
        event=event,
        engine=engine,
    )


@router.delete("/logs", status_code=204, tags=["system"])
async def delete_logs(actor: Superadmin, session: DbDep, before: date) -> None:
    await service.delete_logs(session, actor=actor, before=before)
