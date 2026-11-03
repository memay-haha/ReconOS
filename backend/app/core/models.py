"""Model registry for Alembic autogenerate.

Every module imports its models here so `alembic revision --autogenerate` sees
the full schema: docs/data/database.md. Modules arrive from batch 2 onward.
"""

from app.core.db import Base

__all__ = ["Base"]
