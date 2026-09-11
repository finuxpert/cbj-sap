"""Deterministic daily/weekly/monthly SAP workload evaluation.

SPHERE evaluates normalized PROGRAM and JOB observations. The result is a review
signal for Basis/ABAP teams, not a root-cause declaration. Current-period metrics
are compared with the immediately preceding period of equal length.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import text

from backend.db.session import get_engine

PERIOD_DAYS = {"1d": 1, "7d": 7, "30d": 30}
CPU_HIGH_AVG = float(os.getenv("SPHERE_EVAL_CPU_HIGH_AVG_PCT", "70"))
CPU_HIGH_PEAK = float(os.getenv("SPHERE_EVAL_CPU_HIGH_PEAK_PCT", "100"))
PSS_HIGH_GB = float(os.getenv("SPHERE_EVAL_PSS_HIGH_GB", "4"))
INCREASE_PCT = float(os.getenv("SPHERE_EVAL_INCREASE_PCT", "25"))
RECURRING_PCT = float(os.getenv("SPHERE_EVAL_RECURRING_PCT", "30"))
WP_CORRELATION_PCT = float(os.getenv("SPHERE_EVAL_WP_CORRELATION_PCT", "30"))


def _number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _round(value: Any, digits: int = 1) -> float | None:
    number = _number(value)
    return round(number, digits) if number is not None else None


def _change_pct(current: Any, previous: Any) -> float | None:
    current_value = _number(current)
    previous_value = _number(previous)
    if current_value is None or previous_value is None or previous_value <= 0:
        return None
    return round((current_value - previous_value) / previous_value * 100.0, 1)


def assess_workload(current: dict, previous: dict | None, total_checks: int) -> dict:
    """Return a deterministic review classification and supporting reason."""
    previous = previous or {}
    occurrences = int(current.get("occurrences") or 0)
    wp_checks = int(current.get("critical_wp_checks") or 0)
    avg_cpu = _number(current.get("avg_cpu_pct"))
    peak_cpu = _number(current.get("peak_cpu_pct"))
    avg_pss = _number(current.get("avg_pss_gb"))
    change = _change_pct(avg_cpu, previous.get("avg_cpu_pct"))
    recurring_rate = round(occurrences / total_checks * 100.0, 1) if total_checks else 0.0
    wp_rate = round(wp_checks / occurrences * 100.0, 1) if occurrences else 0.0

    high_resource = (
        (avg_cpu is not None and avg_cpu >= CPU_HIGH_AVG)
        or (peak_cpu is not None and peak_cpu >= CPU_HIGH_PEAK)
        or (avg_pss is not None and avg_pss >= PSS_HIGH_GB)
    )
    increasing = change is not None and change >= INCREASE_PCT
    recurring = occurrences >= 3 and recurring_rate >= RECURRING_PCT
    wp_correlated = occurrences >= 2 and wp_rate >= WP_CORRELATION_PCT

    if (high_resource and increasing) or (high_resource and wp_correlated):
        assessment = "NEEDS REVIEW"
        reason = "High resource usage is combined with an increasing trend or repeated Critical WP correlation."
    elif high_resource:
        assessment = "HIGH RESOURCE"
        reason = "Average/peak Process CPU or average PSS crossed the evaluation review threshold."
    elif increasing:
        assessment = "INCREASING"
        reason = "Average Process CPU increased materially versus the previous equivalent period."
    elif recurring:
        assessment = "RECURRING"
        reason = "The workload repeatedly appears across a material share of collection cycles."
    else:
        assessment = "STABLE"
        reason = "No high-resource, material increase, or recurring review threshold is currently met."

    return {
        "assessment": assessment,
        "assessment_reason": reason,
        "avg_cpu_change_pct": change,
        "recurring_rate_pct": recurring_rate,
        "critical_wp_correlation_pct": wp_rate,
        "signals": {
            "high_resource": high_resource,
            "increasing": increasing,
            "recurring": recurring,
            "critical_wp_correlated": wp_correlated,
        },
    }


def _aggregate_window(conn, start: datetime, end: datetime, consumer_type: str) -> list[dict]:
    type_clause = "AND tc.consumer_type = :consumer_type" if consumer_type in {"JOB", "PROGRAM"} else ""
    params: dict[str, Any] = {"start": start, "end": end}
    if type_clause:
        params["consumer_type"] = consumer_type

    rows = conn.execute(text(f"""
        WITH host_signal AS (
          SELECT collection_id, host, MAX(COALESCE(wp_critical, 0)) AS wp_critical
            FROM rundeck_host_metrics
           WHERE collected_at >= :start AND collected_at < :end
           GROUP BY collection_id, host
        )
        SELECT tc.consumer_type,
               tc.consumer_key,
               COUNT(DISTINCT tc.collection_id) AS occurrences,
               COUNT(*) AS observations,
               AVG(tc.cpu_pct) AS avg_cpu_pct,
               MAX(tc.cpu_pct) AS peak_cpu_pct,
               AVG(NULLIF(tc.details->>'pss_gb', '')::double precision) AS avg_pss_gb,
               MAX(NULLIF(tc.details->>'pss_gb', '')::double precision) AS peak_pss_gb,
               COUNT(DISTINCT tc.host) AS app_count,
               ARRAY_AGG(DISTINCT tc.host ORDER BY tc.host) AS hosts,
               MIN(tc.collected_at) AS first_seen,
               MAX(tc.collected_at) AS last_seen,
               COUNT(DISTINCT CASE WHEN COALESCE(hs.wp_critical, 0) > 0 THEN tc.collection_id END) AS critical_wp_checks
          FROM rundeck_top_consumers tc
          LEFT JOIN host_signal hs
            ON hs.collection_id = tc.collection_id AND hs.host = tc.host
         WHERE tc.collected_at >= :start
           AND tc.collected_at < :end
           AND tc.consumer_type IN ('JOB', 'PROGRAM')
           {type_clause}
         GROUP BY tc.consumer_type, tc.consumer_key
    """), params)
    return [dict(row._mapping) for row in rows]


def _ready_collection_count(conn, start: datetime, end: datetime) -> int:
    value = conn.execute(text("""
        SELECT COUNT(*)
          FROM rundeck_collections
         WHERE status = 'READY'
           AND COALESCE(finished_at, created_at) >= :start
           AND COALESCE(finished_at, created_at) < :end
    """), {"start": start, "end": end}).scalar()
    return int(value or 0)


def _anchor_time(conn) -> datetime:
    value = conn.execute(text("""
        SELECT MAX(COALESCE(finished_at, created_at))
          FROM rundeck_collections
         WHERE status = 'READY'
    """)).scalar()
    if value is None:
        return datetime.now(timezone.utc)
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def evaluation_report(period: str = "7d", consumer_type: str = "ALL", limit: int = 30) -> dict:
    period_key = str(period or "7d").lower()
    if period_key not in PERIOD_DAYS:
        raise ValueError("period must be one of 1d, 7d, 30d")
    type_key = str(consumer_type or "ALL").upper()
    if type_key not in {"ALL", "JOB", "PROGRAM"}:
        raise ValueError("type must be ALL, JOB or PROGRAM")

    engine = get_engine()
    if engine is None:
        raise RuntimeError("Database history is not enabled")

    days = PERIOD_DAYS[period_key]
    with engine.connect() as conn:
        end = _anchor_time(conn) + timedelta(microseconds=1)
        start = end - timedelta(days=days)
        previous_start = start - timedelta(days=days)
        current_rows = _aggregate_window(conn, start, end, type_key)
        previous_rows = _aggregate_window(conn, previous_start, start, type_key)
        current_checks = _ready_collection_count(conn, start, end)
        previous_checks = _ready_collection_count(conn, previous_start, start)

    previous_map = {
        (str(row.get("consumer_type")), str(row.get("consumer_key"))): row
        for row in previous_rows
    }
    priority = {"NEEDS REVIEW": 5, "HIGH RESOURCE": 4, "INCREASING": 3, "RECURRING": 2, "STABLE": 1}
    items: list[dict] = []
    for row in current_rows:
        previous = previous_map.get((str(row.get("consumer_type")), str(row.get("consumer_key"))))
        normalized = {
            **row,
            "occurrences": int(row.get("occurrences") or 0),
            "observations": int(row.get("observations") or 0),
            "app_count": int(row.get("app_count") or 0),
            "hosts": list(row.get("hosts") or []),
            "critical_wp_checks": int(row.get("critical_wp_checks") or 0),
            "avg_cpu_pct": _round(row.get("avg_cpu_pct")),
            "peak_cpu_pct": _round(row.get("peak_cpu_pct")),
            "avg_pss_gb": _round(row.get("avg_pss_gb"), 2),
            "peak_pss_gb": _round(row.get("peak_pss_gb"), 2),
            "previous": {
                "occurrences": int(previous.get("occurrences") or 0) if previous else 0,
                "avg_cpu_pct": _round(previous.get("avg_cpu_pct")) if previous else None,
                "peak_cpu_pct": _round(previous.get("peak_cpu_pct")) if previous else None,
                "avg_pss_gb": _round(previous.get("avg_pss_gb"), 2) if previous else None,
            },
        }
        normalized.update(assess_workload(normalized, normalized["previous"], current_checks))
        items.append(normalized)

    items.sort(key=lambda item: (
        priority.get(item["assessment"], 0),
        item.get("avg_cpu_pct") or 0,
        item.get("peak_cpu_pct") or 0,
        item.get("occurrences") or 0,
    ), reverse=True)
    items = items[:max(1, min(int(limit), 100))]

    summary = {
        "workloads": len(current_rows),
        "needs_review": sum(1 for item in current_rows if False),
        "programs": sum(1 for row in current_rows if row.get("consumer_type") == "PROGRAM"),
        "jobs": sum(1 for row in current_rows if row.get("consumer_type") == "JOB"),
    }
    summary["needs_review"] = sum(1 for item in items if item["assessment"] == "NEEDS REVIEW")
    summary["high_resource"] = sum(1 for item in items if item["assessment"] == "HIGH RESOURCE")
    summary["increasing"] = sum(1 for item in items if item["assessment"] == "INCREASING")
    summary["recurring"] = sum(1 for item in items if item["assessment"] == "RECURRING")

    return {
        "period": period_key,
        "days": days,
        "type": type_key,
        "start": start,
        "end": end,
        "previous_start": previous_start,
        "previous_end": start,
        "collection_checks": current_checks,
        "previous_collection_checks": previous_checks,
        "thresholds": {
            "avg_cpu_high_pct": CPU_HIGH_AVG,
            "peak_cpu_high_pct": CPU_HIGH_PEAK,
            "avg_pss_high_gb": PSS_HIGH_GB,
            "increase_pct": INCREASE_PCT,
            "recurring_pct": RECURRING_PCT,
            "critical_wp_correlation_pct": WP_CORRELATION_PCT,
        },
        "summary": summary,
        "items": items,
        "method": "Deterministic historical comparison; review signal, not root-cause proof.",
    }
