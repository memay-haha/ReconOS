"""Model registry for Alembic autogenerate.

Every module imports its models here so `alembic revision --autogenerate` sees
the full schema: docs/data/database.md.
"""

from app.alert.models import Alert, AlertRead
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
from app.dashboard.models import DiagnosticRun
from app.engine.models import Engine, EngineVariable
from app.finding.models import Finding
from app.job.models import Job
from app.program.models import Program, ProgramUser, Proxy
from app.raw_output.models import RawOutput
from app.report.models import Report, ReportFinding
from app.schedule.models import Schedule
from app.scope.models import ScopeRule
from app.screenshot.models import Screenshot
from app.tag.models import AssetTag, FindingTag, Tag
from app.tool_module.models import ToolModule
from app.user.models import LoginAttempt, Worker, WorkerToken

__all__ = [
    "Alert",
    "AlertRead",
    "AssetEvent",
    "AssetTag",
    "AuditLog",
    "Base",
    "DiagnosticRun",
    "Domain",
    "DomainIp",
    "Engine",
    "EngineVariable",
    "Finding",
    "FindingTag",
    "Ip",
    "Job",
    "LoginAttempt",
    "Program",
    "ProgramUser",
    "Proxy",
    "RawOutput",
    "Report",
    "ReportFinding",
    "Schedule",
    "ScopeRule",
    "Screenshot",
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
