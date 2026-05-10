from __future__ import annotations

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

try:
    from .history_serializers import collect_file_parsed_results_history
except Exception:
    from history_serializers import collect_file_parsed_results_history

try:
    from .storage_config import CASE_DIR
except Exception:
    from storage_config import CASE_DIR


def list_parsed_results_history_dbfirst(case_id: str = "", tool: str = "", limit: int = 100) -> dict:
    """
    DB-first parsed result history service.

    Safe behavior:
    - Reads PostgreSQL first when runtime DB is enabled.
    - Falls back to JSON/file-backed case parsed_results if DB read fails or DB is disabled.
    - Preserves the existing /parsed-results-history response contract.
    """
    limit = max(1, min(int(limit or 100), 500))

    if _cbj_dbfirst_runtime_enabled():
        try:
            rows = _cbj_dbfirst_fetch_parsed_results_history(
                case_id=case_id,
                tool=tool,
                limit=limit,
            )
            return {
                "ok": True,
                "read_source": "postgres",
                "mode": "hybrid",
                "count": len(rows),
                "parsed_results": rows,
                "fallback_reason": None,
            }
        except Exception as exc:
            fallback_reason = str(exc)
    else:
        fallback_reason = "database_disabled"

    rows = collect_file_parsed_results_history(
        CASE_DIR,
        case_id=case_id,
        tool=tool,
        limit=limit,
    )

    return {
        "ok": True,
        "read_source": "file",
        "mode": "hybrid",
        "count": len(rows),
        "parsed_results": rows,
        "fallback_reason": fallback_reason,
    }
