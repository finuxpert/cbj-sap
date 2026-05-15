from __future__ import annotations

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

try:
    from .case_service import (
        create_case_item,
        delete_case_item,
        get_case_item,
        list_case_items,
        update_case_item,
    )
except Exception:
    from case_service import (
        create_case_item,
        delete_case_item,
        get_case_item,
        list_case_items,
        update_case_item,
    )

try:
    from .correlation_service import correlate_case
except Exception:
    from correlation_service import correlate_case

try:
    from .session_service import get_session_item
except Exception:
    from session_service import get_session_item

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
    from .parsed_result_service import add_case_parsed_result
except Exception:
    from parsed_result_service import add_case_parsed_result

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
    from .storage_config import APP_NAME, EVIDENCE_DIR, MAX_UPLOAD_MB, META_DIR, STORAGE_ROOT
except Exception:
    from storage_config import APP_NAME, EVIDENCE_DIR, MAX_UPLOAD_MB, META_DIR, STORAGE_ROOT

try:
    from .storage_helpers import ensure_dirs
except Exception:
    from storage_helpers import ensure_dirs

try:
    from .db.session import check_database
except Exception:
    try:
        from db.session import check_database
    except Exception:
        def check_database() -> dict:
            return {"enabled": False, "configured": False, "status": "unavailable"}


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
    db_ready = db_status.get("enabled") and db_status.get("status") == "ok"
    case_history = "db" if db_ready else "db-unavailable"
    return {
        "status": "ok" if db_ready else "degraded",
        "service": APP_NAME,
        "storage_root": str(STORAGE_ROOT),
        "max_upload_mb": MAX_UPLOAD_MB,
        "case_history": case_history,
        "case_history_source_of_truth": "postgres",
        "file_storage_role": "binary-evidence-only",
        "analytics": "enabled",
        "database": db_status,
    }


@app.post("/cases")
def create_case(payload: CaseCreate) -> dict:
    return create_case_item(payload)


@app.get("/cases")
def list_cases(q: str = "", sid: str = "", severity: str = "", status: str = "", limit: int = 100) -> dict:
    return list_case_items(q=q, sid=sid, severity=severity, status=status, limit=limit)


@app.get("/cases/{case_id}")
def get_case(case_id: str) -> dict:
    return get_case_item(case_id)


@app.get("/cases/{case_id}/correlation")
def get_case_correlation(case_id: str) -> dict:
    case_response = get_case_item(case_id)
    case_data = case_response.get("case", {})
    return {
        "ok": True,
        "case_id": case_id,
        "correlation": correlate_case(case_data if isinstance(case_data, dict) else {}),
    }


@app.get("/cases/{case_id}/session")
def get_case_session(case_id: str) -> dict:
    case_response = get_case_item(case_id)
    case_data = case_response.get("case", {})
    return get_session_item(case_data if isinstance(case_data, dict) else {})


@app.patch("/cases/{case_id}")
def update_case(case_id: str, patch: CaseUpdate) -> dict:
    return update_case_item(case_id, patch)


@app.delete("/cases/{case_id}")
def delete_case(case_id: str) -> dict:
    return delete_case_item(case_id)


@app.post("/cases/{case_id}/parsed-results")
def add_parsed_result(case_id: str, payload: ParsedResultCreate) -> dict:
    return add_case_parsed_result(case_id, payload)


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


@app.delete("/evidence/{evidence_id}")
def delete_evidence(evidence_id: str) -> dict:
    return delete_evidence_item(evidence_id)


@app.get("/evidence/{evidence_id}/download")
def download_evidence(evidence_id: str):
    return get_evidence_download_response(evidence_id)


@app.get("/evidence-history")
def list_evidence_history(case_id: str = "", tool: str = "", limit: int = 100) -> dict:
    return list_evidence_history_dbfirst(
        case_id=case_id,
        tool=tool,
        limit=limit,
    )


@app.post("/maintenance/cleanup")
def cleanup(days: int = 90) -> dict:
    deleted = cleanup_old_evidence_files(META_DIR, EVIDENCE_DIR, days=days)
    return {"ok": True, "deleted": deleted, "days": days}


@app.get("/")
def root() -> dict:
    return health()
