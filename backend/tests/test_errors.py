"""Business errors and their RFC 9457 shape: docs/api/architecture.md."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.errors import (
    AppError,
    BadRequestError,
    ConflictError,
    CurrentPasswordIncorrectError,
    ForbiddenError,
    InternalError,
    NotFoundError,
    PayloadTooLargeError,
    RateLimitedError,
    SelfApprovalForbiddenError,
    TargetOutOfScopeError,
    UnauthenticatedError,
    ValidationFailedError,
    install_error_handlers,
)

# One row per line of the error table in docs/api/architecture.md.
ERROR_TABLE = [
    (BadRequestError, 400, "bad_request"),
    (UnauthenticatedError, 401, "unauthenticated"),
    (ForbiddenError, 403, "forbidden"),
    (SelfApprovalForbiddenError, 403, "self_approval_forbidden"),
    (NotFoundError, 404, "not_found"),
    (ConflictError, 409, "conflict"),
    (PayloadTooLargeError, 413, "payload_too_large"),
    (ValidationFailedError, 422, "validation_error"),
    (TargetOutOfScopeError, 422, "target_out_of_scope"),
    (CurrentPasswordIncorrectError, 422, "current_password_incorrect"),
    (RateLimitedError, 429, "rate_limited"),
    (InternalError, 500, "internal_error"),
]


@pytest.mark.parametrize(("error_class", "status", "code"), ERROR_TABLE)
def test_error_class_carries_the_documented_status_and_code(
    error_class: type[AppError], status: int, code: str
) -> None:
    error = error_class()

    assert error.status == status
    assert error.code == code


@pytest.mark.parametrize(("error_class", "status", "code"), ERROR_TABLE)
def test_error_renders_as_rfc_9457(error_class: type[AppError], status: int, code: str) -> None:
    problem = error_class(detail="something went wrong").to_problem()

    assert problem == {
        "type": f"https://reconos/errors/{code.replace('_', '-')}",
        "title": error_class.title,
        "status": status,
        "code": code,
        "detail": "something went wrong",
    }


def test_problem_omits_detail_when_absent() -> None:
    problem = NotFoundError().to_problem()

    assert "detail" not in problem
    assert problem["code"] == "not_found"


def test_problem_carries_field_errors() -> None:
    problem = TargetOutOfScopeError(
        detail="a.other.com does not match any in-scope rule",
        errors=[{"field": "target[0]", "code": "target_out_of_scope"}],
    ).to_problem()

    assert problem["errors"] == [{"field": "target[0]", "code": "target_out_of_scope"}]


def _client() -> TestClient:
    app = FastAPI()
    install_error_handlers(app)

    @app.get("/boom")
    async def boom() -> None:
        raise TargetOutOfScopeError(detail="a.other.com does not match any in-scope rule")

    @app.get("/unexpected")
    async def unexpected() -> None:
        raise RuntimeError("connection string postgres://user:secret@db/reconos")

    return TestClient(app, raise_server_exceptions=False)


def test_handler_returns_problem_json_for_app_error() -> None:
    with _client() as client:
        response = client.get("/boom")

    assert response.status_code == 422
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["code"] == "target_out_of_scope"


def test_handler_hides_details_of_unexpected_errors() -> None:
    with _client() as client:
        response = client.get("/unexpected")

    body = response.json()
    assert response.status_code == 500
    assert body["code"] == "internal_error"
    # An unexpected error must never leak a connection string or a stack trace.
    assert "secret" not in response.text
    assert "Traceback" not in response.text
