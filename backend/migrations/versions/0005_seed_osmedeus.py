"""seed engines and the Osmedeus workflow tool modules

One `engine` row per engine named in code (`runs_on` of a tool module) and one
`tool_module` row per tool module registered in code: docs/data/database.md,
section Migration. Engines start disabled with no address: a Superadmin sets
the connection on S16, S17. Timeouts stay under the 24-hour worker
`visibility_timeout`: docs/integrations/external-services.md.

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-13 09:00:00.000000+00:00

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0005"
down_revision: str | Sequence[str] | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ENGINES = ("osmedeus", "vigolium")
# name, max_concurrency, timeout_minutes
TOOL_MODULES = (
    ("osmedeus-domain-lite", 1, 240),
    ("osmedeus-general", 1, 720),
    ("osmedeus-domain-extensive", 1, 1200),
)


def upgrade() -> None:
    """Seed rows; existing rows keep the operator's values."""
    for name in ENGINES:
        op.execute(f"INSERT INTO engine (name) VALUES ('{name}') ON CONFLICT (name) DO NOTHING")  # noqa: S608  constants above
    for name, concurrency, timeout in TOOL_MODULES:
        op.execute(
            "INSERT INTO tool_module (name, max_concurrency, timeout_minutes) "  # noqa: S608  constants above
            f"VALUES ('{name}', {concurrency}, {timeout}) ON CONFLICT (name) DO NOTHING"
        )


def downgrade() -> None:
    names = ", ".join(f"'{name}'" for name, _, _ in TOOL_MODULES)
    op.execute(f"DELETE FROM tool_module WHERE name IN ({names})")  # noqa: S608  constants above
    engines = ", ".join(f"'{name}'" for name in ENGINES)
    op.execute(f"DELETE FROM engine WHERE name IN ({engines})")  # noqa: S608  constants above
