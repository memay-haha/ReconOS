# Worker image: runner code plus security tools at fixed versions with checked
# downloads. Updating a tool means changing its version and checksum here:
# docs/ops/deployment.md
FROM ghcr.io/astral-sh/uv:0.13.7 AS uv

# Tools are fetched and unpacked in a separate stage, so the final image has
# no download leftovers.
FROM python:3.15-slim AS tools
ARG NUCLEI_VERSION=3.11.1
ARG NUCLEI_SHA256=ea63d4ae232808cd7c6bc00d0142428e231fab59dae01042246097d195835ab6
ARG NUCLEI_TEMPLATES_VERSION=10.5.2
ARG NUCLEI_TEMPLATES_SHA256=016b7abbf931d4d1a851a5a568e44510dc61691dc8a5202e3b24e701515ec574
ARG SQLMAP_VERSION=1.10.8
ARG SQLMAP_SHA256=64ce8ab903cd34052366a2ddcced5bc21fc76f095929b6053c48ec01477f65d1
ARG DALFOX_VERSION=3.2.4
ARG DALFOX_SHA256=c11cfd2f8261973f0a2a2a1eba5a147ce77712a29acfa6343f9847fb8bb7eca2
ARG GOWITNESS_VERSION=3.2.2
ARG GOWITNESS_SHA256=063ac21063ec96992a9bd7216bf05b3e96afa01a05e1a908490a2b42f573a12a
ADD --checksum=sha256:${NUCLEI_SHA256} \
    https://github.com/projectdiscovery/nuclei/releases/download/v${NUCLEI_VERSION}/nuclei_${NUCLEI_VERSION}_linux_amd64.zip \
    /tmp/nuclei.zip
ADD --checksum=sha256:${NUCLEI_TEMPLATES_SHA256} \
    https://github.com/projectdiscovery/nuclei-templates/archive/refs/tags/v${NUCLEI_TEMPLATES_VERSION}.tar.gz \
    /tmp/nuclei-templates.tar.gz
ADD --checksum=sha256:${SQLMAP_SHA256} \
    https://github.com/sqlmapproject/sqlmap/archive/refs/tags/${SQLMAP_VERSION}.tar.gz \
    /tmp/sqlmap.tar.gz
# The musl build is static, so it runs on the slim image without extra libraries.
ADD --checksum=sha256:${DALFOX_SHA256} \
    https://github.com/hahwul/dalfox/releases/download/v${DALFOX_VERSION}/dalfox-v${DALFOX_VERSION}-linux-x86_64-musl.tar.gz \
    /tmp/dalfox.tar.gz
ADD --checksum=sha256:${GOWITNESS_SHA256} \
    https://github.com/sensepost/gowitness/releases/download/${GOWITNESS_VERSION}/gowitness-${GOWITNESS_VERSION}-linux-amd64 \
    /opt/tools/gowitness
RUN python -I -c "import zipfile; zipfile.ZipFile('/tmp/nuclei.zip').extract('nuclei', '/opt/tools')" \
    && chmod 0755 /opt/tools/nuclei /opt/tools/gowitness \
    && mkdir -p /opt/nuclei-templates \
    && tar -xzf /tmp/nuclei-templates.tar.gz -C /opt/nuclei-templates --strip-components=1 \
    && mkdir -p /opt/sqlmap \
    && tar -xzf /tmp/sqlmap.tar.gz -C /opt/sqlmap --strip-components=1 \
    && tar -xzf /tmp/dalfox.tar.gz -C /opt/tools --strip-components=1 \
        dalfox-v${DALFOX_VERSION}-linux-x86_64-musl/dalfox \
    && chmod 0755 /opt/tools/dalfox \
    && printf '#!/bin/sh\nexec /usr/local/bin/python3 /opt/sqlmap/sqlmap.py "$@"\n' > /opt/tools/sqlmap \
    && chmod 0755 /opt/tools/sqlmap

FROM python:3.15-slim AS base
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH" \
    RECONOS_WORKER_WORKDIR=/var/lib/reconos/jobs
COPY --from=uv /uv /usr/local/bin/uv
# Headless browser for gowitness, from the signed Debian archive. The runner
# passes its path: workers/worker/runners/gowitness.py.
RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
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
# A checkout made with umask 077 gives owner-only modes; the image user must read the code.
RUN chmod -R a+rX contracts workers \
    && uv sync --frozen --no-dev --package reconos-workers

COPY --from=tools /opt/tools/ /usr/local/bin/
# sqlmap is Python and runs on the image interpreter, outside the worker venv.
COPY --from=tools /opt/sqlmap/ /opt/sqlmap/
ENV HOME=/home/reconos
RUN useradd --system --uid 10002 --create-home --home-dir "$HOME" reconos \
    && mkdir -p "$RECONOS_WORKER_WORKDIR" \
    && chown reconos "$RECONOS_WORKER_WORKDIR"
# Templates live where nuclei looks by default. The runner passes
# -disable-update-check, so a job never downloads templates.
COPY --from=tools --chown=reconos /opt/nuclei-templates/ /home/reconos/nuclei-templates/
WORKDIR /srv/workers
USER reconos
# Record the template folder in the nuclei config of the image user.
RUN nuclei -update-template-dir "$HOME/nuclei-templates" -disable-update-check -version

CMD ["celery", "-A", "worker.celery_app", "worker"]
