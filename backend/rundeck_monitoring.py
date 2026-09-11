"""Rundeck monitoring persistence, history queries and retention helpers.

The raw collection remains evidence. Dashboard queries use normalized PostgreSQL rows.
TimescaleDB is optional and detected at runtime.
"""
from __future__ import annotations

import gzip
import json
import os
import re
import shutil
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from sqlalchemy import text

from backend.db.session import db_enabled, get_engine

RETENTION_DAYS = int(os.getenv("SPHERE_RETENTION_DAYS", "90"))
DISK_WARNING_PCT = float(os.getenv("SPHERE_DISK_WARNING_PCT", "70"))
DISK_CRITICAL_PCT = float(os.getenv("SPHERE_DISK_CRITICAL_PCT", "85"))
MAINTENANCE_INTERVAL_SECONDS = int(os.getenv("SPHERE_MAINTENANCE_INTERVAL_SECONDS", "21600"))

CPU_WARNING = float(os.getenv("SPHERE_CPU_WARNING_PCT", "75"))
CPU_CRITICAL = float(os.getenv("SPHERE_CPU_CRITICAL_PCT", "90"))
RAM_WARNING = float(os.getenv("SPHERE_RAM_WARNING_PCT", "80"))
RAM_CRITICAL = float(os.getenv("SPHERE_RAM_CRITICAL_PCT", "90"))
IOWAIT_WARNING = float(os.getenv("SPHERE_IOWAIT_WARNING_PCT", "10"))
IOWAIT_CRITICAL = float(os.getenv("SPHERE_IOWAIT_CRITICAL_PCT", "20"))
WP_WARNING = int(os.getenv("SPHERE_WP_WARNING", "1"))
WP_CRITICAL = int(os.getenv("SPHERE_WP_CRITICAL", "3"))


def _dt(value: str | datetime | None) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _float(fields: dict, *names: str) -> float | None:
    for name in names:
        value = fields.get(name)
        if value in (None, "", "NA", "N/A", "-"):
            continue
        try:
            return float(str(value).rstrip("%"))
        except (TypeError, ValueError):
            continue
    return None


def _int(fields: dict, *names: str) -> int | None:
    value = _float(fields, *names)
    return int(value) if value is not None else None


def _snapshot_blocks(text_value: str) -> list[dict]:
    blocks = re.findall(
        r"^## RCA-SNAPSHOT-V2\.2-BEGIN\s*\n(.*?)^## RCA-SNAPSHOT-V2\.2-END\s*$",
        text_value,
        re.M | re.S,
    )
    rows: list[dict] = []
    for block in blocks:
        fields: dict[str, str] = {}
        for line in block.splitlines():
            if "\t" in line:
                key, value = line.split("\t", 1)
                fields[key.strip()] = value.strip()
            elif "=" in line and " " not in line.split("=", 1)[0]:
                key, value = line.split("=", 1)
                fields[key.strip()] = value.strip()
        if fields:
            rows.append(fields)
    return rows


def _extension_iowait(text_value: str) -> dict[str, float]:
    result: dict[str, float] = {}
    current_host = None
    for line in text_value.splitlines():
        match = re.match(r"^## RCA-EXT @ (\S+) ", line)
        if match:
            current_host = match.group(1)
            continue
        if current_host and line.startswith("EXT_HOST "):
            fields = dict(re.findall(r"(\w+)=([^\s]+)", line))
            value = _float(fields, "iowait_pct")
            if value is not None:
                result[current_host] = value
            current_host = None
    return result


