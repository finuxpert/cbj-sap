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


async def dbfirst_read_middleware(request: Request, call_next):
    """Serve selected read endpoints from PostgreSQL first, then fall back to legacy routes.

    This keeps the existing hybrid contract intact:
    - only GET requests are intercepted
    - DB runtime must be enabled
    - empty/missing DB rows fall through to file-backed routes
    - DB exceptions fall through to file-backed routes and store a fallback reason
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

    try:
        if normalized in case_list_paths:
            rows = _cbj_dbfirst_fetch_cases()
            if rows:
                return JSONResponse({
                    "ok": True,
                    "read_source": "postgres",
                    "mode": os.getenv("DB_MODE", "hybrid"),
                    "count": len(rows),
                    "cases": rows,
                })

        if normalized in evidence_history_paths:
            rows = _cbj_dbfirst_fetch_evidence_history()
            if rows:
                return JSONResponse({
                    "ok": True,
                    "read_source": "postgres",
                    "mode": os.getenv("DB_MODE", "hybrid"),
                    "count": len(rows),
                    "evidence": rows,
                })

        # DB-first single case detail: /cases/<id>
        if normalized.startswith("/cases/"):
            case_key = normalized.split("/cases/", 1)[1].strip("/")
            if case_key and "/" not in case_key:
                item = _cbj_dbfirst_fetch_case_detail(case_key)
                if item:
                    return JSONResponse({
                        "ok": True,
                        "read_source": "postgres",
                        "mode": os.getenv("DB_MODE", "hybrid"),
                        "case": item,
                    })

    except Exception as exc:
        request.state.dbfirst_fallback_reason = str(exc)
        return await call_next(request)

    return await call_next(request)
