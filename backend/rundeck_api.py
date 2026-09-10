"""Isolated /dev API for Rundeck collections and historical monitoring."""
from __future__ import annotations

import asyncio
import gzip
import json
import os
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, Response, StreamingResponse

from backend.rundeck_monitoring import (
    alert_history,
    collection_history,
    disk_status,
    host_history,
    latest_host_metrics,
    timeline,
    timescale_status,
    top_consumer_history,
)
from backend.rundeck_store import ROOT, collections, identifier

app = FastAPI(title="SPHERE Rundeck Development", docs_url=None, redoc_url=None)
WIB = ZoneInfo("Asia/Jakarta")
STALE_MINUTES = int(os.getenv("RUNDECK_STALE_MINUTES", "20"))


def _parse_time(value: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(400, "Invalid ISO timestamp") from None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _wib(value: str | datetime | None) -> str | None:
    if not value:
        return None
    parsed = _parse_time(value) if isinstance(value, str) else value
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(WIB).isoformat()


def _view(row: dict) -> dict:
    expected = row.get("expected_hosts") or []
    received = row.get("received_hosts") or []
    return {
        **row,
        "collection_time_wib": _wib(row.get("finished_at")),
        "host_count": f"{len(received)} of {len(expected) or 5}",
    }


def _latest_ready() -> dict | None:
    return next((item for item in collections() if item.get("status") == "READY"), None)


def _stale(latest_row: dict | None) -> bool:
    if latest_row is None or not latest_row.get("finished_at"):
        return True
    finished = _parse_time(latest_row["finished_at"])
    return datetime.now(timezone.utc) - finished.astimezone(timezone.utc) > timedelta(minutes=STALE_MINUTES)


@app.get("/health")
def health():
    state = ROOT / "poller.json"
    latest_row = _latest_ready()
    ingestion = json.loads(state.read_text()) if state.exists() else {"status": "NOT_CONFIGURED"}
    return {
        "ok": ROOT.is_dir(),
        "source": "rundeck",
        "ingestion": ingestion,
        "latest": _view(latest_row) if latest_row else None,
        "rundeck_stale": _stale(latest_row),
        "stale_after_minutes": STALE_MINUTES,
        "storage": disk_status(ROOT) if ROOT.exists() else {"status": "UNKNOWN"},
        **timescale_status(),
    }


@app.get("/collections")
def list_collections(limit: int = Query(50, ge=1, le=500)):
    return {"items": [_view(row) for row in collections()[:limit]]}


@app.get("/collections/latest")
def latest():
    row = _latest_ready()
    if row is None:
        raise HTTPException(404, "No READY collection available")
    return _view(row)


@app.get("/collections/{collection_id}")
def metadata(collection_id: str):
    try:
        if identifier(collection_id.removeprefix("rundeck-")) != collection_id:
            raise ValueError()
    except ValueError:
        raise HTTPException(404, "Collection not found") from None
    path = ROOT / "manifests" / (collection_id + ".json")
    if not path.is_file():
        raise HTTPException(404, "Collection not found")
    return _view(json.loads(path.read_text()))


@app.get("/collections/{collection_id}/raw")
def raw_collection(collection_id: str):
    row = metadata(collection_id)
    path = (ROOT / row.get("raw_path", "missing")).resolve()
    if ROOT.resolve() not in path.parents or not path.is_file():
        raise HTTPException(404, "Raw collection not available")
    headers = {"Cache-Control": "no-store", "Content-Disposition": f'attachment; filename="{collection_id}.log"'}
    if path.suffix == ".gz":
        with gzip.open(path, "rb") as stream:
            return Response(stream.read(), media_type="text/plain", headers=headers)
    return FileResponse(path, media_type="text/plain", filename=collection_id + ".log", headers={"Cache-Control": "no-store"})


@app.get("/history/hosts")
def history_hosts(
    host: str | None = Query(None, max_length=120),
    days: int = Query(7, ge=1, le=90),
    limit: int = Query(20000, ge=1, le=100000),
):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    try:
        return {"since": since, "days": days, "host": host, "items": host_history(host, since, limit)}
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from None


@app.get("/history/hosts/latest")
def history_hosts_latest():
    try:
        return {"items": latest_host_metrics()}
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from None


@app.get("/history/alerts")
def history_alerts(days: int = Query(7, ge=1, le=90), limit: int = Query(500, ge=1, le=5000)):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    try:
        return {"since": since, "days": days, "items": alert_history(since, limit)}
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from None


@app.get("/history/top-consumers")
def history_top_consumers(days: int = Query(90, ge=1, le=90), limit: int = Query(100, ge=1, le=1000)):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    try:
        return {"since": since, "days": days, "items": top_consumer_history(since, limit)}
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from None


@app.get("/history/collections")
def history_collections(days: int = Query(90, ge=1, le=90), limit: int = Query(2000, ge=1, le=13000)):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    try:
        items = collection_history(since, limit)
    except RuntimeError:
        # File manifest history remains a fallback while DB is being enabled in /dev.
        items = [_view(row) for row in collections()[:limit]]
    return {"since": since, "days": days, "items": items}


@app.get("/history/timeline")
def history_timeline(at: str, window_minutes: int = Query(5, ge=1, le=30)):
    target = _parse_time(at)
    try:
        return {"at": target, "window_minutes": window_minutes, "items": timeline(target, window_minutes)}
    except RuntimeError as error:
        raise HTTPException(503, str(error)) from None


@app.get("/collect-now/status")
def collect_now_status():
    if os.getenv("RUNDECK_COLLECT_NOW_ENABLED", "false").lower() != "true":
        return {"enabled": False, "allowed": False}
    from backend.rundeck_runner import status
    try:
        return {"enabled": True, **status()}
    except Exception as error:
        raise HTTPException(503, f"Collect Now status unavailable: {type(error).__name__}") from None


@app.post("/collect-now")
def trigger_collect_now(request: Request):
    if os.getenv("RUNDECK_COLLECT_NOW_ENABLED", "false").lower() != "true":
        raise HTTPException(503, "Collect Now is disabled")
    if request.headers.get("X-SPHERE-Action") != "collect-now":
        raise HTTPException(403, "Missing SPHERE action header")
    from backend.rundeck_runner import collect_now
    actor = request.headers.get("X-Forwarded-User") or request.headers.get("X-Remote-User") or "sphere"
    try:
        result = collect_now(actor)
    except Exception as error:
        raise HTTPException(503, f"Collect Now failed: {type(error).__name__}") from None
    return {"enabled": True, **result}


@app.get("/events")
async def events():
    """SSE event stream. Browser reconnects automatically; poller remains source of truth."""
    async def stream():
        last_collection = None
        heartbeat = 0
        while True:
            latest_row = _latest_ready()
            current = latest_row.get("collection_id") if latest_row else None
            if current and current != last_collection:
                payload = json.dumps({
                    "type": "collection_ready",
                    "collection": _view(latest_row),
                }, default=str)
                yield f"event: collection_ready\ndata: {payload}\n\n"
                last_collection = current
            heartbeat += 1
            if heartbeat >= 6:
                yield f": heartbeat {datetime.now(timezone.utc).isoformat()}\n\n"
                heartbeat = 0
            await asyncio.sleep(5)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
