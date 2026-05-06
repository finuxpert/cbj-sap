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

app = FastAPI(title=APP_NAME, version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


def ensure_dirs() -> None:
    for d in (EVIDENCE_DIR, META_DIR, REPORT_DIR):
        d.mkdir(parents=True, exist_ok=True)


def safe_name(name: str) -> str:
    base = Path(name or "evidence.bin").name
    base = re.sub(r"[^A-Za-z0-9._ -]+", "_", base).strip(" .")
    return base[:180] or "evidence.bin"


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


class EvidenceUpdate(BaseModel):
    title: Optional[str] = None
    sid: Optional[str] = None
    tool: Optional[str] = None
    note: Optional[str] = None
    tags: Optional[list[str]] = None


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
    }


@app.post("/upload")
async def upload_evidence(
    file: UploadFile = File(...),
    tool: str = Form("unknown"),
    sid: str = Form(""),
    title: str = Form(""),
    note: str = Form(""),
    tags: str = Form(""),
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
        "original_filename": original,
        "stored_filename": stored_name,
        "size_bytes": size,
        "ext": ext,
        "download_url": f"/sap-api/evidence/{evidence_id}/download",
    }
    write_meta(evidence_id, meta)
    return {"ok": True, "evidence": meta}


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
