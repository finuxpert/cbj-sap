from __future__ import annotations

import json
import os
import re
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

try:
    from .case_analytics import build_case_analytics
except Exception:
    from case_analytics import build_case_analytics

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

APP_NAME = "SAP Intelligent RCA Evidence API"
STORAGE_ROOT = Path(os.getenv("SAP_EVIDENCE_ROOT", "/var/www/svr01-dev/sap-data"))
EVIDENCE_DIR = STORAGE_ROOT / "evidence"
META_DIR = STORAGE_ROOT / "metadata"
REPORT_DIR = STORAGE_ROOT / "reports"
CASE_DIR = STORAGE_ROOT / "cases"
MAX_UPLOAD_MB = int(os.getenv("SAP_EVIDENCE_MAX_UPLOAD_MB", "500"))

ALLOWED_EXT = {
    ".zip",
    ".log",
    ".txt",
    ".csv",
    ".xlsx",
    ".xls",
    ".pdf",
    ".json",
}

app = FastAPI(title=APP_NAME, version="1.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
)


def ensure_dirs() -> None:
    for d in (EVIDENCE_DIR, META_DIR, REPORT_DIR, CASE_DIR):
        d.mkdir(parents=True, exist_ok=True)


def safe_name(name: str) -> str:
    base = Path(name or "evidence.bin").name
    base = re.sub(r"[^A-Za-z0-9._ -]+", "_", base).strip(" .")
    return base[:180] or "evidence.bin"


def safe_case_id(value: str) -> str:
    text = re.sub(r"[^A-Za-z0-9._-]+", "-", str(value or "")).strip("-._")
    return text[:80]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_meta(evidence_id: str) -> dict:
    p = META_DIR / f"{evidence_id}.json"
    if not p.exists():
        raise HTTPException(status_code=404, detail="Evidence not found")
    return json.loads(p.read_text(encoding="utf-8"))


