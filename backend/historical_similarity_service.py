from __future__ import annotations

from collections import Counter
from typing import Any

try:
    from .correlation_service import correlate_case, normalize_parsed_result
except Exception:
    from correlation_service import correlate_case, normalize_parsed_result


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _as_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    return []


def _dedupe(values: list[Any]) -> list[str]:
    output: list[str] = []
    for value in values:
        if isinstance(value, (list, tuple, set)):
            items = value
        else:
            items = [value]
        for item in items:
            text = _as_text(item)
            if text and text not in output:
                output.append(text)
    return output


def _set(values: list[Any]) -> set[str]:
    return {item.lower() for item in _dedupe(values)}


def _intersection_score(a: set[str], b: set[str], weight: int) -> int:
    if not a or not b:
        return 0
    shared = a.intersection(b)
    if not shared:
        return 0
    ratio = len(shared) / max(len(a.union(b)), 1)
    return round(min(weight, ratio * weight + len(shared) * 2))


def _case_id(case_data: dict[str, Any]) -> str:
    return _as_text(case_data.get("id") or case_data.get("case_id") or case_data.get("case_no"))


def _case_title(case_data: dict[str, Any]) -> str:
    return _as_text(case_data.get("title") or case_data.get("summary") or _case_id(case_data))


def _normalize_case_signals(case_data: dict[str, Any]) -> dict[str, Any]:
    parsed_results = [item for item in _as_list(case_data.get("parsed_results")) if isinstance(item, dict)]
    normalized_results = [normalize_parsed_result(item) for item in parsed_results]
    correlation = correlate_case(case_data)

    hosts = _dedupe([
        case_data.get("host"),
        case_data.get("hostname"),
        case_data.get("affected_hosts"),
        correlation.get("affected_hosts"),
        [host for item in normalized_results for host in item.get("hosts", [])],
    ])
    workprocesses = _dedupe([
        case_data.get("workprocesses"),
        correlation.get("related_workprocesses"),
        [wp for item in normalized_results for wp in item.get("workprocesses", [])],
    ])
    programs = _dedupe([
        case_data.get("program"),
        case_data.get("programs"),
        correlation.get("related_programs"),
        [program for item in normalized_results for program in item.get("programs", [])],
    ])
    errors = _dedupe([
        case_data.get("top_anomaly"),
        case_data.get("top_suspect"),
        correlation.get("top_root_cause"),
        correlation.get("error_signatures"),
        [error for item in normalized_results for error in item.get("error_signatures", [])],
    ])
    tools = _dedupe([
        correlation.get("tools"),
        [item.get("tool") for item in normalized_results],
    ])
    correlation_keys = _dedupe([
        correlation.get("correlation_keys"),
        [key for item in normalized_results for key in item.get("correlation_keys", [])],
    ])
    terms = _dedupe([
        case_data.get("summary"),
        case_data.get("title"),
        case_data.get("top_anomaly"),
        case_data.get("top_suspect"),
        [term for item in normalized_results for term in item.get("terms", [])],
    ])

    return {
        "case_id": _case_id(case_data),
        "case_no": _as_text(case_data.get("case_no")),
        "title": _case_title(case_data),
        "severity": _as_text(case_data.get("severity") or correlation.get("severity") or "INFO").upper(),
        "status": _as_text(case_data.get("status") or "OPEN").upper(),
        "created_at": case_data.get("created_at"),
        "updated_at": case_data.get("updated_at"),
        "confidence": int(correlation.get("confidence") or case_data.get("confidence") or 0),
        "hosts": hosts,
        "workprocesses": workprocesses,
        "programs": programs,
        "error_signatures": errors,
        "tools": tools,
        "correlation_keys": correlation_keys,
        "terms": terms,
        "correlation": correlation,
    }


