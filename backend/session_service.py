from __future__ import annotations

from typing import Any

try:
    from .correlation_service import correlate_case
except Exception:
    from correlation_service import correlate_case


def _as_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    return []


def _as_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _case_id(case_data: dict[str, Any]) -> str:
    return _as_text(case_data.get("id") or case_data.get("case_no"))


def summarize_session(case_data: dict[str, Any]) -> dict[str, Any]:
    """Build a compact session summary from a case without mutating source data."""
    evidence = _as_list(case_data.get("evidence"))
    parsed_results = _as_list(case_data.get("parsed_results"))
    reports = _as_list(case_data.get("reports"))
    timeline = _as_list(case_data.get("timeline"))
    correlation = correlate_case(case_data)

    return {
        "case_id": _case_id(case_data),
        "case_no": _as_text(case_data.get("case_no")),
        "title": _as_text(case_data.get("title")) or _case_id(case_data),
        "sid": _as_text(case_data.get("sid")),
        "environment": _as_text(case_data.get("environment")),
        "severity": _as_text(case_data.get("severity") or correlation.get("severity") or "INFO").upper(),
        "status": _as_text(case_data.get("status") or "OPEN").upper(),
        "summary": _as_text(case_data.get("summary")),
        "top_anomaly": _as_text(case_data.get("top_anomaly")),
        "top_suspect": _as_text(case_data.get("top_suspect")),
        "created_at": case_data.get("created_at"),
        "updated_at": case_data.get("updated_at"),
        "counts": {
            "evidence": len(evidence),
            "parsed_results": len(parsed_results),
            "reports": len(reports),
            "timeline": len(timeline),
        },
        "correlation": {
            "mode": correlation.get("mode"),
            "severity": correlation.get("severity"),
            "confidence": correlation.get("confidence"),
            "top_root_cause": correlation.get("top_root_cause"),
            "tools": correlation.get("tools", []),
        },
    }


def build_session_replay(case_data: dict[str, Any]) -> dict[str, Any]:
    """Return a replay-friendly view of an RCA investigation session."""
    evidence = _as_list(case_data.get("evidence"))
    parsed_results = _as_list(case_data.get("parsed_results"))
    timeline = _as_list(case_data.get("timeline"))
    correlation = correlate_case(case_data)

    replay_events: list[dict[str, Any]] = []

    for item in evidence:
        if not isinstance(item, dict):
            continue
        replay_events.append({
            "type": "evidence",
            "time": item.get("uploaded_at") or item.get("created_at") or item.get("updated_at"),
            "title": _as_text(item.get("title") or item.get("original_filename") or item.get("filename") or "Evidence uploaded"),
            "severity": "INFO",
            "tool": _as_text(item.get("tool")),
            "source_id": item.get("id"),
        })

    for item in parsed_results:
        if not isinstance(item, dict):
            continue
        replay_events.append({
            "type": "parsed_result",
            "time": item.get("created_at"),
            "title": _as_text(item.get("top_anomaly") or item.get("top_suspect") or item.get("summary") or "Parsed result saved"),
            "severity": _as_text(item.get("severity") or "INFO").upper(),
            "tool": _as_text(item.get("tool")),
            "source_id": item.get("id"),
        })

    for item in timeline:
        if not isinstance(item, dict):
            continue
        replay_events.append({
            "type": "timeline",
            "time": item.get("time") or item.get("created_at"),
            "title": _as_text(item.get("title") or item.get("description") or "Timeline event"),
            "severity": _as_text(item.get("severity") or "INFO").upper(),
            "tool": _as_text(item.get("tool")),
            "source_id": item.get("id"),
        })

    for item in _as_list(correlation.get("timeline_correlation")):
        if not isinstance(item, dict):
            continue
        replay_events.append({
            "type": "correlation",
            "time": item.get("time"),
            "title": _as_text(item.get("title") or "Correlation signal"),
            "severity": _as_text(item.get("severity") or correlation.get("severity") or "INFO").upper(),
            "tool": _as_text(item.get("tool")),
            "source_id": item.get("id"),
        })

    replay_events = sorted(
        replay_events,
        key=lambda item: _as_text(item.get("time")),
    )

    return {
        "ok": True,
        "case_id": _case_id(case_data),
        "replay_ready": bool(replay_events),
        "count": len(replay_events),
        "events": replay_events,
    }


def create_session_from_case(case_data: dict[str, Any]) -> dict[str, Any]:
    """Build an in-memory RCA session payload from case data.

    This is intentionally persistence-agnostic. It prepares the contract for a future route or DB/file-backed
    session store without changing existing case APIs.
    """
    summary = summarize_session(case_data)
    replay = build_session_replay(case_data)
    correlation = correlate_case(case_data)

    return {
        "ok": True,
        "mode": "case_session",
        "session_id": summary.get("case_id"),
        "case_id": summary.get("case_id"),
        "summary": summary,
        "correlation": correlation,
        "replay": replay,
    }


def get_session_item(case_data: dict[str, Any]) -> dict[str, Any]:
    """Alias for session retrieval from case payloads until persistent session storage is introduced."""
    return create_session_from_case(case_data)
