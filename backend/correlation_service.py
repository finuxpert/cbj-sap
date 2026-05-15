from __future__ import annotations

from collections import Counter
from typing import Any
import re

SEVERITY_WEIGHT = {
    "INFO": 10,
    "OK": 10,
    "WARN": 55,
    "WARNING": 55,
    "ERROR": 75,
    "ERR": 75,
    "CRIT": 95,
    "CRITICAL": 95,
}

TOOL_ALIASES = {
    "wp-scout": "wp_scout",
    "wpscout": "wp_scout",
    "rca-comparator": "wp_scout",
    "comparator": "wp_scout",
    "st03n": "st03n",
    "st03n-impact-v2": "st03n",
    "log-triage": "log_triage",
    "log_evidence": "log_triage",
    "logs": "log_triage",
}

HOST_STOPWORDS = {
    "abap",
    "about",
    "around",
    "basis",
    "case",
    "check",
    "comparator",
    "confidence",
    "conversion",
    "critical",
    "daily",
    "data",
    "detected",
    "evidence",
    "failed",
    "format",
    "host",
    "impact",
    "issue",
    "linked",
    "log",
    "memory",
    "next",
    "parsed",
    "priority",
    "problem",
    "response",
    "result",
    "root",
    "save",
    "scout",
    "severity",
    "source",
    "summary",
    "suspect",
    "system",
    "tool",
    "uploaded",
    "user",
    "validation",
    "window",
    "workprocess",
    "workprocesses",
    "wp",
    "component",
    "crit",
    "db",
    "dbms",
    "incident",
    "line",
    "raw",
    "report",
    "telemetry",
}

HOST_LIKE_RE = re.compile(r"^(?=.{3,63}$)(?!\d+$)(?:[a-z0-9]+(?:-[a-z0-9]+)*)(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*$")
HOST_DATE_RE = re.compile(r"(?:^|[-_.])(?:\d{2}[.-]\d{2}[.-]\d{4}|\d{4}[.-]\d{2}[.-]\d{2})(?:$|[-_.])", re.IGNORECASE)
HOST_FILE_FRAGMENT_RE = re.compile(r"\.(?:log|txt|csv|json|zip)(?:$|[-_.])", re.IGNORECASE)


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _normalize_tool(tool: Any) -> str:
    raw = _as_text(tool).lower().replace(" ", "-")
    return TOOL_ALIASES.get(raw, raw.replace("-", "_")) or "unknown"


def _normalize_severity(severity: Any) -> str:
    raw = _as_text(severity).upper() or "INFO"
    if raw == "WARNING":
        return "WARN"
    if raw in {"ERR", "ERROR"}:
        return "ERROR"
    if raw == "CRITICAL":
        return "CRIT"
    return raw


def _severity_score(severity: Any) -> int:
    return SEVERITY_WEIGHT.get(_normalize_severity(severity), 25)


def _extract_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    if value not in (None, ""):
        return [value]
    return []


def _extract_result_json(result: dict[str, Any]) -> dict[str, Any]:
    payload = result.get("result_json")
    return payload if isinstance(payload, dict) else {}


def _extract_normalized_rca(result: dict[str, Any]) -> dict[str, Any]:
    payload = result.get("normalized_rca")
    return payload if isinstance(payload, dict) else {}


def _get_first(result: dict[str, Any], *keys: str) -> Any:
    normalized = _extract_normalized_rca(result)
    payload = _extract_result_json(result)
    for key in keys:
        if key in result and result.get(key) not in (None, "", [], {}):
            return result.get(key)
        if key in normalized and normalized.get(key) not in (None, "", [], {}):
            return normalized.get(key)
        if key in payload and payload.get(key) not in (None, "", [], {}):
            return payload.get(key)
    return None


def _dedupe_text(values: list[Any]) -> list[str]:
    normalized: list[str] = []
    for value in values:
        for item in _extract_list(value):
            text = _as_text(item)
            if text and text not in normalized:
                normalized.append(text)
    return normalized


