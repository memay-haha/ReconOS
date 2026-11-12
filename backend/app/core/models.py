"""Model registry for Alembic autogenerate.

Every module imports its models here so `alembic revision --autogenerate` sees
the full schema: docs/data/database.md.
"""

from app.asset.models import (
    AssetEvent,
    Domain,
    DomainIp,
    Ip,
    Service,
    Technology,
    Url,
    UrlTechnology,
)
from app.core.audit import AuditLog
from app.core.db import Base
from app.core.identity import User, UserSession
from app.core.system_setting import SystemSetting
from app.engine.models import Engine, EngineVariable
from app.job.models import Job
from app.program.models import Program, ProgramUser, Proxy
from app.raw_output.models import RawOutput
from app.scope.models import ScopeRule
from app.tag.models import AssetTag, Tag
from app.tool_module.models import ToolModule
from app.user.models import LoginAttempt, Worker, WorkerToken

__all__ = [
    "AssetEvent",
    "AssetTag",
    "AuditLog",
    "Base",
    "Domain",
    "DomainIp",
    "Engine",
    "EngineVariable",
    "Ip",
    "Job",
    "LoginAttempt",
    "Program",
    "ProgramUser",
    "Proxy",
    "RawOutput",
    "ScopeRule",
    "Service",
    "SystemSetting",
    "Tag",
    "Technology",
    "ToolModule",
    "Url",
    "UrlTechnology",
    "User",
    "UserSession",
    "Worker",
    "WorkerToken",
]
