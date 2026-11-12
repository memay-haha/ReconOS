"""HTTP surface of the asset module. No query and no business rule lives here.

Roles per endpoint: docs/security/authorization.md. Exports stream a file as an
attachment: docs/api/architecture.md, section Xuất dữ liệu.
"""

import uuid
from collections.abc import Iterator
from dataclasses import replace
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse

from app.asset import export, service
from app.asset.models import DnsStatus
from app.asset.schemas import (
    MAX_IDS,
    AssetEventResponse,
    AssetSort,
    DomainActivityResponse,
    DomainDetailResponse,
    DomainIdsRequest,
    DomainRowResponse,
    DomainSort,
    DomainSummaryResponse,
    EventSort,
    ExportFormat,
    IpResponse,
    ProgramStatusFilter,
    ServiceResponse,
    TechnologyResponse,
    TechnologySort,
    UrlDetailResponse,
    UrlResponse,
)
from app.core.deps import CurrentUser, DbDep
from app.core.identity import User, UserRole
from app.core.pagination import DEFAULT_LIMIT, Page
from app.core.security import require_roles

router = APIRouter(prefix="/api/v1", tags=["asset"])

_readers = require_roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER)
_operators = require_roles(UserRole.SUPERADMIN, UserRole.ADMIN)


async def reader(request: Request, user: CurrentUser) -> User:
    return await _readers(user, request)


async def operator(request: Request, user: CurrentUser) -> User:
    return await _operators(user, request)


Reader = Annotated[User, Depends(reader)]
Operator = Annotated[User, Depends(operator)]
SearchQ = Annotated[str | None, Query(max_length=255)]
ExportIds = Annotated[list[uuid.UUID] | None, Query(max_length=MAX_IDS)]


def domain_filter(
    program_id: uuid.UUID | None = None,
    dns_status: Annotated[list[DnsStatus] | None, Query()] = None,
    in_scope: bool | None = None,
    q: SearchQ = None,
    has_findings: bool | None = None,
    first_seen_at_from: datetime | None = None,
    program_status: ProgramStatusFilter | None = None,
) -> service.DomainFilter:
    return service.DomainFilter(
        program_id=program_id,
        dns_status=dns_status,
        in_scope=in_scope,
        q=q,
        has_findings=has_findings,
        first_seen_at_from=first_seen_at_from,
        program_status=program_status,
    )


DomainFilterDep = Annotated[service.DomainFilter, Depends(domain_filter)]


def asset_filter(
    program_id: uuid.UUID | None = None,
    domain_id: uuid.UUID | None = None,
    q: SearchQ = None,
) -> service.AssetFilter:
    return service.AssetFilter(program_id=program_id, domain_id=domain_id, q=q)


AssetFilterDep = Annotated[service.AssetFilter, Depends(asset_filter)]


def ip_filter(program_id: uuid.UUID | None = None, q: SearchQ = None) -> service.AssetFilter:
    # /ips takes no domain_id: docs/api/openapi.yaml.
    return service.AssetFilter(program_id=program_id, q=q)


IpFilterDep = Annotated[service.AssetFilter, Depends(ip_filter)]


def _with_ids[F: (service.DomainFilter, service.AssetFilter)](
    flt: F, ids: list[uuid.UUID] | None
) -> F:
    return replace(flt, ids=ids or None)


def _download(body: Iterator[str], resource: str, fmt: ExportFormat) -> StreamingResponse:
    return StreamingResponse(
        (piece.encode("utf-8") for piece in body),
        media_type=export.MEDIA_TYPES[fmt],
        headers={
            "Content-Disposition": f'attachment; filename="{export.filename(resource, fmt)}"',
            "X-Content-Type-Options": "nosniff",
        },
    )


# ---------------------------------------------------------------- domains


@router.get("/domains", response_model=Page[DomainRowResponse])
async def list_domains(
    actor: Reader,
    session: DbDep,
    flt: DomainFilterDep,
    limit: int = DEFAULT_LIMIT,
    cursor: str | None = None,
    sort: DomainSort = "name",
) -> Page[DomainRowResponse]:
    return await service.list_domains(
        session, viewer=actor, flt=flt, limit=limit, cursor=cursor, sort=sort
    )


@router.get("/domains/export", response_class=StreamingResponse)
async def export_domains(
    actor: Reader,
    session: DbDep,
    flt: DomainFilterDep,
    ids: ExportIds = None,
    format: ExportFormat = "csv",  # documented query parameter name
) -> StreamingResponse:
    body = await service.export_domains(session, viewer=actor, flt=_with_ids(flt, ids), fmt=format)
    return _download(body, "domains", format)


@router.get("/domains/summary", response_model=DomainSummaryResponse)
async def domain_summary(
    actor: Reader, session: DbDep, flt: DomainFilterDep
) -> DomainSummaryResponse:
    return await service.domain_summary(session, viewer=actor, flt=flt)


@router.post("/domains/bulk-delete", status_code=204)
async def bulk_delete_domains(body: DomainIdsRequest, actor: Operator, session: DbDep) -> None:
    await service.delete_domains(session, actor=actor, domain_ids=body.ids)


@router.get("/domains/{domain_id}", response_model=DomainDetailResponse)
async def read_domain(domain_id: uuid.UUID, actor: Reader, session: DbDep) -> DomainDetailResponse:
    return await service.get_domain(session, viewer=actor, domain_id=domain_id)


