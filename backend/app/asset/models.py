"""Tables owned by the asset module: docs/data/schema.md, section Tài sản.

Every asset carries `program_id`, so the assignment filter of core applies to
it directly (G7). Assets are written only by the parser through upserts on the
natural keys below: docs/data/database.md, section Upsert và khử trùng lặp.
"""

import uuid
from datetime import datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import INET, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class DnsStatus(StrEnum):
    UNKNOWN = "unknown"
    RESOLVED = "resolved"
    NXDOMAIN = "nxdomain"
    TIMEOUT = "timeout"


class RecordType(StrEnum):
    A = "a"
    AAAA = "aaaa"


class Transport(StrEnum):
    TCP = "tcp"
    UDP = "udp"


class AssetEventType(StrEnum):
    DISCOVERED = "discovered"
    CHANGED = "changed"


class AssetType(StrEnum):
    """The four asset tables a finding, tag or event can point at."""

    DOMAIN = "domain"
    IP = "ip"
    URL = "url"
    SERVICE = "service"


def _allowed(values: type[StrEnum]) -> str:
    return ", ".join(f"'{member.value}'" for member in values)


# Exactly one asset column is set: docs/data/database.md, section Liên kết tới tài sản.
ONE_ASSET = "num_nonnulls(domain_id, ip_id, url_id, service_id) = 1"


def _uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, server_default=text("uuidv7()"))


def _program_fk() -> Mapped[uuid.UUID]:
    # Lower-tier tables are named, their models never imported:
    # .claude/rules/design-patterns.md.
    return mapped_column(UUID(as_uuid=True), ForeignKey("program.id", ondelete="CASCADE"))


def _now() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), server_default=text("now()"))


