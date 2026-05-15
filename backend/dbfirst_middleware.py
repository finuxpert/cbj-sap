from __future__ import annotations

import os

from fastapi import Request
from fastapi.responses import JSONResponse

try:
    from .dbfirst_read_helpers import (
        _cbj_dbfirst_fetch_case_detail,
        _cbj_dbfirst_fetch_cases,
        _cbj_dbfirst_fetch_evidence_history,
        _cbj_dbfirst_runtime_enabled,
    )
except Exception:
    from dbfirst_read_helpers import (
        _cbj_dbfirst_fetch_case_detail,
        _cbj_dbfirst_fetch_cases,
        _cbj_dbfirst_fetch_evidence_history,
        _cbj_dbfirst_runtime_enabled,
    )


def _db_mode() -> str:
    return os.getenv("DB_MODE") or os.getenv("DATABASE_MODE") or "db"


def _strict_db_reads_enabled() -> bool:
    """Return true when DB-backed history must not fall back to legacy JSON files.

    Defaulting to strict mode prevents old QA/dummy JSON files under
    sap-data/cases from reappearing after PostgreSQL has been cleaned.
    Set SAP_RCA_STRICT_DB_READS=0 only for legacy recovery/debug sessions.
    """
    value = str(os.getenv("SAP_RCA_STRICT_DB_READS", "1")).strip().lower()
    return value not in {"0", "false", "no", "off"}


def _dbfirst_list_response(payload_key: str, rows: list[dict], fallback_reason: str = "") -> JSONResponse:
    body = {
        "ok": True,
        "read_source": "postgres",
        "mode": _db_mode(),
        "strict_db_reads": _strict_db_reads_enabled(),
        "count": len(rows),
        payload_key: rows,
    }

    # Backward-compatible aliases for older frontend panels.
    if payload_key == "cases":
        body["items"] = rows
    if fallback_reason:
        body["fallback_suppressed_reason"] = fallback_reason

    return JSONResponse(body)


async def dbfirst_read_middleware(request: Request, call_next):
    """Serve selected read endpoints from PostgreSQL first.

    DB is the Case History source of truth for UI/Grafana. Legacy file JSON is
    no longer used for these read paths when DB runtime is enabled.
    """
    path = request.url.path.rstrip("/") or "/"
    method = request.method.upper()

    if method != "GET" or not _cbj_dbfirst_runtime_enabled():
        return await call_next(request)

    # Nginx normally strips /sap-api, but this supports both internal/public path forms.
    normalized = path
    if normalized.startswith("/sap-api/"):
        normalized = normalized[len("/sap-api"):]
    normalized = normalized.rstrip("/") or "/"

    case_list_paths = {
        "/cases",
        "/case-history",
        "/history/cases",
        "/cases/history",
    }

    evidence_history_paths = {
        "/evidence-history",
        "/evidence/history",
        "/history/evidence",
    }

    strict_reads = _strict_db_reads_enabled()

    try:
        if normalized in case_list_paths:
            rows = _cbj_dbfirst_fetch_cases()
            if rows or strict_reads:
                return _dbfirst_list_response("cases", rows)

        if normalized in evidence_history_paths:
            rows = _cbj_dbfirst_fetch_evidence_history()
            if rows or strict_reads:
                return _dbfirst_list_response("evidence", rows)

        # DB-first single case detail: /cases/<id>
        if normalized.startswith("/cases/"):
            case_key = normalized.split("/cases/", 1)[1].strip("/")
            if case_key and "/" not in case_key:
                item = _cbj_dbfirst_fetch_case_detail(case_key)
                if item:
                    return JSONResponse({
                        "ok": True,
                        "read_source": "postgres",
                        "mode": _db_mode(),
                        "strict_db_reads": strict_reads,
                        "case": item,
                    })
                if strict_reads:
                    return JSONResponse({
                        "ok": False,
                        "read_source": "postgres",
                        "mode": _db_mode(),
                        "strict_db_reads": True,
                        "detail": "Case not found in PostgreSQL",
                    }, status_code=404)

    except Exception as exc:
        request.state.dbfirst_fallback_reason = str(exc)
        if strict_reads and normalized in case_list_paths:
            return _dbfirst_list_response("cases", [], fallback_reason=str(exc))
        if strict_reads and normalized in evidence_history_paths:
            return _dbfirst_list_response("evidence", [], fallback_reason=str(exc))
        return await call_next(request)

    return await call_next(request)
