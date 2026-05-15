from __future__ import annotations

import re
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

ENV_ALIASES = {
    "PROD": "PRD",
    "PRODUCTION": "PRD",
    "PRD": "PRD",
    "LIVE": "PRD",
    "QAS": "QAS",
    "QA": "QAS",
    "QUALITY": "QAS",
    "UAT": "QAS",
    "DEV": "DEV",
    "DEVELOPMENT": "DEV",
    "DR": "DR",
    "DRA": "DR",
}

SUSPECT_TAXONOMY = (
    ("ABAP_CONVERSION_DATA_FORMAT", ("CONVT_NO_NUMBER", "CX_SY_CONVERSION", "CONVERSION", "DATA FORMAT", "NO_NUMBER")),
    ("ABAP_RUNTIME_DUMP", ("ST22", "DUMP", "SHORT DUMP", "RUNTIME ERROR", "CX_SY_")),
    ("BACKGROUND_JOB_FAILURE", ("JOB", "SM37", "CANCEL", "CANCELLED", "ABORTED")),
    ("WORK_PROCESS_SATURATION", ("WP", "WORK PROCESS", "DIA", "BTC", "PRIV", "WAITING", "RUNNING")),
    ("DATABASE_RESPONSE_TIME", ("DB TIME", "DATABASE", "SQL", "HANA", "LOCK WAIT", "EXPENSIVE SQL")),
    ("ENQUEUE_LOCK_CONTENTION", ("ENQUEUE", "LOCK", "SM12")),
    ("RFC_COMMUNICATION", ("RFC", "COMMUNICATION", "CPIC", "DESTINATION")),
    ("MEMORY_PRESSURE", ("MEMORY", "TSV_TNEW_PAGE_ALLOC_FAILED", "ROLL AREA", "EXTENDED MEMORY")),
)

HOST_RE = re.compile(r"\b(?:[a-zA-Z0-9][a-zA-Z0-9-]{1,62}\.)*[a-zA-Z0-9][a-zA-Z0-9-]{2,62}\b")
SID_RE = re.compile(r"\b[A-Z][A-Z0-9]{2}\b")


def _payload_value(payload: ParsedResultCreate, field: str) -> Any:
    if hasattr(payload, "model_dump"):
        return payload.model_dump().get(field)
    if hasattr(payload, "dict"):
        return payload.dict().get(field)
    return getattr(payload, field, None)


def _as_list(value: Any) -> list[str]:
    if value in (None, "", [], {}):
        return []
    if isinstance(value, list):
        raw = value
    elif isinstance(value, tuple):
        raw = list(value)
    else:
        raw = [value]
    result: list[str] = []
    seen: set[str] = set()
    for item in raw:
        text = str(item or "").strip()
        if not text:
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(text[:160])
    return result[:30]


def _text_blob(*values: Any) -> str:
    chunks: list[str] = []
    for value in values:
        if value in (None, "", [], {}):
            continue
        if isinstance(value, dict):
            chunks.extend(str(v) for v in value.values() if v not in (None, "", [], {}))
        elif isinstance(value, list):
            chunks.extend(str(v) for v in value if v not in (None, "", [], {}))
        else:
            chunks.append(str(value))
    return " ".join(chunks)


def _normalize_sid(value: Any, blob: str = "") -> str:
    explicit = str(value or "").strip().upper()
    if SID_RE.fullmatch(explicit):
        return explicit

    for match in SID_RE.findall(blob.upper()):
        if match not in {"SAP", "CPU", "MEM", "RFC", "SQL", "HDB", "DIA", "BTC", "ICM", "SNC", "SSL", "DEV", "QAS", "PRD"}:
            return match
    return ""


def _normalize_environment(value: Any, blob: str = "") -> str:
    explicit = str(value or "").strip().upper()
    if explicit in ENV_ALIASES:
        return ENV_ALIASES[explicit]

    hay = f" {blob.upper()} "
    for key, normalized in ENV_ALIASES.items():
        if f" {key} " in hay or f"_{key}_" in hay or f"-{key}-" in hay:
            return normalized
    return ""


def _normalize_hosts(value: Any, blob: str = "") -> list[str]:
    hosts = _as_list(value)
    if not hosts and blob:
        candidates = []
        for match in HOST_RE.findall(blob):
            lowered = match.lower()
            if lowered in {"unknown", "summary", "severity", "confidence", "result", "source"}:
                continue
            if lowered.endswith((".log", ".txt", ".csv", ".xlsx", ".json")):
                continue
            if SID_RE.fullmatch(match.upper()):
                continue
            candidates.append(lowered)
        hosts = _as_list(candidates)
    return [host.lower() for host in hosts if host.lower() != "unknown"][:20]


def _normalize_severity(severity: Any, confidence: Any = 0, blob: str = "") -> str:
    raw = str(severity or "").strip().upper()
    if raw in {"CRIT", "CRITICAL", "HIGH", "P1"}:
        return "CRIT"
    if raw in {"WARN", "WARNING", "MEDIUM", "P2"}:
        return "WARN"
    if raw in {"OK", "INFO", "LOW", "P3", "P4"}:
        return "INFO"

    hay = blob.upper()
    if any(token in hay for token in ("CRIT", "FATAL", "ABORT", "CANCELLED", "DUMP", "CONVT_NO_NUMBER")):
        return "CRIT"
    if any(token in hay for token in ("WARN", "ERROR", "FAILED", "TIMEOUT")):
        return "WARN"

    try:
        return "WARN" if float(confidence or 0) >= 70 else "INFO"
    except Exception:
        return "INFO"


