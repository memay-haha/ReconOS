"""HTTP surface of the user module. No query and no business rule lives here.

The CSRF check is not written out per handler: the application declares it once
as a dependency, so a handler added here inherits it: app/core/deps.py.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response

from app.core.deps import CurrentUser, DbDep, SettingsDep
from app.core.identity import User, UserRole
from app.core.pagination import DEFAULT_LIMIT, Page
from app.core.security import require_roles, session_cookie
from app.user import service
from app.user.schemas import (
    LoginRequest,
    PasswordChangeRequest,
    UserCreateRequest,
    UserDetailResponse,
    UserResponse,
    UserSessionResponse,
    UserUpdateRequest,
)

router = APIRouter(prefix="/api/v1", tags=["auth"])


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "0.0.0.0"  # noqa: S104  # a placeholder address, not a bind


@router.post("/auth/login", status_code=204)
async def login(
    request: Request, body: LoginRequest, session: DbDep, settings: SettingsDep, response: Response
) -> None:
    result = await service.login(
        session,
        username=body.username,
        password=body.password,
        ip_address=client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    cookie = session_cookie(settings)
    response.set_cookie(
        cookie.name,
        result.session_id,
        max_age=result.max_age_seconds,
        secure=cookie.secure,
        httponly=cookie.httponly,
        samesite=cookie.samesite,
        path=cookie.path,
    )


@router.post("/auth/logout", status_code=204)
async def logout(
    request: Request,
    user: CurrentUser,
    session: DbDep,
    settings: SettingsDep,
    response: Response,
) -> None:
    cookie = session_cookie(settings)
    await service.logout(session, user=user, session_id=request.cookies[cookie.name])
    response.delete_cookie(
        cookie.name,
        path=cookie.path,
        secure=cookie.secure,
        httponly=cookie.httponly,
        samesite=cookie.samesite,
    )


@router.get("/auth/me", response_model=UserResponse)
async def me(user: CurrentUser) -> User:
    return user


@router.post("/auth/password", status_code=204)
async def change_password(
    request: Request,
    body: PasswordChangeRequest,
    user: CurrentUser,
    session: DbDep,
    settings: SettingsDep,
) -> None:
    await service.change_password(
        session,
        user=user,
        current_password=body.current_password,
        new_password=body.new_password,
        session_id=request.cookies[session_cookie(settings).name],
        ip_address=client_ip(request),
    )


superadmin_only = require_roles(UserRole.SUPERADMIN)


async def superadmin(request: Request, user: CurrentUser) -> User:
    # The guard takes the request so a denial records the method, path and IP.
    return await superadmin_only(user, request)


Superadmin = Annotated[User, Depends(superadmin)]


@router.post("/users", response_model=UserResponse, tags=["user"])
async def create_user(body: UserCreateRequest, actor: Superadmin, session: DbDep) -> User:
    return await service.create_user(
        session,
        actor=actor,
        username=body.username,
        display_name=body.display_name,
        password=body.password,
        role=body.role,
    )


@router.get("/users", response_model=Page[UserDetailResponse], tags=["user"])
async def list_users(
    actor: Superadmin, session: DbDep, limit: int = DEFAULT_LIMIT, cursor: str | None = None
) -> Page[UserDetailResponse]:
    return await service.list_users(session, limit=limit, cursor=cursor)


@router.get("/users/{user_id}", response_model=UserDetailResponse, tags=["user"])
async def read_user(user_id: uuid.UUID, actor: Superadmin, session: DbDep) -> UserDetailResponse:
    return await service.get_user_detail(session, user_id)


@router.patch("/users/{user_id}", response_model=UserResponse, tags=["user"])
async def patch_user(
    user_id: uuid.UUID, body: UserUpdateRequest, actor: Superadmin, session: DbDep
) -> User:
    return await service.update_user(
        session, actor=actor, user_id=user_id, display_name=body.display_name, role=body.role
    )


@router.post("/users/{user_id}/lock", status_code=204, tags=["user"])
async def lock_user(user_id: uuid.UUID, actor: Superadmin, session: DbDep) -> None:
    await service.set_locked(session, actor=actor, user_id=user_id, locked=True)


@router.post("/users/{user_id}/unlock", status_code=204, tags=["user"])
async def unlock_user(user_id: uuid.UUID, actor: Superadmin, session: DbDep) -> None:
    await service.set_locked(session, actor=actor, user_id=user_id, locked=False)


@router.get("/users/{user_id}/sessions", response_model=Page[UserSessionResponse], tags=["user"])
async def list_user_sessions(
    user_id: uuid.UUID,
    actor: Superadmin,
    session: DbDep,
    limit: int = DEFAULT_LIMIT,
    cursor: str | None = None,
) -> Page[UserSessionResponse]:
    return await service.list_sessions_for_user(
        session, user_id=user_id, limit=limit, cursor=cursor
    )


@router.get("/user-sessions", response_model=Page[UserSessionResponse], tags=["user"])
async def list_all_sessions(
    actor: Superadmin, session: DbDep, limit: int = DEFAULT_LIMIT, cursor: str | None = None
) -> Page[UserSessionResponse]:
    return await service.list_active_sessions(session, limit=limit, cursor=cursor)


@router.delete("/user-sessions/{user_session_id}", status_code=204, tags=["user"])
async def revoke_session(user_session_id: uuid.UUID, actor: Superadmin, session: DbDep) -> None:
    await service.revoke_session(session, actor=actor, user_session_id=user_session_id)
