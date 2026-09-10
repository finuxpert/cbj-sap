"""Operational health snapshot for the isolated SPHERE Rundeck development stack."""
from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import text

from backend.db.session import check_database, db_enabled, get_engine

INODE_WARNING_PCT = float(os.getenv("SPHERE_INODE_WARNING_PCT", "75"))
INODE_CRITICAL_PCT = float(os.getenv("SPHERE_INODE_CRITICAL_PCT", "90"))
MAINTENANCE_INTERVAL_SECONDS = int(os.getenv("SPHERE_MAINTENANCE_INTERVAL_SECONDS", "21600"))
RELEASES_KEEP = max(1, int(os.getenv("SPHERE_RELEASES_KEEP", "5")))
CACHE_SECONDS = max(5, int(os.getenv("SPHERE_PLATFORM_HEALTH_CACHE_SECONDS", "30")))

_CACHE: dict = {"at": 0.0, "value": None}


def _json_file(path: Path) -> dict | None:
    try:
        if path.is_file():
            value = json.loads(path.read_text())
            return value if isinstance(value, dict) else None
    except (OSError, ValueError):
        return None
    return None


def _tree_usage(path: Path) -> dict:
    if not path.exists():
        return {"files": 0, "bytes": 0}
    files = 0
    total = 0
    try:
        for item in path.rglob("*"):
            if not item.is_file():
                continue
            try:
                total += item.stat().st_size
                files += 1
            except OSError:
                continue
    except OSError:
        pass
    return {"files": files, "bytes": total}


def _inode_usage(path: Path) -> dict:
    try:
        stats = os.statvfs(path)
        total = int(stats.f_files or 0)
        free = int(stats.f_ffree or 0)
        used = max(0, total - free)
        pct = (used / total * 100.0) if total else 0.0
        status = "CRITICAL" if pct >= INODE_CRITICAL_PCT else "WARNING" if pct >= INODE_WARNING_PCT else "NORMAL"
        return {
            "status": status,
            "used_pct": round(pct, 2),
            "used": used,
            "free": free,
            "total": total,
            "warning_pct": INODE_WARNING_PCT,
            "critical_pct": INODE_CRITICAL_PCT,
        }
    except OSError:
        return {"status": "UNKNOWN"}


def _release_state(root: Path, current: Path) -> dict:
    try:
        releases = [item for item in root.iterdir() if item.is_dir() and len(item.name) == 40]
    except OSError:
        releases = []
    try:
        current_revision = current.resolve().name if current.exists() else None
    except OSError:
        current_revision = None
    return {
        "count": len(releases),
        "retain": RELEASES_KEEP,
        "current_revision": current_revision,
    }


def _database_stats() -> dict:
    state = check_database()
    result = {"status": state.get("status", "unknown"), "enabled": state.get("enabled", False)}
    if not db_enabled():
        return result
    engine = get_engine()
    if engine is None:
        return result
    try:
        with engine.connect() as conn:
            result["database_bytes"] = int(conn.execute(text("SELECT pg_database_size(current_database())")).scalar() or 0)
            result["connections"] = int(conn.execute(text(
                "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database()"
            )).scalar() or 0)
            result["long_transactions"] = int(conn.execute(text(
                "SELECT count(*) FROM pg_stat_activity "
                "WHERE datname=current_database() AND xact_start IS NOT NULL "
                "AND now() - xact_start > interval '5 minutes'"
            )).scalar() or 0)
            tables = {}
            for name in (
                "rundeck_collections",
                "rundeck_host_metrics",
                "rundeck_top_consumers",
                "rundeck_alerts",
                "rundeck_manual_runs",
            ):
                size = conn.execute(text(
                    "SELECT CASE WHEN to_regclass(:name) IS NULL THEN 0 "
                    "ELSE pg_total_relation_size(to_regclass(:name)) END"
                ), {"name": name}).scalar()
                tables[name] = int(size or 0)
            result["table_bytes"] = tables
            try:
                result["wal_bytes"] = int(conn.execute(text("SELECT COALESCE(sum(size),0) FROM pg_ls_waldir()" )).scalar() or 0)
            except Exception:
                result["wal_bytes"] = None
    except Exception as error:
        result["status"] = "error"
        result["error_type"] = type(error).__name__
    return result


def _maintenance_state(root: Path) -> dict:
    state = _json_file(root / "maintenance.json")
    if not state:
        return {"status": "UNKNOWN", "last_run": None}
    last_run = state.get("ran_at")
    age_seconds = None
    try:
        parsed = datetime.fromisoformat(str(last_run).replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        age_seconds = max(0, int((datetime.now(timezone.utc) - parsed.astimezone(timezone.utc)).total_seconds()))
    except (TypeError, ValueError):
        pass
    stale_after = MAINTENANCE_INTERVAL_SECONDS * 2
    status = "WARNING" if age_seconds is None or age_seconds > stale_after else "NORMAL"
    return {
        "status": status,
        "last_run": last_run,
        "age_seconds": age_seconds,
        "removed_files": int(state.get("removed_files") or 0),
        "retention_days": int(state.get("retention_days") or 0),
    }


def _backup_state(root: Path) -> dict:
    configured = os.getenv("SPHERE_BACKUP_STATUS_FILE", "").strip()
    path = Path(configured) if configured else root / "backup.json"
    state = _json_file(path)
    if not state:
        return {"status": "NOT_CONFIGURED", "last_success": None}
    return {
        "status": str(state.get("status") or "UNKNOWN").upper(),
        "last_success": state.get("last_success"),
        "type": state.get("type"),
    }


def platform_health(root: Path) -> dict:
    now_monotonic = time.monotonic()
    cached = _CACHE.get("value")
    if cached is not None and now_monotonic - float(_CACHE.get("at") or 0) < CACHE_SECONDS:
        return cached

    from backend.rundeck_monitoring import disk_status

    filesystem = disk_status(root) if root.exists() else {"status": "UNKNOWN"}
    inode = _inode_usage(root)
    archive = _tree_usage(root / "archive")
    rejected = _tree_usage(root / "rejected")
    maintenance = _maintenance_state(root)
    backup = _backup_state(root)
    database = _database_stats()
    backend_releases = _release_state(Path("/opt/sphere-rundeck-dev/releases"), Path("/opt/sphere-rundeck-dev/current"))
    web_releases = _release_state(Path("/var/www/sphere-dev/releases"), Path("/var/www/sphere-dev/current"))

    states = [filesystem.get("status"), inode.get("status"), maintenance.get("status")]
    if db_enabled():
        states.append("NORMAL" if database.get("status") == "ok" else "CRITICAL")
    if "CRITICAL" in states:
        status = "CRITICAL"
    elif "WARNING" in states:
        status = "WARNING"
    else:
        status = "NORMAL"

    value = {
        "status": status,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "filesystem": filesystem,
        "inode": inode,
        "archive": archive,
        "rejected": rejected,
        "maintenance": maintenance,
        "backup": backup,
        "database": database,
        "releases": {"backend": backend_releases, "web": web_releases},
    }
    _CACHE["at"] = now_monotonic
    _CACHE["value"] = value
    return value
