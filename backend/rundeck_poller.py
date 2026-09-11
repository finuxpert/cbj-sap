"""Scheduled pull from the fixed Rundeck origin, using read-only credentials."""
import fcntl
import json
import os
from pathlib import Path
from urllib.parse import quote, urlencode
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

from backend.rundeck_credentials import credential_mode, read_credential
from backend.rundeck_store import ROOT, collections, identifier, ingest, initialize, now, write_json

BASE = "http://10.14.55.205:4440"
API_VERSION = 44
MAX_BYTES = 100 * 1024 * 1024


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request(path, token, accept):
    opener = build_opener(ProxyHandler({}), NoRedirect())
    req = Request(BASE + path, headers={"X-Rundeck-Auth-Token": token, "Accept": accept})
    with opener.open(req, timeout=60) as response:
        if response.status != 200:
            raise ValueError("Rundeck response is not HTTP 200")
        content_type = response.headers.get_content_type()
        if content_type in ("text/html", "application/xhtml+xml"):
            raise ValueError("Rundeck requires authentication; HTML rejected")
        result = response.read(MAX_BYTES + 1)
        if len(result) > MAX_BYTES:
            raise ValueError("Output exceeds configured size limit")
        return result


def execution_matches(execution, group, name):
    job = execution.get("job") or {}
    return str(job.get("group") or "").strip() == group and str(job.get("name") or "").strip() == name


def output_text(execution_id, token):
    payload = json.loads(request(
        f"/api/{API_VERSION}/execution/{execution_id}/output?format=json&offset=0",
        token,
        "application/json",
    ))
    if not payload.get("completed") or not payload.get("execCompleted"):
        raise ValueError("Rundeck execution output is not complete")
    entries = payload.get("entries")
    if not isinstance(entries, list) or not entries:
        raise ValueError("Rundeck execution output is empty")
    lines = [str(entry.get("log", "")) for entry in entries if isinstance(entry, dict) and "log" in entry]
    if not lines:
        raise ValueError("Rundeck execution output contains no log entries")
    return ("\n".join(lines) + "\n").encode("utf-8")


def poll():
    from backend.rundeck_monitoring import maybe_run_retention

    initialize()
    try:
        maybe_run_retention(ROOT)
    except Exception as error:
        # Retention failure must be visible to Platform Health but must not block ingestion.
        write_json(ROOT / "maintenance-error.json", {
            "failed_at": now(),
            "error_type": type(error).__name__,
        })

    with (ROOT / "poller.lock").open("w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        try:
            project = os.environ.get("RUNDECK_PROJECT", "Linux").strip()
            group = os.environ.get("RUNDECK_JOB_GROUP", "").strip()
            job_name = os.environ.get("RUNDECK_JOB_NAME", "").strip()
            expected = [host.strip() for host in os.environ.get("RUNDECK_EXPECTED_HOSTS", "").split(",") if host.strip()]
            auth_mode = credential_mode("rundeck-reader", "RUNDECK_TOKEN_FILE")
            if not project or not group or not job_name or len(set(expected)) != 5 or auth_mode == "missing":
                write_json(ROOT / "poller.json", {
                    "status": "NOT_CONFIGURED",
                    "checked_at": now(),
                    "credential_mode": auth_mode,
                })
                return

            token = read_credential("rundeck-reader", "RUNDECK_TOKEN_FILE")
            query = urlencode({
                "groupPathExact": group,
                "jobFilter": job_name,
                "adhoc": "false",
                "max": 20,
                "offset": 0,
            })
            page = json.loads(request(
                f"/api/{API_VERSION}/project/{quote(project, safe='')}/executions?" + query,
                token,
                "application/json",
            ))
            executions = [row for row in page.get("executions", []) if execution_matches(row, group, job_name)]
            if not executions:
                write_json(ROOT / "poller.json", {
                    "status": "NO_MATCH",
                    "checked_at": now(),
                    "credential_mode": auth_mode,
                    "project": project,
                    "job_group": group,
                    "job_name": job_name,
                })
                return

            execution = max(executions, key=lambda row: int(row["id"]))
            eid = str(execution["id"])
            identifier(eid)
            state = str(execution.get("status") or "").lower()

            if state in ("running", "scheduled"):
                write_json(ROOT / "poller.json", {
                    "status": "WAITING",
                    "checked_at": now(),
                    "credential_mode": auth_mode,
                    "latest_execution": eid,
                    "latest_execution_status": state,
                })
                return

            known = {row["execution_id"] for row in collections() if row["status"] in ("READY", "PARTIAL", "FAILED")}
            if eid in known:
                write_json(ROOT / "poller.json", {
                    "status": "OK",
                    "checked_at": now(),
                    "credential_mode": auth_mode,
                    "processed": 0,
                    "latest_execution": eid,
                    "latest_execution_status": state,
                })
                return

            raw = output_text(eid, token) if state == "succeeded" else b""
            result = ingest(execution, raw, expected)
            write_json(ROOT / "poller.json", {
                "status": "OK",
                "checked_at": now(),
                "credential_mode": auth_mode,
                "processed": 1,
                "latest_execution": eid,
                "latest_execution_status": state,
                "collection_id": result["collection_id"],
                "collection_status": result["status"],
                "database_status": result.get("database_status"),
                "job_id_observed": (execution.get("job") or {}).get("id"),
            })
        except BlockingIOError:
            write_json(ROOT / "poller.json", {"status": "BUSY", "checked_at": now()})
        except Exception as error:
            write_json(ROOT / "poller.json", {
                "status": "ERROR",
                "checked_at": now(),
                "credential_mode": credential_mode("rundeck-reader", "RUNDECK_TOKEN_FILE"),
                "error_type": type(error).__name__,
            })
            raise RuntimeError(
                "Rundeck ingestion failed; check authentication, connectivity and collection contract"
            ) from None


if __name__ == "__main__":
    poll()
