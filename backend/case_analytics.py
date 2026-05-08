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
        "summary": {
            "top_signal": _top(anomaly, 1)[0]["name"] if anomaly else case_data.get("top_anomaly", ""),
            "dominant_source": _top(tools, 1)[0]["name"] if tools else case_data.get("tool", ""),
            "avg_confidence": avg_confidence,
            "parsed_count": len(_items(case_data.get("parsed_results"))),
            "evidence_count": len(_items(case_data.get("evidence"))),
            "report_count": len(_items(case_data.get("reports"))),
        },
    }
    analytics["has_data"] = any(
        analytics[key]
        for key in ["severity", "tools", "evidence_sources", "anomalies", "jobs", "programs", "confidence", "timeline"]
    )
    return analytics
