#!/bin/bash
# Creates the ReconOS databases and one role per database.
# Runs once, on an empty data directory: docs/ops/deployment.md
set -euo pipefail

app_password="${RECONOS_DB_PASSWORD:?RECONOS_DB_PASSWORD is required}"
log_password="${RECONOS_LOG_DB_PASSWORD:?RECONOS_LOG_DB_PASSWORD is required}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<SQL
CREATE ROLE reconos_app LOGIN PASSWORD '${app_password}';
CREATE ROLE reconos_log_app LOGIN PASSWORD '${log_password}';

CREATE DATABASE reconos OWNER reconos_app;
CREATE DATABASE reconos_log OWNER reconos_log_app;

-- Test databases live beside the dev ones so pytest never touches dev data:
-- .claude/rules/testing.md
CREATE DATABASE reconos_test OWNER reconos_app;
CREATE DATABASE reconos_log_test OWNER reconos_log_app;
SQL

for db in reconos reconos_log reconos_test reconos_log_test; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" <<SQL
-- uuidv7() is built in from PostgreSQL 18, no extension needed.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
SQL
done

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname reconos -c 'GRANT ALL ON SCHEMA public TO reconos_app;'
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname reconos_test -c 'GRANT ALL ON SCHEMA public TO reconos_app;'
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname reconos_log -c 'GRANT ALL ON SCHEMA public TO reconos_log_app;'
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname reconos_log_test -c 'GRANT ALL ON SCHEMA public TO reconos_log_app;'
