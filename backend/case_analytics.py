from __future__ import annotations

from collections import defaultdict
from typing import Any


def _items(value: Any) -> list:
    return value if isinstance(value, list) else []


def _number(value: Any, default: float = 0) -> float:
    try:
        return float(value)
    except Exception:
        return default


def _label(value: Any, fallback: str = "Unknown", max_len: int = 80) -> str:
    text = str(value or fallback).strip() or fallback
    return text[:max_len]


def _add(bucket: dict[str, float], key: Any, amount: Any = 1) -> None:
    bucket[_label(key)] += _number(amount, 1)


def _top(bucket: dict[str, float], limit: int = 8) -> list[dict[str, Any]]:
    rows = [
        {"name": name[:48], "value": int(value) if float(value).is_integer() else round(value, 2)}
        for name, value in bucket.items()
    ]
    return sorted(rows, key=lambda item: item["value"], reverse=True)[:limit]


def _first_number(row: dict, keys: list[str], default: float = 0) -> float:
    for key in keys:
        if key in row and row.get(key) is not None:
            return _number(row.get(key), default)
    return default


def _resource_candidates(result_json: dict) -> list:
    candidates: list = []
    for key in ["system_resources", "resources", "cpu_mem_swap", "host_metrics", "resourceTimeline", "resource_timeline"]:
        candidates.extend(_items(result_json.get(key)))

    metrics = result_json.get("metrics") if isinstance(result_json.get("metrics"), dict) else {}
    for key in ["system_resources", "resources", "cpu_mem_swap", "host_metrics", "resourceTimeline", "resource_timeline"]:
        candidates.extend(_items(metrics.get(key)))

    sap = result_json.get("sap") if isinstance(result_json.get("sap"), dict) else {}
    candidates.extend(_items(sap.get("resources")))
    candidates.extend(_items(sap.get("host_metrics")))

    # Existing saved Log Evidence results often keep raw parsed rows under result_json.rows.
    # Those rows can contain cpu/rss/swap fields even when no system_resources array exists yet.
    candidates.extend(_items(result_json.get("rows")))
    candidates.extend(_items(result_json.get("evidenceRows")))
    candidates.extend(_items(result_json.get("parsedRows")))
    return candidates


def _build_resource_row(raw: dict, index: int) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None

    name = _label(
        raw.get("name")
        or raw.get("time")
        or raw.get("timeLabel")
        or raw.get("timestamp")
        or raw.get("label")
        or f"T{index + 1}",
        max_len=32,
    )
    cpu = _first_number(raw, ["cpu", "cpuPct", "cpu_percent", "cpu_pct", "cpu_usage", "cpuUsage", "cpuUtilization"])
    mem = _first_number(raw, ["mem", "memory", "memoryPct", "memory_pct", "mem_pct", "memory_percent", "memPercent", "mem_percent", "memory_usage", "memoryUsage", "rssPct"])
    swap = _first_number(raw, ["swap", "swapPct", "swap_pct", "swap_percent", "swapPercent", "swap_usage", "swapUsage"])

    # Some SAP WP/log parsers store RSS in GB but not memory percentage. Keep it chartable as a bounded proxy.
    if mem == 0:
        rss_gb = _first_number(raw, ["rssGb", "rssGB", "rss_gb", "rss"], 0)
        if rss_gb > 0:
            mem = min(100, rss_gb * 10)

    if cpu == 0 and mem == 0 and swap == 0:
        return None

    return {
        "name": name,
        "cpu": round(max(0, min(cpu, 100)), 2),
        "mem": round(max(0, min(mem, 100)), 2),
        "swap": round(max(0, min(swap, 100)), 2),
    }


def _aggregate_resource_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = {}
    for row in rows:
        key = row.get("name") or "T"
        current = grouped.setdefault(key, {"name": key, "cpu": 0, "mem": 0, "swap": 0, "cpuCount": 0, "memCount": 0, "swapCount": 0})
        if row.get("cpu", 0) > 0:
            current["cpu"] += row["cpu"]
            current["cpuCount"] += 1
        if row.get("mem", 0) > 0:
            current["mem"] += row["mem"]
            current["memCount"] += 1
        if row.get("swap", 0) > 0:
            current["swap"] += row["swap"]
            current["swapCount"] += 1

    return [
        {
            "name": item["name"],
            "cpu": round(item["cpu"] / item["cpuCount"], 2) if item["cpuCount"] else 0,
            "mem": round(item["mem"] / item["memCount"], 2) if item["memCount"] else 0,
            "swap": round(item["swap"] / item["swapCount"], 2) if item["swapCount"] else 0,
        }
        for item in grouped.values()
    ][-30:]


