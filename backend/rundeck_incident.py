"""Current SAP performance incident summary and workload correlation.

This module answers the first Basis RCA questions from normalized Rundeck data:
when the active degradation signal started, which application server is affected,
what workload is hottest in the current collection, and which workload remains
most persistent across the incident window. Correlation is evidence, not proof
of root cause.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import text

from backend.db.session import get_engine
from backend.rundeck_latest import latest_ready_host_metrics
from backend.rundeck_monitoring import (
    CPU_CRITICAL,
    CPU_WARNING,
    IOWAIT_CRITICAL,
    IOWAIT_WARNING,
    RAM_CRITICAL,
    RAM_WARNING,
    WP_CRITICAL,
    WP_WARNING,
)

INCIDENT_LOOKBACK_HOURS = max(1, int(os.getenv("SPHERE_INCIDENT_LOOKBACK_HOURS", "24")))
INCIDENT_GAP_MINUTES = max(5, int(os.getenv("SPHERE_INCIDENT_GAP_MINUTES", "22")))
WP_ONLY_CRITICAL_COUNT = max(1, int(os.getenv("SPHERE_WP_ONLY_CRITICAL_COUNT", "8")))
WP_ONLY_CRITICAL_SAMPLES = max(2, int(os.getenv("SPHERE_WP_ONLY_CRITICAL_SAMPLES", "6")))

_SIGNAL_DEFS = (
    {
        "code": "WP_CRITICAL",
        "key": "wp_critical",
        "label": "Critical Work Process",
        "warning": float(WP_WARNING),
        "critical": float(WP_CRITICAL),
        "unit": "",
        "priority": 4,
        "host_resource": False,
    },
    {
        "code": "IOWAIT_HIGH",
        "key": "io_wait_pct",
        "label": "Host I/O Wait",
        "warning": float(IOWAIT_WARNING),
        "critical": float(IOWAIT_CRITICAL),
        "unit": "%",
        "priority": 3,
        "host_resource": True,
    },
    {
        "code": "CPU_HIGH",
        "key": "cpu_pct",
        "label": "Host CPU",
        "warning": float(CPU_WARNING),
        "critical": float(CPU_CRITICAL),
        "unit": "%",
        "priority": 2,
        "host_resource": True,
    },
    {
        "code": "RAM_HIGH",
        "key": "ram_pct",
        "label": "Host Memory",
        "warning": float(RAM_WARNING),
        "critical": float(RAM_CRITICAL),
        "unit": "%",
        "priority": 1,
        "host_resource": True,
    },
)
_SIGNAL_BY_CODE = {item["code"]: item for item in _SIGNAL_DEFS}
_SEVERITY = {"NORMAL": 0, "WARNING": 1, "CRITICAL": 2}


def _number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def active_signals(metric: dict) -> list[dict]:
    """Return threshold signals currently active for one normalized host metric.

    A signal can be called CRITICAL because it crossed that signal's threshold. That
    does not automatically make the whole SAP incident CRITICAL; incident severity is
    assessed separately after persistence and host-resource evidence are available.
    """
    signals: list[dict] = []
    for definition in _SIGNAL_DEFS:
        value = _number(metric.get(definition["key"]))
        if value is None or value < definition["warning"]:
            continue
        severity = "CRITICAL" if value >= definition["critical"] else "WARNING"
        threshold = definition["critical"] if severity == "CRITICAL" else definition["warning"]
        signals.append({
            "code": definition["code"],
            "label": definition["label"],
            "severity": severity,
            "value": value,
            "warning": definition["warning"],
            "critical": definition["critical"],
            "unit": definition["unit"],
            "host_resource": definition["host_resource"],
            "score": value / threshold if threshold else value,
            "priority": definition["priority"],
        })
    return sorted(
        signals,
        key=lambda item: (_SEVERITY[item["severity"]], item["score"], item["priority"]),
        reverse=True,
    )


def primary_signal(metric: dict) -> dict | None:
    signals = active_signals(metric)
    return signals[0] if signals else None


def _signal_active(metric: dict, code: str) -> bool:
    definition = _SIGNAL_BY_CODE.get(code)
    if not definition:
        return False
    value = _number(metric.get(definition["key"]))
    return value is not None and value >= definition["warning"]


def continuous_incident_samples(
    samples: list[dict],
    signal_code: str,
    gap_minutes: int = INCIDENT_GAP_MINUTES,
) -> list[dict]:
    """Keep the latest uninterrupted run of the same signal.

    A healthy sample or an unexpectedly large telemetry gap closes the previous
    incident. Returned samples are chronological, oldest first.
    """
    ordered = sorted(
        (row for row in samples if isinstance(row.get("collected_at"), datetime)),
        key=lambda row: row["collected_at"],
        reverse=True,
    )
    if not ordered or not _signal_active(ordered[0], signal_code):
        return []

    selected = [ordered[0]]
    previous = ordered[0]["collected_at"]
    max_gap = timedelta(minutes=gap_minutes)
    for row in ordered[1:]:
        current = row["collected_at"]
        if previous - current > max_gap or not _signal_active(row, signal_code):
            break
        selected.append(row)
        previous = current
    return list(reversed(selected))


def incident_severity(signal: dict, current_signals: list[dict], incident_samples: list[dict]) -> tuple[str, str, str]:
    """Return incident severity, confidence and a short deterministic reason.

    Critical WP is an SAP signal name/count, not by itself proof of a critical host
    incident. Resource critical thresholds remain decisive. A WP-only incident is
    promoted to CRITICAL only when an intentionally high count persists for multiple
    collection cycles; defaults are conservative and environment-configurable.
    """
    resource_signals = [item for item in current_signals if item.get("host_resource")]
    critical_resources = [item for item in resource_signals if item.get("severity") == "CRITICAL"]
    if critical_resources:
        labels = ", ".join(item["label"] for item in critical_resources)
        return "CRITICAL", "HIGH", f"Critical host resource threshold: {labels}."

    if signal.get("code") == "WP_CRITICAL":
        current_wp = _number(signal.get("value")) or 0.0
        persistent = len(incident_samples) >= 3
        extreme_persistent = current_wp >= WP_ONLY_CRITICAL_COUNT and len(incident_samples) >= WP_ONLY_CRITICAL_SAMPLES
        if extreme_persistent:
            return "CRITICAL", "HIGH", (
                f"Critical WP count {int(current_wp)} persisted for {len(incident_samples)} checks."
            )
        if persistent:
            return "WARNING", "HIGH", (
                f"Critical WP signal persisted for {len(incident_samples)} checks while host resources remain below critical thresholds."
            )
        return "WARNING", "MEDIUM", "Critical WP signal detected without critical host resource pressure."

    if signal.get("severity") == "CRITICAL":
        return "CRITICAL", "HIGH", f"{signal.get('label', 'Host resource')} crossed its critical threshold."
    if resource_signals:
        return "WARNING", "HIGH" if len(incident_samples) >= 3 else "MEDIUM", "Host resource warning threshold is active."
    return "WARNING", "MEDIUM", "SAP performance signal is active."


def _current_workload(conn, host: str, collection_id: str | None) -> dict | None:
    """Top normalized SAP workload for the exact current Collection Cycle."""
    if not collection_id:
        return None
    row = conn.execute(text("""
        SELECT collection_id, collected_at, consumer_type, consumer_key,
               rank, cpu_pct, ram_pct, details
          FROM rundeck_top_consumers
         WHERE host = :host
           AND collection_id = :collection_id
         ORDER BY rank ASC, cpu_pct DESC NULLS LAST
         LIMIT 1
    """), {"host": host, "collection_id": collection_id}).mappings().first()
    if not row:
        return None
    return {
        "collection_id": row["collection_id"],
        "collected_at": row["collected_at"],
        "consumer_type": row["consumer_type"],
        "consumer_key": row["consumer_key"],
        "rank": int(row["rank"] or 0),
        "cpu_pct": float(row["cpu_pct"]) if row["cpu_pct"] is not None else None,
        "ram_pct": float(row["ram_pct"]) if row["ram_pct"] is not None else None,
        "details": dict(row["details"] or {}),
    }


def _persistent_workload_candidate(conn, host: str, collection_ids: list[str]) -> dict | None:
    if not collection_ids:
        return None
    params: dict[str, Any] = {"host": host}
    placeholders = []
    for index, collection_id in enumerate(collection_ids):
        key = f"cid_{index}"
        placeholders.append(f":{key}")
        params[key] = collection_id
    in_clause = ", ".join(placeholders)

    aggregate = conn.execute(text(f"""
        SELECT consumer_type, consumer_key,
               COUNT(DISTINCT collection_id) AS occurrences,
               AVG(cpu_pct) AS avg_cpu_pct,
               MAX(cpu_pct) AS peak_cpu_pct,
               AVG(rank) AS avg_rank,
               MAX(collected_at) AS last_seen
          FROM rundeck_top_consumers
         WHERE host = :host
           AND collection_id IN ({in_clause})
         GROUP BY consumer_type, consumer_key
         ORDER BY COUNT(DISTINCT collection_id) DESC,
                  AVG(rank) ASC,
                  MAX(cpu_pct) DESC NULLS LAST
         LIMIT 1
    """), params).mappings().first()
    if not aggregate:
        return None

    detail_params = {
        **params,
        "consumer_type": aggregate["consumer_type"],
        "consumer_key": aggregate["consumer_key"],
    }
    representative = conn.execute(text(f"""
        SELECT collection_id, collected_at, rank, cpu_pct, ram_pct, details
          FROM rundeck_top_consumers
         WHERE host = :host
           AND collection_id IN ({in_clause})
           AND consumer_type = :consumer_type
           AND consumer_key = :consumer_key
         ORDER BY cpu_pct DESC NULLS LAST, rank ASC, collected_at DESC
         LIMIT 1
    """), detail_params).mappings().first()

    occurrences = int(aggregate["occurrences"] or 0)
    affected_samples = len(collection_ids)
    return {
        "consumer_type": aggregate["consumer_type"],
        "consumer_key": aggregate["consumer_key"],
        "occurrences": occurrences,
        "affected_samples": affected_samples,
        "presence_pct": round(occurrences / affected_samples * 100.0, 1) if affected_samples else 0.0,
        "avg_cpu_pct": float(aggregate["avg_cpu_pct"]) if aggregate["avg_cpu_pct"] is not None else None,
        "peak_cpu_pct": float(aggregate["peak_cpu_pct"]) if aggregate["peak_cpu_pct"] is not None else None,
        "last_seen": aggregate["last_seen"],
        "representative_collection_id": representative["collection_id"] if representative else None,
        "representative_at": representative["collected_at"] if representative else None,
        "representative_cpu_pct": float(representative["cpu_pct"]) if representative and representative["cpu_pct"] is not None else None,
        "representative_ram_pct": float(representative["ram_pct"]) if representative and representative["ram_pct"] is not None else None,
        "details": dict(representative["details"] or {}) if representative else {},
    }


def performance_incident_summary() -> dict:
    snapshot = latest_ready_host_metrics()
    items = snapshot.get("items") or []
    base = {
        "collection_id": snapshot.get("collection_id"),
        "execution_id": snapshot.get("execution_id"),
        "collection_started_at": snapshot.get("started_at"),
        "collection_finished_at": snapshot.get("finished_at"),
        "complete": bool(snapshot.get("complete")),
    }
    if not items:
        return {
            **base,
            "status": "WAITING",
            "active": False,
            "assessment": "No complete normalized Application Server telemetry is available yet.",
        }

    candidates = []
    affected_servers = []
    for metric in items:
        signals = active_signals(metric)
        if not signals:
            continue
        affected_servers.append({
            "host": metric["host"],
            "health": metric.get("health"),
            "signals": signals,
        })
        signal = signals[0]
        candidates.append((
            _SEVERITY[signal["severity"]],
            signal["score"],
            signal["priority"],
            metric,
            signal,
        ))

    if not candidates:
        latest_sample = max((row.get("collected_at") for row in items if row.get("collected_at")), default=None)
        return {
            **base,
            "status": "NORMAL",
            "active": False,
            "last_observed": latest_sample,
            "affected_servers": [],
            "host_resource_pressure": False,
            "host_saturation": False,
            "resource_assessment": "Host CPU, RAM and IO Wait are below configured pressure thresholds.",
            "assessment": "No active host resource or Critical WP threshold is detected in the latest collection.",
        }

    candidates.sort(key=lambda item: item[:3], reverse=True)
    _, _, _, current_metric, signal = candidates[0]
    host = current_metric["host"]
    latest_at = current_metric["collected_at"]
    if latest_at.tzinfo is None:
        latest_at = latest_at.replace(tzinfo=timezone.utc)

    engine = get_engine()
    if engine is None:
        raise RuntimeError("Database history is not enabled")
    lookback = latest_at - timedelta(hours=INCIDENT_LOOKBACK_HOURS)
    with engine.connect() as conn:
        history_rows = conn.execute(text("""
            SELECT DISTINCT ON (m.collection_id)
                   m.collection_id, m.collected_at, m.host, m.cpu_pct, m.ram_pct,
                   m.load_1, m.io_wait_pct, m.swap_pct, m.wp_critical, m.health
              FROM rundeck_host_metrics m
              JOIN rundeck_collections c ON c.collection_id = m.collection_id
             WHERE m.host = :host
               AND c.status = 'READY'
               AND m.collected_at BETWEEN :since AND :latest
             ORDER BY m.collection_id, m.collected_at DESC
        """), {"host": host, "since": lookback, "latest": latest_at})
        history = [dict(row._mapping) for row in history_rows]
        incident_samples = continuous_incident_samples(history, signal["code"])
        collection_ids = [row["collection_id"] for row in incident_samples]
        current_workload = _current_workload(conn, host, snapshot.get("collection_id"))
        persistent_workload = _persistent_workload_candidate(conn, host, collection_ids)

    signal_active_since = incident_samples[0]["collected_at"] if incident_samples else latest_at
    last_observed = incident_samples[-1]["collected_at"] if incident_samples else latest_at
    duration_seconds = max(0, int((last_observed - signal_active_since).total_seconds()))
    all_current_signals = active_signals(current_metric)
    host_resource_pressure = any(item["host_resource"] for item in all_current_signals)
    status, confidence, severity_reason = incident_severity(signal, all_current_signals, incident_samples)
    resource_assessment = (
        "Host resource pressure is detected on the affected Application Server."
        if host_resource_pressure
        else "Host CPU, RAM and IO Wait are below configured pressure thresholds."
    )

    if signal["code"] == "WP_CRITICAL" and not host_resource_pressure:
        assessment = "Persistent Critical WP activity is the primary RCA path; current host resources remain below configured pressure thresholds."
    elif host_resource_pressure and persistent_workload:
        assessment = "Host resource pressure is present. Correlate the affected server with current and recurring SAP workload evidence before assigning root cause."
    elif host_resource_pressure:
        assessment = "Host resource pressure is present, but no normalized SAP workload candidate is available for the active signal window."
    else:
        assessment = "An SAP performance signal is active. Use workload correlation as RCA evidence, not proof of root cause."

    return {
        **base,
        "status": status,
        "signal_severity": signal["severity"],
        "confidence": confidence,
        "severity_reason": severity_reason,
        "active": True,
        "signal_active_since": signal_active_since,
        "detected_since": signal_active_since,
        "last_observed": last_observed,
        "duration_seconds": duration_seconds,
        "incident_samples": len(incident_samples),
        "affected_server": host,
        "affected_servers": affected_servers,
        "primary_signal": {key: value for key, value in signal.items() if key not in {"score", "priority"}},
        "host_resource_pressure": host_resource_pressure,
        "host_saturation": host_resource_pressure,
        "resource_assessment": resource_assessment,
        "current_host_metrics": {
            "cpu_pct": current_metric.get("cpu_pct"),
            "ram_pct": current_metric.get("ram_pct"),
            "load_1": current_metric.get("load_1"),
            "io_wait_pct": current_metric.get("io_wait_pct"),
            "swap_pct": current_metric.get("swap_pct"),
            "wp_critical": current_metric.get("wp_critical"),
        },
        "current_workload": current_workload,
        "persistent_workload": persistent_workload,
        "primary_workload": persistent_workload,
        "assessment": assessment,
    }
