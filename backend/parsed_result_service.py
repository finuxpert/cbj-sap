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
    from .timeline_service import append_parsed_result_timeline_event
except Exception:
    from timeline_service import append_parsed_result_timeline_event

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


RCA_NORMALIZED_FIELDS = (
    "incident_start",
    "incident_end",
    "sid",
    "environment",
    "client",
    "hosts",
    "affected_hosts",
    "instances",
    "workprocesses",
    "jobs",
    "programs",
    "transactions",
    "users",
    "error_signatures",
    "log_families",
    "metrics",
    "correlation_keys",
    "evidence_ids",
    "rca_model_version",
)


def _payload_value(payload: ParsedResultCreate, field: str) -> Any:
    if hasattr(payload, "model_dump"):
        return payload.model_dump().get(field)
    if hasattr(payload, "dict"):
        return payload.dict().get(field)
    return getattr(payload, field, None)


def _compact_normalized_fields(payload: ParsedResultCreate) -> dict[str, Any]:
    normalized: dict[str, Any] = {}
    for field in RCA_NORMALIZED_FIELDS:
        value = _payload_value(payload, field)
        if value in (None, "", [], {}):
            continue
        normalized[field] = value
    if normalized and "rca_model_version" not in normalized:
        normalized["rca_model_version"] = "rca-data-model-v1"
    return normalized


def _auto_case_stage(case_data: dict, result: dict) -> str:
    severity = str(result.get("severity") or "INFO").upper()
    confidence = float(result.get("confidence") or 0)

    if severity in {"CRIT", "WARN"} or confidence >= 0.5:
        return "CLASSIFIED"

    return "ANALYZING"


def add_case_parsed_result(case_id: str, payload: ParsedResultCreate) -> dict[str, Any]:
    """Save one parsed result into a case and preserve the existing route contract."""
    case_data = read_case(case_id)
    normalized_fields = _compact_normalized_fields(payload)
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
    result.update(normalized_fields)
    if normalized_fields:
        result["normalized_rca"] = normalized_fields
    case_data.setdefault("parsed_results", []).append(result)

    case_data["case_stage"] = _auto_case_stage(case_data, result)

    if result["severity"] in {"WARN", "CRIT"}:
        case_data["severity"] = result["severity"]
    if result["summary"]:
        case_data["summary"] = result["summary"]
    if result["top_anomaly"]:
        case_data["top_anomaly"] = result["top_anomaly"]
    if result["top_suspect"]:
        case_data["top_suspect"] = result["top_suspect"]

    if result["top_suspect"] and result["summary"]:
        sid = str(case_data.get("sid") or "SAP")
        case_data["title"] = f"{sid} - {result['top_suspect']} - SAP RCA"

    append_parsed_result_timeline_event(case_data, result)
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
