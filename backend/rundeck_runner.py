"""Narrow Rundeck runner used by SPHERE Collect Now.

No user supplied job ID is accepted. The only executable job is the configured whitelist.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.request import ProxyHandler, Request, build_opener

from backend.rundeck_poller import API_VERSION, BASE, NoRedirect
from backend.rundeck_store import ROOT, write_json

COOLDOWN_SECONDS = int(os.getenv("RUNDECK_COLLECT_COOLDOWN_SECONDS", "300"))


def _token() -> str:
    path = os.getenv("RUNDECK_RUNNER_TOKEN_FILE", "").strip()
    if not path:
        raise RuntimeError("Runner credential is not configured")
    token = Path(path).read_text().strip()
    if not token:
        raise RuntimeError("Runner credential is empty")
    return token


def _job_id() -> str:
    value = os.getenv("RUNDECK_RUN_JOB_ID", "").strip()
    if not value:
        raise RuntimeError("Whitelisted Rundeck job ID is not configured")
    return value


def _request(path: str, method: str = "GET") -> dict:
    opener = build_opener(ProxyHandler({}), NoRedirect())
    request = Request(
        BASE + path,
        method=method,
        headers={
            "X-Rundeck-Auth-Token": _token(),
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
        data=b"{}" if method == "POST" else None,
    )
    with opener.open(request, timeout=30) as response:
        if response.status not in (200, 201):
            raise RuntimeError("Unexpected Rundeck response")
        if response.headers.get_content_type() in ("text/html", "application/xhtml+xml"):
            raise RuntimeError("Rundeck returned HTML")
        return json.loads(response.read(1024 * 1024))


def _state_file() -> Path:
    return ROOT / "collect-now.json"


def _read_state() -> dict:
    path = _state_file()
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return {}


def _parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def status() -> dict:
    state = _read_state()
    execution_id = state.get("execution_id")
    if execution_id:
        try:
            execution = _request(f"/api/{API_VERSION}/execution/{execution_id}")
            state["status"] = str(execution.get("status") or state.get("status") or "unknown").lower()
            if state["status"] not in ("running", "scheduled"):
                state["finished_at"] = (
                    (execution.get("date-ended") or {}).get("date")
                    or state.get("finished_at")
                    or datetime.now(timezone.utc).isoformat()
                )
                write_json(_state_file(), state)
        except Exception:
            state["rundeck_status_check"] = "unavailable"

    requested = _parse_time(state.get("requested_at"))
    cooldown_until = requested + timedelta(seconds=COOLDOWN_SECONDS) if requested else None
    running = state.get("status") in ("running", "scheduled")
    cooldown = bool(cooldown_until and datetime.now(timezone.utc) < cooldown_until)
    return {
        **state,
        "running": running,
        "cooldown": cooldown,
        "cooldown_seconds": COOLDOWN_SECONDS,
        "cooldown_until": cooldown_until.isoformat() if cooldown_until else None,
        "allowed": not running and not cooldown,
        "job_id_configured": bool(os.getenv("RUNDECK_RUN_JOB_ID", "").strip()),
    }


def collect_now(requested_by: str = "sphere") -> dict:
    current = status()
    if not current["allowed"]:
        return current
    job_id = _job_id()
    execution = _request(f"/api/{API_VERSION}/job/{job_id}/run", method="POST")
    execution_id = str(execution.get("id") or "").strip()
    if not execution_id.isdigit():
        raise RuntimeError("Rundeck did not return a valid execution ID")
    state = {
        "execution_id": execution_id,
        "job_id": job_id,
        "requested_at": datetime.now(timezone.utc).isoformat(),
        "requested_by": requested_by[:120],
        "status": str(execution.get("status") or "running").lower(),
    }
    write_json(_state_file(), state)
    return status()
