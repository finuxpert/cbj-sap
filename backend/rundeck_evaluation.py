"""Deterministic daily/weekly/monthly SAP workload evaluation.

SPHERE evaluates normalized PROGRAM and JOB observations. The result is a review
signal for Basis/ABAP teams, not a root-cause declaration. Current-period metrics
are compared with the immediately preceding period of equal length only when the
historical baseline has enough complete telemetry to support that comparison.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from statistics import median
from typing import Any

from sqlalchemy import text

from backend.db.session import get_engine
from backend.rundeck_consumers import TOP_CONSUMERS_PER_HOST

PERIOD_DAYS = {"1d": 1, "7d": 7, "30d": 30}
CPU_HIGH_AVG = float(os.getenv("SPHERE_EVAL_CPU_HIGH_AVG_PCT", "70"))
CPU_HIGH_PEAK = float(os.getenv("SPHERE_EVAL_CPU_HIGH_PEAK_PCT", "100"))
PSS_HIGH_GB = float(os.getenv("SPHERE_EVAL_PSS_HIGH_GB", "4"))
INCREASE_PCT = float(os.getenv("SPHERE_EVAL_INCREASE_PCT", "25"))
RECURRING_PCT = float(os.getenv("SPHERE_EVAL_RECURRING_PCT", "30"))
WP_CORRELATION_PCT = float(os.getenv("SPHERE_EVAL_WP_CORRELATION_PCT", "30"))
MIN_BASELINE_OCCURRENCES = max(2, int(os.getenv("SPHERE_EVAL_MIN_BASELINE_OCCURRENCES", "5")))
CONFIDENCE_MEDIUM_OCCURRENCES = max(2, int(os.getenv("SPHERE_EVAL_CONFIDENCE_MEDIUM_OCCURRENCES", "4")))
CONFIDENCE_HIGH_OCCURRENCES = max(CONFIDENCE_MEDIUM_OCCURRENCES, int(os.getenv("SPHERE_EVAL_CONFIDENCE_HIGH_OCCURRENCES", "20")))
_CONFIDENCE_RANK = {"LOW": 1, "MEDIUM": 2, "HIGH": 3}


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


def _cap_confidence(value: str, period_confidence: str) -> str:
    value_rank = _CONFIDENCE_RANK.get(value, 1)
    period_rank = _CONFIDENCE_RANK.get(period_confidence, 1)
    target = min(value_rank, period_rank)
    return next((name for name, rank in _CONFIDENCE_RANK.items() if rank == target), "LOW")


def _workload_confidence(occurrences: int, period_confidence: str) -> str:
    if occurrences >= CONFIDENCE_HIGH_OCCURRENCES:
        raw = "HIGH"
    elif occurrences >= CONFIDENCE_MEDIUM_OCCURRENCES:
        raw = "MEDIUM"
    else:
        raw = "LOW"
    return _cap_confidence(raw, period_confidence)


def assess_workload(
    current: dict,
    previous: dict | None,
    total_checks: int,
    *,
    baseline_eligible: bool = True,
    period_confidence: str = "HIGH",
) -> dict:
    """Return deterministic review classification, confidence and supporting reason."""
    previous = previous or {}
    occurrences = int(current.get("occurrences") or 0)
    wp_checks = int(current.get("critical_wp_checks") or 0)
    avg_cpu = _number(current.get("avg_cpu_pct"))
    peak_cpu = _number(current.get("peak_cpu_pct"))
    avg_pss = _number(current.get("avg_pss_gb"))
    evidence_confidence = _workload_confidence(occurrences, period_confidence)
    change = _change_pct(avg_cpu, previous.get("avg_cpu_pct")) if baseline_eligible else None
    recurring_rate = round(occurrences / total_checks * 100.0, 1) if total_checks else 0.0
    wp_rate = round(wp_checks / occurrences * 100.0, 1) if occurrences else 0.0

    high_resource = (
        (avg_cpu is not None and avg_cpu >= CPU_HIGH_AVG)
        or (peak_cpu is not None and peak_cpu >= CPU_HIGH_PEAK)
        or (avg_pss is not None and avg_pss >= PSS_HIGH_GB)
    )
    increasing = baseline_eligible and change is not None and change >= INCREASE_PCT
    recurring_signal = occurrences >= 3 and recurring_rate >= RECURRING_PCT
    wp_overlap_signal = occurrences >= 2 and wp_rate >= WP_CORRELATION_PCT
    enough_evidence = evidence_confidence in {"MEDIUM", "HIGH"}
    wp_correlated = wp_overlap_signal and enough_evidence
    recurring = recurring_signal and enough_evidence

    if high_resource and enough_evidence and (increasing or wp_correlated):
        assessment = "NEEDS REVIEW"
        reason = "High resource usage is combined with a supported trend increase or repeated host Critical WP signal overlap."
    elif high_resource:
        assessment = "HIGH RESOURCE"
        reason = "Average/peak Process CPU or average PSS crossed the review threshold; evidence confidence is shown separately."
    elif increasing:
        assessment = "INCREASING"
        reason = "Average Process CPU increased materially versus a sufficiently covered previous equivalent period."
    elif recurring:
        assessment = "RECURRING"
        reason = "The workload repeatedly appears across a material share of complete collection cycles."
    elif not enough_evidence:
        assessment = "LIMITED DATA"
        reason = "Too few observations or insufficient period coverage are available for a stronger historical classification."
    else:
        assessment = "STABLE"
        reason = "No high-resource, supported material increase, or recurring review threshold is currently met."

    return {
        "assessment": assessment,
        "assessment_reason": reason,
        "evidence_confidence": evidence_confidence,
        "baseline_available": bool(baseline_eligible),
        "avg_cpu_change_pct": change,
        "recurring_rate_pct": recurring_rate,
        "wp_signal_overlap_pct": wp_rate,
        # Backward-compatible field name for existing API consumers.
        "critical_wp_correlation_pct": wp_rate,
        "signals": {
            "high_resource": high_resource,
            "increasing": increasing,
            "recurring": recurring,
            "recurring_signal": recurring_signal,
            "critical_wp_correlated": wp_correlated,
            "wp_signal_overlap": wp_overlap_signal,
        },
    }


def _complete_collection_clause(alias: str = "c") -> str:
    return (
        f"{alias}.status = 'READY' "
        f"AND {alias}.expected_host_count > 0 "
        f"AND {alias}.received_host_count >= {alias}.expected_host_count"
    )


def _aggregate_window(conn, start: datetime, end: datetime, consumer_type: str) -> list[dict]:
    type_clause = "AND tc.consumer_type = :consumer_type" if consumer_type in {"JOB", "PROGRAM"} else ""
    params: dict[str, Any] = {"start": start, "end": end}
    if type_clause:
        params["consumer_type"] = consumer_type

    rows = conn.execute(text(f"""
        WITH complete_collections AS (
          SELECT collection_id
            FROM rundeck_collections c
           WHERE {_complete_collection_clause('c')}
             AND COALESCE(c.finished_at, c.started_at) >= :start
             AND COALESCE(c.finished_at, c.started_at) < :end
        ),
        host_signal AS (
          SELECT hm.collection_id, hm.host, MAX(COALESCE(hm.wp_critical, 0)) AS wp_critical
            FROM rundeck_host_metrics hm
            JOIN complete_collections cc ON cc.collection_id = hm.collection_id
           GROUP BY hm.collection_id, hm.host
        )
        SELECT tc.consumer_type,
               tc.consumer_key,
               COUNT(DISTINCT tc.collection_id) AS occurrences,
               COUNT(*) AS observations,
               AVG(tc.cpu_pct) AS avg_cpu_pct,
               MAX(tc.cpu_pct) AS peak_cpu_pct,
               AVG(NULLIF(COALESCE(tc.details->>'total_pss_gb', tc.details->>'pss_gb'), '')::double precision) AS avg_pss_gb,
               MAX(NULLIF(COALESCE(tc.details->>'total_pss_gb', tc.details->>'pss_gb'), '')::double precision) AS peak_pss_gb,
               COUNT(DISTINCT tc.host) AS app_count,
               ARRAY_AGG(DISTINCT tc.host ORDER BY tc.host) AS hosts,
               MIN(tc.collected_at) AS first_seen,
               MAX(tc.collected_at) AS last_seen,
               COUNT(DISTINCT CASE WHEN COALESCE(hs.wp_critical, 0) > 0 THEN tc.collection_id END) AS critical_wp_checks,
               MAX(tc.rank) AS max_rank_seen,
               COUNT(*) FILTER (WHERE tc.details->>'resource_aggregation' = 'SUM_BY_CONSUMER') AS aggregate_resource_observations
          FROM rundeck_top_consumers tc
          JOIN complete_collections cc ON cc.collection_id = tc.collection_id
          LEFT JOIN host_signal hs
            ON hs.collection_id = tc.collection_id AND hs.host = tc.host
         WHERE tc.collected_at >= :start
           AND tc.collected_at < :end
           AND tc.consumer_type IN ('JOB', 'PROGRAM')
           {type_clause}
         GROUP BY tc.consumer_type, tc.consumer_key
    """), params)
    return [dict(row._mapping) for row in rows]


def _collection_quality(conn, start: datetime, end: datetime) -> dict:
    rows = conn.execute(text("""
        SELECT status,
               COALESCE(finished_at, started_at) AS observed_at,
               expected_host_count,
               received_host_count
          FROM rundeck_collections
         WHERE COALESCE(finished_at, started_at) >= :start
           AND COALESCE(finished_at, started_at) < :end
         ORDER BY COALESCE(finished_at, started_at) ASC
    """), {"start": start, "end": end}).mappings().all()

    complete = [
        row for row in rows
        if row.get("status") == "READY"
        and int(row.get("expected_host_count") or 0) > 0
        and int(row.get("received_host_count") or 0) >= int(row.get("expected_host_count") or 0)
        and row.get("observed_at") is not None
    ]
    partial = [row for row in rows if row not in complete]
    times = [row["observed_at"] if row["observed_at"].tzinfo else row["observed_at"].replace(tzinfo=timezone.utc) for row in complete]
    window_seconds = max(1.0, (end - start).total_seconds())
    observed_span_seconds = max(0.0, (times[-1] - times[0]).total_seconds()) if len(times) > 1 else 0.0
    gaps = [max(0.0, (right - left).total_seconds()) for left, right in zip(times, times[1:]) if right > left]
    cadence_seconds = median(gaps) if gaps else None
    expected_checks = int(window_seconds / cadence_seconds) + 1 if cadence_seconds and cadence_seconds > 0 else None
    check_coverage_pct = min(100.0, len(complete) / expected_checks * 100.0) if expected_checks else (100.0 if len(complete) > 1 and observed_span_seconds >= window_seconds * .95 else 0.0)
    time_coverage_pct = min(100.0, observed_span_seconds / window_seconds * 100.0)
    coverage_pct = round(min(check_coverage_pct, time_coverage_pct), 1)

    expected_hosts = max((int(row.get("expected_host_count") or 0) for row in rows), default=0)
    host_ratios = [
        min(1.0, int(row.get("received_host_count") or 0) / int(row.get("expected_host_count") or 1))
        for row in rows if int(row.get("expected_host_count") or 0) > 0
    ]
    app_coverage_pct = round(sum(host_ratios) / len(host_ratios) * 100.0, 1) if host_ratios else 0.0

    if len(complete) >= 20 and coverage_pct >= 75 and app_coverage_pct >= 99:
        confidence = "HIGH"
    elif len(complete) >= 5 and coverage_pct >= 25 and app_coverage_pct >= 95:
        confidence = "MEDIUM"
    else:
        confidence = "LOW"

    return {
        "confidence": confidence,
        "complete_checks": len(complete),
        "partial_or_incomplete_checks": len(partial),
        "expected_checks": expected_checks,
        "coverage_pct": coverage_pct,
        "observed_span_hours": round(observed_span_seconds / 3600.0, 1),
        "window_hours": round(window_seconds / 3600.0, 1),
        "cadence_minutes": round(cadence_seconds / 60.0, 1) if cadence_seconds else None,
        "app_coverage_pct": app_coverage_pct,
        "expected_host_count": expected_hosts,
        "first_complete_at": times[0] if times else None,
        "last_complete_at": times[-1] if times else None,
    }


def _sampling_quality(conn, start: datetime, end: datetime) -> dict:
    row = conn.execute(text(f"""
        SELECT MAX(tc.rank) AS observed_rank_depth,
               COUNT(*) AS observations,
               COUNT(*) FILTER (WHERE tc.details->>'resource_aggregation' = 'SUM_BY_CONSUMER') AS aggregate_observations,
               MAX(NULLIF(tc.details->>'persisted_rank_limit', '')::integer) AS recorded_rank_limit
          FROM rundeck_top_consumers tc
          JOIN rundeck_collections c ON c.collection_id = tc.collection_id
         WHERE {_complete_collection_clause('c')}
           AND tc.collected_at >= :start
           AND tc.collected_at < :end
    """), {"start": start, "end": end}).mappings().one()
    observations = int(row.get("observations") or 0)
    aggregate_observations = int(row.get("aggregate_observations") or 0)
    return {
        "configured_rank_limit": TOP_CONSUMERS_PER_HOST,
        "recorded_rank_limit": int(row.get("recorded_rank_limit") or 0) or None,
        "observed_rank_depth": int(row.get("observed_rank_depth") or 0),
        "resource_aggregation_coverage_pct": round(aggregate_observations / observations * 100.0, 1) if observations else 0.0,
        "seen_definition": "Observed in persisted top-consumer collection cycles; not an execution counter.",
        "wp_overlap_basis": "Same APP and collection cycle; correlation evidence, not direct workload-to-WP causation.",
        "direct_wp_match_available": False,
    }


def _anchor_time(conn) -> datetime:
    value = conn.execute(text(f"""
        SELECT MAX(COALESCE(finished_at, started_at))
          FROM rundeck_collections c
         WHERE {_complete_collection_clause('c')}
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
        current_quality = _collection_quality(conn, start, end)
        previous_quality = _collection_quality(conn, previous_start, start)
        current_rows = _aggregate_window(conn, start, end, type_key)
        previous_rows = _aggregate_window(conn, previous_start, start, type_key)
        sampling = _sampling_quality(conn, start, end)

    current_checks = int(current_quality["complete_checks"])
    previous_checks = int(previous_quality["complete_checks"])
    previous_map = {
        (str(row.get("consumer_type")), str(row.get("consumer_key"))): row
        for row in previous_rows
    }
    priority = {"NEEDS REVIEW": 6, "HIGH RESOURCE": 5, "INCREASING": 4, "RECURRING": 3, "LIMITED DATA": 2, "STABLE": 1}
    evaluated: list[dict] = []
    for row in current_rows:
        previous = previous_map.get((str(row.get("consumer_type")), str(row.get("consumer_key"))))
        observations = int(row.get("observations") or 0)
        aggregate_resource_observations = int(row.get("aggregate_resource_observations") or 0)
        previous_occurrences = int(previous.get("occurrences") or 0) if previous else 0
        baseline_eligible = (
            previous is not None
            and previous_occurrences >= MIN_BASELINE_OCCURRENCES
            and previous_quality.get("confidence") in {"MEDIUM", "HIGH"}
        )
        normalized = {
            **row,
            "occurrences": int(row.get("occurrences") or 0),
            "observations": observations,
            "app_count": int(row.get("app_count") or 0),
            "hosts": list(row.get("hosts") or []),
            "critical_wp_checks": int(row.get("critical_wp_checks") or 0),
            "max_rank_seen": int(row.get("max_rank_seen") or 0),
            "aggregate_resource_observations": aggregate_resource_observations,
            "resource_aggregation_coverage_pct": round(aggregate_resource_observations / observations * 100.0, 1) if observations else 0.0,
            "avg_cpu_pct": _round(row.get("avg_cpu_pct")),
            "peak_cpu_pct": _round(row.get("peak_cpu_pct")),
            "avg_pss_gb": _round(row.get("avg_pss_gb"), 2),
            "peak_pss_gb": _round(row.get("peak_pss_gb"), 2),
            "previous": {
                "occurrences": previous_occurrences,
                "avg_cpu_pct": _round(previous.get("avg_cpu_pct")) if previous else None,
                "peak_cpu_pct": _round(previous.get("peak_cpu_pct")) if previous else None,
                "avg_pss_gb": _round(previous.get("avg_pss_gb"), 2) if previous else None,
            },
        }
        normalized.update(assess_workload(
            normalized,
            normalized["previous"],
            current_checks,
            baseline_eligible=baseline_eligible,
            period_confidence=str(current_quality.get("confidence") or "LOW"),
        ))
        evaluated.append(normalized)

    evaluated.sort(key=lambda item: (
        priority.get(item["assessment"], 0),
        _CONFIDENCE_RANK.get(item.get("evidence_confidence"), 0),
        item.get("avg_cpu_pct") or 0,
        item.get("peak_cpu_pct") or 0,
        item.get("occurrences") or 0,
    ), reverse=True)
    items = evaluated[:max(1, min(int(limit), 100))]

    summary = {
        "workloads": len(evaluated),
        "programs": sum(1 for item in evaluated if item.get("consumer_type") == "PROGRAM"),
        "jobs": sum(1 for item in evaluated if item.get("consumer_type") == "JOB"),
        "needs_review": sum(1 for item in evaluated if item["assessment"] == "NEEDS REVIEW"),
        "high_resource": sum(1 for item in evaluated if item.get("signals", {}).get("high_resource")),
        "increasing": sum(1 for item in evaluated if item.get("signals", {}).get("increasing")),
        "recurring": sum(1 for item in evaluated if item.get("signals", {}).get("recurring")),
        "limited_data": sum(1 for item in evaluated if item["assessment"] == "LIMITED DATA"),
        "wp_signal_overlap": sum(1 for item in evaluated if item.get("signals", {}).get("wp_signal_overlap")),
    }

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
        "quality": current_quality,
        "previous_quality": previous_quality,
        "sampling": sampling,
        "thresholds": {
            "avg_cpu_high_pct": CPU_HIGH_AVG,
            "peak_cpu_high_pct": CPU_HIGH_PEAK,
            "avg_pss_high_gb": PSS_HIGH_GB,
            "increase_pct": INCREASE_PCT,
            "recurring_pct": RECURRING_PCT,
            "wp_signal_overlap_pct": WP_CORRELATION_PCT,
            "min_baseline_occurrences": MIN_BASELINE_OCCURRENCES,
        },
        "summary": summary,
        "items": items,
        "method": "Deterministic historical comparison using complete collections only; review signal, not root-cause proof.",
    }
