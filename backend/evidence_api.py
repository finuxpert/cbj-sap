from __future__ import annotations

import json
import os
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

try:
    from .case_helpers import make_case_no, mobile_case_payload, summarize_case
except Exception:
    from case_helpers import make_case_no, mobile_case_payload, summarize_case

try:
    from .evidence_helpers import collect_file_evidence
except Exception:
    from evidence_helpers import collect_file_evidence

try:
    from .external_models import CaseCreate, CaseUpdate, EvidenceUpdate, ParsedResultCreate
except Exception:
    from external_models import CaseCreate, CaseUpdate, EvidenceUpdate, ParsedResultCreate

try:
    from .evidence_upload_service import handle_upload_evidence
except Exception:
    from evidence_upload_service import handle_upload_evidence

try:
    from .evidence_history_service import (
        get_evidence_item,
        list_evidence_history_dbfirst,
        list_evidence_items,
    )
except Exception:
    from evidence_history_service import (
        get_evidence_item,
        list_evidence_history_dbfirst,
        list_evidence_items,
    )

try:
    from .evidence_mutation_service import (
        delete_evidence_item,
        get_evidence_download_response,
        update_evidence_item,
    )
except Exception:
    from evidence_mutation_service import (
        delete_evidence_item,
        get_evidence_download_response,
        update_evidence_item,
    )

try:
    from .parsed_results_history_service import list_parsed_results_history_dbfirst
except Exception:
    from parsed_results_history_service import list_parsed_results_history_dbfirst

try:
    from .mobile_case_service import (
        get_mobile_case_analytics_item,
        get_mobile_case_item,
        list_mobile_case_items,
    )
except Exception:
    from mobile_case_service import (
        get_mobile_case_analytics_item,
        get_mobile_case_item,
        list_mobile_case_items,
    )

try:
    from .maintenance_helpers import cleanup_old_evidence_files
except Exception:
    from maintenance_helpers import cleanup_old_evidence_files

try:
    from .dbfirst_middleware import dbfirst_read_middleware
except Exception:
    from dbfirst_middleware import dbfirst_read_middleware

try:
    from .storage_config import APP_NAME, ALLOWED_EXT, CASE_DIR, EVIDENCE_DIR, MAX_UPLOAD_MB, META_DIR, STORAGE_ROOT
except Exception:
    from storage_config import APP_NAME, ALLOWED_EXT, CASE_DIR, EVIDENCE_DIR, MAX_UPLOAD_MB, META_DIR, STORAGE_ROOT

try:
    from .storage_helpers import (
        case_path,
        ensure_dirs,
        now_iso,
        read_case,
        read_meta,
        safe_case_id,
        safe_name,
        write_case,
        write_meta,
    )
except Exception:
    from storage_helpers import (
        case_path,
        ensure_dirs,
        now_iso,
        read_case,
        read_meta,
        safe_case_id,
        safe_name,
        write_case,
        write_meta,
    )

try:
    from .db.session import check_database
except Exception:
    try:
        from db.session import check_database
    except Exception:
        def check_database() -> dict:
            return {"enabled": False, "configured": False, "status": "unavailable"}

try:
    from .db.repositories import (
        insert_parsed_result_best_effort,
        upsert_case_best_effort,
        upsert_evidence_best_effort,
    )
except Exception:
    try:
        from db.repositories import (
            insert_parsed_result_best_effort,
            upsert_case_best_effort,
            upsert_evidence_best_effort,
        )
    except Exception:
        def upsert_case_best_effort(case_data: dict) -> dict:
            return {"enabled": False, "written": False, "status": "unavailable"}

        def upsert_evidence_best_effort(meta: dict) -> dict:
            return {"enabled": False, "written": False, "status": "unavailable"}

        def insert_parsed_result_best_effort(case_id: str, result: dict) -> dict:
            return {"enabled": False, "written": False, "status": "unavailable"}


app = FastAPI(title=APP_NAME, version="1.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
)

app.middleware("http")(dbfirst_read_middleware)


@app.on_event("startup")
def startup() -> None:
    ensure_dirs()


