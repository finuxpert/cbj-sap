"""Collection-bound latest telemetry helpers.

Never mix APP1-APP5 rows from different Rundeck executions in one operational snapshot.
"""
from __future__ import annotations

from sqlalchemy import text

from backend.db.session import get_engine


def latest_ready_host_metrics() -> dict:
    engine = get_engine()
    if engine is None:
        raise RuntimeError("Database history is not enabled")

    with engine.connect() as conn:
        collection = conn.execute(text("""
            SELECT collection_id, execution_id, expected_host_count, received_host_count,
                   started_at, finished_at
              FROM rundeck_collections
             WHERE status = 'READY'
             ORDER BY COALESCE(finished_at, created_at) DESC
             LIMIT 1
        """)).mappings().first()
        if not collection:
            return {
                "collection_id": None,
                "execution_id": None,
                "expected_host_count": 5,
                "received_host_count": 0,
                "items": [],
            }

        rows = conn.execute(text("""
            SELECT DISTINCT ON (host)
                   collection_id, collected_at, host, cpu_pct, ram_pct, load_1,
                   io_wait_pct, swap_pct, wp_critical, health
              FROM rundeck_host_metrics
             WHERE collection_id = :collection_id
             ORDER BY host, collected_at DESC
        """), {"collection_id": collection["collection_id"]})
        items = [dict(row._mapping) for row in rows]

    return {
        **dict(collection),
        "items": items,
        "complete": len(items) == int(collection["expected_host_count"] or 5),
    }
