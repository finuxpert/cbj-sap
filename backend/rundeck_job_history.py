"""Read-only SAP job history queries for Rundeck-backed RCA."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import text

from backend.db.session import get_engine


def current_sap_jobs(collection_id: str, limit: int = 50) -> list[dict]:
    engine = get_engine()
    if engine is None:
        raise RuntimeError("Database history is not enabled")

    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT t.collection_id,
                   c.execution_id,
                   t.collected_at,
                   t.host,
                   t.consumer_type,
                   t.consumer_key,
                   t.rank,
                   t.cpu_pct,
                   t.ram_pct,
                   t.details
              FROM rundeck_top_consumers t
              LEFT JOIN rundeck_collections c
                ON c.collection_id = t.collection_id
             WHERE t.collection_id = :collection_id
             ORDER BY t.cpu_pct DESC NULLS LAST,
                      t.ram_pct DESC NULLS LAST,
                      t.host ASC,
                      t.rank ASC
             LIMIT :limit
        """), {"collection_id": collection_id, "limit": limit})
        return [dict(row._mapping) for row in rows]


def sap_job_history(
    consumer_key: str,
    since: datetime,
    host: str | None = None,
    consumer_type: str | None = None,
    limit: int = 200,
) -> dict:
    engine = get_engine()
    if engine is None:
        raise RuntimeError("Database history is not enabled")

    conditions = ["t.collected_at >= :since", "t.consumer_key = :consumer_key"]
    params: dict = {
        "since": since,
        "consumer_key": consumer_key,
        "limit": limit,
    }
    if host:
        conditions.append("t.host = :host")
        params["host"] = host.upper()
    if consumer_type:
        conditions.append("t.consumer_type = :consumer_type")
        params["consumer_type"] = consumer_type.upper()

    where_sql = " AND ".join(conditions)

    with engine.connect() as conn:
        summary_row = conn.execute(text(f"""
            SELECT COUNT(DISTINCT t.collection_id) AS checks,
                   MIN(t.collected_at) AS first_seen,
                   MAX(t.collected_at) AS last_seen,
                   AVG(t.cpu_pct) AS avg_cpu_pct,
                   MAX(t.cpu_pct) AS peak_cpu_pct,
                   AVG(t.ram_pct) AS avg_ram_pct,
                   MAX(t.ram_pct) AS peak_ram_pct,
                   COUNT(DISTINCT t.host) AS server_count
              FROM rundeck_top_consumers t
             WHERE {where_sql}
        """), params).mappings().one()

        rows = conn.execute(text(f"""
            SELECT t.collection_id,
                   c.execution_id,
                   t.collected_at,
                   t.host,
                   t.consumer_type,
                   t.consumer_key,
                   t.rank,
                   t.cpu_pct,
                   t.ram_pct,
                   t.details,
                   h.wp_critical AS host_wp_critical
              FROM rundeck_top_consumers t
              LEFT JOIN rundeck_collections c
                ON c.collection_id = t.collection_id
              LEFT JOIN rundeck_host_metrics h
                ON h.collection_id = t.collection_id
               AND h.host = t.host
             WHERE {where_sql}
             ORDER BY t.collected_at DESC, t.host ASC
             LIMIT :limit
        """), params)
        items = [dict(row._mapping) for row in rows]

    summary = dict(summary_row)
    return {
        "consumer_key": consumer_key,
        "consumer_type": consumer_type.upper() if consumer_type else (items[0]["consumer_type"] if items else None),
        "host": host.upper() if host else None,
        "checks": int(summary.get("checks") or 0),
        "first_seen": summary.get("first_seen"),
        "last_seen": summary.get("last_seen"),
        "avg_cpu_pct": float(summary["avg_cpu_pct"]) if summary.get("avg_cpu_pct") is not None else None,
        "peak_cpu_pct": float(summary["peak_cpu_pct"]) if summary.get("peak_cpu_pct") is not None else None,
        "avg_ram_pct": float(summary["avg_ram_pct"]) if summary.get("avg_ram_pct") is not None else None,
        "peak_ram_pct": float(summary["peak_ram_pct"]) if summary.get("peak_ram_pct") is not None else None,
        "server_count": int(summary.get("server_count") or 0),
        "items": items,
    }
