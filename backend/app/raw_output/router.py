"""HTTP surface of the raw_output module: browse, download, and the worker upload.

Downloads are always attachments: .claude/rules/security.md. The upload body is
streamed to MinIO, never held whole in memory.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, StreamingResponse

from app.core.deps import CurrentUser, DbDep
from app.core.identity import User, UserRole
from app.core.pagination import DEFAULT_LIMIT, Page
from app.core.security import require_roles
from app.raw_output import service
from app.raw_output.schemas import RawOutputResponse, RawOutputSort
from app.user.service import CurrentWorker

router = APIRouter(prefix="/api/v1", tags=["raw_output"])

_readers = require_roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER)


async def reader(request: Request, user: CurrentUser) -> User:
    return await _readers(user, request)


Reader = Annotated[User, Depends(reader)]


@router.get("/jobs/{job_id}/raw-outputs", response_model=Page[RawOutputResponse])
async def list_job_raw_outputs(
    job_id: uuid.UUID,
    actor: Reader,
    session: DbDep,
    limit: int = DEFAULT_LIMIT,
    cursor: str | None = None,
    sort: RawOutputSort = "created_at",
) -> Page[RawOutputResponse]:
    return await service.list_for_job(
        session, viewer=actor, job_id=job_id, limit=limit, cursor=cursor, sort=sort
    )


@router.get("/raw-outputs/{raw_output_id}", response_model=RawOutputResponse)
async def read_raw_output(
    raw_output_id: uuid.UUID, actor: Reader, session: DbDep
) -> RawOutputResponse:
    row, _ = await service.get_raw_output(session, viewer=actor, raw_output_id=raw_output_id)
    return RawOutputResponse.model_validate(row)


@router.get("/raw-outputs/{raw_output_id}/content", response_class=StreamingResponse)
async def download_raw_output(
    raw_output_id: uuid.UUID, actor: Reader, session: DbDep
) -> StreamingResponse:
    row, body = await service.open_content(session, viewer=actor, raw_output_id=raw_output_id)
    # The file name is restricted to [A-Za-z0-9._-] on upload, so it needs no quoting.
    return StreamingResponse(
        body,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="{row.filename}"',
            "Content-Length": str(row.size_bytes),
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.put("/worker/jobs/{job_id}/raw-outputs/{filename}", tags=["worker_contract"])
async def upload_raw_output(
    job_id: uuid.UUID,
    filename: str,
    request: Request,
    worker: CurrentWorker,
    session: DbDep,
) -> JSONResponse:
    length = request.headers.get("content-length")
    row, created = await service.store_upload(
        session,
        worker=worker,
        job_id=job_id,
        filename=filename,
        content_type=request.headers.get("content-type"),
        content_length=int(length) if length and length.isdigit() else None,
        chunks=request.stream(),
    )
    return JSONResponse(
        status_code=201 if created else 200,
        content=RawOutputResponse.model_validate(row).model_dump(mode="json"),
    )
