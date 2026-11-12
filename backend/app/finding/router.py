"""HTTP surface of the finding module. No query and no business rule lives here.

Roles per endpoint: docs/security/authorization.md. Every role triages, a User
only on the programs assigned to it, which the service enforces with a 404.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse

from app.asset.schemas import MAX_IDS
from app.core.deps import CurrentUser, DbDep
from app.core.identity import User, UserRole
from app.core.pagination import DEFAULT_LIMIT, Page
from app.core.security import require_roles
from app.finding import service
from app.finding.models import Severity, TriageStatus
from app.finding.schemas import (
    ExportFormat,
    FindingBulkTriageRequest,
    FindingDetailResponse,
    FindingResponse,
    FindingSort,
    FindingSummaryResponse,
    FindingTriageRequest,
)

router = APIRouter(prefix="/api/v1", tags=["finding"])

_readers = require_roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER)


async def reader(request: Request, user: CurrentUser) -> User:
    return await _readers(user, request)


Reader = Annotated[User, Depends(reader)]


def finding_filter(
    program_id: uuid.UUID | None = None,
    triage_status: Annotated[list[TriageStatus] | None, Query()] = None,
    severity: Annotated[list[Severity] | None, Query()] = None,
    domain_id: uuid.UUID | None = None,
    job_id: uuid.UUID | None = None,
    tool_module_id: Annotated[list[uuid.UUID] | None, Query()] = None,
    tag_id: uuid.UUID | None = None,
    q: Annotated[str | None, Query(max_length=255)] = None,
) -> service.FindingFilter:
    return service.FindingFilter(
        program_id=program_id,
        triage_status=triage_status,
        severity=severity,
        domain_id=domain_id,
        job_id=job_id,
        tool_module_id=tool_module_id,
        tag_id=tag_id,
        q=q,
    )


FindingFilterDep = Annotated[service.FindingFilter, Depends(finding_filter)]


@router.get("/findings", response_model=Page[FindingResponse])
async def list_findings(
    actor: Reader,
    session: DbDep,
    flt: FindingFilterDep,
    limit: int = DEFAULT_LIMIT,
    cursor: str | None = None,
    sort: FindingSort = "-last_seen_at",
) -> Page[FindingResponse]:
    return await service.list_findings(
        session, viewer=actor, flt=flt, limit=limit, cursor=cursor, sort=sort
    )


@router.get("/findings/export", response_class=StreamingResponse)
async def export_findings(
    actor: Reader,
    session: DbDep,
    flt: FindingFilterDep,
    ids: Annotated[list[uuid.UUID] | None, Query(max_length=MAX_IDS)] = None,
    format: ExportFormat = "csv",  # documented query parameter name
) -> StreamingResponse:
    body = await service.export_findings(
        session, viewer=actor, flt=service.with_ids(flt, ids), fmt=format
    )
    media_type, headers = service.export_headers(format)
    return StreamingResponse(
        (piece.encode("utf-8") for piece in body), media_type=media_type, headers=headers
    )


@router.get("/findings/summary", response_model=FindingSummaryResponse)
async def finding_summary(
    actor: Reader, session: DbDep, flt: FindingFilterDep
) -> FindingSummaryResponse:
    return await service.summary(session, viewer=actor, flt=flt)


@router.post("/findings/bulk-triage", status_code=204)
async def bulk_triage(body: FindingBulkTriageRequest, actor: Reader, session: DbDep) -> None:
    await service.bulk_triage(
        session, actor=actor, ids=body.ids, triage_status=TriageStatus(body.triage_status)
    )


@router.get("/findings/{finding_id}", response_model=FindingDetailResponse)
async def read_finding(
    finding_id: uuid.UUID, actor: Reader, session: DbDep
) -> FindingDetailResponse:
    return await service.get_finding(session, viewer=actor, finding_id=finding_id)


@router.patch("/findings/{finding_id}", response_model=FindingDetailResponse)
async def triage_finding(
    finding_id: uuid.UUID, body: FindingTriageRequest, actor: Reader, session: DbDep
) -> FindingDetailResponse:
    return await service.triage(
        session,
        actor=actor,
        finding_id=finding_id,
        triage_status=body.triage_status,
        duplicate_of_id=body.duplicate_of_id,
    )
