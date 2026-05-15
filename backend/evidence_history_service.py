from __future__ import annotations

import os
from typing import Any

try:
    from .evidence_helpers import collect_file_evidence
except Exception:
    from evidence_helpers import collect_file_evidence

try:
    from .storage_config import META_DIR
except Exception:
    from storage_config import META_DIR

try:
    from .storage_helpers import read_meta
except Exception:
    from storage_helpers import read_meta

try:
    from .dbfirst_read_helpers import (
        _cbj_dbfirst_fetch_evidence_history,
        _cbj_dbfirst_runtime_enabled,
    )
except Exception:
    from dbfirst_read_helpers import (
        _cbj_dbfirst_fetch_evidence_history,
        _cbj_dbfirst_runtime_enabled,
    )


def _db_mode() -> str:
    return os.getenv("DB_MODE") or os.getenv("DATABASE_MODE") or "db"


def list_evidence_items(
    *,
    tool: str = "",
    sid: str = "",
    q: str = "",
    limit: int = 100,
) -> dict[str, Any]:
    """Return /evidence list.

    This legacy route remains file-backed for raw local metadata browsing. Case
    History and Grafana should use /evidence-history, which is DB-only when DB is
    enabled.
    """
    items = collect_file_evidence(
        META_DIR,
        tool=tool,
        sid=sid,
        q=q,
        limit=limit,
    )
    return {"ok": True, "count": len(items), "items": items}


def get_evidence_item(evidence_id: str) -> dict[str, Any]:
    """Return legacy /evidence/{id} response shape for raw file metadata lookup."""
    return {"ok": True, "evidence": read_meta(evidence_id)}


def list_evidence_history_dbfirst(*, case_id: str = "", tool: str = "", limit: int = 100) -> dict[str, Any]:
    """Return DB-only evidence history for Case History/Grafana consistency."""
    mode = _db_mode()

    if not _cbj_dbfirst_runtime_enabled():
        return {
            "ok": False,
            "read_source": "postgres",
            "mode": mode if mode else "unknown",
            "count": 0,
            "evidence": [],
            "detail": "Database runtime not enabled/configured; evidence history is DB-only.",
        }

    try:
        rows = _cbj_dbfirst_fetch_evidence_history(
            case_id=case_id,
            tool=tool,
            limit=limit,
        )
        return {
            "ok": True,
            "read_source": "postgres",
            "mode": mode,
            "count": len(rows),
            "evidence": rows,
        }
    except Exception as exc:
        return {
            "ok": False,
            "read_source": "postgres",
            "mode": mode,
            "count": 0,
            "evidence": [],
            "fallback_reason": str(exc),
        }