def _normalize_suspect(value: Any, blob: str = "") -> tuple[str, str]:
    original = str(value or "").strip()
    hay = f"{original} {blob}".upper()
    for canonical, needles in SUSPECT_TAXONOMY:
        if any(needle in hay for needle in needles):
            return canonical, original or canonical
    return original or "SAP_RCA_UNCLASSIFIED", original or "SAP_RCA_UNCLASSIFIED"


def _compact_normalized_fields(payload: ParsedResultCreate, case_data: dict | None = None) -> dict[str, Any]:
    case_data = case_data or {}
    result_json = _payload_value(payload, "result_json") or {}
    blob = _text_blob(
        _payload_value(payload, "tool"),
        _payload_value(payload, "verdict"),
        _payload_value(payload, "top_anomaly"),
        _payload_value(payload, "top_suspect"),
        _payload_value(payload, "summary"),
        result_json,
        case_data.get("title"),
        case_data.get("sid"),
        case_data.get("environment"),
    )

    normalized: dict[str, Any] = {}
    for field in RCA_NORMALIZED_FIELDS:
        value = _payload_value(payload, field)
        if value in (None, "", [], {}):
            continue
        normalized[field] = value

    sid = _normalize_sid(normalized.get("sid") or case_data.get("sid"), blob)
    environment = _normalize_environment(normalized.get("environment") or case_data.get("environment"), blob)
    hosts = _normalize_hosts(normalized.get("hosts") or normalized.get("affected_hosts"), blob)

    if sid:
        normalized["sid"] = sid
    if environment:
        normalized["environment"] = environment
    if hosts:
        normalized["hosts"] = hosts
        normalized.setdefault("affected_hosts", hosts)

    for list_field in ("instances", "workprocesses", "jobs", "programs", "transactions", "users", "error_signatures", "log_families", "correlation_keys", "evidence_ids"):
        if list_field in normalized:
            normalized[list_field] = _as_list(normalized[list_field])

    normalized["rca_model_version"] = str(normalized.get("rca_model_version") or "rca-data-model-v2")
    return {key: value for key, value in normalized.items() if value not in (None, "", [], {})}


def _auto_case_stage(case_data: dict, result: dict) -> str:
    severity = str(result.get("severity") or "INFO").upper()
    confidence = float(result.get("confidence") or 0)

    if severity in {"CRIT", "WARN"} or confidence >= 50:
        return "CLASSIFIED"

    return "ANALYZING"


def _build_generated_title(case_data: dict, result: dict) -> str:
    if not result.get("top_suspect") or not result.get("summary"):
        return ""
    sid = str(case_data.get("sid") or "SAP")
    return f"{sid} - {result['top_suspect']} - SAP RCA"


def add_case_parsed_result(case_id: str, payload: ParsedResultCreate) -> dict[str, Any]:
    """Save one parsed result into a case without changing the case identity.

    A case represents one incident. Each RCA tool may append its own parsed result,
    but the latest tool must not rename or reclassify the whole case label in the
    case list. Case-level summary fields are only initialized when still empty.
    """
    case_data = read_case(case_id)
    normalized_fields = _compact_normalized_fields(payload, case_data)
    result_json = payload.result_json or {}
    blob = _text_blob(payload.tool, payload.verdict, payload.top_anomaly, payload.top_suspect, payload.summary, result_json, normalized_fields)
    canonical_suspect, original_suspect = _normalize_suspect(payload.top_suspect or payload.top_anomaly, blob)
    severity = _normalize_severity(payload.severity, payload.confidence, blob)

    result = {
        "id": uuid.uuid4().hex,
        "created_at": now_iso(),
        "tool": payload.tool,
        "verdict": payload.verdict or "",
        "severity": severity,
        "confidence": payload.confidence or 0,
        "top_anomaly": payload.top_anomaly or "",
        "top_suspect": canonical_suspect,
        "original_top_suspect": original_suspect,
        "summary": payload.summary or "",
        "result_json": result_json,
    }
    result.update(normalized_fields)
    if normalized_fields:
        result["normalized_rca"] = normalized_fields
    case_data.setdefault("parsed_results", []).append(result)

    case_data["case_stage"] = _auto_case_stage(case_data, result)

    if result["severity"] in {"WARN", "CRIT"}:
        case_data["severity"] = result["severity"]
    if normalized_fields.get("sid") and not case_data.get("sid"):
        case_data["sid"] = normalized_fields["sid"]
    if normalized_fields.get("environment") and not case_data.get("environment"):
        case_data["environment"] = normalized_fields["environment"]

    if result["summary"] and not case_data.get("summary"):
        case_data["summary"] = result["summary"]
    if result["top_anomaly"] and not case_data.get("top_anomaly"):
        case_data["top_anomaly"] = result["top_anomaly"]
    if result["top_suspect"] and not case_data.get("top_suspect"):
        case_data["top_suspect"] = result["top_suspect"]

    generated_title = _build_generated_title(case_data, result)
    if generated_title:
        case_data["latest_generated_title"] = generated_title

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
