from __future__ import annotations

import json
import os
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

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
    from .history_serializers import collect_file_parsed_results_history
except Exception:
    from history_serializers import collect_file_parsed_results_history

try:
    from .maintenance_helpers import cleanup_old_evidence_files
except Exception:
    from maintenance_helpers import cleanup_old_evidence_files

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
    """
    DB-first parsed result history.

    Safe behavior:
    - Reads PostgreSQL first when runtime DB is enabled.
    - Falls back to JSON/file-backed case parsed_results if DB read fails or DB is disabled.
    - Does not remove existing case JSON fallback.
    """
    ensure_dirs()
    limit = max(1, min(limit, 500))

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


@app.get("/mobile/cases")
def list_mobile_cases(limit: int = 50) -> dict:
    return list_cases(limit=limit)


@app.get("/mobile/cases/{case_id}")
def get_mobile_case(case_id: str) -> dict:
    case_data = read_case(case_id)
    return {"ok": True, "case": mobile_case_payload(case_data)}


@app.get("/mobile/cases/{case_id}/analytics")
def get_mobile_case_analytics(case_id: str) -> dict:
    case_data = read_case(case_id)
    return {"ok": True, "case_id": case_data.get("id") or case_data.get("case_no"), "analytics": mobile_case_payload(case_data).get("analytics")}


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
    ensure_dirs()
    original = safe_name(file.filename or "evidence.bin")
    ext = Path(original).suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")

    evidence_id = datetime.now().strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:8]
    stored_name = f"{evidence_id}__{original}"
    target = EVIDENCE_DIR / stored_name

    size = 0
    max_bytes = MAX_UPLOAD_MB * 1024 * 1024
    try:
        with target.open("wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > max_bytes:
                    out.close()
                    target.unlink(missing_ok=True)
                    raise HTTPException(status_code=413, detail=f"File too large. Max {MAX_UPLOAD_MB} MB")
                out.write(chunk)
    finally:
        await file.close()

    tag_list = [x.strip() for x in tags.split(",") if x.strip()]
    meta = {
        "id": evidence_id,
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "tool": tool or "unknown",
        "sid": sid or "",
        "title": title or original,
        "note": note or "",
        "tags": tag_list,
        "case_id": case_id or "",
        "original_filename": original,
        "stored_filename": stored_name,
        "stored_path": str(target),
        "size_bytes": size,
        "ext": ext,
        "download_url": f"/sap-api/evidence/{evidence_id}/download",
    }
    write_meta(evidence_id, meta)
    db_evidence_write = upsert_evidence_best_effort(meta)

    linked_case = None
    db_case_write = None
    if case_id:
        try:
            case_data = read_case(case_id)
            evidence_item = {
                "id": evidence_id,
                "tool": meta["tool"],
                "title": meta["title"],
                "original_filename": original,
                "size_bytes": size,
                "download_url": meta["download_url"],
                "created_at": meta["created_at"],
            }
            case_data.setdefault("evidence", []).append(evidence_item)
            case_data["updated_at"] = now_iso()
            write_case(case_data)
            db_case_write = upsert_case_best_effort(case_data)
            linked_case = summarize_case(case_data)
        except HTTPException:
            linked_case = {"warning": "case_id was provided but case was not found"}

    return {
        "ok": True,
        "evidence": meta,
        "case": linked_case,
        "db_write": {"evidence": db_evidence_write, "case": db_case_write},
    }


@app.get("/evidence")
def list_evidence(tool: str = "", sid: str = "", q: str = "", limit: int = 100) -> dict:
    ensure_dirs()
    items = collect_file_evidence(
        META_DIR,
        tool=tool,
        sid=sid,
        q=q,
        limit=limit,
    )
    return {"ok": True, "count": len(items), "items": items}


@app.get("/evidence/{evidence_id}")
def get_evidence(evidence_id: str) -> dict:
    return {"ok": True, "evidence": read_meta(evidence_id)}


@app.post("/evidence/{evidence_id}")
def update_evidence(evidence_id: str, patch: EvidenceUpdate) -> dict:
    meta = read_meta(evidence_id)
    data = patch.dict(exclude_unset=True)
    for k, v in data.items():
        if v is not None:
            meta[k] = v
    meta["updated_at"] = now_iso()
    write_meta(evidence_id, meta)
    db_write = upsert_evidence_best_effort(meta)
    return {"ok": True, "evidence": meta, "db_write": db_write}


@app.get("/evidence/{evidence_id}/download")
def download_evidence(evidence_id: str):
    meta = read_meta(evidence_id)
    f = EVIDENCE_DIR / meta["stored_filename"]
    if not f.exists():
        raise HTTPException(status_code=404, detail="Evidence file missing")
    return FileResponse(str(f), filename=meta.get("original_filename") or f.name)


@app.delete("/evidence/{evidence_id}")
def delete_evidence(evidence_id: str) -> dict:
    meta = read_meta(evidence_id)
    f = EVIDENCE_DIR / meta.get("stored_filename", "")
    if f.exists():
        f.unlink()
    (META_DIR / f"{evidence_id}.json").unlink(missing_ok=True)
    return {"ok": True, "deleted": evidence_id}


@app.post("/maintenance/cleanup")
def cleanup(days: int = 90) -> dict:
    ensure_dirs()
    deleted = cleanup_old_evidence_files(META_DIR, EVIDENCE_DIR, days=days)
    return {"ok": True, "deleted": deleted, "retention_days": days}


# === CBJ SAP RCA DB-FIRST READ PATCH V1 ===
# Incremental DB-first read layer.
# Helper/fetch implementation lives in backend/dbfirst_read_helpers.py.
# Existing JSON/file-backed fallback remains available.

try:
    from fastapi import Request
    from fastapi.responses import JSONResponse
except Exception:
    pass

try:
    from .dbfirst_read_helpers import (
        _cbj_dbfirst_runtime_enabled,
        _cbj_dbfirst_fetch_cases,
        _cbj_dbfirst_fetch_case_detail,
        _cbj_dbfirst_fetch_evidence_history,
        _cbj_dbfirst_fetch_parsed_results_history,
    )
except Exception:
    from dbfirst_read_helpers import (
        _cbj_dbfirst_runtime_enabled,
        _cbj_dbfirst_fetch_cases,
        _cbj_dbfirst_fetch_case_detail,
        _cbj_dbfirst_fetch_evidence_history,
        _cbj_dbfirst_fetch_parsed_results_history,
    )


@app.middleware("http")
async def _cbj_sap_rca_dbfirst_read_middleware(request: Request, call_next):
    path = request.url.path.rstrip("/") or "/"
    method = request.method.upper()

    if method != "GET" or not _cbj_dbfirst_runtime_enabled():
        return await call_next(request)

    # Nginx normally strips /sap-api, but this supports both internal/public path forms.
    normalized = path
    if normalized.startswith("/sap-api/"):
        normalized = normalized[len("/sap-api"):]
    normalized = normalized.rstrip("/") or "/"

    # DB-first list/history endpoints.
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

        # DB-first single case detail:
        # /cases/<id>
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
        # Existing JSON/file-backed route becomes fallback.
        request.state.dbfirst_fallback_reason = str(exc)
        return await call_next(request)

    # If DB empty/no match, keep existing JSON/file-backed behavior.
    return await call_next(request)
# === END CBJ SAP RCA DB-FIRST READ PATCH V1 ===


# === CBJ SAP RCA DB-FIRST EXPLICIT ROUTES V2 ===
# Explicit additive routes for endpoints that may not exist in legacy file-backed API.
# Existing fallback remains untouched.

@app.get("/evidence-history")
async def _cbj_dbfirst_evidence_history_route():
    if not _cbj_dbfirst_runtime_enabled():
        return JSONResponse(
            {
                "ok": False,
                "read_source": "file_fallback",
                "mode": os.getenv("DB_MODE") or os.getenv("DATABASE_MODE") or "unknown",
                "count": 0,
                "evidence": [],
                "warning": "database runtime not enabled/configured",
            },
            status_code=200,
        )

    try:
        rows = _cbj_dbfirst_fetch_evidence_history()
        return JSONResponse({
            "ok": True,
            "read_source": "postgres",
            "mode": os.getenv("DB_MODE") or os.getenv("DATABASE_MODE") or "hybrid",
            "count": len(rows),
            "evidence": rows,
        })
    except Exception as exc:
        return JSONResponse(
            {
                "ok": False,
                "read_source": "file_fallback",
                "mode": os.getenv("DB_MODE") or os.getenv("DATABASE_MODE") or "hybrid",
                "count": 0,
                "evidence": [],
                "fallback_reason": str(exc),
            },
            status_code=200,
        )


@app.get("/history/evidence")
async def _cbj_dbfirst_history_evidence_route():
    return await _cbj_dbfirst_evidence_history_route()


@app.get("/evidence/history")
async def _cbj_dbfirst_evidence_slash_history_route():
    return await _cbj_dbfirst_evidence_history_route()
# === END CBJ SAP RCA DB-FIRST EXPLICIT ROUTES V2 ===
