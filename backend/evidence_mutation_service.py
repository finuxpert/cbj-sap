from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import HTTPException
from fastapi.responses import FileResponse

try:
    from .external_models import EvidenceUpdate
except Exception:
    from external_models import EvidenceUpdate

try:
    from .storage_config import EVIDENCE_DIR, META_DIR
except Exception:
    from storage_config import EVIDENCE_DIR, META_DIR

try:
    from .storage_helpers import now_iso, read_meta, write_meta
except Exception:
    from storage_helpers import now_iso, read_meta, write_meta

try:
    from .db.repositories import upsert_evidence_best_effort
except Exception:
    try:
        from db.repositories import upsert_evidence_best_effort
    except Exception:
        def upsert_evidence_best_effort(meta: dict) -> dict:
            return {"enabled": False, "written": False, "status": "unavailable"}


def update_evidence_item(evidence_id: str, patch: EvidenceUpdate) -> dict[str, Any]:
    """Update evidence metadata and preserve the existing route response contract."""
    meta = read_meta(evidence_id)
    data = patch.dict(exclude_unset=True)
    for key, value in data.items():
        if value is not None:
            meta[key] = value
    meta["updated_at"] = now_iso()
    write_meta(evidence_id, meta)
    db_write = upsert_evidence_best_effort(meta)
    return {"ok": True, "evidence": meta, "db_write": db_write}


def get_evidence_download_response(evidence_id: str) -> FileResponse:
    """Return the existing evidence download response with the same 404 behavior."""
    meta = read_meta(evidence_id)
    evidence_file = EVIDENCE_DIR / meta["stored_filename"]
    if not evidence_file.exists():
        raise HTTPException(status_code=404, detail="Evidence file missing")
    return FileResponse(str(evidence_file), filename=meta.get("original_filename") or evidence_file.name)


def delete_evidence_item(evidence_id: str) -> dict[str, Any]:
    """Delete evidence file and metadata with the existing response contract."""
    meta = read_meta(evidence_id)
    evidence_file = EVIDENCE_DIR / meta.get("stored_filename", "")
    if evidence_file.exists():
        evidence_file.unlink()
    (META_DIR / f"{evidence_id}.json").unlink(missing_ok=True)
    return {"ok": True, "deleted": evidence_id}
