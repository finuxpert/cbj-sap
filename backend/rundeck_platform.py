"""Operational health snapshot for the isolated SPHERE Rundeck runtime."""
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


def _parse_iso(value) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
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
    status = "WARNING" if len(releases) > RELEASES_KEEP + 2 else "NORMAL"
    return {
        "status": status,
        "count": len(releases),
        "retain": RELEASES_KEEP,
        "current_revision": current_revision,
    }


def _runtime_release_paths() -> tuple[Path, Path, Path, Path]:
    backend_releases_env = os.getenv("SPHERE_BACKEND_RELEASES_ROOT", "").strip()
    backend_current_env = os.getenv("SPHERE_BACKEND_CURRENT", "").strip()
    web_releases_env = os.getenv("SPHERE_WEB_RELEASES_ROOT", "").strip()
    web_current_env = os.getenv("SPHERE_WEB_CURRENT", "").strip()

    if backend_releases_env and backend_current_env and web_releases_env and web_current_env:
        return (
            Path(backend_releases_env),
            Path(backend_current_env),
            Path(web_releases_env),
            Path(web_current_env),
        )

    runtime = str(Path.cwd().resolve())
    if "sphere-rundeck-prod" in runtime:
        return (
            Path("/opt/sphere-rundeck-prod/releases"),
            Path("/opt/sphere-rundeck-prod/current"),
            Path("/var/www/sphere.astraotoparts.co.id/releases"),
            Path("/var/www/sphere.astraotoparts.co.id/current"),
        )

    return (
        Path("/opt/sphere-rundeck-dev/releases"),
        Path("/opt/sphere-rundeck-dev/current"),
        Path("/var/www/sphere-dev/releases"),
        Path("/var/www/sphere-dev/current"),
    )


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
            with engine.connect() as wal_conn:
                result["wal_bytes"] = int(wal_conn.execute(text(
                    "SELECT COALESCE(sum(size),0) FROM pg_ls_waldir()"
                )).scalar() or 0)
        except Exception:
            result["wal_bytes"] = None
    except Exception as error:
        result["status"] = "error"
        result["error_type"] = type(error).__name__
    return result


def _collector_state(root: Path) -> dict:
    state = _json_file(root / "poller.json") or {}
    raw_status = str(state.get("status") or "UNKNOWN").upper()
    if raw_status == "ERROR":
        status = "CRITICAL"
    elif raw_status in {"NOT_CONFIGURED", "NO_MATCH"}:
        status = "WARNING"
    elif raw_status in {"OK", "WAITING", "BUSY"}:
        status = "NORMAL"
    else:
        status = "UNKNOWN"
    return {
        "status": status,
        "poller_status": raw_status,
        "checked_at": state.get("checked_at"),
        "credential_mode": state.get("credential_mode") or "unknown",
        "error_type": state.get("error_type"),
    }


def _maintenance_state(root: Path) -> dict:
    state = _json_file(root / "maintenance.json")
    error = _json_file(root / "maintenance-error.json")
    if not state and not error:
        return {"status": "UNKNOWN", "last_run": None, "last_error": None}

    last_run = state.get("ran_at") if state else None
    last_error = error.get("failed_at") if error else None
    success_dt = _parse_iso(last_run)
    error_dt = _parse_iso(last_error)
    age_seconds = None
    if success_dt:
        age_seconds = max(0, int((datetime.now(timezone.utc) - success_dt.astimezone(timezone.utc)).total_seconds()))

    stale_after = MAINTENANCE_INTERVAL_SECONDS * 2
    newer_error = bool(error_dt and (success_dt is None or error_dt > success_dt))
    status = "WARNING" if newer_error or age_seconds is None or age_seconds > stale_after else "NORMAL"
    return {
        "status": status,
        "last_run": last_run,
        "last_error": last_error if newer_error else None,
        "error_type": error.get("error_type") if newer_error and error else None,
        "age_seconds": age_seconds,
        "removed_files": int((state or {}).get("removed_files") or 0),
        "retention_days": int((state or {}).get("retention_days") or 0),
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
    collector = _collector_state(root)
    maintenance = _maintenance_state(root)
    backup = _backup_state(root)
    database = _database_stats()
    backend_releases_root, backend_current, web_releases_root, web_current = _runtime_release_paths()
    backend_releases = _release_state(backend_releases_root, backend_current)
    web_releases = _release_state(web_releases_root, web_current)

    states = [
        filesystem.get("status"),
        inode.get("status"),
        collector.get("status"),
        maintenance.get("status"),
        backend_releases.get("status"),
        web_releases.get("status"),
    ]
    if db_enabled():
        states.append("NORMAL" if database.get("status") == "ok" else "CRITICAL")
    if backup.get("status") in {"FAILED", "ERROR"}:
        states.append("WARNING")

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
        "collector": collector,
        "maintenance": maintenance,
        "backup": backup,
        "database": database,
        "releases": {"backend": backend_releases, "web": web_releases},
    }
    _CACHE["at"] = now_monotonic
    _CACHE["value"] = value
    return value