@app.get("/health")
def health() -> dict:
    ensure_dirs()
    db_status = check_database()
    case_history = "hybrid" if db_status.get("enabled") and db_status.get("status") == "ok" else "file-backed"
    return {
        "status": "ok",
        "service": APP_NAME,
        "storage_root": str(STORAGE_ROOT),
        "max_upload_mb": MAX_UPLOAD_MB,
        "case_history": case_history,
        "analytics": "enabled",
        "database": db_status,
    }


@app.post("/cases")
def create_case(payload: CaseCreate) -> dict:
    ensure_dirs()
    case_no = make_case_no()
    data = {
        "id": case_no,
        "case_no": case_no,
        "title": payload.title.strip() or case_no,
        "sid": payload.sid or "",
        "environment": payload.environment or "",
        "severity": (payload.severity or "INFO").upper(),
        "status": (payload.status or "OPEN").upper(),
        "summary": payload.summary or "",
        "top_anomaly": payload.top_anomaly or "",
        "top_suspect": payload.top_suspect or "",
        "created_by": payload.created_by or "",
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "evidence": [],
        "parsed_results": [],
        "reports": [],
        "timeline": [],
    }
    write_case(data)
    db_write = upsert_case_best_effort(data)
    return {"ok": True, "case": data, "db_write": db_write}


@app.get("/cases")
def list_cases(q: str = "", sid: str = "", severity: str = "", status: str = "", limit: int = 100) -> dict:
    ensure_dirs()
    limit = max(1, min(limit, 500))
    items = []
    for p in sorted(CASE_DIR.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True):
        try:
            case_data = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        item = summarize_case(case_data)
        if sid and str(item.get("sid", "")).lower() != sid.lower():
            continue
        if severity and str(item.get("severity", "")).lower() != severity.lower():
            continue
        if status and str(item.get("status", "")).lower() != status.lower():
            continue
        if q:
            hay = " ".join(str(item.get(k, "")) for k in ["case_no", "title", "summary", "top_anomaly", "top_suspect", "sid", "tool"])
            if q.lower() not in hay.lower():
                continue
        items.append(item)
        if len(items) >= limit:
            break
    return {"ok": True, "count": len(items), "items": items}


@app.get("/cases/{case_id}")
def get_case(case_id: str) -> dict:
    return {"ok": True, "case": read_case(case_id)}


@app.patch("/cases/{case_id}")
def update_case(case_id: str, patch: CaseUpdate) -> dict:
    case_data = read_case(case_id)
    data = patch.dict(exclude_unset=True)
    for key, value in data.items():
        if value is not None:
            case_data[key] = value.upper() if key in {"severity", "status"} else value
    case_data["updated_at"] = now_iso()
    write_case(case_data)
    db_write = upsert_case_best_effort(case_data)
    return {"ok": True, "case": case_data, "db_write": db_write}


@app.delete("/cases/{case_id}")
def delete_case(case_id: str) -> dict:
    p = case_path(case_id)
    if not p.exists():
        raise HTTPException(status_code=404, detail="Case not found")
    deleted_id = safe_case_id(case_id)
    p.unlink(missing_ok=True)
    return {"ok": True, "deleted": deleted_id}


