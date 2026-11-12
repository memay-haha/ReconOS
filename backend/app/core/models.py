"""Model registry for Alembic autogenerate.

Every module imports its models here so `alembic revision --autogenerate` sees
the full schema: docs/data/database.md.
"""

from app.core.audit import AuditLog
from app.core.db import Base
from app.core.identity import User, UserSession
from app.core.system_setting import SystemSetting
from app.program.models import Program, ProgramUser, Proxy
from app.scope.models import ScopeRule
from app.user.models import LoginAttempt

__all__ = [
    "AuditLog",
    "Base",
    "LoginAttempt",
    "Program",
    "ProgramUser",
    "Proxy",
    "ScopeRule",
    "SystemSetting",
    "User",
    "UserSession",
]
