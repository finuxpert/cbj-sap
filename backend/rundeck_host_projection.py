"""Enrich normalized host metrics from the exact RCA-SNAPSHOT/WP V2.2 contract.

`swap_pct` is retained for schema compatibility but stores swap activity (swap-in + swap-out
pages/second) for Rundeck V2.2 collections. The JSON details preserve both source counters.
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


def _host_segments(raw_text: str) -> dict[str, str]:
    matches = list(re.finditer(
        r"^##\s*WP-SCOUT\s*@\s*(\S+)\s+SID=\S+\s+INSTS=\S+\s+TS=.+$",
        raw_text,
        re.M,
    ))
    segments = {}
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(raw_text)
        segments[match.group(1).upper()] = raw_text[match.start():end]
    return segments


def _wp_critical(segment: str) -> int | None:
    match = re.search(r"CPU\s+WP\s+Critical\s*:\s*(\d+)", segment, re.I)
    return int(match.group(1)) if match else None


def _health(cpu, ram, iowait, wp_critical) -> str:
    if (
        (cpu is not None and cpu >= CPU_CRITICAL)
        or (ram is not None and ram >= RAM_CRITICAL)
        or (iowait is not None and iowait >= IOWAIT_CRITICAL)
        or (wp_critical is not None and wp_critical >= WP_CRITICAL)
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


def _ensure_alert(conn, *, collection_id: str, host: str, collected_at: datetime,
                  code: str, severity: str, message: str, details: dict) -> None:
    exists = conn.execute(text("""
        SELECT 1
          FROM rundeck_alerts
         WHERE collection_id = :collection_id
           AND host = :host
           AND code = :code
         LIMIT 1
    """), {"collection_id": collection_id, "host": host, "code": code}).first()
    if exists:
        return
    conn.execute(text("""
        INSERT INTO rundeck_alerts (
          id, collection_id, collected_at, host, code, severity, message, details
        ) VALUES (
          :id, :collection_id, :collected_at, :host, :code, :severity, :message,
          CAST(:details AS jsonb)
        )
    """), {
        "id": uuid4().hex,
        "collection_id": collection_id,
        "collected_at": collected_at,
        "host": host,
        "code": code,
        "severity": severity,
        "message": message,
        "details": json.dumps(details),
    })


def enrich_host_metrics(collection_id: str, raw: bytes) -> int:
    """Correct/complete V2.2 IO-wait, swap activity and WP critical fields."""
    if not db_enabled():
        return 0
    engine = get_engine()
    if engine is None:
        return 0

    raw_text = raw.decode("utf-8-sig", errors="strict")
    segments = _host_segments(raw_text)
    snapshots = _snapshots(raw_text)
    updated = 0

    with engine.begin() as conn:
        for snapshot in snapshots:
            host = str(snapshot.get("hostname") or "").strip().upper()
            if not host:
                continue
            cpu = _number(snapshot.get("host_cpu_pct"))
            ram = _number(snapshot.get("memory_used_pct"))
            iowait = _number(snapshot.get("host_iowait_pct"))
            swap_in = _number(snapshot.get("swap_in_ps"))
            swap_out = _number(snapshot.get("swap_out_ps"))
            swap_activity = (
                (swap_in or 0.0) + (swap_out or 0.0)
                if swap_in is not None or swap_out is not None
                else None
            )
            wp_critical = _wp_critical(segments.get(host, ""))
            health = _health(cpu, ram, iowait, wp_critical)
            details = {
                "host_iowait_pct": iowait,
                "swap_in_ps": swap_in,
                "swap_out_ps": swap_out,
                "swap_activity_ps": swap_activity,
                "swap_metric_semantics": "activity_ps",
                "wp_critical": wp_critical,
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
            if iowait is not None and iowait >= IOWAIT_WARNING:
                _ensure_alert(
                    conn,
                    collection_id=collection_id,
                    host=host,
                    collected_at=collected_at,
                    code="IOWAIT_HIGH",
                    severity="CRITICAL" if iowait >= IOWAIT_CRITICAL else "WARNING",
                    message=f"IO Wait threshold exceeded on {host}",
                    details={"value": iowait, "warning": IOWAIT_WARNING, "critical": IOWAIT_CRITICAL},
                )
            if wp_critical is not None and wp_critical >= WP_WARNING:
                _ensure_alert(
                    conn,
                    collection_id=collection_id,
                    host=host,
                    collected_at=collected_at,
                    code="WP_CRITICAL",
                    severity="CRITICAL" if wp_critical >= WP_CRITICAL else "WARNING",
                    message=f"Critical work process threshold exceeded on {host}",
                    details={"value": wp_critical, "warning": WP_WARNING, "critical": WP_CRITICAL},
                )
    return updated
