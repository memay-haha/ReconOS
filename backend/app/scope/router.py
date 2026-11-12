"""HTTP surface of the scope module. No query and no business rule lives here.

Permissions: docs/security/authorization.md. Reads are open to every role and
limited to assigned programs by the service; writes need Superadmin or Admin.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.core.deps import CurrentUser, DbDep
from app.core.identity import User, UserRole
from app.core.pagination import DEFAULT_LIMIT, Page
from app.core.security import require_roles
from app.scope import service
from app.scope.models import ScopeRule
from app.scope.schemas import (
    ScopeCheckRequest,
    ScopeCheckResponse,
    ScopeRuleBulkCreateRequest,
    ScopeRuleBulkCreateResponse,
    ScopeRuleCreateRequest,
    ScopeRuleResponse,
    ScopeRuleSort,
    ScopeRuleUpdateRequest,
)

router = APIRouter(prefix="/api/v1", tags=["scope"])

scope_editors = require_roles(UserRole.SUPERADMIN, UserRole.ADMIN)


async def scope_editor(request: Request, user: CurrentUser) -> User:
    return await scope_editors(user, request)


ScopeEditor = Annotated[User, Depends(scope_editor)]


@router.get("/programs/{program_id}/scope-rules", response_model=Page[ScopeRuleResponse])
async def list_scope_rules(
    program_id: uuid.UUID,
    viewer: CurrentUser,
    session: DbDep,
    limit: int = DEFAULT_LIMIT,
    cursor: str | None = None,
    sort: ScopeRuleSort = "created_at",
) -> Page[ScopeRuleResponse]:
    return await service.list_rules(
        session, viewer=viewer, program_id=program_id, limit=limit, cursor=cursor, sort=sort
    )


@router.post("/programs/{program_id}/scope-rules", response_model=ScopeRuleResponse)
async def create_scope_rule(
    program_id: uuid.UUID, body: ScopeRuleCreateRequest, actor: ScopeEditor, session: DbDep
) -> ScopeRule:
    (rule,) = await service.create_rules(session, actor=actor, program_id=program_id, items=[body])
    return rule


@router.post(
    "/programs/{program_id}/scope-rules/bulk-create", response_model=ScopeRuleBulkCreateResponse
)
async def bulk_create_scope_rules(
    program_id: uuid.UUID, body: ScopeRuleBulkCreateRequest, actor: ScopeEditor, session: DbDep
) -> ScopeRuleBulkCreateResponse:
    rules = await service.create_rules(
        session, actor=actor, program_id=program_id, items=body.items, field_prefix="items."
    )
    return ScopeRuleBulkCreateResponse(
        items=[ScopeRuleResponse.model_validate(rule) for rule in rules]
    )


@router.patch("/scope-rules/{scope_rule_id}", response_model=ScopeRuleResponse)
async def update_scope_rule(
    scope_rule_id: uuid.UUID, body: ScopeRuleUpdateRequest, actor: ScopeEditor, session: DbDep
) -> ScopeRule:
    return await service.update_rule(
        session, actor=actor, scope_rule_id=scope_rule_id, changes=body
    )


@router.delete("/scope-rules/{scope_rule_id}", status_code=204)
async def delete_scope_rule(scope_rule_id: uuid.UUID, actor: ScopeEditor, session: DbDep) -> None:
    await service.delete_rule(session, actor=actor, scope_rule_id=scope_rule_id)


@router.post("/programs/{program_id}/scope-check", response_model=ScopeCheckResponse)
async def check_scope(
    program_id: uuid.UUID, body: ScopeCheckRequest, viewer: CurrentUser, session: DbDep
) -> ScopeCheckResponse:
    items = await service.check_targets(
        session, viewer=viewer, program_id=program_id, targets=body.targets
    )
    return ScopeCheckResponse(items=items)
