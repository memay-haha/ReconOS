"""HTTP surface of the schedule module: periodic scans on S09 and the S16 tab.

Roles per endpoint: docs/security/authorization.md.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.core.deps import CurrentUser, DbDep
from app.core.identity import User, UserRole
from app.core.pagination import DEFAULT_LIMIT, Page
from app.core.security import require_roles
from app.job.schemas import JobResponse
from app.schedule import service
from app.schedule.schemas import (
    ScheduleCreateRequest,
    ScheduleResponse,
    ScheduleSort,
    ScheduleUpdateRequest,
)

router = APIRouter(prefix="/api/v1", tags=["schedule"])

_readers = require_roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER)
_operators = require_roles(UserRole.SUPERADMIN, UserRole.ADMIN)


async def reader(request: Request, user: CurrentUser) -> User:
    return await _readers(user, request)


async def operator(request: Request, user: CurrentUser) -> User:
    return await _operators(user, request)


Reader = Annotated[User, Depends(reader)]
Operator = Annotated[User, Depends(operator)]


@router.get("/programs/{program_id}/schedules", response_model=Page[ScheduleResponse])
async def list_program_schedules(
    program_id: uuid.UUID,
    actor: Reader,
    session: DbDep,
    limit: int = DEFAULT_LIMIT,
    cursor: str | None = None,
    sort: ScheduleSort = "-created_at",  # one order only, kept for the API shape
) -> Page[ScheduleResponse]:
    return await service.list_program_schedules(
        session, viewer=actor, program_id=program_id, limit=limit, cursor=cursor
    )


@router.post("/programs/{program_id}/schedules", response_model=ScheduleResponse)
async def create_schedule(
    program_id: uuid.UUID, body: ScheduleCreateRequest, actor: Operator, session: DbDep
) -> ScheduleResponse:
    return await service.create_schedule(
        session,
        actor=actor,
        program_id=program_id,
        tool_module_id=body.tool_module_id,
        target=body.target,
        params=body.params,
        interval_minutes=body.interval_minutes,
        is_enabled=body.is_enabled,
    )


@router.get("/schedules", response_model=Page[ScheduleResponse])
async def list_schedules(
    actor: Reader,
    session: DbDep,
    limit: int = DEFAULT_LIMIT,
    cursor: str | None = None,
    sort: ScheduleSort = "-created_at",  # one order only, kept for the API shape
    engine_id: uuid.UUID | None = None,
) -> Page[ScheduleResponse]:
    return await service.list_schedules(
        session, viewer=actor, engine_id=engine_id, limit=limit, cursor=cursor
    )


@router.patch("/schedules/{schedule_id}", response_model=ScheduleResponse)
async def patch_schedule(
    schedule_id: uuid.UUID, body: ScheduleUpdateRequest, actor: Operator, session: DbDep
) -> ScheduleResponse:
    return await service.update_schedule(
        session,
        actor=actor,
        schedule_id=schedule_id,
        fields=body.model_dump(exclude_unset=True),
    )


@router.delete("/schedules/{schedule_id}", status_code=204)
async def delete_schedule(schedule_id: uuid.UUID, actor: Operator, session: DbDep) -> None:
    await service.delete_schedule(session, actor=actor, schedule_id=schedule_id)


@router.post("/schedules/{schedule_id}/run", response_model=JobResponse)
async def run_schedule(schedule_id: uuid.UUID, actor: Operator, session: DbDep) -> JobResponse:
    return await service.run_schedule(session, actor=actor, schedule_id=schedule_id)