class Domain(Base):
    __tablename__ = "domain"
    __table_args__ = (
        # Includes soft-deleted rows, so a deleted name is not re-created.
        UniqueConstraint("program_id", "name"),
        CheckConstraint(f"dns_status IN ({_allowed(DnsStatus)})", name="dns_status_allowed"),
        Index("ix_domain_program_id_last_seen_at", "program_id", "last_seen_at"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    program_id: Mapped[uuid.UUID] = _program_fk()
    name: Mapped[str] = mapped_column(Text)
    apex: Mapped[str] = mapped_column(Text)
    is_wildcard: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    cname: Mapped[str | None] = mapped_column(Text)
    dns_status: Mapped[str] = mapped_column(Text, server_default=text("'unknown'"))
    in_scope: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    first_seen_at: Mapped[datetime] = _now()
    last_seen_at: Mapped[datetime] = _now()
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Ip(Base):
    __tablename__ = "ip"
    __table_args__ = (
        UniqueConstraint("program_id", "address"),
        Index("ix_ip_program_id_last_seen_at", "program_id", "last_seen_at"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    program_id: Mapped[uuid.UUID] = _program_fk()
    address: Mapped[str] = mapped_column(INET)
    asn: Mapped[int | None] = mapped_column(BigInteger)
    asn_org: Mapped[str | None] = mapped_column(Text)
    country: Mapped[str | None] = mapped_column(Text)
    is_private: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    cdn_name: Mapped[str | None] = mapped_column(Text)
    ptr: Mapped[str | None] = mapped_column(Text)
    in_scope: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    first_seen_at: Mapped[datetime] = _now()
    last_seen_at: Mapped[datetime] = _now()


class DomainIp(Base):
    __tablename__ = "domain_ip"
    __table_args__ = (
        CheckConstraint(f"record_type IN ({_allowed(RecordType)})", name="record_type_allowed"),
    )

    domain_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("domain.id", ondelete="CASCADE"), primary_key=True
    )
    ip_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ip.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    record_type: Mapped[str] = mapped_column(Text, primary_key=True)
    first_seen_at: Mapped[datetime] = _now()
    last_seen_at: Mapped[datetime] = _now()


class Service(Base):
    __tablename__ = "service"
    __table_args__ = (
        UniqueConstraint("ip_id", "port", "transport"),
        CheckConstraint(f"transport IN ({_allowed(Transport)})", name="transport_allowed"),
        CheckConstraint("port BETWEEN 0 AND 65535", name="port_range"),
        Index("ix_service_program_id_last_seen_at", "program_id", "last_seen_at"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    program_id: Mapped[uuid.UUID] = _program_fk()
    ip_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ip.id", ondelete="CASCADE")
    )
    port: Mapped[int] = mapped_column(Integer)
    transport: Mapped[str] = mapped_column(Text, server_default=text("'tcp'"))
    name: Mapped[str | None] = mapped_column(Text)
    product: Mapped[str | None] = mapped_column(Text)
    version: Mapped[str | None] = mapped_column(Text)
    banner: Mapped[str | None] = mapped_column(Text)
    in_scope: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    first_seen_at: Mapped[datetime] = _now()
    last_seen_at: Mapped[datetime] = _now()
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Url(Base):
    __tablename__ = "url"
    __table_args__ = (
        UniqueConstraint("program_id", "url_hash"),
        Index("ix_url_program_id_last_seen_at", "program_id", "last_seen_at"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    program_id: Mapped[uuid.UUID] = _program_fk()
    domain_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("domain.id", ondelete="CASCADE"), index=True
    )
    ip_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("ip.id", ondelete="CASCADE"), index=True
    )
    url: Mapped[str] = mapped_column(Text)
    # SHA-256 of the canonical url: docs/data/database.md.
    url_hash: Mapped[bytes] = mapped_column(LargeBinary)
    scheme: Mapped[str] = mapped_column(Text)
    host: Mapped[str] = mapped_column(Text)
    port: Mapped[int] = mapped_column(Integer)
    path: Mapped[str] = mapped_column(Text)
    status_code: Mapped[int | None] = mapped_column(Integer)
    title: Mapped[str | None] = mapped_column(Text)
    content_length: Mapped[int | None] = mapped_column(BigInteger)
    content_type: Mapped[str | None] = mapped_column(Text)
    webserver: Mapped[str | None] = mapped_column(Text)
    favicon_hash: Mapped[str | None] = mapped_column(Text)
    tls_not_after: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    in_scope: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    first_seen_at: Mapped[datetime] = _now()
    last_seen_at: Mapped[datetime] = _now()


class Technology(Base):
    __tablename__ = "technology"

    id: Mapped[uuid.UUID] = _uuid_pk()
    name: Mapped[str] = mapped_column(Text, unique=True)
    category: Mapped[str | None] = mapped_column(Text)


class UrlTechnology(Base):
    __tablename__ = "url_technology"

    url_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("url.id", ondelete="CASCADE"), primary_key=True
    )
    technology_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("technology.id", ondelete="CASCADE"),
        primary_key=True,
        index=True,
    )
    version: Mapped[str | None] = mapped_column(Text)
    first_seen_at: Mapped[datetime] = _now()
    last_seen_at: Mapped[datetime] = _now()


def _asset_fk(table: str) -> Mapped[uuid.UUID | None]:
    return mapped_column(UUID(as_uuid=True), ForeignKey(f"{table}.id", ondelete="CASCADE"))


def asset_column_indexes(table: str) -> tuple[Index, ...]:
    """One index per asset column, limited to rows where it is set: docs/data/database.md."""
    return tuple(
        Index(
            f"ix_{table}_{column}",
            column,
            postgresql_where=text(f"{column} IS NOT NULL"),
        )
        for column in ("domain_id", "ip_id", "url_id", "service_id")
    )


class AssetEvent(Base):
    __tablename__ = "asset_event"
    __table_args__ = (
        CheckConstraint(ONE_ASSET, name="one_asset"),
        CheckConstraint(f"event_type IN ({_allowed(AssetEventType)})", name="event_type_allowed"),
        Index("ix_asset_event_program_id_created_at", "program_id", "created_at"),
        *asset_column_indexes("asset_event"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    program_id: Mapped[uuid.UUID] = _program_fk()
    domain_id: Mapped[uuid.UUID | None] = _asset_fk("domain")
    ip_id: Mapped[uuid.UUID | None] = _asset_fk("ip")
    url_id: Mapped[uuid.UUID | None] = _asset_fk("url")
    service_id: Mapped[uuid.UUID | None] = _asset_fk("service")
    event_type: Mapped[str] = mapped_column(Text)
    # Job and raw output are named, never imported. A program hard delete
    # removes them in the same statement, so the default action is enough.
    job_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("job.id"), index=True
    )
    raw_output_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("raw_output.id")
    )
    # Changed columns, old and new value. Never a credential (G7).
    diff: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = _now()
