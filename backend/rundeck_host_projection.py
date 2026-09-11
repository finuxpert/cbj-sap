"""Enrich normalized host metrics from the exact RCA-SNAPSHOT/WP V2.2 contract.

`swap_pct` is retained for schema compatibility but stores swap activity (swap-in + swap-out
pages/second) for Rundeck V2.2 collections. The JSON details preserve both source counters.

The browser V2.2 parser treats every ``snapshot @`` block as one logical host segment and
reads human summary counters such as ``CPU WP Critical`` from that segment. Keep this
projection on the same segmentation contract so DB-backed monitoring cannot disagree with
the point-in-time parser for the same raw collection.
"""
from __future__ import annotations

import json
import os
import re
from datetime import datetime
from uuid import uuid4

from sqlalchemy import text

from backend.db.session import db_enabled, get_engine

CPU_WARNING = float(os.getenv("SPHERE_CPU_WARNING_PCT", "75"))
CPU_CRITICAL = float(os.getenv("SPHERE_CPU_CRITICAL_PCT", "90"))
RAM_WARNING = float(os.getenv("SPHERE_RAM_WARNING_PCT", "80"))
RAM_CRITICAL = float(os.getenv("SPHERE_RAM_CRITICAL_PCT", "90"))
IOWAIT_WARNING = float(os.getenv("SPHERE_IOWAIT_WARNING_PCT", "10"))
IOWAIT_CRITICAL = float(os.getenv("SPHERE_IOWAIT_CRITICAL_PCT", "20"))
WP_WARNING = int(os.getenv("SPHERE_WP_WARNING", "1"))
WP_CRITICAL = int(os.getenv("SPHERE_WP_CRITICAL", "3"))
V22_MARKER = "## RCA-SNAPSHOT-V2.2-BEGIN"


def _number(value):
    if value in (None, "", "?", "NA", "N/A", "-"):
        return None
    try:
        return float(str(value).replace(",", ".").rstrip("%"))
    except (TypeError, ValueError):
        return None


def _snapshots(raw_text: str) -> list[dict]:
    blocks = re.findall(
        r"^## RCA-SNAPSHOT-V2\.2-BEGIN\s*\n(.*?)^## RCA-SNAPSHOT-V2\.2-END\s*$",
        raw_text,
        re.M | re.S,
    )
    rows = []
    for block in blocks:
        fields = {}
        for line in block.splitlines():
            if "\t" in line:
                key, value = line.split("\t", 1)
                fields[key.strip()] = value.strip()
        if fields.get("hostname"):
            rows.append(fields)
    return rows


def _split_v22_segments(raw_text: str) -> list[str]:
    """Mirror ``splitV22Segments`` in ``src/tools/logAnalysisV15.js``.

    Rundeck executes APP1 -> APP5 sequentially. Human WP counters belong to the
    surrounding host snapshot, so using WP-SCOUT headers as boundaries can associate
    a counter with the wrong host when collector text contains additional headers.
    """
    normalized = str(raw_text or "").replace("\r", "")
    if V22_MARKER not in normalized:
        return []

    lines = normalized.split("\n")
    starts = [
        index
        for index, line in enumerate(lines)
        if re.match(r"^snapshot\s*@", line.strip(), re.I)
    ]
    if len(starts) <= 1:
        return [normalized]

    segments = []
    for index, start in enumerate(starts):
        end = starts[index + 1] if index + 1 < len(starts) else len(lines)
        segment = "\n".join(lines[start:end])
        if V22_MARKER in segment:
            segments.append(segment)
    return segments


def _wp_critical(segment: str) -> int | None:
    match = re.search(r"CPU\s+WP\s+Critical\s*:\s*(\d+)", segment, re.I)
    return int(match.group(1)) if match else None


def parse_host_projection(raw: bytes | str) -> list[dict]:
    """Parse host metrics using the exact browser V2.2 host-boundary semantics.

    This function is intentionally DB-free so contract tests can compare it against
    known V2.2 samples without requiring PostgreSQL.
    """
    raw_text = raw.decode("utf-8-sig", errors="strict") if isinstance(raw, bytes) else str(raw)
    segments = _split_v22_segments(raw_text)
    rows = []

    for segment in segments:
        snapshots = _snapshots(segment)
        if not snapshots:
            continue
        # Browser parseKeyValueBlock() consumes the first snapshot block in each segment.
        snapshot = snapshots[0]
        host = str(snapshot.get("hostname") or "").strip().upper()
        if not host:
            continue

        swap_in = _number(snapshot.get("swap_in_ps"))
        swap_out = _number(snapshot.get("swap_out_ps"))
        swap_activity = (
            (swap_in or 0.0) + (swap_out or 0.0)
            if swap_in is not None or swap_out is not None
            else None
        )
        rows.append({
            "host": host,
            "cpu": _number(snapshot.get("host_cpu_pct")),
            "ram": _number(snapshot.get("memory_used_pct")),
            "iowait": _number(snapshot.get("host_iowait_pct")),
            "swap_in": swap_in,
            "swap_out": swap_out,
            "swap_activity": swap_activity,
            "wp_critical": _wp_critical(segment),
        })
    return rows