def evaluate_health(metric: dict) -> str:
    critical = (
        (metric.get("cpu_pct") is not None and metric["cpu_pct"] >= CPU_CRITICAL)
        or (metric.get("ram_pct") is not None and metric["ram_pct"] >= RAM_CRITICAL)
        or (metric.get("io_wait_pct") is not None and metric["io_wait_pct"] >= IOWAIT_CRITICAL)
        or (metric.get("wp_critical") is not None and metric["wp_critical"] >= WP_CRITICAL)
    )
    if critical:
        return "CRITICAL"
    warning = (
        (metric.get("cpu_pct") is not None and metric["cpu_pct"] >= CPU_WARNING)
        or (metric.get("ram_pct") is not None and metric["ram_pct"] >= RAM_WARNING)
        or (metric.get("io_wait_pct") is not None and metric["io_wait_pct"] >= IOWAIT_WARNING)
        or (metric.get("wp_critical") is not None and metric["wp_critical"] >= WP_WARNING)
    )
    return "WARNING" if warning else "NORMAL"


def parse_host_metrics(raw: bytes, fallback_time: datetime | None = None) -> list[dict]:
    text_value = raw.decode("utf-8-sig", errors="strict")
    ext_iowait = _extension_iowait(text_value)
    rows = []
    for fields in _snapshot_blocks(text_value):
        host = str(fields.get("hostname") or "").strip()
        if not host:
            continue
        collected_at = (
            _dt(fields.get("snapshot_ts"))
            or fallback_time
            or datetime.now(timezone.utc)
        )
        metric = {
            "host": host,
            "collected_at": collected_at,
            "cpu_pct": _float(fields, "host_cpu_pct", "cpu_pct", "cpu_used_pct"),
            "ram_pct": _float(fields, "host_mem_pct", "mem_used_pct", "ram_pct", "memory_used_pct"),
            "load_1": _float(fields, "load1", "load_1", "host_load1"),
            "io_wait_pct": _float(fields, "io_wait_pct", "iowait_pct"),
            "swap_pct": _float(fields, "swap_pct", "swap_used_pct"),
            "wp_critical": _int(fields, "wp_critical", "critical_wp", "wp_critical_count"),
            "details": fields,
        }
        if metric["io_wait_pct"] is None:
            metric["io_wait_pct"] = ext_iowait.get(host)
        metric["health"] = evaluate_health(metric)
        rows.append(metric)
    return rows


def _alerts_for_metric(collection_id: str, metric: dict) -> list[dict]:
    values = [
        ("CPU_HIGH", metric.get("cpu_pct"), CPU_WARNING, CPU_CRITICAL, "CPU"),
        ("RAM_HIGH", metric.get("ram_pct"), RAM_WARNING, RAM_CRITICAL, "RAM"),
        ("IOWAIT_HIGH", metric.get("io_wait_pct"), IOWAIT_WARNING, IOWAIT_CRITICAL, "IO Wait"),
        ("WP_CRITICAL", metric.get("wp_critical"), WP_WARNING, WP_CRITICAL, "Critical work process"),
    ]
    alerts = []
    for code, value, warning, critical, label in values:
        if value is None or value < warning:
            continue
        severity = "CRITICAL" if value >= critical else "WARNING"
        alerts.append({
            "id": uuid4().hex,
            "collection_id": collection_id,
            "collected_at": metric["collected_at"],
            "host": metric["host"],
            "code": code,
            "severity": severity,
            "message": f"{label} threshold exceeded on {metric['host']}",
            "details": {"value": value, "warning": warning, "critical": critical},
        })
    return alerts


def _collection_alerts(row: dict, collected_at: datetime) -> list[dict]:
    alerts = []
    expected = set(row.get("expected_hosts") or [])
    received = set(row.get("received_hosts") or [])
    missing = sorted(expected - received)
    status = str(row.get("status") or "").upper()
    if status == "FAILED":
        alerts.append({
            "id": uuid4().hex,
            "collection_id": row.get("collection_id"),
            "collected_at": collected_at,
            "host": None,
            "code": "COLLECTION_FAILED",
            "severity": "CRITICAL",
            "message": "Rundeck collection failed",
            "details": {"execution_id": row.get("execution_id"), "error": row.get("error")},
        })
    elif status == "PARTIAL":
        alerts.append({
            "id": uuid4().hex,
            "collection_id": row.get("collection_id"),
            "collected_at": collected_at,
            "host": None,
            "code": "COLLECTION_PARTIAL",
            "severity": "WARNING",
            "message": "Rundeck collection is partial",
            "details": {"execution_id": row.get("execution_id"), "missing_hosts": missing},
        })
    for host in missing:
        alerts.append({
            "id": uuid4().hex,
            "collection_id": row.get("collection_id"),
            "collected_at": collected_at,
            "host": host,
            "code": "HOST_MISSING",
            "severity": "CRITICAL" if status == "FAILED" else "WARNING",
            "message": f"Expected host missing from collection: {host}",
            "details": {"execution_id": row.get("execution_id")},
        })
    return alerts


