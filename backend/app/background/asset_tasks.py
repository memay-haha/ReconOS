"""Task of the asset module: re-mark `in_scope` after a scope rule changed.

Sent by the scope module by name, so scope never imports asset:
docs/architecture/dependency-graph.md. Idempotent: running it twice gives the
same marks, so a duplicate delivery is harmless.
"""

import uuid

from app.asset import service as asset_service
from app.background.celery_app import app
from app.background.runtime import run_in_session
from app.core.tasks import PARSE_QUEUE, RECOMPUTE_IN_SCOPE_TASK


def _recompute_in_scope(program_id: str) -> None:
    target = uuid.UUID(program_id)
    run_in_session(
        lambda session: asset_service.recompute_in_scope(session, target),
        program_id=program_id,
    )


recompute_in_scope = app.task(name=RECOMPUTE_IN_SCOPE_TASK, queue=PARSE_QUEUE)(_recompute_in_scope)
