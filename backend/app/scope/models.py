"""Tables owned by the scope module: docs/data/schema.md."""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class ScopeRule(Base):
    """One In-Scope or Out-of-Scope rule of a program (G5)."""

    __tablename__ = "scope_rule"
    __table_args__ = (
        # One rule declared twice would only make the list ambiguous.
        UniqueConstraint("program_id", "scope_type", "rule_type", "value"),
        CheckConstraint("scope_type IN ('in_scope', 'out_of_scope')", name="scope_type_allowed"),
        CheckConstraint(
            "rule_type IN ('domain', 'wildcard', 'cidr', 'url')", name="rule_type_allowed"
        ),
        # An exclusion without a stated reason cannot be reviewed later.
        CheckConstraint(
            "scope_type <> 'out_of_scope' OR (reason IS NOT NULL AND reason <> '')",
            name="out_of_scope_has_reason",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuidv7()")
    )
    # Named by table, not by model: program sits on a lower tier and its model
    # is never imported here: .claude/rules/design-patterns.md.
    program_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("program.id", ondelete="CASCADE")
    )
    scope_type: Mapped[str] = mapped_column(Text)
    rule_type: Mapped[str] = mapped_column(Text)
    value: Mapped[str] = mapped_column(Text)
    reason: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("user.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
