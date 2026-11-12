"""HTTP surface of the engine module: S16, S17. Superadmin only.

Roles per endpoint: docs/security/authorization.md.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Request, Response, status

from app.core.deps import CurrentUser, DbDep
from app.core.identity import User, UserRole
from app.core.pagination import DEFAULT_LIMIT, Page
from app.core.security import require_roles
from app.engine import service
from app.engine.schemas import (
    VARIABLE_KEY_PATTERN,
    EngineCheckResult,
    EngineModulePage,
    EngineModulesPatch,
    EnginePage,
    EngineResponse,
    EngineSort,
    EngineTestResponse,
    EngineUpdateRequest,
    EngineVariablePage,
    EngineVariablePut,
    EngineWorkflowDetail,
    EngineWorkflowItem,
    VariableSort,
)

router = APIRouter(prefix="/api/v1", tags=["engine"])

_superadmins = require_roles(UserRole.SUPERADMIN)


async def superadmin(request: Request, user: CurrentUser) -> User:
    return await _superadmins(user, request)


Superadmin = Annotated[User, Depends(superadmin)]
VariableKey = Annotated[str, Path(pattern=VARIABLE_KEY_PATTERN)]
WorkflowName = Annotated[str, Path(min_length=1, max_length=255)]


@router.get("/engines", response_model=EnginePage)
async def list_engines(
    actor: Superadmin,
    session: DbDep,
    limit: int = DEFAULT_LIMIT,
    cursor: str | None = None,
    sort: EngineSort = "name",
) -> EnginePage:
    return await service.list_engines(session, limit=limit, cursor=cursor, sort=sort)


@router.patch("/engines/{engine_id}", response_model=EngineResponse)
async def patch_engine(
    engine_id: uuid.UUID, body: EngineUpdateRequest, actor: Superadmin, session: DbDep
) -> EngineResponse:
    return await service.update_engine(session, actor=actor, engine_id=engine_id, changes=body)


@router.post("/engines/{engine_id}/test", response_model=EngineTestResponse)
async def test_engine(
    engine_id: uuid.UUID, actor: Superadmin, session: DbDep
) -> EngineTestResponse:
    return await service.test_engine(session, actor=actor, engine_id=engine_id)


@router.get("/engines/{engine_id}/workflows", response_model=Page[EngineWorkflowItem])
async def list_workflows(
    engine_id: uuid.UUID, actor: Superadmin, session: DbDep
) -> Page[EngineWorkflowItem]:
    return await service.list_workflows(session, engine_id)


@router.get("/engines/{engine_id}/workflows/{name}", response_model=EngineWorkflowDetail)
async def get_workflow(
    engine_id: uuid.UUID, name: WorkflowName, actor: Superadmin, session: DbDep
) -> EngineWorkflowDetail:
    return await service.get_workflow(session, engine_id, name)


@router.get("/engines/{engine_id}/modules", response_model=EngineModulePage)
async def list_modules(engine_id: uuid.UUID, actor: Superadmin, session: DbDep) -> EngineModulePage:
    return await service.list_modules(session, engine_id)


@router.patch("/engines/{engine_id}/modules", response_model=EngineModulePage)
async def patch_modules(
    engine_id: uuid.UUID, body: EngineModulesPatch, actor: Superadmin, session: DbDep
) -> EngineModulePage:
    return await service.update_modules(session, actor=actor, engine_id=engine_id, changes=body)


@router.post("/engines/{engine_id}/validate", response_model=EngineCheckResult)
async def validate_engine(
    engine_id: uuid.UUID, actor: Superadmin, session: DbDep
) -> EngineCheckResult:
    return await service.validate_engine(session, engine_id)


@router.post("/engines/{engine_id}/verify-model", response_model=EngineCheckResult)
async def verify_model(
    engine_id: uuid.UUID, actor: Superadmin, session: DbDep
) -> EngineCheckResult:
    return await service.verify_model(session, actor=actor, engine_id=engine_id)


@router.get("/engines/{engine_id}/variables", response_model=EngineVariablePage)
async def list_variables(
    engine_id: uuid.UUID,
    actor: Superadmin,
    session: DbDep,
    limit: int = DEFAULT_LIMIT,
    cursor: str | None = None,
    sort: VariableSort = "key",
) -> EngineVariablePage:
    return await service.list_variables(session, engine_id, limit=limit, cursor=cursor, sort=sort)


@router.put("/engines/{engine_id}/variables/{key}", status_code=status.HTTP_204_NO_CONTENT)
async def put_variable(
    engine_id: uuid.UUID,
    key: VariableKey,
    body: EngineVariablePut,
    actor: Superadmin,
    session: DbDep,
) -> Response:
    await service.put_variable(session, actor=actor, engine_id=engine_id, key=key, value=body.value)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/engines/{engine_id}/variables/{key}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_variable(
    engine_id: uuid.UUID, key: VariableKey, actor: Superadmin, session: DbDep
) -> Response:
    await service.delete_variable(session, actor=actor, engine_id=engine_id, key=key)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