def build_case_analytics(case_data: dict) -> dict:
    """Build chart-ready analytics for a mobile case detail response."""
    severity: dict[str, float] = defaultdict(float)
    tools: dict[str, float] = defaultdict(float)
    anomaly: dict[str, float] = defaultdict(float)
    jobs: dict[str, float] = defaultdict(float)
    programs: dict[str, float] = defaultdict(float)
    evidence_sources: dict[str, float] = defaultdict(float)
    timeline: dict[str, dict[str, Any]] = {}
    confidence: list[dict[str, Any]] = []
    system_resources: list[dict[str, Any]] = []

    for index, result in enumerate(_items(case_data.get("parsed_results"))):
        result_json = result.get("result_json") if isinstance(result.get("result_json"), dict) else {}
        tool = result.get("tool") or result_json.get("tool") or "Parsed Result"
        severity_name = str(result.get("severity") or result_json.get("severity") or "INFO").upper()

        _add(severity, severity_name)
        _add(tools, tool)
        _add(anomaly, result.get("top_anomaly") or result.get("verdict") or (result_json.get("primary") or {}).get("name"))

        confidence_value = _number(result.get("confidence", result_json.get("confidence", 0)), 0)
        if confidence_value > 0:
            confidence.append({"name": _label(tool, f"Result {index + 1}", 32), "value": round(confidence_value, 2)})

        for row in _items(result_json.get("timeline")):
            key = _label(row.get("time") or row.get("timeLabel") or row.get("created_at") or f"T{index + 1}", max_len=32)
            current = timeline.setdefault(key, {"name": key, "hits": 0, "crit": 0, "warn": 0})
            current["hits"] += int(_number(row.get("hits") or row.get("crit") or row.get("warn"), 0))
            current["crit"] += int(_number(row.get("crit"), 0))
            current["warn"] += int(_number(row.get("warn"), 0))

        for resource_index, raw_resource in enumerate(_resource_candidates(result_json)):
            row = _build_resource_row(raw_resource, len(system_resources) + resource_index)
            if row:
                system_resources.append(row)

        for row in _items(result_json.get("errorGroups")):
            _add(anomaly, row.get("name") or row.get("errorCode"), row.get("hits") or 1)
        for row in _items(result_json.get("jobGroups")):
            _add(jobs, row.get("name") or row.get("jobName"), row.get("hits") or 1)
        for row in _items(result_json.get("programGroups")):
            _add(programs, row.get("name") or row.get("program"), row.get("hits") or 1)

    for item in _items(case_data.get("evidence")):
        source = item.get("tool") or item.get("source") or "Evidence"
        _add(tools, source)
        _add(evidence_sources, source)

    timeline_rows = list(timeline.values())[-20:]
    resource_rows = _aggregate_resource_rows(system_resources)
    avg_confidence = round(sum(row["value"] for row in confidence) / len(confidence), 2) if confidence else 0

    analytics = {
        "severity": _top(severity, 4),
        "tools": _top(tools, 8),
        "evidence_sources": _top(evidence_sources, 8),
        "anomalies": _top(anomaly, 10),
        "jobs": _top(jobs, 10),
        "programs": _top(programs, 10),
        "confidence": confidence[-10:],
        "timeline": timeline_rows,
        "system_resources": resource_rows,
        "summary": {
            "top_signal": _top(anomaly, 1)[0]["name"] if anomaly else case_data.get("top_anomaly", ""),
            "dominant_source": _top(tools, 1)[0]["name"] if tools else case_data.get("tool", ""),
            "avg_confidence": avg_confidence,
            "parsed_count": len(_items(case_data.get("parsed_results"))),
            "evidence_count": len(_items(case_data.get("evidence"))),
            "report_count": len(_items(case_data.get("reports"))),
            "resource_points": len(resource_rows),
        },
    }
    analytics["has_data"] = any(
        analytics[key]
        for key in ["severity", "tools", "evidence_sources", "anomalies", "jobs", "programs", "confidence", "timeline", "system_resources"]
    )
    return analytics
