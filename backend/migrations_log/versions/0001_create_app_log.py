"""create app_log partitioned by day

Columns and index list: docs/data/schema.md. Partitioning and retention:
docs/data/database.md. The background process creates tomorrow's partition and
drops partitions older than log_retention_days.

Revision ID: 0001_create_app_log
Revises:
Create Date: 2026-11-03
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0001_create_app_log"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE app_log (
            id uuid NOT NULL DEFAULT uuidv7(),
            logged_at timestamptz NOT NULL,
            level text NOT NULL,
            service text NOT NULL,
            event text NOT NULL,
            request_id uuid,
            job_id uuid,
            program_id uuid,
            worker_id uuid,
            context jsonb NOT NULL DEFAULT '{}'::jsonb,
            CONSTRAINT pk_app_log PRIMARY KEY (id, logged_at),
            CONSTRAINT ck_app_log_level CHECK (level IN ('info', 'warning', 'error', 'critical')),
            CONSTRAINT ck_app_log_service CHECK (
                service IN ('api', 'dispatcher', 'background', 'beat', 'worker')
            )
        ) PARTITION BY RANGE (logged_at)
    """)
    # Index on the parent: PostgreSQL creates the matching index on every partition.
    op.execute("CREATE INDEX ix_app_log_job_id_logged_at ON app_log (job_id, logged_at)")
    op.execute("CREATE INDEX ix_app_log_level_logged_at ON app_log (level, logged_at)")
    # A default partition keeps inserts working before the first daily partition
    # exists; the background task moves rows out of it as it creates partitions.
    op.execute("CREATE TABLE app_log_default PARTITION OF app_log DEFAULT")


def downgrade() -> None:
    op.execute("DROP TABLE app_log")
