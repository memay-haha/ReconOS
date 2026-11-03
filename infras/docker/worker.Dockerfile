# Worker image. Security tools are installed here with fixed versions from
# batch 4 of docs/roadmap.md onward: docs/ops/deployment.md
FROM ghcr.io/astral-sh/uv:0.13.7 AS uv

FROM python:3.15-slim AS base
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH" \
    RECONOS_WORKER_WORKDIR=/var/lib/reconos/jobs
COPY --from=uv /uv /usr/local/bin/uv
WORKDIR /srv

COPY pyproject.toml uv.lock ./
COPY backend/pyproject.toml backend/
COPY contracts/pyproject.toml contracts/
COPY workers/pyproject.toml workers/
RUN mkdir -p backend/app contracts/contracts workers/worker \
    && touch backend/app/__init__.py contracts/contracts/__init__.py workers/worker/__init__.py \
    && uv sync --frozen --no-dev --package reconos-workers

COPY contracts/ contracts/
COPY workers/ workers/
RUN uv sync --frozen --no-dev --package reconos-workers

RUN useradd --system --uid 10002 reconos \
    && mkdir -p "$RECONOS_WORKER_WORKDIR" \
    && chown reconos "$RECONOS_WORKER_WORKDIR"
WORKDIR /srv/workers
USER reconos

CMD ["celery", "-A", "worker.celery_app", "worker"]
