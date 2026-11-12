"""The shared tag catalogue and tags on assets and findings: docs/architecture/modules.md.

The asset tables and `program` sit above this tier, so they are read by table
name only, never imported: docs/architecture/dependency-graph.md. Tagging an
asset needs the asset visible to the caller (404 otherwise, G7) and its program
writable (409 when archived): docs/security/authorization.md.
"""

import json
import uuid
from collections.abc import Sequence
from typing import Any

from sqlalchemy import (
    ColumnClause,
    ColumnElement,
    TableClause,
    and_,
    column,
    delete,
    func,
    select,
    table,
    tuple_,
)
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import audit
from app.core.errors import BadRequestError, ConflictError, NotFoundError
from app.core.identity import User
from app.core.pagination import MAX_LIMIT, Page, decode_cursor, encode_cursor
from app.core.security import program_visible_to
from app.tag.models import AssetTag, FindingTag, Tag
from app.tag.schemas import AssetTagResponse, AssetType, TagResponse, TagSort

RESOURCE = "tag"

_program = table("program", column("id"), column("status"))
_finding = table("finding", column("id"), column("program_id"))


def _asset_table(name: str) -> TableClause:
    columns: list[ColumnClause[Any]] = [column("id"), column("program_id")]
    if name == "domain":
        columns.append(column("deleted_at"))
    return table(name, *columns)


_ASSET_TABLES: dict[str, TableClause] = {
    name: _asset_table(name) for name in ("domain", "ip", "url", "service")
}


def _clamp(limit: int) -> int:
    return max(1, min(limit, MAX_LIMIT))


# ---------------------------------------------------------------- catalogue


def _decode_tag_cursor(cursor: str) -> tuple[str, str]:
    """The sort value is the JSON pair [key, value]; anything else is a 400."""
    value, _ = decode_cursor(cursor)
    try:
        pair = json.loads(value) if isinstance(value, str) else None
    except ValueError as err:
        raise BadRequestError(detail="cursor is not valid") from err
    if not (isinstance(pair, list) and len(pair) == 2 and all(isinstance(v, str) for v in pair)):
        raise BadRequestError(detail="cursor is not valid")
    return pair[0], pair[1]


async def list_tags(
    session: AsyncSession, *, limit: int, cursor: str | None, sort: TagSort = "key"
) -> Page[TagResponse]:
    size = _clamp(limit)
    descending = sort.startswith("-")
    order_key = tuple_(Tag.key, Tag.value, Tag.id)
    stmt = select(Tag).order_by(
        *(
            (Tag.key.desc(), Tag.value.desc(), Tag.id.desc())
            if descending
            else (Tag.key.asc(), Tag.value.asc(), Tag.id.asc())
        )
    )
    if cursor is not None:
        key, value = _decode_tag_cursor(cursor)
        seen = (key, value, decode_cursor(cursor)[1])
        stmt = stmt.where(order_key < seen if descending else order_key > seen)
    rows = list(await session.scalars(stmt.limit(size + 1)))
    total = await session.scalar(select(func.count()).select_from(Tag)) or 0
    page_rows = rows[:size]
    next_cursor = (
        encode_cursor(json.dumps([page_rows[-1].key, page_rows[-1].value]), page_rows[-1].id)
        if len(rows) > size
        else None
    )
    return Page[TagResponse](
        items=[TagResponse.model_validate(row) for row in page_rows],
        next_cursor=next_cursor,
        total=total,
    )


async def create_tag(session: AsyncSession, *, actor: User, key: str, value: str) -> Tag:
    conflict = ConflictError(
        detail="the tag already exists", errors=[{"field": "value", "code": "already_exists"}]
    )
    if await session.scalar(select(Tag.id).where(Tag.key == key, Tag.value == value)):
        raise conflict
    tag = Tag(key=key, value=value, created_by=actor.id)
    session.add(tag)
    try:
        async with session.begin_nested():
            await session.flush()
    except IntegrityError as err:
        raise conflict from err
    await session.refresh(tag)
    await audit.record(
        session,
        action="tag_created",
        user_id=actor.id,
        resource_type=RESOURCE,
        resource_id=tag.id,
        detail={"key": key, "value": value},
    )
    return tag


