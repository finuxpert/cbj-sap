"""Bounded historical trend aggregation for SPHERE Rundeck /dev."""
from __future__ import annotations

import os
from datetime import datetime, timedelta

from sqlalchemy import text

from backend.db.session import get_engine

# Keep short incident windows at collection resolution. Longer windows are bucketed
# progressively so operators can zoom from the last 30 minutes to long-term context
# without losing the newest collection-level spikes.
RANGES = {
    "30m": {"hours": 0.5, "auto_bucket": "raw"},
    "1h": {"hours": 1, "auto_bucket": "raw"},
    "3h": {"hours": 3, "auto_bucket": "raw"},
    "6h": {"hours": 6, "auto_bucket": "10m"},
    "24h": {"hours": 24, "auto_bucket": "30m"},
    "7d": {"hours": 24 * 7, "auto_bucket": "1h"},
    "30d": {"hours": 24 * 30, "auto_bucket": "6h"},
    "90d": {"hours": 24 * 90, "auto_bucket": "1d"},
}

BUCKETS = {
    "raw": "raw",
    "10m": "10 minutes",
    "30m": "30 minutes",
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
    """Return host metric trend data aligned to logical Rundeck collection time.

    APP1 -> APP5 are collected sequentially. Short windows use one point per logical
    collection so recent spikes remain visible. Longer windows use date_bin while
    retaining peak timestamp and collection id for drill-down to exact evidence.
    """
    engine = get_engine()
    if engine is None:
        raise RuntimeError("Database history is not enabled")

    metric = resolve_metric(metric_key)
    resolved_bucket, stride = resolve_bucket(range_key, bucket_key)
    column = metric["column"]

    if resolved_bucket == "raw":
        query = text(f"""
            WITH base AS (
                SELECT
                    h.collection_id,
                    COALESCE(c.started_at, c.finished_at, h.collected_at) AS bucket,
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
                        PARTITION BY collection_id, host
                        ORDER BY collected_at DESC
                    ) AS sample_rank
                FROM base
            )
            SELECT
                bucket,
                host,
                value AS avg_value,
                value AS max_value,
                value AS min_value,
                CASE WHEN value IS NULL THEN 0 ELSE 1 END AS samples,
                CASE
                    WHEN value IS NOT NULL
                     AND (
                        (CAST(:warning AS double precision) IS NOT NULL AND value >= CAST(:warning AS double precision))
                        OR (CAST(:warning AS double precision) IS NULL AND value > 0)
                     ) THEN 1 ELSE 0
                END AS affected_samples,
                collected_at AS peak_at,
                collection_id AS peak_collection_id
            FROM ranked
            WHERE sample_rank = 1
            ORDER BY bucket ASC, host ASC
        """)
        params = {"since": since, "warning": metric["warning"]}
    else:
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
        params = {"since": since, "stride": stride, "warning": metric["warning"]}

    with engine.connect() as conn:
        result = conn.execute(query, params)
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

    by_host: dict[str, dict] = {}
    for row in rows:
        by_host.setdefault(row["host"], row)
    return [by_host[host] for host in sorted(by_host)]


def collection_timeline_at(at: datetime, window_minutes: int = 5) -> tuple[str | None, list[dict]]:
    """Resolve a chart peak timestamp to its logical collection, then return all hosts."""
    engine = get_engine()
    if engine is None:
        raise RuntimeError("Database history is not enabled")
    start = at - timedelta(minutes=window_minutes)
    end = at + timedelta(minutes=window_minutes)
    with engine.connect() as conn:
        collection_id = conn.execute(text("""
            SELECT collection_id
              FROM rundeck_host_metrics
             WHERE collected_at BETWEEN :start AND :end
             ORDER BY ABS(EXTRACT(EPOCH FROM (collected_at - :at))), collected_at DESC
             LIMIT 1
        """), {"at": at, "start": start, "end": end}).scalar()
    if not collection_id:
        return None, []
    return str(collection_id), collection_timeline(str(collection_id))