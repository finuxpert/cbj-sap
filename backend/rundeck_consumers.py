"""Normalize RCA-WP-V2.2 rows into retained Top Consumer history.

The browser parser remains authoritative for interactive LOG analysis. This module stores a
server-side projection used for historical ranking and point-in-time correlation. Historical
coverage is intentionally broader than the UI's current-workload list so evaluation is less
biased toward only the hottest few consumers.
"""
from __future__ import annotations

import json
import os
import re
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text

from backend.db.session import db_enabled, get_engine

UNKNOWN = {"", "?", "NA", "N/A", "-"}
TOP_CONSUMERS_PER_HOST = max(10, min(100, int(os.getenv("SPHERE_TOP_CONSUMERS_PER_HOST", "30"))))


def _clean(value: Any) -> str:
    out = str(value or "").strip()
    return "" if out.upper() in UNKNOWN else out


def _number(value: Any) -> float | None:
    cleaned = _clean(value).replace(",", ".").rstrip("%")
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def _parse_time(value: Any, fallback: datetime | None = None) -> datetime:
    cleaned = _clean(value)
    if cleaned:
        try:
            parsed = datetime.fromisoformat(cleaned.replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    return fallback or datetime.now(timezone.utc)


def _kv_blocks(raw_text: str) -> list[dict[str, str]]:
    blocks = re.findall(
        r"^## RCA-SNAPSHOT-V2\.2-BEGIN\s*\n(.*?)^## RCA-SNAPSHOT-V2\.2-END\s*$",
        raw_text,
        re.M | re.S,
    )
    output = []
    for block in blocks:
        fields: dict[str, str] = {}
        for line in block.splitlines():
            if "\t" not in line:
                continue
            key, value = line.split("\t", 1)
            fields[key.strip()] = value.strip()
        if fields:
            output.append(fields)
    return output


def _wp_rows(raw_text: str) -> list[dict[str, str]]:
    blocks = re.findall(
        r"^## RCA-WP-V2\.2-BEGIN\s*\n(.*?)^## RCA-WP-V2\.2-END\s*$",
        raw_text,
        re.M | re.S,
    )
    output: list[dict[str, str]] = []
    for block in blocks:
        lines = [line for line in block.splitlines() if line.strip()]
        if len(lines) < 2:
            continue
        headers = [column.strip() for column in lines[0].split("\t")]
        for line in lines[1:]:
            values = line.split("\t")
            output.append({
                header: (values[index].strip() if index < len(values) else "")
                for index, header in enumerate(headers)
            })
    return output


def parse_top_consumers(
    raw: bytes,
    fallback_time: datetime | None = None,
    top_per_host: int | None = None,
) -> list[dict]:
    top_per_host = TOP_CONSUMERS_PER_HOST if top_per_host is None else max(1, int(top_per_host))
    raw_text = raw.decode("utf-8-sig", errors="strict")
    snapshots: dict[str, dict[str, str]] = {}
    for snapshot in _kv_blocks(raw_text):
        snapshot_id = _clean(snapshot.get("snapshot_id"))
        if snapshot_id:
            snapshots[snapshot_id] = snapshot

    groups: dict[tuple[str, datetime, str, str], dict] = {}
    for row in _wp_rows(raw_text):
        snapshot_id = _clean(row.get("snapshot_id"))
        snapshot = snapshots.get(snapshot_id, {})
        host = (_clean(row.get("host")) or _clean(snapshot.get("hostname"))).upper()
        if not host:
            continue

        collected_at = _parse_time(
            snapshot.get("snapshot_ts") or row.get("proc_sample_ts"),
            fallback_time,
        )
        job_name = _clean(row.get("job_name"))
        program = _clean(row.get("program"))
        pid = _clean(row.get("pid"))
        wp = _clean(row.get("wp"))
        wp_type = _clean(row.get("type"))
        user = (
            _clean(row.get("user"))
            or _clean(row.get("sap_user"))
            or _clean(row.get("username"))
            or _clean(row.get("bname"))
        )

        if job_name:
            consumer_type, consumer_key = "JOB", job_name
        elif program:
            consumer_type, consumer_key = "PROGRAM", program
        elif pid:
            consumer_type, consumer_key = "PROCESS", f"PID {pid}"
        else:
            continue

        cpu = _number(row.get("cpu_interval_pct"))
        ram = _number(row.get("pmem_pct"))
        pss = _number(row.get("pss_gb"))
        rss = _number(row.get("rss_gb"))
        read = _number(row.get("read_mib_s"))
        write = _number(row.get("write_mib_s"))
        key = (host, collected_at, consumer_type, consumer_key)
        current = groups.setdefault(key, {
            "host": host,
            "collected_at": collected_at,
            "consumer_type": consumer_type,
            "consumer_key": consumer_key,
            "cpu_values": [],
            "ram_values": [],
            "pss_values": [],
            "rss_values": [],
            "read_values": [],
            "write_values": [],
            "programs": set(),
            "wps": set(),
            "users": set(),
            "pids": set(),
            "wp_types": set(),
            "representative": {},
        })
        if cpu is not None:
            current["cpu_values"].append(cpu)
        if ram is not None:
            current["ram_values"].append(ram)
        if pss is not None:
            current["pss_values"].append(pss)
        if rss is not None:
            current["rss_values"].append(rss)
        if read is not None:
            current["read_values"].append(read)
        if write is not None:
            current["write_values"].append(write)
        if program:
            current["programs"].add(program)
        if wp:
            current["wps"].add(wp)
        if user:
            current["users"].add(user)
        if pid:
            current["pids"].add(pid)
        if wp_type:
            current["wp_types"].add(wp_type)

        representative_cpu = _number(current["representative"].get("cpu_interval_pct"))
        if not current["representative"] or (cpu is not None and (representative_cpu is None or cpu > representative_cpu)):
            current["representative"] = row

    ranked: list[dict] = []
    by_snapshot_host: dict[tuple[str, datetime], list[dict]] = defaultdict(list)
    for group in groups.values():
        cpu_pct = sum(group["cpu_values"]) if group["cpu_values"] else None
        ram_pct = sum(group["ram_values"]) if group["ram_values"] else None
        total_pss = sum(group["pss_values"]) if group["pss_values"] else None
        total_rss = sum(group["rss_values"]) if group["rss_values"] else None
        total_read = sum(group["read_values"]) if group["read_values"] else None
        total_write = sum(group["write_values"]) if group["write_values"] else None
        representative = group["representative"]
        details = {
            "job_name": _clean(representative.get("job_name")),
            "program": _clean(representative.get("program")),
            "wp": _clean(representative.get("wp")),
            "wp_type": _clean(representative.get("type")),
            "user": (
                _clean(representative.get("user"))
                or _clean(representative.get("sap_user"))
                or _clean(representative.get("username"))
                or _clean(representative.get("bname"))
            ),
            "pid": _clean(representative.get("pid")),
            "state": _clean(representative.get("state")),
            # Compatibility fields now represent the aggregate consumer footprint.
            "pss_gb": total_pss,
            "rss_gb": total_rss,
            "read_mib_s": total_read,
            "write_mib_s": total_write,
            "total_pss_gb": total_pss,
            "total_rss_gb": total_rss,
            "total_read_mib_s": total_read,
            "total_write_mib_s": total_write,
            "representative_pss_gb": _number(representative.get("pss_gb")),
            "representative_rss_gb": _number(representative.get("rss_gb")),
            "representative_read_mib_s": _number(representative.get("read_mib_s")),
            "representative_write_mib_s": _number(representative.get("write_mib_s")),
            "resource_aggregation": "SUM_BY_CONSUMER",
            "cpu_class": _clean(representative.get("cpu_class")),
            "snapshot_id": _clean(representative.get("snapshot_id")),
            "process_count": len(group["pids"]) or 1,
            "programs": sorted(group["programs"]),
            "wps": sorted(group["wps"]),
            "users": sorted(group["users"]),
            "pids": sorted(group["pids"]),
            "wp_types": sorted(group["wp_types"]),
        }
        by_snapshot_host[(group["host"], group["collected_at"])].append({
            "host": group["host"],
            "collected_at": group["collected_at"],
            "consumer_type": group["consumer_type"],
            "consumer_key": group["consumer_key"],
            "cpu_pct": cpu_pct,
            "ram_pct": ram_pct,
            "details": details,
        })

    for rows in by_snapshot_host.values():
        rows.sort(
            key=lambda item: (
                item["cpu_pct"] if item["cpu_pct"] is not None else -1,
                item["ram_pct"] if item["ram_pct"] is not None else -1,
            ),
            reverse=True,
        )
        for rank, item in enumerate(rows[:top_per_host], 1):
            item["details"]["persisted_rank_limit"] = top_per_host
            ranked.append({**item, "rank": rank})
    return ranked


def persist_top_consumers(collection_id: str, raw: bytes, fallback_time: datetime | None = None) -> int:
    if not db_enabled():
        return 0
    engine = get_engine()
    if engine is None:
        return 0
    rows = parse_top_consumers(raw, fallback_time, TOP_CONSUMERS_PER_HOST)
    with engine.begin() as conn:
        for row in rows:
            conn.execute(text("""
                INSERT INTO rundeck_top_consumers (
                  collection_id, collected_at, host, consumer_type, consumer_key,
                  rank, cpu_pct, ram_pct, details
                ) VALUES (
                  :collection_id, :collected_at, :host, :consumer_type, :consumer_key,
                  :rank, :cpu_pct, :ram_pct, CAST(:details AS jsonb)
                )
                ON CONFLICT (collection_id, host, collected_at, consumer_type, consumer_key)
                DO UPDATE SET
                  rank=EXCLUDED.rank, cpu_pct=EXCLUDED.cpu_pct,
                  ram_pct=EXCLUDED.ram_pct, details=EXCLUDED.details
            """), {
                **row,
                "collection_id": collection_id,
                "details": json.dumps(row["details"]),
            })
    return len(rows)


def timeline_consumers(collection_id: str, host: str, at: datetime, limit: int = 5) -> list[dict]:
    engine = get_engine()
    if engine is None:
        raise RuntimeError("Database history is not enabled")
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT collection_id, collected_at, host, consumer_type, consumer_key,
                   rank, cpu_pct, ram_pct, details
              FROM rundeck_top_consumers
             WHERE collection_id = :collection_id
               AND host = :host
             ORDER BY ABS(EXTRACT(EPOCH FROM (collected_at - :at))), rank
             LIMIT :limit
        """), {
            "collection_id": collection_id,
            "host": host,
            "at": at,
            "limit": limit,
        })
        return [dict(row._mapping) for row in result]
