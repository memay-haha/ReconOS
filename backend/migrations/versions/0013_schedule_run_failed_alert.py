"""alert type schedule_run_failed, alert.schedule_id, schedule.failing_since

A due schedule whose job is refused raises a `schedule_run_failed` alert, once
per failure streak: docs/architecture/business-flow.md, docs/data/schema.md.

Revision ID: 0013
Revises: 0011
Create Date: 2026-11-13 02:35:28.200461+00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0013"
down_revision: str | Sequence[str] | None = "0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

OLD_TYPES = ("finding_new", "job_pending_approval", "job_failed", "asset_new", "cert_expiring")
NEW_TYPES = (*OLD_TYPES, "schedule_run_failed")


def _check(types: Sequence[str]) -> str:
    return "alert_type IN ({})".format(", ".join(f"'{t}'" for t in types))


def upgrade() -> None:
    op.add_column("schedule", sa.Column("failing_since", sa.DateTime(timezone=True), nullable=True))
    op.add_column("alert", sa.Column("schedule_id", sa.UUID(), nullable=True))
    op.create_index(op.f("ix_alert_schedule_id"), "alert", ["schedule_id"], unique=False)
    op.create_foreign_key(
        op.f("fk_alert_schedule_id_schedule"),
        "alert",
        "schedule",
        ["schedule_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.drop_constraint(op.f("ck_alert_alert_type_allowed"), "alert", type_="check")
    op.create_check_constraint(op.f("ck_alert_alert_type_allowed"), "alert", _check(NEW_TYPES))


def downgrade() -> None:
    # The old constraint cannot hold the new type: its alerts go first.
    op.execute("DELETE FROM alert WHERE alert_type = 'schedule_run_failed'")
    op.drop_constraint(op.f("ck_alert_alert_type_allowed"), "alert", type_="check")
    op.create_check_constraint(op.f("ck_alert_alert_type_allowed"), "alert", _check(OLD_TYPES))
    op.drop_constraint(op.f("fk_alert_schedule_id_schedule"), "alert", type_="foreignkey")
    op.drop_index(op.f("ix_alert_schedule_id"), table_name="alert")
    op.drop_column("alert", "schedule_id")
    op.drop_column("schedule", "failing_since")
