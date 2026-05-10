from __future__ import annotations

import uuid
from datetime import datetime
from pathlib import Path

from fastapi import HTTPException, UploadFile

try:
    from .case_helpers import summarize_case
except Exception:
    from case_helpers import summarize_case

try:
    from .storage_config import ALLOWED_EXT, EVIDENCE_DIR, MAX_UPLOAD_MB
except Exception:
    from storage_config import ALLOWED_EXT, EVIDENCE_DIR, MAX_UPLOAD_MB

try:
    from .storage_helpers import ensure_dirs, now_iso, read_case, safe_name, write_case, write_meta
except Exception:
    from storage_helpers import ensure_dirs, now_iso, read_case, safe_name, write_case, write_meta

try:
    from .db.repositories import upsert_case_best_effort, upsert_evidence_best_effort
except Exception:
    try:
        from db.repositories import upsert_case_best_effort, upsert_evidence_best_effort
    except Exception:
        def upsert_case_best_effort(case_data: dict) -> dict:
            return {"enabled": False, "written": False, "status": "unavailable"}

        def upsert_evidence_best_effort(meta: dict) -> dict:
            return {"enabled": False, "written": False, "status": "unavailable"}


async def handle_upload_evidence(
    *,
    file: UploadFile,
    tool: str = "unknown",
    sid: str = "",
    title: str = "",
    note: str = "",
    tags: str = "",
    case_id: str = "",
) -> dict:
    """Persist uploaded evidence and optionally link it to an RCA case.

    This intentionally preserves the existing /upload API contract while moving
    the implementation out of evidence_api.py so the route can stay thin.
    """
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
