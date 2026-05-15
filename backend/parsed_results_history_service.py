from __future__ import annotations

import os

try:
    from .dbfirst_read_helpers import (
        _cbj_dbfirst_fetch_parsed_results_history,
        _cbj_dbfirst_runtime_enabled,
    )
except Exception:
    from dbfirst_read_helpers import (
        _cbj_dbfirst_fetch_parsed_results_history,
        _cbj_dbfirst_runtime_enabled,
    )


def _db_mode() -> str:
    return os.getenv("DB_MODE") or os.getenv("DATABASE_MODE") or "db"


def list_parsed_results_history_dbfirst(case_id: str = "", tool: str = "", limit: int = 100) -> dict:
    """Return parsed result history from PostgreSQL only when DB runtime is enabled.

    Full-DB mode uses PostgreSQL as the Case History source of truth so Grafana,
    UI, and API reads see the same data. Legacy JSON case files are intentionally
    not read here anymore when DB runtime is configured.
    """
    limit = max(1, min(int(limit or 100), 500))
    mode = _db_mode()

    if not _cbj_dbfirst_runtime_enabled():
        return {
            "ok": False,
            "read_source": "postgres",
            "mode": mode,
            "count": 0,
            "parsed_results": [],
            "detail": "Database runtime not enabled/configured; parsed results history is DB-only.",
        }

    try:
        rows = _cbj_dbfirst_fetch_parsed_results_history(
            case_id=case_id,
            tool=tool,
            limit=limit,
        )
        return {
            "ok": True,
            "read_source": "postgres",
            "mode": mode,
            "count": len(rows),
            "parsed_results": rows,
            "fallback_reason": None,
        }
    except Exception as exc:
        return {
            "ok": False,
            "read_source": "postgres",
            "mode": mode,
            "count": 0,
            "parsed_results": [],
            "fallback_reason": str(exc),
        }
