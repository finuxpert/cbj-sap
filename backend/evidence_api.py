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

app = FastAPI(title=APP_NAME, version="1.1.0")
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
    return {
        "status": "ok",
        "service": APP_NAME,
        "storage_root": str(STORAGE_ROOT),
        "max_upload_mb": MAX_UPLOAD_MB,
        "case_history": "file-backed",
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
    return {"ok": True, "case": data}


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
            hay = " ".join(str(item.get(k, "")) for k in ["case_no", "title", "summary", "top_anomaly", "top_suspect", "sid"])
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
    return {"ok": True, "case": case_data}


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
    return {"ok": True, "result": result, "case": summarize_case(case_data)}


@app.get("/mobile/cases")
def list_mobile_cases(limit: int = 50) -> dict:
    return list_cases(limit=limit)


@app.get("/mobile/cases/{case_id}")
def get_mobile_case(case_id: str) -> dict:
    case_data = read_case(case_id)
    summary = summarize_case(case_data)
    return {
        "ok": True,
        "case": {
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
        },
    }


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
        "size_bytes": size,
        "ext": ext,
        "download_url": f"/sap-api/evidence/{evidence_id}/download",
    }
    write_meta(evidence_id, meta)

    linked_case = None
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
            linked_case = summarize_case(case_data)
        except HTTPException:
            linked_case = {"warning": "case_id was provided but case was not found"}

    return {"ok": True, "evidence": meta, "case": linked_case}


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
    return {"ok": True, "evidence": meta}


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