def _looks_like_host(value: Any) -> bool:
    text = _as_text(value).lower()
    if not text or text in HOST_STOPWORDS:
        return False
    if not re.search(r"[a-z]", text):
        return False
    if HOST_DATE_RE.search(text):
        return False
    if HOST_FILE_FRAGMENT_RE.search(text):
        return False
    if text.endswith((".log", ".txt", ".csv", ".json", ".zip")):
        return False
    if "/" in text or "\\" in text or ":" in text:
        return False
    if re.fullmatch(r"\d+(?:[._-]\d+){2,}", text):
        return False
    if all(part.isdigit() for part in re.split(r"[-_.]+", text) if part):
        return False
    if text.split(".") and all(part in HOST_STOPWORDS for part in text.split(".")):
        return False
    return bool(HOST_LIKE_RE.fullmatch(text))


def _collect_terms(result: dict[str, Any]) -> list[str]:
    normalized = _extract_normalized_rca(result)
    payload = _extract_result_json(result)
    fields = [
        result.get("top_anomaly"),
        result.get("top_suspect"),
        result.get("summary"),
        result.get("verdict"),
        normalized.get("correlation_keys"),
        normalized.get("error_signatures"),
        normalized.get("log_families"),
        normalized.get("programs"),
        normalized.get("transactions"),
        payload.get("top_anomaly"),
        payload.get("top_suspect"),
        payload.get("summary"),
        payload.get("root_cause"),
    ]
    terms: list[str] = []
    for value in fields:
        if isinstance(value, (list, tuple)):
            terms.extend(_dedupe_text(list(value)))
            continue
        text = _as_text(value)
        if text:
            terms.append(text)
    return _dedupe_text(terms)


def _collect_hosts(result: dict[str, Any]) -> list[str]:
    candidates = [
        _get_first(result, "hosts"),
        _get_first(result, "affected_hosts"),
        _get_first(result, "servers"),
        _get_first(result, "instances"),
        _get_first(result, "host", "hostname", "server", "instance"),
    ]
    hosts = [item.lower() for item in _dedupe_text(candidates) if _looks_like_host(item)]
    return hosts[:20]


def _collect_workprocesses(result: dict[str, Any]) -> list[str]:
    candidates = [
        _get_first(result, "workprocesses"),
        _get_first(result, "work_processes"),
        _get_first(result, "wp"),
        _get_first(result, "wps"),
        _get_first(result, "workprocess", "work_process", "wp_no", "pid"),
    ]
    return _dedupe_text(candidates)


def _collect_dimension(result: dict[str, Any], *keys: str) -> list[str]:
    return _dedupe_text([_get_first(result, *keys)])


def _collect_incident_window(result: dict[str, Any]) -> dict[str, str]:
    return {
        "start": _as_text(_get_first(result, "incident_start", "start_time", "from_time")),
        "end": _as_text(_get_first(result, "incident_end", "end_time", "to_time")),
    }


def _build_signal_key(item: dict[str, Any]) -> str:
    parts = [
        item.get("tool") or "unknown",
        item.get("sid") or "",
        ",".join(item.get("hosts") or []),
        ",".join(item.get("workprocesses") or []),
        ",".join(item.get("programs") or []),
        ",".join(item.get("error_signatures") or []),
    ]
    compact = [str(part).strip().lower() for part in parts if str(part).strip()]
    return "|".join(compact[:6])


def _shared_count(normalized: list[dict[str, Any]], key: str) -> int:
    counter: Counter[str] = Counter()
    for item in normalized:
        for value in item.get(key, []) or []:
            counter[value] += 1
    return sum(1 for _, count in counter.items() if count > 1)


def _coverage_score(normalized: list[dict[str, Any]]) -> int:
    dimensions = (
        "hosts",
        "workprocesses",
        "jobs",
        "programs",
        "transactions",
        "users",
        "error_signatures",
        "log_families",
        "correlation_keys",
        "evidence_ids",
    )
    populated = 0
    total = len(normalized) * len(dimensions)
    if not total:
        return 0
    for item in normalized:
        populated += sum(1 for dimension in dimensions if item.get(dimension))
    return round((populated / total) * 100)


def _has_incident_window(item: dict[str, Any]) -> bool:
    window = item.get("incident_window") or {}
    return bool(window.get("start") or window.get("end"))


