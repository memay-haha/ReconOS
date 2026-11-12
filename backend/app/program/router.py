"""HTTP surface of the program module. No query and no business rule lives here.

Roles per endpoint: docs/security/authorization.md. The CSRF check is declared
once on the application: app/core/deps.py.
"""

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Request

from app.core.deps import CurrentUser, DbDep
from app.core.identity import User, UserRole
from app.core.pagination import DEFAULT_LIMIT, Page
from app.core.security import require_roles
from app.program import service
from app.program.models import Program, Proxy
from app.program.schemas import (
    IdsRequest,
    ProgramAction,
    ProgramCreateRequest,
    ProgramListStatus,
    ProgramPage,
    ProgramResponse,
    ProgramRowResponse,
    ProgramSort,
    ProgramUpdateRequest,
    ProgramUserAssignRequest,
    ProgramUserResponse,
    ProxyCreateRequest,
    ProxyResponse,
    ProxyUpdateRequest,
)

router = APIRouter(prefix="/api/v1", tags=["program"])

_readers = require_roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER)
_operators = require_roles(UserRole.SUPERADMIN, UserRole.ADMIN)
_superadmins = require_roles(UserRole.SUPERADMIN)


# Each guard takes the request so a denial records the method, path and IP.
async def reader(request: Request, user: CurrentUser) -> User:
    return await _readers(user, request)


async def operator(request: Request, user: CurrentUser) -> User:
    return await _operators(user, request)


async def superadmin(request: Request, user: CurrentUser) -> User:
    return await _superadmins(user, request)


Reader = Annotated[User, Depends(reader)]
Operator = Annotated[User, Depends(operator)]
Superadmin = Annotated[User, Depends(superadmin)]


@router.get("/programs", response_model=ProgramPage)
async def list_programs(
    actor: Reader,
    session: DbDep,
    limit: int = DEFAULT_LIMIT,
    cursor: str | None = None,
    sort: ProgramSort = "name",
    status: ProgramListStatus | None = None,
    q: Annotated[str | None, Query(max_length=255)] = None,
    has_in_scope_rule: bool | None = None,
    has_domain: bool | None = None,
) -> Page[ProgramRowResponse]:
    return await service.list_programs(
        session,
        viewer=actor,
        limit=limit,
        cursor=cursor,
        sort=sort,
        status=status,
        q=q,
        has_in_scope_rule=has_in_scope_rule,
        has_domain=has_domain,
    )


@router.post("/programs", response_model=ProgramResponse)
async def create_program(body: ProgramCreateRequest, actor: Operator, session: DbDep) -> Program:
    return await service.create_program(session, actor=actor, fields=body.model_dump())


async def _bulk(session: DbDep, actor: User, body: IdsRequest, action: ProgramAction) -> None:
    await service.change_status(session, actor=actor, program_ids=body.ids, action=action)


@router.post("/programs/bulk-pause", status_code=204)
async def bulk_pause(body: IdsRequest, actor: Operator, session: DbDep) -> None:
    await _bulk(session, actor, body, "pause")


@router.post("/programs/bulk-resume", status_code=204)
async def bulk_resume(body: IdsRequest, actor: Operator, session: DbDep) -> None:
    await _bulk(session, actor, body, "resume")


@router.post("/programs/bulk-archive", status_code=204)
async def bulk_archive(body: IdsRequest, actor: Operator, session: DbDep) -> None:
    await _bulk(session, actor, body, "archive")


@router.post("/programs/bulk-delete", status_code=204)
async def bulk_delete(body: IdsRequest, actor: Superadmin, session: DbDep) -> None:
    await service.delete_programs(session, actor=actor, program_ids=body.ids)


@router.get("/programs/{program_id}", response_model=ProgramRowResponse)
async def read_program(program_id: uuid.UUID, actor: Reader, session: DbDep) -> ProgramRowResponse:
    return await service.get_program_row(session, viewer=actor, program_id=program_id)


