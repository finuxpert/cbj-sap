"""Deterministic lifecycle grouping for repeated SAP performance signals."""
from __future__ import annotations

import hashlib
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from backend.db.session import get_engine
from backend.rundeck_monitoring import (
    CPU_CRITICAL,
    CPU_WARNING,
    IOWAIT_CRITICAL,
    IOWAIT_WARNING,
    RAM_CRITICAL,
    RAM_WARNING,
    RETENTION_DAYS,
    WP_CRITICAL,
    WP_WARNING,
)

INCIDENT_GAP_MINUTES = 25
RESOLVE_HEALTHY_CHECKS = 2

SIGNALS = {
    "CPU_HIGH": {
        "field": "cpu_pct",
        "label": "CPU",
        "unit": "%",
        "warning": CPU_WARNING,
        "critical": CPU_CRITICAL,
    },
    "RAM_HIGH": {
        "field": "ram_pct",
        "label": "RAM",
        "unit": "%",
        "warning": RAM_WARNING,
        "critical": RAM_CRITICAL,
    },
    "IOWAIT_HIGH": {
        "field": "io_wait_pct",
        "label": "IO Wait",
        "unit": "%",
        "warning": IOWAIT_WARNING,
        "critical": IOWAIT_CRITICAL,
    },
    "WP_CRITICAL": {
        "field": "wp_critical",
        "label": "Critical WP",
        "unit": "",
        "warning": WP_WARNING,
        "critical": WP_CRITICAL,
    },
}


def _utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _incident_id(host: str, code: str, first_seen: datetime) -> str:
    seed = f"{host}|{code}|{_utc(first_seen).isoformat()}".encode()
    return hashlib.sha1(seed).hexdigest()[:20]


def _evidence_key(row: dict, code: str | None = None) -> tuple[str, str, str]:
    return (
        str(row.get("collection_id") or ""),
        str(row.get("host") or "").upper(),
        str(code or row.get("code") or "").upper(),
    )


def _severity(code: str, value: float | int | None) -> str:
    if code == "WP_CRITICAL":
        if value is not None and float(value) >= float(SIGNALS[code]["critical"]):
            return "CRITICAL"
        return "ATTENTION"
    critical = SIGNALS[code]["critical"]
    if value is not None and float(value) >= float(critical):
        return "CRITICAL"
    return "WARNING"


def _finalize(incident: dict) -> dict:
    first_seen = _utc(incident["first_seen"])
    last_seen = _utc(incident["last_seen"])
    incident["id"] = _incident_id(incident["host"], incident["code"], first_seen)
    incident["duration_seconds"] = max(0, int((last_seen - first_seen).total_seconds()))
    incident["current_severity"] = _severity(incident["code"], incident.get("latest_value"))
    incident["peak_severity"] = _severity(incident["code"], incident.get("peak_value"))
    # Backward compatibility: severity now represents the current state.
    incident["severity"] = incident["current_severity"]
    incident["evidence_count"] = len(incident.get("evidence") or [])
    return incident