def _build_weighted_score(normalized: list[dict[str, Any]], tools: list[str], severity_rank: dict[str, Any]) -> dict[str, Any]:
    parser_confidence = round(sum(item.get("confidence", 0) for item in normalized) / max(len(normalized), 1))
    tool_agreement = min(len(tools) * 8, 24)
    severity_weight = min(severity_rank.get("severity_score", 0), 100)
    evidence_coverage = _coverage_score(normalized)

    shared_host = _shared_count(normalized, "hosts")
    shared_wp = _shared_count(normalized, "workprocesses")
    shared_program = _shared_count(normalized, "programs")
    shared_error = _shared_count(normalized, "error_signatures")
    shared_key = _shared_count(normalized, "correlation_keys")
    overlap_strength = min((shared_host * 8) + (shared_wp * 8) + (shared_program * 6) + (shared_error * 10) + (shared_key * 12), 36)

    window_count = sum(1 for item in normalized if _has_incident_window(item))
    incident_window_score = round((window_count / max(len(normalized), 1)) * 100)

    weighted = round(
        (parser_confidence * 0.32)
        + (severity_weight * 0.18)
        + (tool_agreement * 0.75)
        + (evidence_coverage * 0.16)
        + (overlap_strength * 0.72)
        + (incident_window_score * 0.10)
    )
    weighted = max(0, min(100, weighted))

    return {
        "score": weighted,
        "version": "weighted-rca-score-v1",
        "components": {
            "parser_confidence": parser_confidence,
            "severity_weight": severity_weight,
            "tool_agreement": tool_agreement,
            "evidence_coverage": evidence_coverage,
            "overlap_strength": overlap_strength,
            "incident_window_score": incident_window_score,
        },
        "overlap": {
            "shared_hosts": shared_host,
            "shared_workprocesses": shared_wp,
            "shared_programs": shared_program,
            "shared_error_signatures": shared_error,
            "shared_correlation_keys": shared_key,
        },
    }


def normalize_parsed_result(result: dict[str, Any]) -> dict[str, Any]:
    """Normalize one parsed result into a correlation-friendly shape."""
    severity = _normalize_severity(result.get("severity"))
    normalized = {
        "id": result.get("id"),
        "created_at": result.get("created_at"),
        "tool": _normalize_tool(result.get("tool")),
        "severity": severity,
        "severity_score": _severity_score(severity),
        "confidence": int(result.get("confidence") or 0),
        "top_anomaly": _as_text(result.get("top_anomaly")),
        "top_suspect": _as_text(result.get("top_suspect")),
        "summary": _as_text(result.get("summary")),
        "sid": _as_text(_get_first(result, "sid")),
        "environment": _as_text(_get_first(result, "environment")),
        "client": _as_text(_get_first(result, "client")),
        "incident_window": _collect_incident_window(result),
        "terms": _collect_terms(result),
        "hosts": _collect_hosts(result),
        "workprocesses": _collect_workprocesses(result),
        "jobs": _collect_dimension(result, "jobs", "job", "job_names"),
        "programs": _collect_dimension(result, "programs", "program", "reports"),
        "transactions": _collect_dimension(result, "transactions", "transaction", "tcodes"),
        "users": _collect_dimension(result, "users", "user", "sap_users"),
        "error_signatures": _collect_dimension(result, "error_signatures", "error_signature", "errors", "messages"),
        "log_families": _collect_dimension(result, "log_families", "log_family", "families"),
        "correlation_keys": _collect_dimension(result, "correlation_keys", "correlation_key"),
        "evidence_ids": _collect_dimension(result, "evidence_ids", "evidence_id"),
    }
    generated_key = _build_signal_key(normalized)
    if generated_key and generated_key not in normalized["correlation_keys"]:
        normalized["correlation_keys"].append(generated_key)
    return normalized