def write_meta(evidence_id: str, data: dict) -> None:
    ensure_dirs()
    (META_DIR / f"{evidence_id}.json").write_text(
        json.dumps(data, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def case_path(case_id: str) -> Path:
    safe_id = safe_case_id(case_id)
    if not safe_id:
        raise HTTPException(status_code=400, detail="Invalid case id")
    return CASE_DIR / f"{safe_id}.json"


def read_case(case_id: str) -> dict:
    p = case_path(case_id)
    if not p.exists():
        raise HTTPException(status_code=404, detail="Case not found")
    return json.loads(p.read_text(encoding="utf-8"))


def write_case(data: dict) -> None:
    ensure_dirs()
    case_id = data.get("id") or data.get("case_no")
    if not case_id:
        raise HTTPException(status_code=400, detail="Case id missing")
    case_path(case_id).write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def make_case_no() -> str:
    prefix = datetime.now().strftime("CASE-%Y%m%d")
    existing = sorted(CASE_DIR.glob(f"{prefix}-*.json")) if CASE_DIR.exists() else []
    return f"{prefix}-{len(existing) + 1:03d}"


def summarize_case(case_data: dict) -> dict:
    reports = case_data.get("reports") or []
    evidence = case_data.get("evidence") or []
    results = case_data.get("parsed_results") or []
    latest_result = results[-1] if results else {}
    return {
        "id": case_data.get("id"),
        "case_no": case_data.get("case_no"),
        "title": case_data.get("title"),
        "sid": case_data.get("sid", ""),
        "environment": case_data.get("environment", ""),
        "tool": case_data.get("tool") or latest_result.get("tool", ""),
        "severity": case_data.get("severity", latest_result.get("severity", "INFO")),
        "status": case_data.get("status", "OPEN"),
        "summary": case_data.get("summary") or latest_result.get("summary", ""),
        "top_anomaly": case_data.get("top_anomaly") or latest_result.get("top_anomaly", ""),
        "top_suspect": case_data.get("top_suspect") or latest_result.get("top_suspect", ""),
        "evidence_count": len(evidence),
        "report_count": len(reports),
        "created_at": case_data.get("created_at"),
        "updated_at": case_data.get("updated_at"),
    }


def mobile_case_payload(case_data: dict) -> dict:
    summary = summarize_case(case_data)
    return {
        **summary,
        "executive_summary": summary.get("summary") or "No RCA summary saved yet.",
        "top_problem": {
            "label": summary.get("top_suspect") or summary.get("top_anomaly") or "Pending analysis",
            "reason": summary.get("top_anomaly") or "Upload and parse evidence to generate anomaly detail.",
        },
        "timeline": case_data.get("timeline", [])[-20:],
        "parsed_results": case_data.get("parsed_results", [])[-10:],
        "reports": case_data.get("reports", []),
        "evidence": case_data.get("evidence", []),
        "analytics": build_case_analytics(case_data),
    }


class EvidenceUpdate(BaseModel):
    title: Optional[str] = None
    sid: Optional[str] = None
    tool: Optional[str] = None
    note: Optional[str] = None
    tags: Optional[list[str]] = None


class CaseCreate(BaseModel):
    title: str
    sid: Optional[str] = ""
    environment: Optional[str] = ""
    severity: Optional[str] = "INFO"
    status: Optional[str] = "OPEN"
    summary: Optional[str] = ""
    top_anomaly: Optional[str] = ""
    top_suspect: Optional[str] = ""
    created_by: Optional[str] = ""


class CaseUpdate(BaseModel):
    title: Optional[str] = None
    sid: Optional[str] = None
    environment: Optional[str] = None
    severity: Optional[str] = None
    status: Optional[str] = None
    summary: Optional[str] = None
    top_anomaly: Optional[str] = None
    top_suspect: Optional[str] = None


class ParsedResultCreate(BaseModel):
    tool: str
    verdict: Optional[str] = ""
    severity: Optional[str] = "INFO"
    confidence: Optional[float] = 0
    top_anomaly: Optional[str] = ""
    top_suspect: Optional[str] = ""
    summary: Optional[str] = ""
    result_json: Optional[dict] = None


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
        "analytics": build_case_analytics(case_data),
        "db_write": {"case": db_case_write, "parsed_result": db_result_write},
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
    return {"ok": True, "case_id": case_data.get("id") or case_data.get("case_no"), "analytics": build_case_analytics(case_data)}


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
    items = []
    limit = max(1, min(limit, 500))
    for p in sorted(META_DIR.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True):
        try:
            m = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        if tool and str(m.get("tool", "")).lower() != tool.lower():
            continue
        if sid and str(m.get("sid", "")).lower() != sid.lower():
            continue
        if q:
            hay = " ".join(str(m.get(k, "")) for k in ["title", "note", "original_filename", "sid", "tool"])
            hay += " " + " ".join(m.get("tags", []) or [])
            if q.lower() not in hay.lower():
                continue
        items.append(m)
        if len(items) >= limit:
            break
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
    cutoff = datetime.now(timezone.utc).timestamp() - max(1, days) * 86400
    deleted = 0
    for meta_file in META_DIR.glob("*.json"):
        try:
            meta = json.loads(meta_file.read_text(encoding="utf-8"))
            created = datetime.fromisoformat(str(meta.get("created_at", "")).replace("Z", "+00:00")).timestamp()
        except Exception:
            created = meta_file.stat().st_mtime
        if created < cutoff:
            try:
                stored = json.loads(meta_file.read_text(encoding="utf-8")).get("stored_filename", "")
                (EVIDENCE_DIR / stored).unlink(missing_ok=True)
                meta_file.unlink(missing_ok=True)
                deleted += 1
            except Exception:
                pass
    return {"ok": True, "deleted": deleted, "retention_days": days}


# === CBJ SAP RCA DB-FIRST READ PATCH V1 ===
# Incremental DB-first read layer.
# Purpose:
# - In DB_MODE=hybrid/postgres, GET case list/history reads PostgreSQL first.
# - Existing JSON/file-backed endpoints remain as fallback via call_next().
# - No credential is hardcoded here; runtime DATABASE_URL stays in systemd env.

try:
    from fastapi import Request
    from fastapi.responses import JSONResponse
    from datetime import datetime, date
    import os
    import json
    import uuid
except Exception:
    pass


def _cbj_dbfirst_runtime_enabled():
    # Be flexible because existing runtime/health may derive DB mode from app settings,
    # while systemd environment can use DB_MODE, DATABASE_MODE, DB_ENABLED, or only DATABASE_URL.
    mode = str(os.getenv("DB_MODE") or os.getenv("DATABASE_MODE") or "hybrid").strip().lower()
    enabled = str(os.getenv("DB_ENABLED") or os.getenv("DATABASE_ENABLED") or "true").strip().lower()
    db_url = str(os.getenv("DATABASE_URL", "")).strip()

    if enabled in ("0", "false", "no", "off"):
        return False

    if db_url and mode in ("hybrid", "postgres", "postgresql", "db", "database"):
        return True

    # Last safe fallback: DATABASE_URL exists, so DB runtime is configured.
    # Existing file-backed fallback remains available if DB read fails.
    return bool(db_url)


def _cbj_dbfirst_psycopg_url():
    url = str(os.getenv("DATABASE_URL", "")).strip()

    # Runtime DATABASE_URL uses SQLAlchemy driver style:
    # postgresql+psycopg://...
    #
    # Do not hand-split the URL because credentials may contain special chars.
    # Use SQLAlchemy's URL parser, then render a psycopg-compatible URL.
    try:
        from sqlalchemy.engine import make_url
        parsed = make_url(url)
        if parsed.drivername.startswith("postgresql"):
            parsed = parsed.set(drivername="postgresql")
        elif parsed.drivername.startswith("postgres"):
            parsed = parsed.set(drivername="postgres")
        return parsed.render_as_string(hide_password=False)
    except Exception:
        # Safe fallback for simple URLs only.
        if url.startswith("postgresql+psycopg://"):
            return "postgresql://" + url.split("postgresql+psycopg://", 1)[1]
        if url.startswith("postgres+psycopg://"):
            return "postgres://" + url.split("postgres+psycopg://", 1)[1]
        return url


def _cbj_json_safe(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, bytes):
        try:
            return value.decode("utf-8", "replace")
        except Exception:
            return str(value)
    if isinstance(value, dict):
        return {str(k): _cbj_json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_cbj_json_safe(v) for v in value]
    return value


def _cbj_pick_existing_column(columns, candidates):
    for name in candidates:
        if name in columns:
            return name
    return None


def _cbj_dbfirst_fetch_cases(limit=300):
    import psycopg
    from psycopg.rows import dict_row

    conn_url = _cbj_dbfirst_psycopg_url()
    with psycopg.connect(conn_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'cases'
                ORDER BY ordinal_position
            """)
            columns = [r["column_name"] for r in cur.fetchall()]

            if not columns:
                return []

            order_col = _cbj_pick_existing_column(
                columns,
                ["updated_at", "created_at", "timestamp", "case_date", "id"]
            )

            sql = "SELECT * FROM cases"
            if order_col:
                sql += f' ORDER BY "{order_col}" DESC NULLS LAST'
            sql += " LIMIT %s"

            cur.execute(sql, (limit,))
            rows = cur.fetchall()

    result = []
    for row in rows:
        item = _cbj_json_safe(dict(row))
        item.setdefault("read_source", "postgres")
        result.append(item)
    return result


def _cbj_dbfirst_fetch_case_detail(case_key):
    import psycopg
    from psycopg.rows import dict_row

    conn_url = _cbj_dbfirst_psycopg_url()
    with psycopg.connect(conn_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'cases'
                ORDER BY ordinal_position
            """)
            case_columns = [r["column_name"] for r in cur.fetchall()]
            if not case_columns:
                return None

            id_col = _cbj_pick_existing_column(
                case_columns,
                ["id", "case_id", "case_key", "slug", "name", "title"]
            )
            if not id_col:
                return None

            cur.execute(f'SELECT * FROM cases WHERE "{id_col}"::text = %s LIMIT 1', (str(case_key),))
            case_row = cur.fetchone()
            if not case_row:
                return None

            case_obj = _cbj_json_safe(dict(case_row))
            case_obj.setdefault("read_source", "postgres")

            # Attach related evidence when possible.
            evidence_rows = []
            try:
                cur.execute("""
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'evidence'
                    ORDER BY ordinal_position
                """)
                evidence_columns = [r["column_name"] for r in cur.fetchall()]
                evidence_case_col = _cbj_pick_existing_column(
                    evidence_columns,
                    ["case_id", "case_key", "case_ref", "case_uuid"]
                )
                if evidence_case_col:
                    cur.execute(
                        f'SELECT * FROM evidence WHERE "{evidence_case_col}"::text = %s ORDER BY 1 DESC LIMIT 500',
                        (str(case_key),),
                    )
                    evidence_rows = [_cbj_json_safe(dict(r)) for r in cur.fetchall()]
            except Exception as exc:
                case_obj["evidence_read_warning"] = str(exc)

            # Attach parsed results when possible.
            parsed_rows = []
            try:
                cur.execute("""
                    SELECT column_name
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = 'parsed_results'
                    ORDER BY ordinal_position
                """)
                parsed_columns = [r["column_name"] for r in cur.fetchall()]
                parsed_case_col = _cbj_pick_existing_column(
                    parsed_columns,
                    ["case_id", "case_key", "case_ref", "case_uuid"]
                )
                if parsed_case_col:
                    cur.execute(
                        f'SELECT * FROM parsed_results WHERE "{parsed_case_col}"::text = %s ORDER BY 1 DESC LIMIT 200',
                        (str(case_key),),
                    )
                    parsed_rows = [_cbj_json_safe(dict(r)) for r in cur.fetchall()]
            except Exception as exc:
                case_obj["parsed_results_read_warning"] = str(exc)

    # Keep compatible but additive.
    case_obj.setdefault("evidence", evidence_rows)
    case_obj.setdefault("parsed_results", parsed_rows)
    return case_obj


def _cbj_dbfirst_fetch_evidence_history(limit=300):
    import psycopg
    from psycopg.rows import dict_row

    conn_url = _cbj_dbfirst_psycopg_url()
    with psycopg.connect(conn_url, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'evidence'
                ORDER BY ordinal_position
            """)
            columns = [r["column_name"] for r in cur.fetchall()]

            if not columns:
                return []

            order_col = _cbj_pick_existing_column(
                columns,
                ["updated_at", "created_at", "timestamp", "id"]
            )

            sql = "SELECT * FROM evidence"
            if order_col:
                sql += f' ORDER BY "{order_col}" DESC NULLS LAST'
            sql += " LIMIT %s"

            cur.execute(sql, (limit,))
            rows = cur.fetchall()

    result = []
    for row in rows:
        item = _cbj_json_safe(dict(row))
        item.setdefault("read_source", "postgres")
        result.append(item)
    return result


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

