# Backend image. Runs as api, dispatcher, background or beat depending on the
# command: docs/ops/deployment.md
FROM ghcr.io/astral-sh/uv:0.13.7 AS uv

FROM python:3.15-slim AS base
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH"
COPY --from=uv /uv /usr/local/bin/uv
WORKDIR /srv

# Dependencies first so a code change does not re-resolve the lock file.
COPY pyproject.toml uv.lock ./
COPY backend/pyproject.toml backend/
COPY contracts/pyproject.toml contracts/
COPY workers/pyproject.toml workers/
RUN mkdir -p backend/app contracts/contracts workers/worker \
    && touch backend/app/__init__.py contracts/contracts/__init__.py workers/worker/__init__.py \
    && uv sync --frozen --no-dev --package reconos-backend

COPY contracts/ contracts/
COPY backend/ backend/
RUN uv sync --frozen --no-dev --package reconos-backend

WORKDIR /srv/backend
RUN useradd --system --uid 10001 reconos
USER reconos

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