def _write_alert(conn, alert: dict) -> None:
    conn.execute(text("""
        INSERT INTO rundeck_alerts (
          id, collection_id, collected_at, host, code, severity, message, details
        ) VALUES (
          :id, :collection_id, :collected_at, :host, :code, :severity, :message,
          CAST(:details AS jsonb)
        )
    """), {**alert, "details": json.dumps(alert["details"])})


def persist_collection(row: dict, raw: bytes) -> str:
    """Persist normalized data when DB is enabled. File-mode remains a supported fallback."""
    if not db_enabled():
        return "DISABLED"
    engine = get_engine()
    if engine is None:
        return "DISABLED"
    finished = _dt(row.get("finished_at"))
    created = _dt(row.get("created_at")) or datetime.now(timezone.utc)
    metrics = parse_host_metrics(raw, finished)
    with engine.begin() as conn:
        conn.execute(text("""
            INSERT INTO rundeck_collections (
              collection_id, execution_id, source, status, started_at, finished_at,
              expected_host_count, received_host_count, expected_hosts, received_hosts,
              checksum_sha256, raw_path, size_bytes, error, created_at
            ) VALUES (
              :collection_id, :execution_id, :source, :status, :started_at, :finished_at,
              :expected_host_count, :received_host_count, CAST(:expected_hosts AS jsonb),
              CAST(:received_hosts AS jsonb), :checksum, :raw_path, :size_bytes, :error, :created_at
            )
            ON CONFLICT (collection_id) DO UPDATE SET
              status=EXCLUDED.status, finished_at=EXCLUDED.finished_at,
              received_host_count=EXCLUDED.received_host_count,
              received_hosts=EXCLUDED.received_hosts, checksum_sha256=EXCLUDED.checksum_sha256,
              raw_path=EXCLUDED.raw_path, size_bytes=EXCLUDED.size_bytes, error=EXCLUDED.error
        """), {
            "collection_id": row["collection_id"],
            "execution_id": row["execution_id"],
            "source": row.get("source", "rundeck"),
            "status": row["status"],
            "started_at": _dt(row.get("started_at")),
            "finished_at": finished,
            "expected_host_count": len(row.get("expected_hosts") or []),
            "received_host_count": len(row.get("received_hosts") or []),
            "expected_hosts": json.dumps(row.get("expected_hosts") or []),
            "received_hosts": json.dumps(row.get("received_hosts") or []),
            "checksum": row.get("checksum"),
            "raw_path": row.get("raw_path"),
            "size_bytes": int(row.get("size_bytes") or 0),
            "error": row.get("error"),
            "created_at": created,
        })
        for metric in metrics:
            conn.execute(text("""
                INSERT INTO rundeck_host_metrics (
                  collection_id, collected_at, host, cpu_pct, ram_pct, load_1,
                  io_wait_pct, swap_pct, wp_critical, health, details
                ) VALUES (
                  :collection_id, :collected_at, :host, :cpu_pct, :ram_pct, :load_1,
                  :io_wait_pct, :swap_pct, :wp_critical, :health, CAST(:details AS jsonb)
                )
                ON CONFLICT (collection_id, host, collected_at) DO UPDATE SET
                  cpu_pct=EXCLUDED.cpu_pct, ram_pct=EXCLUDED.ram_pct, load_1=EXCLUDED.load_1,
                  io_wait_pct=EXCLUDED.io_wait_pct, swap_pct=EXCLUDED.swap_pct,
                  wp_critical=EXCLUDED.wp_critical, health=EXCLUDED.health, details=EXCLUDED.details
            """), {**metric, "collection_id": row["collection_id"], "details": json.dumps(metric["details"])})
            for alert in _alerts_for_metric(row["collection_id"], metric):
                _write_alert(conn, alert)
        for alert in _collection_alerts(row, finished or created):
            _write_alert(conn, alert)
    return "STORED"


