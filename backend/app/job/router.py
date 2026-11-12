"""HTTP surface of the job module: S10 and the job half of the worker contract.

Roles per endpoint: docs/security/authorization.md. Worker routes authenticate
with the worker token only: docs/integrations/external-services.md.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from app.core.deps import CurrentUser, DbDep
from app.core.identity import User, UserRole
from app.core.pagination import DEFAULT_LIMIT, Page
from app.core.security import require_roles
from app.job import service
from app.job.schemas import (
    JobBulkCreateRequest,
    JobCleanupResponse,
    JobCreateRequest,
    JobIdsRequest,
    JobListResponse,
    JobResponse,
    JobSort,
)
from app.user.service import CurrentWorker
from contracts.job_status import JobFinish, JobHeartbeatResponse, JobStatus

router = APIRouter(prefix="/api/v1", tags=["job"])

_readers = require_roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER)
_operators = require_roles(UserRole.SUPERADMIN, UserRole.ADMIN)


async def reader(request: Request, user: CurrentUser) -> User:
    return await _readers(user, request)


async def operator(request: Request, user: CurrentUser) -> User:
    return await _operators(user, request)


Reader = Annotated[User, Depends(reader)]
Operator = Annotated[User, Depends(operator)]


async def _rows(session: DbDep, actor: User, job_ids: list[uuid.UUID]) -> JobListResponse:
    return JobListResponse(
        items=[
            await service.get_job_row(session, viewer=actor, job_id=job_id) for job_id in job_ids
        ]
    )


@router.get("/jobs", response_model=Page[JobResponse])
async def list_jobs(
    actor: Reader,
    session: DbDep,
    limit: int = DEFAULT_LIMIT,
    cursor: str | None = None,
    sort: JobSort = "-created_at",
    status: Annotated[list[JobStatus] | None, Query()] = None,
    program_id: uuid.UUID | None = None,
    target: Annotated[str | None, Query(max_length=2048)] = None,
    q: Annotated[str | None, Query(max_length=255)] = None,
    tool_module_id: Annotated[list[uuid.UUID] | None, Query()] = None,
) -> Page[JobResponse]:
    return await service.list_jobs(
        session,
        viewer=actor,
        limit=limit,
        cursor=cursor,
        sort=sort,
        status=status or [],
        program_id=program_id,
        target=target,
        q=q,
        tool_module_id=tool_module_id or [],
    )


@router.post("/jobs", response_model=JobResponse)
async def create_job(body: JobCreateRequest, actor: Reader, session: DbDep) -> JobResponse:
    job = await service.create_job(
        session,
        actor=actor,
        program_id=body.program_id,
        tool_module_id=body.tool_module_id,
        target=body.target,
        params=body.params,
        priority=body.priority,
        proxy_id=body.proxy_id,
    )
    return await service.get_job_row(session, viewer=actor, job_id=job.id)


@router.post("/jobs/bulk-create", response_model=JobListResponse)
async def bulk_create_jobs(
    body: JobBulkCreateRequest, actor: Reader, session: DbDep
) -> JobListResponse:
    jobs = await service.create_jobs(
        session,
        actor=actor,
        program_id=body.program_id,
        target=body.target,
        items=body.items,
        priority=body.priority,
        proxy_id=body.proxy_id,
    )
    return await _rows(session, actor, [job.id for job in jobs])


@router.post("/jobs/bulk-retry", response_model=JobListResponse)
async def bulk_retry_jobs(
    body: JobIdsRequest, request: Request, actor: Reader, session: DbDep
) -> JobListResponse:
    jobs = await service.retry_jobs(session, actor=actor, job_ids=body.ids, path=request.url.path)
    return await _rows(session, actor, [job.id for job in jobs])


@router.post("/jobs/cleanup", response_model=JobCleanupResponse)
async def cleanup_jobs(actor: Operator, session: DbDep) -> JobCleanupResponse:
    return JobCleanupResponse(cancelled=await service.cleanup_queue(session, actor=actor))


@router.get("/jobs/{job_id}", response_model=JobResponse)
async def read_job(job_id: uuid.UUID, actor: Reader, session: DbDep) -> JobResponse:
    return await service.get_job_row(session, viewer=actor, job_id=job_id)


@router.post("/jobs/{job_id}/approve", status_code=204)
async def approve_job(job_id: uuid.UUID, request: Request, actor: Operator, session: DbDep) -> None:
    await service.approve_job(session, actor=actor, job_id=job_id, path=request.url.path)


@router.post("/jobs/{job_id}/reject", status_code=204)
async def reject_job(job_id: uuid.UUID, request: Request, actor: Operator, session: DbDep) -> None:
    await service.reject_job(session, actor=actor, job_id=job_id, path=request.url.path)


@router.post("/jobs/{job_id}/cancel", status_code=204)
async def cancel_job(job_id: uuid.UUID, request: Request, actor: Reader, session: DbDep) -> None:
    await service.cancel_job(session, actor=actor, job_id=job_id, path=request.url.path)


@router.post("/jobs/{job_id}/retry", response_model=JobResponse)
async def retry_job(
    job_id: uuid.UUID, request: Request, actor: Reader, session: DbDep
) -> JobResponse:
    jobs = await service.retry_jobs(session, actor=actor, job_ids=[job_id], path=request.url.path)
    return await service.get_job_row(session, viewer=actor, job_id=jobs[0].id)


@router.post("/jobs/{job_id}/prioritize", status_code=204)
async def prioritize_job(job_id: uuid.UUID, actor: Operator, session: DbDep) -> None:
    await service.prioritize_job(session, actor=actor, job_id=job_id)


# ---------------------------------------------------------------- worker contract


@router.post("/worker/jobs/{job_id}/claim", response_model=None, tags=["worker_contract"])
async def claim_job(job_id: uuid.UUID, worker: CurrentWorker, session: DbDep) -> dict[str, object]:
    spec = await service.claim_job(session, worker=worker, job_id=job_id)
    # JSON mode reveals the proxy URL to the worker only; nothing logs this body (G7).
    return spec.model_dump(mode="json")


@router.post(
    "/worker/jobs/{job_id}/heartbeat",
    response_model=JobHeartbeatResponse,
    tags=["worker_contract"],
)
async def heartbeat_job(
    job_id: uuid.UUID, worker: CurrentWorker, session: DbDep
) -> JobHeartbeatResponse:
    return await service.heartbeat_job(session, worker=worker, job_id=job_id)


@router.post("/worker/jobs/{job_id}/finish", status_code=204, tags=["worker_contract"])
async def finish_job(
    job_id: uuid.UUID, body: JobFinish, worker: CurrentWorker, session: DbDep
) -> None:
    await service.finish_job(session, worker=worker, job_id=job_id, finish=body)
