from __future__ import annotations

from typing import Any


def build_parsed_result_timeline_event(result: dict[str, Any]) -> dict[str, Any]:
    """Build the timeline event used when a parsed result is saved.

    This keeps the existing event shape centralized before route/service wiring is thinned further.
    """
    return {
        "id": result["id"],
        "time": result["created_at"],
        "severity": result["severity"],
        "title": result["top_anomaly"] or f"{result['tool']} parsed result saved",
        "description": result["summary"],
        "tool": result["tool"],
    }


def append_parsed_result_timeline_event(case_data: dict[str, Any], result: dict[str, Any]) -> dict[str, Any]:
    """Append a parsed-result timeline event and return the mutated case data."""
    case_data.setdefault("timeline", []).append(build_parsed_result_timeline_event(result))
    return case_data
