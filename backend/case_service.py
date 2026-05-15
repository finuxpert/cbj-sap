from __future__ import annotations

import json
from typing import Any

from fastapi import HTTPException

try:
    from .case_helpers import make_case_no, summarize_case
except Exception:
    from case_helpers import make_case_no, summarize_case

try:
    from .external_models import CaseCreate, CaseUpdate
except Exception:
    from external_models import CaseCreate, CaseUpdate

try:
    from .storage_config import CASE_DIR
except Exception:
    from storage_config import CASE_DIR

try:
    from .storage_helpers import (
        case_path,
        ensure_dirs,
        now_iso,
        read_case,
        safe_case_id,
        write_case,
    )
except Exception:
    from storage_helpers import (
        case_path,
        ensure_dirs,
        now_iso,
        read_case,
        safe_case_id,
        write_case,
    )

try:
    from .db.repositories import delete_case_cascade_best_effort, upsert_case_best_effort
except Exception:
    try:
        from db.repositories import delete_case_cascade_best_effort, upsert_case_best_effort
    except Exception:
        def upsert_case_best_effort(case_data: dict) -> dict:
            return {"enabled": False, "written": False, "status": "unavailable"}

        def delete_case_cascade_best_effort(case_id: str) -> dict:
            return {"enabled": False, "deleted": False, "status": "unavailable"}


VALID_CASE_STAGES = {
    "INTAKE",
    "WAITING_EVIDENCE",
    "ANALYZING",
    "CLASSIFIED",
    "RESOLVED",
}


def _normalize_case_stage(value: str | None) -> str:
    stage = str(value or "INTAKE").strip().upper()
    return stage if stage in VALID_CASE_STAGES else "INTAKE"


def create_case_item(payload: CaseCreate) -> dict[str, Any]:
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
        "case_stage": _normalize_case_stage(payload.case_stage),
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


def list_case_items(
    q: str = "",
    sid: str = "",
    severity: str = "",
    status: str = "",
    limit: int = 100,
) -> dict[str, Any]:
    ensure_dirs()
    limit = max(1, min(int(limit or 100), 500))
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
            hay = " ".join(str(item.get(k, "")) for k in ["case_no", "title", "summary", "top_anomaly", "top_suspect", "sid", "tool", "case_stage"])
            if q.lower() not in hay.lower():
                continue
        items.append(item)
        if len(items) >= limit:
            break
    return {"ok": True, "count": len(items), "items": items}


def get_case_item(case_id: str) -> dict[str, Any]:
    return {"ok": True, "case": read_case(case_id)}


def update_case_item(case_id: str, patch: CaseUpdate) -> dict[str, Any]:
    case_data = read_case(case_id)
    data = patch.dict(exclude_unset=True)
    for key, value in data.items():
        if value is None:
            continue
        if key in {"severity", "status"}:
            case_data[key] = value.upper()
        elif key == "case_stage":
            case_data[key] = _normalize_case_stage(value)
        else:
            case_data[key] = value
    case_data["updated_at"] = now_iso()
    write_case(case_data)
    db_write = upsert_case_best_effort(case_data)
    return {"ok": True, "case": case_data, "db_write": db_write}


def delete_case_item(case_id: str) -> dict[str, Any]:
    deleted_id = safe_case_id(case_id)
    if not deleted_id:
        raise HTTPException(status_code=400, detail="Invalid case id")

    db_delete = delete_case_cascade_best_effort(deleted_id)
    p = case_path(deleted_id)
    file_deleted = False
    if p.exists():
        p.unlink(missing_ok=True)
        file_deleted = True

    if db_delete.get("enabled") and db_delete.get("status") == "error":
        raise HTTPException(status_code=500, detail=f"DB case delete failed: {db_delete.get('error')}")

    if not file_deleted and not db_delete.get("deleted"):
        raise HTTPException(status_code=404, detail="Case not found")

    return {
        "ok": True,
        "deleted": deleted_id,
        "file_deleted": file_deleted,
        "db_delete": db_delete,
    }
