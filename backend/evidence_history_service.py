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
    return os.getenv("DB_MODE") or os.getenv("DATABASE_MODE") or "hybrid"


def list_evidence_items(
    *,
    tool: str = "",
    sid: str = "",
    q: str = "",
    limit: int = 100,
) -> dict[str, Any]:
    """Return legacy /evidence response shape from file-backed metadata.

    This service is intentionally thin for Phase 1 hybrid safety:
    - preserves the existing JSON/file-backed behavior,
    - keeps response shape stable,
    - creates a future seam for DB-first evidence history reads.
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
    """Return legacy /evidence/{id} response shape."""
    return {"ok": True, "evidence": read_meta(evidence_id)}


def list_evidence_history_dbfirst() -> dict[str, Any]:
    """Return DB-first evidence history response used by compatibility routes.

    Response shape intentionally mirrors the previous explicit route behavior:
    - success: ok=true, read_source=postgres, mode, count, evidence
    - fallback/warning: ok=false, read_source=file_fallback, mode, count=0, evidence=[]
    """
    mode = _db_mode()

    if not _cbj_dbfirst_runtime_enabled():
        return {
            "ok": False,
            "read_source": "file_fallback",
            "mode": mode if mode else "unknown",
            "count": 0,
            "evidence": [],
            "warning": "database runtime not enabled/configured",
        }

    try:
        rows = _cbj_dbfirst_fetch_evidence_history()
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
            "read_source": "file_fallback",
            "mode": mode,
            "count": 0,
            "evidence": [],
            "fallback_reason": str(exc),
        }
