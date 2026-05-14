from __future__ import annotations

from typing import Any

from fastapi import HTTPException

try:
    from .case_helpers import mobile_case_payload
except Exception:
    from case_helpers import mobile_case_payload

try:
    from .case_service import list_case_items
except Exception:
    from case_service import list_case_items

try:
    from .storage_helpers import read_case
except Exception:
    from storage_helpers import read_case

try:
    from .dbfirst_read_helpers import (
        _cbj_dbfirst_fetch_case_detail,
        _cbj_dbfirst_fetch_cases,
        _cbj_dbfirst_runtime_enabled,
    )
except Exception:
    from dbfirst_read_helpers import (
        _cbj_dbfirst_fetch_case_detail,
        _cbj_dbfirst_fetch_cases,
        _cbj_dbfirst_runtime_enabled,
    )

try:
    from .dbfirst_middleware import _strict_db_reads_enabled
except Exception:
    from dbfirst_middleware import _strict_db_reads_enabled


def _mobile_list_payload(rows: list[dict], limit: int) -> dict[str, Any]:
    items = rows[: max(1, min(int(limit or 50), 500))]
    return {
        "ok": True,
        "read_source": "postgres",
        "strict_db_reads": _strict_db_reads_enabled(),
        "count": len(items),
        "items": items,
        "cases": items,
    }


def list_mobile_case_items(limit: int = 50) -> dict[str, Any]:
    """Return case list for mobile/history panels using PostgreSQL first.

    This prevents old legacy JSON files under sap-data/cases from leaking back
    into the UI after PostgreSQL and Grafana have been cleaned.
    """
    if _cbj_dbfirst_runtime_enabled():
        try:
            rows = _cbj_dbfirst_fetch_cases(limit=limit)
            if rows or _strict_db_reads_enabled():
                return _mobile_list_payload(rows, limit)
        except Exception as exc:
            if _strict_db_reads_enabled():
                return {
                    "ok": True,
                    "read_source": "postgres",
                    "strict_db_reads": True,
                    "count": 0,
                    "items": [],
                    "cases": [],
                    "fallback_suppressed_reason": str(exc),
                }

    return list_case_items(limit=limit)


def get_mobile_case_item(case_id: str) -> dict[str, Any]:
    """Return the mobile-shaped case payload without falling back in strict DB mode."""
    if _cbj_dbfirst_runtime_enabled():
        try:
            case_data = _cbj_dbfirst_fetch_case_detail(case_id)
            if case_data:
                return {"ok": True, "read_source": "postgres", "case": mobile_case_payload(case_data)}
            if _strict_db_reads_enabled():
                raise HTTPException(status_code=404, detail="Case not found in PostgreSQL")
        except HTTPException:
            raise
        except Exception as exc:
            if _strict_db_reads_enabled():
                raise HTTPException(status_code=503, detail=f"DB-first mobile case read failed: {exc}")

    case_data = read_case(case_id)
    return {"ok": True, "read_source": "file", "case": mobile_case_payload(case_data)}


def get_mobile_case_analytics_item(case_id: str) -> dict[str, Any]:
    """Return mobile analytics for a case with DB-first behavior."""
    response = get_mobile_case_item(case_id)
    case_data = response.get("case", {})
    return {
        "ok": True,
        "read_source": response.get("read_source", "unknown"),
        "case_id": case_data.get("id") or case_data.get("case_no") or case_id,
        "analytics": mobile_case_payload(case_data).get("analytics"),
    }
