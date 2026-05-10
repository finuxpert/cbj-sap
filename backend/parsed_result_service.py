from __future__ import annotations

import uuid
from typing import Any

try:
    from .case_helpers import mobile_case_payload, summarize_case
except Exception:
    from case_helpers import mobile_case_payload, summarize_case

try:
    from .external_models import ParsedResultCreate
except Exception:
    from external_models import ParsedResultCreate

try:
    from .storage_helpers import now_iso, read_case, write_case
except Exception:
    from storage_helpers import now_iso, read_case, write_case

try:
    from .db.repositories import insert_parsed_result_best_effort, upsert_case_best_effort
except Exception:
    try:
        from db.repositories import insert_parsed_result_best_effort, upsert_case_best_effort
    except Exception:
        def upsert_case_best_effort(case_data: dict) -> dict:
            return {"enabled": False, "written": False, "status": "unavailable"}

        def insert_parsed_result_best_effort(case_id: str, result: dict) -> dict:
            return {"enabled": False, "written": False, "status": "unavailable"}


def add_case_parsed_result(case_id: str, payload: ParsedResultCreate) -> dict[str, Any]:
    """Save one parsed result into a case and preserve the existing route contract."""
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
