"""Request and response bodies of the scope module: docs/api/architecture.md."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.core.pagination import Page
from app.scope.matching import MAX_TARGET_LENGTH, RuleType, ScopeType, Verdict

MAX_REASON_LENGTH = 1000
# One request may carry at most one page of rules or targets.
MAX_BATCH = 200

ScopeRuleSort = Literal["created_at", "-created_at"]


class ScopeRuleCreateRequest(BaseModel):
    scope_type: ScopeType
    rule_type: RuleType
    value: str = Field(min_length=1, max_length=MAX_TARGET_LENGTH)
    # Required for Out-of-Scope; the service names the field when it is missing.
    reason: str | None = Field(default=None, max_length=MAX_REASON_LENGTH)


class ScopeRuleUpdateRequest(BaseModel):
    scope_type: ScopeType | None = None
    rule_type: RuleType | None = None
    value: str | None = Field(default=None, min_length=1, max_length=MAX_TARGET_LENGTH)
    reason: str | None = Field(default=None, max_length=MAX_REASON_LENGTH)


class ScopeRuleBulkCreateRequest(BaseModel):
    items: list[ScopeRuleCreateRequest] = Field(min_length=1, max_length=MAX_BATCH)


class ScopeRuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    program_id: uuid.UUID
    scope_type: ScopeType
    rule_type: RuleType
    value: str
    reason: str | None
    created_by: uuid.UUID | None
    created_at: datetime


class ScopeRuleRowResponse(ScopeRuleResponse):
    """A row of GET /programs/{program_id}/scope-rules: the rule plus fields computed on read."""

    # Live domains of the program the rule matches: docs/api/architecture.md.
    matched_domain_count: int


class ScopeRuleBulkCreateResponse(BaseModel):
    items: list[ScopeRuleResponse]


ScopeRulePage = Page[ScopeRuleResponse]


class ScopeCheckRequest(BaseModel):
    targets: list[str] = Field(min_length=1, max_length=MAX_BATCH)


class ScopeCheckItem(BaseModel):
    # The target as submitted, so a client can pair each row with its input.
    target: str
    # Canonical form, null when the target could not be read.
    normalized_target: str | None
    in_scope: bool
    verdict: Verdict
    # The first In-Scope rule that admits the target, or the Out-of-Scope rule
    # that excludes it.
    rule_value: str | None


class ScopeCheckResponse(BaseModel):
    items: list[ScopeCheckItem]
