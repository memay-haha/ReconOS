"""Business errors and their RFC 9457 rendering.

Every class here matches one row of the error table in docs/api/architecture.md.
Services raise these; the handlers installed on the app turn them into responses.
"""

from typing import Any, ClassVar, TypedDict, cast

import structlog
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

PROBLEM_CONTENT_TYPE = "application/problem+json"
_TYPE_PREFIX = "https://reconos/errors/"

log = structlog.get_logger()


class FieldError(TypedDict):
    """One entry of the `errors` array: which field failed and why."""

    field: str
    code: str


class AppError(Exception):
    """Base class for every error the API reports on purpose."""

    status: ClassVar[int] = 500
    code: ClassVar[str] = "internal_error"
    title: ClassVar[str] = "Internal error"

    def __init__(self, detail: str | None = None, errors: list[FieldError] | None = None) -> None:
        super().__init__(detail or self.title)
        self.detail = detail
        self.errors = errors

    def to_problem(self) -> dict[str, Any]:
        problem: dict[str, Any] = {
            "type": f"{_TYPE_PREFIX}{self.code.replace('_', '-')}",
            "title": self.title,
            "status": self.status,
            "code": self.code,
        }
        if self.detail is not None:
            problem["detail"] = self.detail
        if self.errors is not None:
            problem["errors"] = self.errors
        return problem


class BadRequestError(AppError):
    status = 400
    code = "bad_request"
    title = "Bad request"


class UnauthenticatedError(AppError):
    status = 401
    code = "unauthenticated"
    title = "Unauthenticated"


class ForbiddenError(AppError):
    status = 403
    code = "forbidden"
    title = "Forbidden"


class SelfApprovalForbiddenError(AppError):
    """Approving a job you created yourself, Superadmin included (G5)."""

    status = 403
    code = "self_approval_forbidden"
    title = "Self approval forbidden"


class NotFoundError(AppError):
    """Also returned for a program the account was never assigned to."""

    status = 404
    code = "not_found"
    title = "Not found"


class ConflictError(AppError):
    status = 409
    code = "conflict"
    title = "Conflict"


class PayloadTooLargeError(AppError):
    status = 413
    code = "payload_too_large"
    title = "Payload too large"


class ValidationFailedError(AppError):
    status = 422
    code = "validation_error"
    title = "Validation error"


class TargetOutOfScopeError(AppError):
    """Target matches no in-scope rule, or matches an out-of-scope rule (G5)."""

    status = 422
    code = "target_out_of_scope"
    title = "Target out of scope"


class CurrentPasswordIncorrectError(AppError):
    """The signed-in account re-proved its password wrongly.

    Deliberately not a 401: the session is valid, and a 401 tells the client the
    session ended and signs the user out.
    """

    status = 422
    code = "current_password_incorrect"
    title = "Current password incorrect"


class RateLimitedError(AppError):
    status = 429
    code = "rate_limited"
    title = "Rate limited"

    def __init__(
        self,
        detail: str | None = None,
        errors: list[FieldError] | None = None,
        retry_after_seconds: int = 900,
    ) -> None:
        super().__init__(detail, errors)
        self.retry_after_seconds = retry_after_seconds


class InternalError(AppError):
    status = 500
    code = "internal_error"
    title = "Internal error"


def _problem_response(error: AppError) -> JSONResponse:
    headers: dict[str, str] | None = None
    if isinstance(error, RateLimitedError):
        headers = {"Retry-After": str(error.retry_after_seconds)}
    return JSONResponse(
        status_code=error.status,
        content=error.to_problem(),
        media_type=PROBLEM_CONTENT_TYPE,
        headers=headers,
    )


def install_error_handlers(app: FastAPI) -> None:
    """Route every error through one place so no response leaks internals."""

    @app.exception_handler(AppError)
    async def handle_app_error(_: Request, exc: Exception) -> JSONResponse:
        return _problem_response(cast(AppError, exc))

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(_: Request, exc: Exception) -> JSONResponse:
        validation_error = cast(RequestValidationError, exc)
        errors: list[FieldError] = [
            {"field": ".".join(str(part) for part in item["loc"][1:]), "code": item["type"]}
            for item in validation_error.errors()
        ]
        return _problem_response(
            ValidationFailedError(detail="request failed validation", errors=errors)
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(_: Request, exc: Exception) -> JSONResponse:
        # Logged with the stack trace here, the last place that handles it, and
        # reported without any detail: .claude/rules/error-handling.md
        log.error("unhandled_exception", exc_info=exc)
        return _problem_response(InternalError())