def _health(cpu, ram, iowait, wp_critical) -> str:
    """Host state is resource severity; Critical WP remains a separate SAP signal.

    A WP count alone can require investigation, but it does not prove host-critical
    resource pressure. Incident severity performs the persistence-aware escalation.
    """
    if (
        (cpu is not None and cpu >= CPU_CRITICAL)
        or (ram is not None and ram >= RAM_CRITICAL)
        or (iowait is not None and iowait >= IOWAIT_CRITICAL)
    ):
        return "CRITICAL"
    if (
        (cpu is not None and cpu >= CPU_WARNING)
        or (ram is not None and ram >= RAM_WARNING)
        or (iowait is not None and iowait >= IOWAIT_WARNING)
        or (wp_critical is not None and wp_critical >= WP_WARNING)
    ):
        return "WARNING"
    return "NORMAL"


def _sync_alert(conn, *, collection_id: str, host: str, collected_at: datetime,
                code: str, active: bool, severity: str, message: str, details: dict) -> None:
    """Keep one derived threshold alert per collection/host/code and remove stale ones."""
    existing = conn.execute(text("""
        SELECT id
          FROM rundeck_alerts
         WHERE collection_id = :collection_id
           AND host = :host
           AND code = :code
         LIMIT 1
    """), {"collection_id": collection_id, "host": host, "code": code}).first()

    if not active:
        if existing:
            conn.execute(text("DELETE FROM rundeck_alerts WHERE id = :id"), {"id": existing[0]})
        return

    payload = {
        "collection_id": collection_id,
        "collected_at": collected_at,
        "host": host,
        "code": code,
        "severity": severity,
        "message": message,
        "details": json.dumps(details),
    }
    if existing:
        conn.execute(text("""
            UPDATE rundeck_alerts
               SET collected_at = :collected_at,
                   severity = :severity,
                   message = :message,
                   details = CAST(:details AS jsonb)
             WHERE id = :id
        """), {**payload, "id": existing[0]})
        return

    conn.execute(text("""
        INSERT INTO rundeck_alerts (
          id, collection_id, collected_at, host, code, severity, message, details
        ) VALUES (
          :id, :collection_id, :collected_at, :host, :code, :severity, :message,
          CAST(:details AS jsonb)
        )
    """), {**payload, "id": uuid4().hex})


def enrich_host_metrics(collection_id: str, raw: bytes) -> int:
    """Correct/complete V2.2 IO-wait, swap activity and WP critical fields."""
    if not db_enabled():
        return 0
    engine = get_engine()
    if engine is None:
        return 0

    projections = parse_host_projection(raw)
    updated = 0

    with engine.begin() as conn:
        for projection in projections:
            host = projection["host"]
            cpu = projection["cpu"]
            ram = projection["ram"]
            iowait = projection["iowait"]
            swap_in = projection["swap_in"]
            swap_out = projection["swap_out"]
            swap_activity = projection["swap_activity"]
            wp_critical = projection["wp_critical"]
            health = _health(cpu, ram, iowait, wp_critical)
            details = {
                "host_iowait_pct": iowait,
                "swap_in_ps": swap_in,
                "swap_out_ps": swap_out,
                "swap_activity_ps": swap_activity,
                "swap_metric_semantics": "activity_ps",
                "wp_critical": wp_critical,
                "projection_contract": "snapshot-segment-v2.2",
            }

            result = conn.execute(text("""
                UPDATE rundeck_host_metrics
                   SET io_wait_pct = COALESCE(:io_wait_pct, io_wait_pct),
                       swap_pct = COALESCE(:swap_activity, swap_pct),
                       wp_critical = COALESCE(:wp_critical, wp_critical),
                       health = :health,
                       details = details || CAST(:details AS jsonb)
                 WHERE collection_id = :collection_id
                   AND UPPER(host) = :host
            """), {
                "io_wait_pct": iowait,
                "swap_activity": swap_activity,
                "wp_critical": wp_critical,
                "health": health,
                "details": json.dumps(details),
                "collection_id": collection_id,
                "host": host,
            })
            updated += result.rowcount or 0

            metric_row = conn.execute(text("""
                SELECT collected_at
                  FROM rundeck_host_metrics
                 WHERE collection_id = :collection_id AND UPPER(host) = :host
                 ORDER BY collected_at DESC
                 LIMIT 1
            """), {"collection_id": collection_id, "host": host}).first()
            if not metric_row:
                continue
            collected_at = metric_row[0]

            _sync_alert(
                conn,
                collection_id=collection_id,
                host=host,
                collected_at=collected_at,
                code="IOWAIT_HIGH",
                active=iowait is not None and iowait >= IOWAIT_WARNING,
                severity="CRITICAL" if iowait is not None and iowait >= IOWAIT_CRITICAL else "WARNING",
                message=f"IO Wait threshold exceeded on {host}",
                details={"value": iowait, "warning": IOWAIT_WARNING, "critical": IOWAIT_CRITICAL},
            )
            _sync_alert(
                conn,
                collection_id=collection_id,
                host=host,
                collected_at=collected_at,
                code="WP_CRITICAL",
                active=wp_critical is not None and wp_critical >= WP_WARNING,
                severity="CRITICAL" if wp_critical is not None and wp_critical >= WP_CRITICAL else "WARNING",
                message=f"Critical work process threshold exceeded on {host}",
                details={"value": wp_critical, "warning": WP_WARNING, "critical": WP_CRITICAL},
            )
    return updated
