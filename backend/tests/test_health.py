"""Healthcheck endpoint: docs/api/openapi.yaml, path /health."""

from fastapi.testclient import TestClient

from app.main import app


def test_health_returns_204_without_authentication() -> None:
    with TestClient(app) as client:
        response = client.get("/api/v1/health")

    assert response.status_code == 204
    assert response.content == b""


def test_health_is_served_only_under_the_version_prefix() -> None:
    with TestClient(app) as client:
        unprefixed = client.get("/health")

    assert unprefixed.status_code == 404


def test_interactive_docs_are_not_exposed() -> None:
    # Only POST /auth/login and GET /health may answer without a session.
    with TestClient(app) as client:
        statuses = [client.get(path).status_code for path in ("/docs", "/redoc", "/openapi.json")]

    assert statuses == [404, 404, 404]
