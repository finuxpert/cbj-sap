from __future__ import annotations

from collections import Counter
from typing import Any

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
    "log-triage": "log_triage",
    "log_evidence": "log_triage",
    "logs": "log_triage",
}


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
    return []


def _extract_result_json(result: dict[str, Any]) -> dict[str, Any]:
    payload = result.get("result_json")
    return payload if isinstance(payload, dict) else {}


def _collect_terms(result: dict[str, Any]) -> list[str]:
    payload = _extract_result_json(result)
    fields = [
        result.get("top_anomaly"),
        result.get("top_suspect"),
        result.get("summary"),
        result.get("verdict"),
        payload.get("top_anomaly"),
        payload.get("top_suspect"),
        payload.get("summary"),
        payload.get("root_cause"),
    ]
    terms: list[str] = []
    for value in fields:
        text = _as_text(value)
        if text:
            terms.append(text)
    return terms


def _collect_hosts(result: dict[str, Any]) -> list[str]:
    payload = _extract_result_json(result)
    candidates: list[Any] = []
    for key in ("hosts", "affected_hosts", "servers", "instances"):
        candidates.extend(_extract_list(payload.get(key)))
    for key in ("host", "hostname", "server", "instance"):
        value = payload.get(key)
        if value:
            candidates.append(value)
    normalized = []
    for value in candidates:
        host = _as_text(value)
        if host and host not in normalized:
            normalized.append(host)
    return normalized


def _collect_workprocesses(result: dict[str, Any]) -> list[str]:
    payload = _extract_result_json(result)
    candidates: list[Any] = []
    for key in ("workprocesses", "work_processes", "wp", "wps"):
        candidates.extend(_extract_list(payload.get(key)))
    for key in ("workprocess", "work_process", "wp_no", "pid"):
        value = payload.get(key)
        if value:
            candidates.append(value)
    normalized = []
    for value in candidates:
        wp = _as_text(value)
        if wp and wp not in normalized:
            normalized.append(wp)
    return normalized


def normalize_parsed_result(result: dict[str, Any]) -> dict[str, Any]:
    """Normalize one parsed result into a correlation-friendly shape."""
    severity = _normalize_severity(result.get("severity"))
    return {
        "id": result.get("id"),
        "created_at": result.get("created_at"),
        "tool": _normalize_tool(result.get("tool")),
        "severity": severity,
        "severity_score": _severity_score(severity),
        "confidence": int(result.get("confidence") or 0),
        "top_anomaly": _as_text(result.get("top_anomaly")),
        "top_suspect": _as_text(result.get("top_suspect")),
        "summary": _as_text(result.get("summary")),
        "terms": _collect_terms(result),
        "hosts": _collect_hosts(result),
        "workprocesses": _collect_workprocesses(result),
    }


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
    hosts = sorted({host for item in normalized for host in item.get("hosts", [])})
    workprocesses = sorted({wp for item in normalized for wp in item.get("workprocesses", [])})

    suspect_counter: Counter[str] = Counter()
    for item in normalized:
        suspect = item.get("top_suspect") or item.get("top_anomaly") or item.get("summary")
        if suspect:
            suspect_counter[suspect] += 1
    top_root_cause = suspect_counter.most_common(1)[0][0] if suspect_counter else ""

    avg_confidence = sum(item.get("confidence", 0) for item in normalized) / max(len(normalized), 1)
    tool_bonus = min(len(tools) * 5, 15)
    severity_bonus = min(severity_rank.get("severity_score", 0) // 10, 10)
    confidence = max(0, min(100, round(avg_confidence + tool_bonus + severity_bonus)))

    timeline_correlation = [
        {
            "id": item.get("id"),
            "time": item.get("created_at"),
            "tool": item.get("tool"),
            "severity": item.get("severity"),
            "title": item.get("top_anomaly") or item.get("top_suspect") or item.get("summary"),
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
        "severity": severity_rank.get("severity", "INFO"),
        "tools": tools,
        "affected_hosts": hosts,
        "related_workprocesses": workprocesses,
        "timeline_correlation": timeline_correlation,
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
