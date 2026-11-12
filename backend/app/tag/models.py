"""Tables owned by the tag module: docs/data/schema.md.

`tag` is a key-value catalogue shared by every program. `asset_tag` points at
one asset, `finding_tag` at one finding. The asset and finding tables sit
higher up, so they are named by string and their models never imported:
.claude/rules/design-patterns.md.
"""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base

ASSET_COLUMNS = ("domain_id", "ip_id", "url_id", "service_id")


class Tag(Base):
    __tablename__ = "tag"
    __table_args__ = (UniqueConstraint("key", "value"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuidv7()")
    )
    key: Mapped[str] = mapped_column(Text)
    value: Mapped[str] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("user.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )


def _asset_fk(table: str) -> Mapped[uuid.UUID | None]:
    return mapped_column(UUID(as_uuid=True), ForeignKey(f"{table}.id", ondelete="CASCADE"))


class AssetTag(Base):
    __tablename__ = "asset_tag"
    __table_args__ = (
        CheckConstraint("num_nonnulls(domain_id, ip_id, url_id, service_id) = 1", name="one_asset"),
        # A tag sits on an asset once: one partial unique index per asset type.
        *(
            Index(
                f"uq_asset_tag_tag_id_{column}",
                "tag_id",
                column,
                unique=True,
                postgresql_where=text(f"{column} IS NOT NULL"),
            )
            for column in ASSET_COLUMNS
        ),
        *(
            Index(
                f"ix_asset_tag_{column}",
                column,
                postgresql_where=text(f"{column} IS NOT NULL"),
            )
            for column in ASSET_COLUMNS
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("uuidv7()")
    )
    # Deleting a tag removes it from every asset: docs/data/database.md.
    tag_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tag.id", ondelete="CASCADE")
    )
    domain_id: Mapped[uuid.UUID | None] = _asset_fk("domain")
    ip_id: Mapped[uuid.UUID | None] = _asset_fk("ip")
    url_id: Mapped[uuid.UUID | None] = _asset_fk("url")
    service_id: Mapped[uuid.UUID | None] = _asset_fk("service")
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("user.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )


class FindingTag(Base):
    __tablename__ = "finding_tag"

    # The finding table sits four tiers up: named, never imported. Deleting
    # either side removes the link.
    finding_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("finding.id", ondelete="CASCADE"), primary_key=True
    )
    tag_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tag.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("user.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