@router.delete("/domains/{domain_id}", status_code=204)
async def delete_domain(domain_id: uuid.UUID, actor: Operator, session: DbDep) -> None:
    await service.delete_domains(session, actor=actor, domain_ids=[domain_id])


@router.get("/domains/{domain_id}/activity", response_model=Page[DomainActivityResponse])
async def domain_activity(
    domain_id: uuid.UUID,
    actor: Reader,
    session: DbDep,
    limit: int = DEFAULT_LIMIT,
    cursor: str | None = None,
) -> Page[DomainActivityResponse]:
    return await service.domain_activity(
        session, viewer=actor, domain_id=domain_id, limit=limit, cursor=cursor
    )


# ---------------------------------------------------------------- IPs, URLs, services


@router.get("/ips", response_model=Page[IpResponse])
async def list_ips(
    actor: Reader,
    session: DbDep,
    flt: IpFilterDep,
    limit: int = DEFAULT_LIMIT,
    cursor: str | None = None,
    sort: AssetSort = "-last_seen_at",
) -> Page[IpResponse]:
    return await service.list_ips(
        session, viewer=actor, flt=flt, limit=limit, cursor=cursor, sort=sort
    )


@router.get("/ips/export", response_class=StreamingResponse)
async def export_ips(
    actor: Reader,
    session: DbDep,
    flt: IpFilterDep,
    ids: ExportIds = None,
    format: ExportFormat = "csv",  # documented query parameter name
) -> StreamingResponse:
    body = await service.export_assets(
        session, viewer=actor, resource="ips", flt=_with_ids(flt, ids), fmt=format
    )
    return _download(body, "ips", format)


@router.get("/ips/{ip_id}", response_model=IpResponse)
async def read_ip(ip_id: uuid.UUID, actor: Reader, session: DbDep) -> IpResponse:
    return await service.get_ip(session, viewer=actor, ip_id=ip_id)


@router.get("/urls", response_model=Page[UrlResponse])
async def list_urls(
    actor: Reader,
    session: DbDep,
    flt: AssetFilterDep,
    limit: int = DEFAULT_LIMIT,
    cursor: str | None = None,
    sort: AssetSort = "-last_seen_at",
) -> Page[UrlResponse]:
    return await service.list_urls(
        session, viewer=actor, flt=flt, limit=limit, cursor=cursor, sort=sort
    )


@router.get("/urls/export", response_class=StreamingResponse)
async def export_urls(
    actor: Reader,
    session: DbDep,
    flt: AssetFilterDep,
    ids: ExportIds = None,
    format: ExportFormat = "csv",  # documented query parameter name
) -> StreamingResponse:
    body = await service.export_assets(
        session, viewer=actor, resource="urls", flt=_with_ids(flt, ids), fmt=format
    )
    return _download(body, "urls", format)


@router.get("/urls/{url_id}", response_model=UrlDetailResponse)
async def read_url(url_id: uuid.UUID, actor: Reader, session: DbDep) -> UrlDetailResponse:
    return await service.get_url(session, viewer=actor, url_id=url_id)


@router.get("/services", response_model=Page[ServiceResponse])
async def list_services(
    actor: Reader,
    session: DbDep,
    flt: AssetFilterDep,
    limit: int = DEFAULT_LIMIT,
    cursor: str | None = None,
    sort: AssetSort = "-last_seen_at",
) -> Page[ServiceResponse]:
    return await service.list_services(
        session, viewer=actor, flt=flt, limit=limit, cursor=cursor, sort=sort
    )


@router.get("/services/export", response_class=StreamingResponse)
async def export_services(
    actor: Reader,
    session: DbDep,
    flt: AssetFilterDep,
    ids: ExportIds = None,
    format: ExportFormat = "csv",  # documented query parameter name
) -> StreamingResponse:
    body = await service.export_assets(
        session, viewer=actor, resource="services", flt=_with_ids(flt, ids), fmt=format
    )
    return _download(body, "services", format)


@router.get("/services/{service_id}", response_model=ServiceResponse)
async def read_service(service_id: uuid.UUID, actor: Reader, session: DbDep) -> ServiceResponse:
    return await service.get_service(session, viewer=actor, service_id=service_id)


@router.get("/asset-events", response_model=Page[AssetEventResponse])
async def list_asset_events(
    actor: Reader,
    session: DbDep,
    program_id: uuid.UUID | None = None,
    domain_id: uuid.UUID | None = None,
    limit: int = DEFAULT_LIMIT,
    cursor: str | None = None,
    sort: EventSort = "-created_at",
) -> Page[AssetEventResponse]:
    return await service.list_asset_events(
        session,
        viewer=actor,
        program_id=program_id,
        domain_id=domain_id,
        limit=limit,
        cursor=cursor,
        sort=sort,
    )


@router.get("/technologies", response_model=Page[TechnologyResponse])
async def list_technologies(
    _: Reader,
    session: DbDep,
    limit: int = DEFAULT_LIMIT,
    cursor: str | None = None,
    sort: TechnologySort = "name",
) -> Page[TechnologyResponse]:
    return await service.list_technologies(session, limit=limit, cursor=cursor, sort=sort)
