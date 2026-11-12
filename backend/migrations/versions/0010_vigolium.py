"""seed the vigolium tool module

One `tool_module` row per tool module registered in code: docs/data/database.md,
section Migration. The `vigolium` engine row comes from 0005. One slot: the
engine runs one scan at a time and answers 409 to a second one. The time limit
stays under the 24-hour worker `visibility_timeout`:
docs/integrations/external-services.md.

Revision ID: 0010
Revises: 0006
Create Date: 2026-11-13 12:00:00.000000+00:00

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0010"
down_revision: str | Sequence[str] | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Seed the row; an existing row keeps the operator's values."""
    op.execute(
        "INSERT INTO tool_module (name, max_concurrency, timeout_minutes) "
        "VALUES ('vigolium', 1, 480) ON CONFLICT (name) DO NOTHING"
    )


def downgrade() -> None:
    op.execute("DELETE FROM tool_module WHERE name = 'vigolium'")
