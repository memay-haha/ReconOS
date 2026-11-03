#!/bin/bash
# Creates the raw-output buckets on a fresh MinIO volume. Runs on the host and
# drives the mc client that ships inside the MinIO image.
set -euo pipefail

compose_file="${1:-infras/compose/compose.dev.yaml}"
bucket="${RECONOS_S3_BUCKET:-reconos-raw-output}"
: "${RECONOS_S3_ACCESS_KEY:?RECONOS_S3_ACCESS_KEY is required}"
: "${RECONOS_S3_SECRET_KEY:?RECONOS_S3_SECRET_KEY is required}"

mc() { docker compose -f "$compose_file" exec -T minio mc "$@"; }

mc alias set local http://127.0.0.1:9000 "$RECONOS_S3_ACCESS_KEY" "$RECONOS_S3_SECRET_KEY" >/dev/null

# The test bucket keeps pytest away from development data: .claude/rules/testing.md
for b in "$bucket" "${bucket}-test"; do
  mc ls "local/$b" >/dev/null 2>&1 || mc mb "local/$b" >/dev/null
done

echo "minio ready: buckets $bucket and ${bucket}-test"
