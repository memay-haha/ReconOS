"""Model registry for Alembic autogenerate.

Every module imports its models here so `alembic revision --autogenerate` sees
the full schema: docs/data/database.md.
"""

from app.audit_log.models import AuditLog
from app.core.db import Base
from app.core.identity import User, UserSession
from app.core.system_setting import SystemSetting
from app.user.models import LoginAttempt

__all__ = ["AuditLog", "Base", "LoginAttempt", "SystemSetting", "User", "UserSession"]
