"""HTTP surface of the report module. No query and no business rule lives here.

Roles per endpoint: docs/security/authorization.md. Every role drafts and
submits reports, a User only on the programs assigned to it, which the service
enforces with a 404.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse

from app.core.deps import CurrentUser, DbDep
from app.core.identity import User, UserRole
from app.core.pagination import DEFAULT_LIMIT, Page
from app.core.security import require_roles
from app.report import service
from app.report.models import ReportStatus
from app.report.schemas import (
    ReportCreateRequest,
    ReportDetailResponse,
    ReportExportFormat,
    ReportResponse,
    ReportSort,
    ReportSubmitRequest,
    ReportUpdateRequest,
)

router = APIRouter(prefix="/api/v1", tags=["report"])

_writers = require_roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER)


async def writer(request: Request, user: CurrentUser) -> User:
    return await _writers(user, request)


Writer = Annotated[User, Depends(writer)]


@router.get("/reports", response_model=Page[ReportResponse])
async def list_reports(
    actor: Writer,
    session: DbDep,
    program_id: uuid.UUID | None = None,
    status: ReportStatus | None = None,
    q: Annotated[str | None, Query(max_length=255)] = None,
    limit: int = DEFAULT_LIMIT,
    cursor: str | None = None,
    sort: ReportSort = "-created_at",
) -> Page[ReportResponse]:
    return await service.list_reports(
        session,
        viewer=actor,
        program_id=program_id,
        status=status,
        q=q,
        limit=limit,
        cursor=cursor,
        sort=sort,
    )


@router.post("/reports", response_model=ReportDetailResponse, status_code=201)
async def create_report(
    body: ReportCreateRequest, actor: Writer, session: DbDep
) -> ReportDetailResponse:
    return await service.create_report(session, actor=actor, data=body)


@router.get("/reports/{report_id}", response_model=ReportDetailResponse)
async def read_report(report_id: uuid.UUID, actor: Writer, session: DbDep) -> ReportDetailResponse:
    return await service.get_report(session, viewer=actor, report_id=report_id)


@router.patch("/reports/{report_id}", response_model=ReportDetailResponse)
async def update_report(
    report_id: uuid.UUID, body: ReportUpdateRequest, actor: Writer, session: DbDep
) -> ReportDetailResponse:
    return await service.update_report(
        session, actor=actor, report_id=report_id, changes=body.changes()
    )


@router.delete("/reports/{report_id}", status_code=204)
async def delete_report(report_id: uuid.UUID, actor: Writer, session: DbDep) -> None:
    await service.delete_report(session, actor=actor, report_id=report_id)


@router.post("/reports/{report_id}/submit", response_model=ReportDetailResponse)
async def submit_report(
    report_id: uuid.UUID,
    actor: Writer,
    session: DbDep,
    body: ReportSubmitRequest | None = None,
) -> ReportDetailResponse:
    return await service.submit_report(
        session,
        actor=actor,
        report_id=report_id,
        platform_report_ref=body.platform_report_ref if body else None,
    )


@router.get("/reports/{report_id}/export", response_class=StreamingResponse)
async def export_report(
    report_id: uuid.UUID,
    actor: Writer,
    session: DbDep,
    format: ReportExportFormat = "md",  # documented query parameter name
) -> StreamingResponse:
    body, media_type, headers = await service.export_report(
        session, viewer=actor, report_id=report_id, fmt=format
    )
    return StreamingResponse(
        (piece.encode("utf-8") for piece in body), media_type=media_type, headers=headers
    )
