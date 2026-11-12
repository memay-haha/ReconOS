"""Model registry for Alembic autogenerate.

Every module imports its models here so `alembic revision --autogenerate` sees
the full schema: docs/data/database.md.
"""

from app.core.audit import AuditLog
from app.core.db import Base
from app.core.identity import User, UserSession
from app.core.system_setting import SystemSetting
from app.job.models import Job
from app.program.models import Program, ProgramUser, Proxy
from app.raw_output.models import RawOutput
from app.scope.models import ScopeRule
from app.tool_module.models import ToolModule
from app.user.models import LoginAttempt, Worker, WorkerToken

__all__ = [
    "AuditLog",
    "Base",
    "Job",
    "LoginAttempt",
    "Program",
    "ProgramUser",
    "Proxy",
    "RawOutput",
    "ScopeRule",
    "SystemSetting",
    "ToolModule",
    "User",
    "UserSession",
    "Worker",
    "WorkerToken",
]