def build_incidents(
    samples: list[dict],
    evidence: list[dict] | None = None,
    visible_since: datetime | None = None,
    limit: int | None = None,
) -> list[dict]:
    """Group host+signal observations into lifecycle incidents.

    One healthy host observation is tolerated to avoid flapping. Two
    consecutive healthy observations confirm resolution. A host observation
    gap over 25 minutes closes the previous episode; ``resolved_at`` remains
    unset for a gap because the exact recovery time is not known.
    """
    evidence_map: dict[tuple[str, str, str], list[dict]] = defaultdict(list)
    for row in evidence or []:
        evidence_map[_evidence_key(row)].append(dict(row))

    normalized = [dict(row) for row in samples if row.get("host") and row.get("collected_at")]
    normalized.sort(
        key=lambda row: (
            _utc(row["collected_at"]),
            str(row.get("host")),
            str(row.get("collection_id")),
        )
    )
    global_latest = max((_utc(row["collected_at"]) for row in normalized), default=None)

    by_host: dict[str, list[dict]] = defaultdict(list)
    for row in normalized:
        by_host[str(row["host"]).upper()].append(row)

    incidents: list[dict] = []
    gap = timedelta(minutes=INCIDENT_GAP_MINUTES)

    for host, host_rows in by_host.items():
        host_rows.sort(key=lambda row: (_utc(row["collected_at"]), str(row.get("collection_id"))))
        for code, config in SIGNALS.items():
            current: dict | None = None
            clear_checks = 0
            previous_sample_at: datetime | None = None

            for row in host_rows:
                at = _utc(row["collected_at"])
                if current is not None and previous_sample_at is not None and at - previous_sample_at > gap:
                    current["state"] = "RESOLVED"
                    current["resolved_at"] = None
                    current["resolution_reason"] = "OBSERVATION_GAP"
                    incidents.append(_finalize(current))
                    current = None
                    clear_checks = 0

                raw_value = row.get(config["field"])
                try:
                    value = float(raw_value) if raw_value is not None else None
                except (TypeError, ValueError):
                    value = None
                signal_active = value is not None and value >= float(config["warning"])

                if signal_active:
                    event_evidence = evidence_map.get(_evidence_key(row, code), [])
                    if current is None:
                        current = {
                            "host": host,
                            "code": code,
                            "signal": config["label"],
                            "unit": config["unit"],
                            "state": "ACTIVE",
                            "first_seen": at,
                            "last_seen": at,
                            "resolved_at": None,
                            "resolution_reason": None,
                            "checks": 1,
                            "peak_value": value,
                            "latest_value": value,
                            "latest_collection_id": row.get("collection_id"),
                            "pending_clear_checks": 0,
                            "evidence": [dict(item) for item in event_evidence],
                        }
                    else:
                        current["last_seen"] = at
                        current["checks"] += 1
                        current["peak_value"] = max(float(current["peak_value"]), value)
                        current["latest_value"] = value
                        current["latest_collection_id"] = row.get("collection_id")
                        current["evidence"].extend(dict(item) for item in event_evidence)
                    clear_checks = 0
                    current["pending_clear_checks"] = 0
                elif current is not None:
                    clear_checks += 1
                    current["pending_clear_checks"] = clear_checks
                    if clear_checks >= RESOLVE_HEALTHY_CHECKS:
                        current["state"] = "RESOLVED"
                        current["resolved_at"] = at
                        current["resolution_reason"] = "HEALTHY_CHECKS"
                        incidents.append(_finalize(current))
                        current = None
                        clear_checks = 0

                previous_sample_at = at

            if current is not None:
                if previous_sample_at is not None and global_latest is not None and global_latest - previous_sample_at > gap:
                    current["state"] = "RESOLVED"
                    current["resolved_at"] = None
                    current["resolution_reason"] = "OBSERVATION_GAP"
                else:
                    current["state"] = "ACTIVE"
                incidents.append(_finalize(current))

    if visible_since is not None:
        visible_since = _utc(visible_since)
        incidents = [
            item
            for item in incidents
            if item["state"] == "ACTIVE"
            or _utc(item.get("resolved_at") or item["last_seen"]) >= visible_since
        ]

    severity_rank = {"ATTENTION": 1, "WARNING": 2, "CRITICAL": 3}
    incidents.sort(
        key=lambda item: (
            0 if item["state"] == "ACTIVE" else 1,
            -severity_rank.get(item.get("current_severity"), 0),
            -severity_rank.get(item.get("peak_severity"), 0),
            -_utc(item.get("resolved_at") or item["last_seen"]).timestamp(),
            item["host"],
            item["code"],
        )
    )
    return incidents[:limit] if limit is not None else incidents


def incident_history(since: datetime, limit: int = 200) -> list[dict]:
    """Build incidents from normalized telemetry while retaining raw evidence."""
    engine = get_engine()
    if engine is None:
        raise RuntimeError("Database history is not enabled")

    # Scan the retained normalized history so an incident that started before
    # the requested display range keeps its real first_seen timestamp.
    scan_since = datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)
    with engine.connect() as conn:
        sample_rows = conn.execute(text("""
            SELECT collection_id, collected_at, host, cpu_pct, ram_pct, io_wait_pct, wp_critical
              FROM rundeck_host_metrics
             WHERE collected_at >= :scan_since
             ORDER BY collected_at ASC, host ASC, collection_id ASC
        """), {"scan_since": scan_since})
        samples = [dict(row._mapping) for row in sample_rows]

        evidence_rows = conn.execute(text("""
            SELECT a.id, a.collection_id, c.execution_id, a.collected_at, a.host,
                   a.code, a.severity, a.message, a.details
              FROM rundeck_alerts a
              LEFT JOIN rundeck_collections c
                ON c.collection_id = a.collection_id
             WHERE a.collected_at >= :scan_since
               AND a.code IN ('CPU_HIGH', 'RAM_HIGH', 'IOWAIT_HIGH', 'WP_CRITICAL')
             ORDER BY a.collected_at ASC, a.host ASC, a.code ASC, a.id ASC
        """), {"scan_since": scan_since})
        evidence = [dict(row._mapping) for row in evidence_rows]

    return build_incidents(samples, evidence, visible_since=since, limit=limit)
