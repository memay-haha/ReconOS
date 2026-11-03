"""HTTP surface of the user module. No query and no business rule lives here."""

from fastapi import APIRouter, Request, Response

from app.core.deps import CurrentUser, DbDep, SettingsDep
from app.core.identity import User
from app.core.security import enforce_csrf, session_cookie
from app.user import service
from app.user.schemas import LoginRequest, PasswordChangeRequest, UserResponse

router = APIRouter(prefix="/api/v1", tags=["auth"])


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "0.0.0.0"  # noqa: S104  # a placeholder address, not a bind


@router.post("/auth/login", status_code=204)
async def login(
    request: Request, body: LoginRequest, session: DbDep, settings: SettingsDep, response: Response
) -> None:
    enforce_csrf(request, settings)
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
    enforce_csrf(request, settings)
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
    enforce_csrf(request, settings)
    await service.change_password(
        session,
        user=user,
        current_password=body.current_password,
        new_password=body.new_password,
        session_id=request.cookies[session_cookie(settings).name],
        ip_address=client_ip(request),
    )