async def delete_tag(session: AsyncSession, *, actor: User, tag_id: uuid.UUID) -> None:
    """Hard delete. Every asset loses the tag through ON DELETE CASCADE."""
    tag = await session.get(Tag, tag_id)
    if tag is None:
        raise NotFoundError(detail="tag does not exist")
    detail = {"key": tag.key, "value": tag.value}
    await session.execute(delete(Tag).where(Tag.id == tag_id))
    await audit.record(
        session,
        action="tag_deleted",
        user_id=actor.id,
        resource_type=RESOURCE,
        resource_id=tag_id,
        detail=detail,
    )


# ---------------------------------------------------------------- tags on assets


def _asset_visible(viewer: User, asset: TableClause) -> ColumnElement[bool]:
    clauses = [program_visible_to(viewer, asset.c.program_id)]
    if "deleted_at" in asset.c:
        clauses.append(asset.c.deleted_at.is_(None))
    return and_(*clauses)


async def _writable_assets(
    session: AsyncSession, viewer: User, asset_type: AssetType, ids: Sequence[uuid.UUID]
) -> dict[uuid.UUID, uuid.UUID]:
    """Asset id to program id, all or none: 404 when one is missing, 409 when archived."""
    asset = _ASSET_TABLES[asset_type]
    wanted = set(ids)
    rows = list(
        (
            await session.execute(
                select(asset.c.id, asset.c.program_id, _program.c.status)
                .join(_program, _program.c.id == asset.c.program_id)
                .where(asset.c.id.in_(wanted), _asset_visible(viewer, asset))
            )
        ).all()
    )
    if len(rows) != len(wanted):
        raise NotFoundError(detail=f"{asset_type} does not exist")
    if any(status == "archived" for _, _, status in rows):
        raise ConflictError(detail="program is archived and read only")
    return {asset_id: program_id for asset_id, program_id, _ in rows}


async def _require_tag(session: AsyncSession, tag_id: uuid.UUID) -> Tag:
    tag = await session.get(Tag, tag_id)
    if tag is None:
        raise NotFoundError(detail="tag does not exist")
    return tag


async def tag_asset(
    session: AsyncSession,
    *,
    actor: User,
    tag_id: uuid.UUID,
    asset_type: AssetType,
    asset_id: uuid.UUID,
) -> AssetTag:
    tag = await _require_tag(session, tag_id)
    programs = await _writable_assets(session, actor, asset_type, [asset_id])
    column_name = f"{asset_type}_id"
    conflict = ConflictError(
        detail="the asset already has this tag",
        errors=[{"field": "tag_id", "code": "already_exists"}],
    )
    existing = await session.scalar(
        select(AssetTag.id).where(
            AssetTag.tag_id == tag.id, getattr(AssetTag, column_name) == asset_id
        )
    )
    if existing is not None:
        raise conflict
    row = AssetTag(tag_id=tag.id, created_by=actor.id, **{column_name: asset_id})
    session.add(row)
    try:
        async with session.begin_nested():
            await session.flush()
    except IntegrityError as err:
        raise conflict from err
    await session.refresh(row)
    await audit.record(
        session,
        action="asset_tagged",
        user_id=actor.id,
        program_id=programs[asset_id],
        resource_type=asset_type,
        resource_id=asset_id,
        detail={"tag_id": str(tag.id), "key": tag.key, "value": tag.value},
    )
    return row


