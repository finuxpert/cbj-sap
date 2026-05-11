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


def _dedupe(values: list[Any]) -> list[str]:
    result: list[str] = []
    for value in values:
        items = value if isinstance(value, (list, tuple)) else [value]
        for item in items:
            text = _as_text(item)
            if text and text not in result:
                result.append(text)
    return result


def _extract_normalized_rca(item: dict[str, Any]) -> dict[str, Any]:
    payload = item.get("normalized_rca")
    return payload if isinstance(payload, dict) else {}


def _extract_result_json(item: dict[str, Any]) -> dict[str, Any]:
    payload = item.get("result_json")
    return payload if isinstance(payload, dict) else {}


def _get_first(item: dict[str, Any], *keys: str) -> Any:
    normalized = _extract_normalized_rca(item)
    payload = _extract_result_json(item)
    for key in keys:
        if key in item and item.get(key) not in (None, "", [], {}):
            return item.get(key)
        if key in normalized and normalized.get(key) not in (None, "", [], {}):
            return normalized.get(key)
        if key in payload and payload.get(key) not in (None, "", [], {}):
            return payload.get(key)
    return None


def _impact_window(item: dict[str, Any]) -> dict[str, str]:
    return {
        "start": _as_text(_get_first(item, "incident_start", "start_time", "from_time")),
        "end": _as_text(_get_first(item, "incident_end", "end_time", "to_time")),
    }


def _affected_components(item: dict[str, Any]) -> dict[str, list[str]]:
    return {
        "hosts": _dedupe([
            _get_first(item, "hosts"),
            _get_first(item, "affected_hosts"),
            _get_first(item, "host", "hostname", "server", "instance"),
        ]),
        "workprocesses": _dedupe([
            _get_first(item, "workprocesses"),
            _get_first(item, "work_processes"),
            _get_first(item, "wp", "wps", "wp_no", "pid"),
        ]),
        "programs": _dedupe([_get_first(item, "programs", "program", "reports")]),
        "jobs": _dedupe([_get_first(item, "jobs", "job", "job_names")]),
        "transactions": _dedupe([_get_first(item, "transactions", "transaction", "tcodes")]),
        "error_signatures": _dedupe([_get_first(item, "error_signatures", "error_signature", "errors", "messages")]),
    }


def _correlation_group(item: dict[str, Any], event_type: str, tool: str) -> str:
    keys = _dedupe([_get_first(item, "correlation_keys", "correlation_key")])
    if keys:
        return keys[0]
    components = _affected_components(item)
    parts = [
        tool or event_type,
        _as_text(_get_first(item, "sid")),
        ",".join(components.get("hosts") or []),
        ",".join(components.get("workprocesses") or []),
        ",".join(components.get("programs") or []),
        ",".join(components.get("error_signatures") or []),
    ]
    compact = [part.lower() for part in parts if part]
    return "|".join(compact[:6]) or event_type


def _normalize_replay_event(raw: dict[str, Any], *, event_type: str, title: str, severity: str, tool: str, time: Any, source_id: Any) -> dict[str, Any]:
    severity_text = _as_text(severity or "INFO").upper()
    source_tool = _as_text(tool) or "unknown-tool"
    impact_window = _impact_window(raw)
    affected_components = _affected_components(raw)
    correlation_group = _correlation_group(raw, event_type, source_tool)

    return {
        # Existing UI contract fields.
        "type": event_type,
        "time": time,
        "title": _as_text(title) or "Replay event",
        "severity": severity_text,
        "tool": source_tool,
        "source_id": source_id,

        # Normalized replay schema v1.
        "event_type": event_type,
        "source_tool": source_tool,
        "source_id": source_id,
        "event_time": time,
        "impact_window": impact_window,
        "affected_components": affected_components,
        "correlation_group": correlation_group,
        "correlation_keys": _dedupe([_get_first(raw, "correlation_keys", "correlation_key"), correlation_group]),
        "replay_schema_version": "rca-replay-event-v1",
    }


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
            "weighted_score": correlation.get("weighted_score"),
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
        replay_events.append(_normalize_replay_event(
            item,
            event_type="evidence",
            time=item.get("uploaded_at") or item.get("created_at") or item.get("updated_at"),
            title=_as_text(item.get("title") or item.get("original_filename") or item.get("filename") or "Evidence uploaded"),
            severity="INFO",
            tool=_as_text(item.get("tool")),
            source_id=item.get("id"),
        ))

    for item in parsed_results:
        if not isinstance(item, dict):
            continue
        replay_events.append(_normalize_replay_event(
            item,
            event_type="parsed_result",
            time=item.get("created_at"),
            title=_as_text(item.get("top_anomaly") or item.get("top_suspect") or item.get("summary") or "Parsed result saved"),
            severity=_as_text(item.get("severity") or "INFO").upper(),
            tool=_as_text(item.get("tool")),
            source_id=item.get("id"),
        ))

    for item in timeline:
        if not isinstance(item, dict):
            continue
        replay_events.append(_normalize_replay_event(
            item,
            event_type="timeline",
            time=item.get("time") or item.get("created_at"),
            title=_as_text(item.get("title") or item.get("description") or "Timeline event"),
            severity=_as_text(item.get("severity") or "INFO").upper(),
            tool=_as_text(item.get("tool")),
            source_id=item.get("id"),
        ))

    for item in _as_list(correlation.get("timeline_correlation")):
        if not isinstance(item, dict):
            continue
        replay_events.append(_normalize_replay_event(
            item,
            event_type="correlation",
            time=item.get("time"),
            title=_as_text(item.get("title") or "Correlation signal"),
            severity=_as_text(item.get("severity") or correlation.get("severity") or "INFO").upper(),
            tool=_as_text(item.get("tool")),
            source_id=item.get("id"),
        ))

    replay_events = sorted(
        replay_events,
        key=lambda item: _as_text(item.get("event_time") or item.get("time")),
    )

    return {
        "ok": True,
        "case_id": _case_id(case_data),
        "replay_ready": bool(replay_events),
        "count": len(replay_events),
        "schema_version": "rca-session-replay-v1",
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