def timescale_status() -> dict:
    if not db_enabled():
        return {"database": False, "timescaledb": False}
    engine = get_engine()
    if engine is None:
        return {"database": False, "timescaledb": False}
    try:
        with engine.connect() as conn:
            enabled = bool(conn.execute(text(
                "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname='timescaledb')"
            )).scalar())
        return {"database": True, "timescaledb": enabled}
    except Exception:
        return {"database": True, "timescaledb": False}


def host_history(host: str | None, since: datetime, limit: int = 20000) -> list[dict]:
    engine = get_engine()
    if engine is None:
        raise RuntimeError("Database history is not enabled")
    clause = "AND host = :host" if host else ""
    params = {"since": since, "limit": limit}
    if host:
        params["host"] = host
    with engine.connect() as conn:
        result = conn.execute(text(f"""
            SELECT collection_id, collected_at, host, cpu_pct, ram_pct, load_1,
                   io_wait_pct, swap_pct, wp_critical, health
              FROM rundeck_host_metrics
             WHERE collected_at >= :since {clause}
             ORDER BY collected_at ASC, host ASC
             LIMIT :limit
        """), params)
        return [dict(row._mapping) for row in result]


def collection_history(since: datetime, limit: int = 2000) -> list[dict]:
    engine = get_engine()
    if engine is None:
        raise RuntimeError("Database history is not enabled")
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT collection_id, execution_id, source, status, started_at, finished_at,
                   expected_host_count, received_host_count, error, created_at
              FROM rundeck_collections
             WHERE COALESCE(finished_at, created_at) >= :since
             ORDER BY COALESCE(finished_at, created_at) DESC
             LIMIT :limit
        """), {"since": since, "limit": limit})
        return [dict(row._mapping) for row in result]


def timeline(at: datetime, window_minutes: int = 5) -> list[dict]:
    engine = get_engine()
    if engine is None:
        raise RuntimeError("Database history is not enabled")
    start = at - timedelta(minutes=window_minutes)
    end = at + timedelta(minutes=window_minutes)
    with engine.connect() as conn:
        result = conn.execute(text("""
            WITH ranked AS (
              SELECT collection_id, collected_at, host, cpu_pct, ram_pct, load_1,
                     io_wait_pct, swap_pct, wp_critical, health,
                     ROW_NUMBER() OVER (
                       PARTITION BY host
                       ORDER BY ABS(EXTRACT(EPOCH FROM (collected_at - :at)))
                     ) AS rn
                FROM rundeck_host_metrics
               WHERE collected_at BETWEEN :start AND :end
            )
            SELECT collection_id, collected_at, host, cpu_pct, ram_pct, load_1,
                   io_wait_pct, swap_pct, wp_critical, health
              FROM ranked WHERE rn = 1
             ORDER BY host
        """), {"at": at, "start": start, "end": end})
        return [dict(row._mapping) for row in result]


def disk_status(root: Path) -> dict:
    usage = shutil.disk_usage(root)
    pct = (usage.used / usage.total * 100.0) if usage.total else 0.0
    status = "CRITICAL" if pct >= DISK_CRITICAL_PCT else "WARNING" if pct >= DISK_WARNING_PCT else "NORMAL"
    return {
        "status": status,
        "used_pct": round(pct, 2),
        "warning_pct": DISK_WARNING_PCT,
        "critical_pct": DISK_CRITICAL_PCT,
        "free_bytes": usage.free,
        "total_bytes": usage.total,
    }


def compress_file(path: Path) -> Path:
    if path.suffix == ".gz":
        return path
    target = Path(str(path) + ".gz")
    temporary = Path(str(target) + ".tmp")
    with path.open("rb") as source, gzip.open(temporary, "wb", compresslevel=6) as output:
        shutil.copyfileobj(source, output)
    temporary.replace(target)
    path.unlink()
    return target


def _cleanup_db(cutoff: datetime) -> None:
    engine = get_engine()
    if engine is None:
        return
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM rundeck_alerts WHERE collected_at < :cutoff"), {"cutoff": cutoff})
        conn.execute(text("DELETE FROM rundeck_top_consumers WHERE collected_at < :cutoff"), {"cutoff": cutoff})
        conn.execute(text("DELETE FROM rundeck_host_metrics WHERE collected_at < :cutoff"), {"cutoff": cutoff})
        conn.execute(text(
            "DELETE FROM rundeck_collections WHERE COALESCE(finished_at, created_at) < :cutoff"
        ), {"cutoff": cutoff})
        conn.execute(text("DELETE FROM rundeck_manual_runs WHERE requested_at < :cutoff"), {"cutoff": cutoff})


def run_retention(root: Path) -> dict:
    cutoff = datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)
    removed = 0
    for folder in ("archive", "rejected", "manifests"):
        directory = root / folder
        if not directory.exists():
            continue
        for path in directory.iterdir():
            if not path.is_file():
                continue
            modified = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
            if modified < cutoff:
                path.unlink()
                removed += 1
    if db_enabled():
        _cleanup_db(cutoff)
    return {"removed_files": removed, "retention_days": RETENTION_DAYS, "ran_at": datetime.now(timezone.utc).isoformat()}


def maybe_run_retention(root: Path) -> dict | None:
    marker = root / "maintenance.json"
    now_epoch = time.time()
    if marker.exists() and now_epoch - marker.stat().st_mtime < MAINTENANCE_INTERVAL_SECONDS:
        return None
    result = run_retention(root)
    temporary = marker.with_suffix(".tmp")
    temporary.write_text(json.dumps(result, indent=2))
    temporary.replace(marker)
    return result


def latest_host_metrics() -> list[dict]:
    engine = get_engine()
    if engine is None:
        raise RuntimeError("Database history is not enabled")
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT DISTINCT ON (host)
                   collection_id, collected_at, host, cpu_pct, ram_pct, load_1,
                   io_wait_pct, swap_pct, wp_critical, health
              FROM rundeck_host_metrics
             ORDER BY host, collected_at DESC
        """))
        return [dict(row._mapping) for row in result]


