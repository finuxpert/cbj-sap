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
    from .db.repositories import upsert_case_best_effort
except Exception:
    try:
        from db.repositories import upsert_case_best_effort
    except Exception:
        def upsert_case_best_effort(case_data: dict) -> dict:
            return {"enabled": False, "written": False, "status": "unavailable"}


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
            hay = " ".join(str(item.get(k, "")) for k in ["case_no", "title", "summary", "top_anomaly", "top_suspect", "sid", "tool"])
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
        if value is not None:
            case_data[key] = value.upper() if key in {"severity", "status"} else value
    case_data["updated_at"] = now_iso()
    write_case(case_data)
    db_write = upsert_case_best_effort(case_data)
    return {"ok": True, "case": case_data, "db_write": db_write}


def delete_case_item(case_id: str) -> dict[str, Any]:
    p = case_path(case_id)
    if not p.exists():
        raise HTTPException(status_code=404, detail="Case not found")
    deleted_id = safe_case_id(case_id)
    p.unlink(missing_ok=True)
    return {"ok": True, "deleted": deleted_id}
