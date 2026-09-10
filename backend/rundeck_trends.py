"""Bounded historical trend aggregation for SPHERE Rundeck /dev."""
from __future__ import annotations

import os
from datetime import datetime

from sqlalchemy import text

from backend.db.session import get_engine

RANGES = {
    "6h": {"hours": 6, "auto_bucket": "10m"},
    "24h": {"hours": 24, "auto_bucket": "10m"},
    "7d": {"hours": 24 * 7, "auto_bucket": "1h"},
    "30d": {"hours": 24 * 30, "auto_bucket": "6h"},
    "90d": {"hours": 24 * 90, "auto_bucket": "1d"},
}

BUCKETS = {
    "10m": "10 minutes",
    "1h": "1 hour",
    "6h": "6 hours",
    "1d": "1 day",
}

METRICS = {
    "cpu": {
        "column": "cpu_pct",
        "label": "CPU",
        "unit": "%",
        "warning": float(os.getenv("SPHERE_CPU_WARNING_PCT", "75")),
        "critical": float(os.getenv("SPHERE_CPU_CRITICAL_PCT", "90")),
    },
    "ram": {
        "column": "ram_pct",
        "label": "RAM",
        "unit": "%",
        "warning": float(os.getenv("SPHERE_RAM_WARNING_PCT", "80")),
        "critical": float(os.getenv("SPHERE_RAM_CRITICAL_PCT", "90")),
    },
    "load": {
        "column": "load_1",
        "label": "Load 1M",
        "unit": "",
        "warning": None,
        "critical": None,
    },
    "iowait": {
        "column": "io_wait_pct",
        "label": "I/O Wait",
        "unit": "%",
        "warning": float(os.getenv("SPHERE_IOWAIT_WARNING_PCT", "10")),
        "critical": float(os.getenv("SPHERE_IOWAIT_CRITICAL_PCT", "20")),
    },
    "swap": {
        "column": "swap_pct",
        "label": "Swap I/O",
        "unit": "p/s",
        "warning": None,
        "critical": None,
    },
    "wp": {
        "column": "wp_critical",
        "label": "WP Critical",
        "unit": "",
        "warning": float(os.getenv("SPHERE_WP_WARNING", "1")),
        "critical": float(os.getenv("SPHERE_WP_CRITICAL", "3")),
    },
}


def resolve_range(range_key: str) -> dict:
    try:
        return RANGES[range_key]
    except KeyError as error:
        raise ValueError(f"Unsupported range: {range_key}") from error


def resolve_bucket(range_key: str, bucket_key: str) -> tuple[str, str]:
    range_config = resolve_range(range_key)
    resolved = range_config["auto_bucket"] if bucket_key == "auto" else bucket_key
    try:
        return resolved, BUCKETS[resolved]
    except KeyError as error:
        raise ValueError(f"Unsupported bucket: {bucket_key}") from error


def resolve_metric(metric_key: str) -> dict:
    try:
        return METRICS[metric_key]
    except KeyError as error:
        raise ValueError(f"Unsupported metric: {metric_key}") from error


def trend_series(
    since: datetime,
    range_key: str,
    bucket_key: str,
    metric_key: str,
) -> dict:
    """Aggregate host metrics by logical Rundeck collection time.

    APP1 -> APP5 are collected sequentially, so their raw host timestamps can cross a
    10-minute wall-clock boundary. Bucketing by the Rundeck execution start keeps all
    hosts from the same collection aligned on one x-axis point while peak_at preserves
    the exact host sample time used for RCA drill-down.
    """
    engine = get_engine()
    if engine is None:
        raise RuntimeError("Database history is not enabled")

    metric = resolve_metric(metric_key)
    resolved_bucket, stride = resolve_bucket(range_key, bucket_key)
    column = metric["column"]

    # column is selected only from the server-side METRICS allowlist.
    query = text(f"""
        WITH base AS (
            SELECT
                date_bin(
                    CAST(:stride AS interval),
                    COALESCE(c.started_at, c.finished_at, h.collected_at),
                    TIMESTAMPTZ '2000-01-01 00:00:00+00'
                ) AS bucket,
                h.collection_id,
                COALESCE(c.started_at, c.finished_at, h.collected_at) AS collection_at,
                h.collected_at,
                h.host,
                h.{column}::double precision AS value
            FROM rundeck_host_metrics h
            LEFT JOIN rundeck_collections c
              ON c.collection_id = h.collection_id
            WHERE COALESCE(c.started_at, c.finished_at, h.collected_at) >= :since
        ),
        ranked AS (
            SELECT
                *,
                ROW_NUMBER() OVER (
                    PARTITION BY bucket, host
                    ORDER BY value DESC NULLS LAST, collected_at DESC
                ) AS peak_rank
            FROM base
        )
        SELECT
            bucket,
            host,
            AVG(value) FILTER (WHERE value IS NOT NULL) AS avg_value,
            MAX(value) FILTER (WHERE value IS NOT NULL) AS max_value,
            MIN(value) FILTER (WHERE value IS NOT NULL) AS min_value,
            COUNT(value) AS samples,
            COUNT(*) FILTER (
                WHERE value IS NOT NULL
                  AND (
                    (CAST(:warning AS double precision) IS NOT NULL AND value >= CAST(:warning AS double precision))
                    OR (CAST(:warning AS double precision) IS NULL AND value > 0)
                  )
            ) AS affected_samples,
            MAX(CASE WHEN peak_rank = 1 AND value IS NOT NULL THEN collected_at END) AS peak_at,
            MAX(CASE WHEN peak_rank = 1 AND value IS NOT NULL THEN collection_id END) AS peak_collection_id
        FROM ranked
        GROUP BY bucket, host
        ORDER BY bucket ASC, host ASC
    """)

    with engine.connect() as conn:
        result = conn.execute(
            query,
            {"since": since, "stride": stride, "warning": metric["warning"]},
        )
        items = [dict(row._mapping) for row in result]

    return {
        "since": since,
        "range": range_key,
        "bucket": resolved_bucket,
        "requested_bucket": bucket_key,
        "metric": metric_key,
        "metric_label": metric["label"],
        "unit": metric["unit"],
        "warning": metric["warning"],
        "critical": metric["critical"],
        "items": items,
    }


def collection_timeline(collection_id: str) -> list[dict]:
    """Return the exact APP1-APP5 snapshot rows for one Rundeck collection."""
    engine = get_engine()
    if engine is None:
        raise RuntimeError("Database history is not enabled")
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT collection_id, collected_at, host, cpu_pct, ram_pct, load_1,
                   io_wait_pct, swap_pct, wp_critical, health
              FROM rundeck_host_metrics
             WHERE collection_id = :collection_id
             ORDER BY host, collected_at DESC
        """), {"collection_id": collection_id})
        rows = [dict(row._mapping) for row in result]

    # Defensive de-duplication: retain the latest sample if a collector ever stores
    # more than one row for the same host inside a logical collection.
    by_host: dict[str, dict] = {}
    for row in rows:
        by_host.setdefault(row["host"], row)
    return [by_host[host] for host in sorted(by_host)]