def alert_history(since: datetime, limit: int = 1000) -> list[dict]:
    engine = get_engine()
    if engine is None:
        raise RuntimeError("Database history is not enabled")
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT id, collection_id, collected_at, host, code, severity, message, details, resolved_at
              FROM rundeck_alerts
             WHERE collected_at >= :since
             ORDER BY collected_at DESC
             LIMIT :limit
        """), {"since": since, "limit": limit})
        return [dict(row._mapping) for row in result]


def top_consumer_history(since: datetime, limit: int = 100) -> list[dict]:
    engine = get_engine()
    if engine is None:
        raise RuntimeError("Database history is not enabled")
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT consumer_type, consumer_key, host,
                   COUNT(*) AS occurrences,
                   MAX(cpu_pct) AS peak_cpu_pct,
                   AVG(cpu_pct) AS avg_cpu_pct,
                   MAX(ram_pct) AS peak_ram_pct,
                   MAX(collected_at) AS last_seen
              FROM rundeck_top_consumers
             WHERE collected_at >= :since
             GROUP BY consumer_type, consumer_key, host
             ORDER BY occurrences DESC, peak_cpu_pct DESC NULLS LAST
             LIMIT :limit
        """), {"since": since, "limit": limit})
        return [dict(row._mapping) for row in result]
