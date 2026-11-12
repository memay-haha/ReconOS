"""HTTP surface of the screenshot module. No query and no business rule lives here.

Roles per endpoint: docs/security/authorization.md. Every screenshot body is
served with `X-Content-Type-Options: nosniff`: the image is checked by its own
bytes, the HTML goes out as plain text (.claude/rules/security.md).
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import PlainTextResponse, StreamingResponse

from app.core.deps import CurrentUser, DbDep
from app.core.identity import User, UserRole
from app.core.pagination import DEFAULT_LIMIT, Page
from app.core.security import require_roles
from app.screenshot import service
from app.screenshot.schemas import (
    ScreenshotDetailResponse,
    ScreenshotNetworkResponse,
    ScreenshotResponse,
    ScreenshotSort,
    ScreenshotSummaryResponse,
    StatusClass,
)

router = APIRouter(prefix="/api/v1", tags=["screenshot"])

_readers = require_roles(UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.USER)
_operators = require_roles(UserRole.SUPERADMIN, UserRole.ADMIN)

# The page and the image may hold anything the target served: nothing in them
# runs or is sniffed into another type.
_BODY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cache-Control": "private, no-store",
}


async def reader(request: Request, user: CurrentUser) -> User:
    return await _readers(user, request)


async def operator(request: Request, user: CurrentUser) -> User:
    return await _operators(user, request)


Reader = Annotated[User, Depends(reader)]
Operator = Annotated[User, Depends(operator)]


def screenshot_filter(
    program_id: uuid.UUID | None = None,
    domain_id: uuid.UUID | None = None,
    is_failed: bool | None = None,
    q: Annotated[str | None, Query(max_length=255)] = None,
    technology_id: Annotated[list[uuid.UUID] | None, Query()] = None,
    status_code: Annotated[list[StatusClass] | None, Query()] = None,
    job_id: uuid.UUID | None = None,
) -> service.ScreenshotFilter:
    return service.ScreenshotFilter(
        program_id=program_id,
        domain_id=domain_id,
        is_failed=is_failed,
        q=q,
        technology_id=technology_id,
        status_code=status_code,
        job_id=job_id,
    )


ScreenshotFilterDep = Annotated[service.ScreenshotFilter, Depends(screenshot_filter)]


def summary_filter(
    program_id: uuid.UUID | None = None,
    domain_id: uuid.UUID | None = None,
    is_failed: bool | None = None,
    q: Annotated[str | None, Query(max_length=255)] = None,
    technology_id: Annotated[list[uuid.UUID] | None, Query()] = None,
    job_id: uuid.UUID | None = None,
) -> service.ScreenshotFilter:
    """Every filter of the list but `status_code`: a chip keeps its count when toggled."""
    return screenshot_filter(
        program_id=program_id,
        domain_id=domain_id,
        is_failed=is_failed,
        q=q,
        technology_id=technology_id,
        job_id=job_id,
    )


SummaryFilterDep = Annotated[service.ScreenshotFilter, Depends(summary_filter)]


@router.get("/screenshots", response_model=Page[ScreenshotResponse])
async def list_screenshots(
    actor: Reader,
    session: DbDep,
    flt: ScreenshotFilterDep,
    limit: int = DEFAULT_LIMIT,
    cursor: str | None = None,
    sort: ScreenshotSort = "-captured_at",
) -> Page[ScreenshotResponse]:
    return await service.list_screenshots(
        session, viewer=actor, flt=flt, limit=limit, cursor=cursor, sort=sort
    )


@router.get(
    "/screenshots/summary",
    response_model=ScreenshotSummaryResponse,
    response_model_by_alias=True,
)
async def screenshot_summary(
    actor: Reader, session: DbDep, flt: SummaryFilterDep
) -> ScreenshotSummaryResponse:
    return await service.summary(session, viewer=actor, flt=flt)


@router.get("/screenshots/{screenshot_id}", response_model=ScreenshotDetailResponse)
async def read_screenshot(
    screenshot_id: uuid.UUID, actor: Reader, session: DbDep
) -> ScreenshotDetailResponse:
    return await service.get_screenshot(session, viewer=actor, screenshot_id=screenshot_id)


@router.delete("/screenshots/{screenshot_id}", status_code=204)
async def delete_screenshot(screenshot_id: uuid.UUID, actor: Operator, session: DbDep) -> None:
    await service.delete_screenshot(session, actor=actor, screenshot_id=screenshot_id)


@router.get("/screenshots/{screenshot_id}/image", response_class=StreamingResponse)
async def screenshot_image(
    screenshot_id: uuid.UUID, actor: Reader, session: DbDep
) -> StreamingResponse:
    media_type, body = await service.open_image(session, viewer=actor, screenshot_id=screenshot_id)
    return StreamingResponse(
        body,
        media_type=media_type,
        headers={**_BODY_HEADERS, "Content-Disposition": "inline"},
    )


@router.get("/screenshots/{screenshot_id}/html", response_class=PlainTextResponse)
async def screenshot_html(
    screenshot_id: uuid.UUID, actor: Reader, session: DbDep
) -> PlainTextResponse:
    html = await service.get_html(session, viewer=actor, screenshot_id=screenshot_id)
    return PlainTextResponse(html, headers=_BODY_HEADERS)


@router.get("/screenshots/{screenshot_id}/network", response_model=ScreenshotNetworkResponse)
async def screenshot_network(
    screenshot_id: uuid.UUID, actor: Reader, session: DbDep
) -> ScreenshotNetworkResponse:
    return await service.get_network(session, viewer=actor, screenshot_id=screenshot_id)


@router.get("/screenshots/{screenshot_id}/har", response_class=StreamingResponse)
async def screenshot_har(
    screenshot_id: uuid.UUID, actor: Reader, session: DbDep
) -> StreamingResponse:
    shot_id, body = await service.build_har(session, viewer=actor, screenshot_id=screenshot_id)
    return StreamingResponse(
        (piece.encode("utf-8") for piece in body),
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="screenshot-{shot_id}.har"',
            "X-Content-Type-Options": "nosniff",
        },
    )