def correlate_parsed_results(parsed_results: list[dict[str, Any]]) -> dict[str, Any]:
    """Build a compact RCA correlation summary across parser outputs.

    This service is intentionally route-agnostic. It does not read or write files, does not touch DB state,
    and preserves existing API behavior until explicitly wired into a route or report flow.
    """
    normalized = [normalize_parsed_result(item) for item in parsed_results if isinstance(item, dict)]
    if not normalized:
        return {
            "ok": True,
            "mode": "empty",
            "top_root_cause": "",
            "confidence": 0,
            "severity": "INFO",
            "tools": [],
            "affected_hosts": [],
            "related_workprocesses": [],
            "timeline_correlation": [],
            "recommended_actions": [],
            "signals": [],
        }

    severity_rank = max(normalized, key=lambda item: item.get("severity_score", 0))
    tools = sorted({item["tool"] for item in normalized if item.get("tool")})
    hosts = sorted({host for item in normalized for host in item.get("hosts", []) if _looks_like_host(host)})
    workprocesses = sorted({wp for item in normalized for wp in item.get("workprocesses", [])})
    jobs = sorted({job for item in normalized for job in item.get("jobs", [])})
    programs = sorted({program for item in normalized for program in item.get("programs", [])})
    error_signatures = sorted({error for item in normalized for error in item.get("error_signatures", [])})
    correlation_keys = sorted({key for item in normalized for key in item.get("correlation_keys", [])})

    suspect_counter: Counter[str] = Counter()
    for item in normalized:
        suspect = item.get("top_suspect") or item.get("top_anomaly") or item.get("summary")
        if suspect:
            suspect_counter[suspect] += 1
        for key in item.get("error_signatures", []):
            suspect_counter[key] += 1
        for key in item.get("programs", []):
            suspect_counter[key] += 1
    top_root_cause = suspect_counter.most_common(1)[0][0] if suspect_counter else ""

    weighted_score = _build_weighted_score(normalized, tools, severity_rank)
    confidence = weighted_score["score"]

    timeline_correlation = [
        {
            "id": item.get("id"),
            "time": item.get("created_at"),
            "tool": item.get("tool"),
            "severity": item.get("severity"),
            "title": item.get("top_anomaly") or item.get("top_suspect") or item.get("summary"),
            "incident_window": item.get("incident_window"),
            "hosts": item.get("hosts", []),
            "workprocesses": item.get("workprocesses", []),
            "programs": item.get("programs", []),
            "correlation_keys": item.get("correlation_keys", []),
        }
        for item in sorted(normalized, key=lambda value: _as_text(value.get("created_at")))
    ]

    recommended_actions = build_recommended_actions(
        severity=severity_rank.get("severity", "INFO"),
        tools=tools,
        hosts=hosts,
        workprocesses=workprocesses,
    )

    return {
        "ok": True,
        "mode": "correlated",
        "top_root_cause": top_root_cause,
        "confidence": confidence,
        "weighted_score": weighted_score,
        "severity": severity_rank.get("severity", "INFO"),
        "tools": tools,
        "correlation_sources": tools,
        "affected_hosts": hosts,
        "related_workprocesses": workprocesses,
        "related_jobs": jobs,
        "related_programs": programs,
        "error_signatures": error_signatures,
        "correlation_keys": correlation_keys,
        "timeline_correlation": timeline_correlation,
        "root_cause": top_root_cause,
        "next_check": recommended_actions[0] if recommended_actions else "",
        "recommended_actions": recommended_actions,
        "signals": normalized,
    }


def build_recommended_actions(
    severity: str,
    tools: list[str],
    hosts: list[str],
    workprocesses: list[str],
) -> list[str]:
    """Return deterministic RCA next actions without calling external AI services."""
    actions: list[str] = []
    normalized_severity = _normalize_severity(severity)
    if normalized_severity in {"CRIT", "ERROR"}:
        actions.append("Prioritize incident validation and capture fresh SAP evidence before remediation.")
    if "wp_scout" in tools:
        actions.append("Review affected work process patterns and compare against active SM50/SM66 state.")
    if "st03n" in tools:
        actions.append("Validate workload spike timing against ST03N task type and response time distribution.")
    if "log_triage" in tools:
        actions.append("Correlate recurring log signatures with the suspected root-cause window.")
    if hosts:
        actions.append("Check OS and SAP instance health on affected host candidates.")
    if workprocesses:
        actions.append("Map related work process IDs to current dispatcher and developer trace entries.")
    if not actions:
        actions.append("Collect additional evidence from WP-SCOUT, ST03N, and log triage before final RCA.")
    return actions


def correlate_case(case_data: dict[str, Any]) -> dict[str, Any]:
    """Build RCA correlation from a case payload without mutating the case."""
    parsed_results = case_data.get("parsed_results")
    return correlate_parsed_results(parsed_results if isinstance(parsed_results, list) else [])