async def bulk_tag_assets(
    session: AsyncSession,
    *,
    actor: User,
    tag_id: uuid.UUID,
    asset_type: AssetType,
    ids: Sequence[uuid.UUID],
) -> None:
    """One tag onto many assets of one type, all or none. An asset already tagged stays as is."""
    tag = await _require_tag(session, tag_id)
    programs = await _writable_assets(session, actor, asset_type, ids)
    column_name = f"{asset_type}_id"
    rows: list[dict[str, Any]] = [
        {"tag_id": tag.id, column_name: asset_id, "created_by": actor.id}
        for asset_id in sorted(programs, key=str)
    ]
    await session.execute(
        insert(AssetTag)
        .values(rows)
        .on_conflict_do_nothing(
            index_elements=[AssetTag.tag_id, getattr(AssetTag, column_name)],
            index_where=getattr(AssetTag, column_name).is_not(None),
        )
    )
    for asset_id, program_id in programs.items():
        await audit.record(
            session,
            action="asset_tagged",
            user_id=actor.id,
            program_id=program_id,
            resource_type=asset_type,
            resource_id=asset_id,
            detail={"tag_id": str(tag.id), "key": tag.key, "value": tag.value},
        )


async def untag_asset(session: AsyncSession, *, actor: User, asset_tag_id: uuid.UUID) -> None:
    row = await session.get(AssetTag, asset_tag_id)
    if row is None:
        raise NotFoundError(detail="asset tag does not exist")
    pairs: list[tuple[AssetType, uuid.UUID | None]] = [
        ("domain", row.domain_id),
        ("ip", row.ip_id),
        ("url", row.url_id),
        ("service", row.service_id),
    ]
    asset_type, asset_id = next((name, value) for name, value in pairs if value is not None)
    if asset_id is None:  # the one_asset CHECK rules this out
        raise NotFoundError(detail="asset tag does not exist")
    try:
        programs = await _writable_assets(session, actor, asset_type, [asset_id])
    except NotFoundError as err:
        raise NotFoundError(detail="asset tag does not exist") from err
    await session.execute(delete(AssetTag).where(AssetTag.id == row.id))
    await audit.record(
        session,
        action="asset_untagged",
        user_id=actor.id,
        program_id=programs[asset_id],
        resource_type=asset_type,
        resource_id=asset_id,
        detail={"tag_id": str(row.tag_id)},
    )


def asset_tag_response(row: AssetTag) -> AssetTagResponse:
    return AssetTagResponse.model_validate(row)


# ---------------------------------------------------------------- tags on findings


async def set_finding_tags(
    session: AsyncSession, *, actor: User, finding_id: uuid.UUID, tag_ids: Sequence[uuid.UUID]
) -> None:
    """Replace the tag list of one finding. One audit row per tag added or removed.

    A finding the actor cannot see answers 404 (G7), an unknown tag 404, a
    finding of an archived program 409.
    """
    found = (
        await session.execute(
            select(_finding.c.program_id, _program.c.status)
            .join(_program, _program.c.id == _finding.c.program_id)
            .where(_finding.c.id == finding_id, program_visible_to(actor, _finding.c.program_id))
        )
    ).first()
    if found is None:
        raise NotFoundError(detail="finding does not exist")
    program_id, status = found
    if status == "archived":
        raise ConflictError(detail="program is archived and read only")
    wanted = set(tag_ids)
    tags = {tag.id: tag for tag in await session.scalars(select(Tag).where(Tag.id.in_(wanted)))}
    if len(tags) != len(wanted):
        raise NotFoundError(detail="tag does not exist")
    current = set(
        await session.scalars(select(FindingTag.tag_id).where(FindingTag.finding_id == finding_id))
    )
    added = sorted(wanted - current, key=str)
    removed = sorted(current - wanted, key=str)
    if removed:
        await session.execute(
            delete(FindingTag).where(
                FindingTag.finding_id == finding_id, FindingTag.tag_id.in_(removed)
            )
        )
    if added:
        await session.execute(
            insert(FindingTag)
            .values(
                [
                    {"finding_id": finding_id, "tag_id": tag_id, "created_by": actor.id}
                    for tag_id in added
                ]
            )
            .on_conflict_do_nothing()
        )
    for action, changed in (("finding_tagged", added), ("finding_untagged", removed)):
        for tag_id in changed:
            detail: dict[str, Any] = {"tag_id": str(tag_id)}
            if tag_id in tags:
                detail |= {"key": tags[tag_id].key, "value": tags[tag_id].value}
            await audit.record(
                session,
                action=action,
                user_id=actor.id,
                program_id=program_id,
                resource_type="finding",
                resource_id=finding_id,
                detail=detail,
            )