@router.patch("/programs/{program_id}", response_model=ProgramResponse)
async def patch_program(
    program_id: uuid.UUID, body: ProgramUpdateRequest, actor: Operator, session: DbDep
) -> Program:
    return await service.update_program(
        session, actor=actor, program_id=program_id, changes=body.changes()
    )


@router.delete("/programs/{program_id}", status_code=204)
async def delete_program(program_id: uuid.UUID, actor: Superadmin, session: DbDep) -> None:
    await service.delete_programs(session, actor=actor, program_ids=[program_id])


@router.post("/programs/{program_id}/pause", status_code=204)
async def pause_program(program_id: uuid.UUID, actor: Operator, session: DbDep) -> None:
    await service.change_status(session, actor=actor, program_ids=[program_id], action="pause")


@router.post("/programs/{program_id}/resume", status_code=204)
async def resume_program(program_id: uuid.UUID, actor: Operator, session: DbDep) -> None:
    await service.change_status(session, actor=actor, program_ids=[program_id], action="resume")


@router.post("/programs/{program_id}/archive", status_code=204)
async def archive_program(program_id: uuid.UUID, actor: Operator, session: DbDep) -> None:
    await service.change_status(session, actor=actor, program_ids=[program_id], action="archive")


@router.get("/programs/{program_id}/users", response_model=Page[ProgramUserResponse])
async def list_program_users(
    program_id: uuid.UUID,
    actor: Operator,
    session: DbDep,
    limit: int = DEFAULT_LIMIT,
    cursor: str | None = None,
    sort: Literal["-assigned_at"] = "-assigned_at",
) -> Page[ProgramUserResponse]:
    # A single order for now, so `sort` admits only it: docs/api/openapi.yaml.
    return await service.list_program_users(
        session, viewer=actor, program_id=program_id, limit=limit, cursor=cursor
    )


@router.post("/programs/{program_id}/users", status_code=204)
async def assign_program_user(
    program_id: uuid.UUID, body: ProgramUserAssignRequest, actor: Operator, session: DbDep
) -> None:
    await service.assign_user(session, actor=actor, program_id=program_id, user_id=body.user_id)


@router.delete("/programs/{program_id}/users/{user_id}", status_code=204)
async def unassign_program_user(
    program_id: uuid.UUID, user_id: uuid.UUID, actor: Operator, session: DbDep
) -> None:
    await service.unassign_user(session, actor=actor, program_id=program_id, user_id=user_id)


@router.get("/programs/{program_id}/proxies", response_model=Page[ProxyResponse])
async def list_proxies(
    program_id: uuid.UUID,
    actor: Operator,
    session: DbDep,
    limit: int = DEFAULT_LIMIT,
    cursor: str | None = None,
    sort: Literal["-created_at"] = "-created_at",
) -> Page[ProxyResponse]:
    # A single order for now, so `sort` admits only it: docs/api/openapi.yaml.
    return await service.list_proxies(
        session, viewer=actor, program_id=program_id, limit=limit, cursor=cursor
    )


@router.post("/programs/{program_id}/proxies", response_model=ProxyResponse)
async def create_proxy(
    program_id: uuid.UUID, body: ProxyCreateRequest, actor: Operator, session: DbDep
) -> Proxy:
    return await service.create_proxy(
        session,
        actor=actor,
        program_id=program_id,
        name=body.name,
        url=body.url.get_secret_value(),
        is_enabled=body.is_enabled,
    )


@router.patch("/proxies/{proxy_id}", response_model=ProxyResponse)
async def patch_proxy(
    proxy_id: uuid.UUID, body: ProxyUpdateRequest, actor: Operator, session: DbDep
) -> Proxy:
    return await service.update_proxy(
        session,
        actor=actor,
        proxy_id=proxy_id,
        name=body.name,
        url=body.url.get_secret_value() if body.url is not None else None,
        is_enabled=body.is_enabled,
    )


@router.delete("/proxies/{proxy_id}", status_code=204)
async def delete_proxy(proxy_id: uuid.UUID, actor: Operator, session: DbDep) -> None:
    await service.delete_proxy(session, actor=actor, proxy_id=proxy_id)