def score_case_similarity(current_case: dict[str, Any], historical_case: dict[str, Any]) -> dict[str, Any]:
    """Score similarity between two RCA cases without mutating either case."""
    current = _normalize_case_signals(current_case)
    historical = _normalize_case_signals(historical_case)

    components = {
        "correlation_key_overlap": _intersection_score(_set(current["correlation_keys"]), _set(historical["correlation_keys"]), 30),
        "error_signature_overlap": _intersection_score(_set(current["error_signatures"]), _set(historical["error_signatures"]), 24),
        "host_overlap": _intersection_score(_set(current["hosts"]), _set(historical["hosts"]), 14),
        "workprocess_overlap": _intersection_score(_set(current["workprocesses"]), _set(historical["workprocesses"]), 10),
        "program_overlap": _intersection_score(_set(current["programs"]), _set(historical["programs"]), 12),
        "tool_overlap": _intersection_score(_set(current["tools"]), _set(historical["tools"]), 6),
        "term_overlap": _intersection_score(_set(current["terms"]), _set(historical["terms"]), 8),
    }
    score = max(0, min(100, sum(components.values())))

    shared = {
        "correlation_keys": sorted(_set(current["correlation_keys"]).intersection(_set(historical["correlation_keys"]))),
        "error_signatures": sorted(_set(current["error_signatures"]).intersection(_set(historical["error_signatures"]))),
        "hosts": sorted(_set(current["hosts"]).intersection(_set(historical["hosts"]))),
        "workprocesses": sorted(_set(current["workprocesses"]).intersection(_set(historical["workprocesses"]))),
        "programs": sorted(_set(current["programs"]).intersection(_set(historical["programs"]))),
        "tools": sorted(_set(current["tools"]).intersection(_set(historical["tools"]))),
    }

    if score >= 75:
        similarity = "HIGH"
    elif score >= 45:
        similarity = "MEDIUM"
    elif score >= 20:
        similarity = "LOW"
    else:
        similarity = "NONE"

    return {
        "case_id": historical["case_id"],
        "case_no": historical["case_no"],
        "title": historical["title"],
        "severity": historical["severity"],
        "status": historical["status"],
        "created_at": historical["created_at"],
        "updated_at": historical["updated_at"],
        "score": score,
        "similarity": similarity,
        "components": components,
        "shared": shared,
        "confidence": historical["confidence"],
    }


def find_similar_cases(
    current_case: dict[str, Any],
    historical_cases: list[dict[str, Any]],
    *,
    limit: int = 8,
    min_score: int = 20,
) -> dict[str, Any]:
    """Find historical RCA cases that look similar to the current case."""
    current_id = _case_id(current_case)
    scored = []
    for item in historical_cases:
        if not isinstance(item, dict):
            continue
        if current_id and _case_id(item) == current_id:
            continue
        result = score_case_similarity(current_case, item)
        if result["score"] >= min_score:
            scored.append(result)

    scored.sort(key=lambda item: (item["score"], item.get("updated_at") or item.get("created_at") or ""), reverse=True)
    top = scored[: max(1, limit)]

    return {
        "ok": True,
        "mode": "historical_similarity",
        "schema_version": "rca-historical-similarity-v1",
        "case_id": current_id,
        "count": len(top),
        "total_candidates": len(scored),
        "similar_cases": top,
        "recurring": any(item["score"] >= 75 for item in top),
        "recommended_action": build_similarity_recommendation(top),
    }


def build_similarity_recommendation(similar_cases: list[dict[str, Any]]) -> str:
    if not similar_cases:
        return "No strong historical match yet. Continue collecting evidence and persist normalized RCA signals."
    top = similar_cases[0]
    if top["score"] >= 75:
        return "High historical similarity detected. Compare remediation path, owner routing, and shared evidence before declaring a new RCA."
    if top["score"] >= 45:
        return "Medium similarity detected. Review shared signatures, hosts, and programs as supporting RCA context."
    return "Low similarity detected. Use historical cases only as weak supporting context."


def summarize_recurring_patterns(cases: list[dict[str, Any]], *, limit: int = 10) -> dict[str, Any]:
    """Summarize repeated RCA signals across case history."""
    normalized_cases = [_normalize_case_signals(item) for item in cases if isinstance(item, dict)]
    counters = {
        "error_signatures": Counter(),
        "hosts": Counter(),
        "programs": Counter(),
        "correlation_keys": Counter(),
        "tools": Counter(),
    }
    for item in normalized_cases:
        for key in counters:
            counters[key].update(_set(item.get(key, [])))

    patterns = {
        key: [
            {"value": value, "count": count}
            for value, count in counter.most_common(limit)
            if count > 1
        ]
        for key, counter in counters.items()
    }

    return {
        "ok": True,
        "mode": "recurring_patterns",
        "schema_version": "rca-recurring-patterns-v1",
        "case_count": len(normalized_cases),
        "patterns": patterns,
    }