@app.post("/cases/{case_id}/parsed-results")
def add_parsed_result(case_id: str, payload: ParsedResultCreate) -> dict:
    case_data = read_case(case_id)
    result = {
        "id": uuid.uuid4().hex,
        "created_at": now_iso(),
        "tool": payload.tool,
        "verdict": payload.verdict or "",
        "severity": (payload.severity or "INFO").upper(),
        "confidence": payload.confidence or 0,
        "top_anomaly": payload.top_anomaly or "",
        "top_suspect": payload.top_suspect or "",
        "summary": payload.summary or "",
        "result_json": payload.result_json or {},
    }
    case_data.setdefault("parsed_results", []).append(result)
    if result["severity"] in {"WARN", "CRIT"}:
        case_data["severity"] = result["severity"]
    if result["summary"]:
        case_data["summary"] = result["summary"]
    if result["top_anomaly"]:
        case_data["top_anomaly"] = result["top_anomaly"]
    if result["top_suspect"]:
        case_data["top_suspect"] = result["top_suspect"]
    case_data.setdefault("timeline", []).append({
        "id": result["id"],
        "time": result["created_at"],
        "severity": result["severity"],
        "title": result["top_anomaly"] or f"{result['tool']} parsed result saved",
        "description": result["summary"],
        "tool": result["tool"],
    })
    case_data["updated_at"] = now_iso()
    write_case(case_data)
    db_case_write = upsert_case_best_effort(case_data)
    db_result_write = insert_parsed_result_best_effort(case_data.get("id") or case_id, result)
    return {
        "ok": True,
        "result": result,
        "case": summarize_case(case_data),
        "analytics": mobile_case_payload(case_data).get("analytics"),
        "db_write": {"case": db_case_write, "parsed_result": db_result_write},
    }


@app.get("/parsed-results-history")
def list_parsed_results_history(case_id: str = "", tool: str = "", limit: int = 100) -> dict:
    return list_parsed_results_history_dbfirst(
        case_id=case_id,
        tool=tool,
        limit=limit,
    )


@app.get("/mobile/cases")
def list_mobile_cases(limit: int = 50) -> dict:
    return list_mobile_case_items(limit=limit)


@app.get("/mobile/cases/{case_id}")
def get_mobile_case(case_id: str) -> dict:
    return get_mobile_case_item(case_id)


@app.get("/mobile/cases/{case_id}/analytics")
def get_mobile_case_analytics(case_id: str) -> dict:
    return get_mobile_case_analytics_item(case_id)


@app.post("/upload")
async def upload_evidence(
    file: UploadFile = File(...),
    tool: str = Form("unknown"),
    sid: str = Form(""),
    title: str = Form(""),
    note: str = Form(""),
    tags: str = Form(""),
    case_id: str = Form(""),
) -> dict:
    return await handle_upload_evidence(
        file=file,
        tool=tool,
        sid=sid,
        title=title,
        note=note,
        tags=tags,
        case_id=case_id,
    )


@app.get("/evidence")
def list_evidence(tool: str = "", sid: str = "", q: str = "", limit: int = 100) -> dict:
    ensure_dirs()
    return list_evidence_items(tool=tool, sid=sid, q=q, limit=limit)


@app.get("/evidence/{evidence_id}")
def get_evidence(evidence_id: str) -> dict:
    return get_evidence_item(evidence_id)


@app.post("/evidence/{evidence_id}")
def update_evidence(evidence_id: str, patch: EvidenceUpdate) -> dict:
    return update_evidence_item(evidence_id, patch)


@app.get("/evidence/{evidence_id}/download")
def download_evidence(evidence_id: str):
    return get_evidence_download_response(evidence_id)


@app.delete("/evidence/{evidence_id}")
def delete_evidence(evidence_id: str) -> dict:
    return delete_evidence_item(evidence_id)


@app.post("/maintenance/cleanup")
def cleanup(days: int = 90) -> dict:
    ensure_dirs()
    deleted = cleanup_old_evidence_files(META_DIR, EVIDENCE_DIR, days=days)
    return {"ok": True, "deleted": deleted, "retention_days": days}


# === CBJ SAP RCA DB-FIRST EXPLICIT ROUTES V2 ===
# Explicit additive routes for endpoints that may not exist in legacy file-backed API.
# Existing fallback remains untouched.

@app.get("/evidence-history")
async def _cbj_dbfirst_evidence_history_route():
    return JSONResponse(list_evidence_history_dbfirst(), status_code=200)


@app.get("/history/evidence")
async def _cbj_dbfirst_history_evidence_route():
    return JSONResponse(list_evidence_history_dbfirst(), status_code=200)


@app.get("/evidence/history")
async def _cbj_dbfirst_evidence_slash_history_route():
    return JSONResponse(list_evidence_history_dbfirst(), status_code=200)
# === END CBJ SAP RCA DB-FIRST EXPLICIT ROUTES V2 ===
