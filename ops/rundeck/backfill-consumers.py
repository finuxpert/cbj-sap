#!/usr/bin/env python3
"""Re-project retained Rundeck raw evidence with the current consumer parser.

Dry-run is the default. Pass --apply explicitly to upsert the wider top-consumer
projection and aggregate multi-process resource fields into PostgreSQL. Raw evidence
is never changed or deleted.
"""
from __future__ import annotations

import argparse
import gzip
from datetime import datetime, timedelta, timezone
from pathlib import Path

from backend.rundeck_consumers import TOP_CONSUMERS_PER_HOST, persist_top_consumers
from backend.rundeck_store import ROOT, collections


def _time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _raw(path: Path) -> bytes:
    if path.suffix == ".gz":
        with gzip.open(path, "rb") as stream:
            return stream.read()
    return path.read_bytes()


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill SPHERE top-consumer history from retained raw evidence")
    parser.add_argument("--days", type=int, default=90, help="READY collection lookback (default: 90)")
    parser.add_argument("--limit", type=int, default=0, help="optional maximum number of collections; 0 = all")
    parser.add_argument("--apply", action="store_true", help="perform PostgreSQL upserts; without this flag only show the plan")
    args = parser.parse_args()

    if args.days < 1 or args.days > 365:
        parser.error("--days must be between 1 and 365")
    if args.limit < 0:
        parser.error("--limit cannot be negative")

    since = datetime.now(timezone.utc) - timedelta(days=args.days)
    candidates = []
    for row in collections(ROOT):
        if row.get("status") != "READY":
            continue
        observed = _time(row.get("finished_at") or row.get("started_at"))
        if observed is None or observed < since:
            continue
        raw_path = row.get("raw_path")
        if not raw_path:
            continue
        path = (ROOT / raw_path).resolve()
        if ROOT.resolve() not in path.parents or not path.is_file():
            continue
        candidates.append((row, path, observed))

    candidates.sort(key=lambda item: item[2])
    if args.limit:
        candidates = candidates[-args.limit:]

    print(f"MODE={'APPLY' if args.apply else 'DRY-RUN'}")
    print(f"INGESTION_ROOT={ROOT}")
    print(f"LOOKBACK_DAYS={args.days}")
    print(f"PERSISTED_DEPTH=Top {TOP_CONSUMERS_PER_HOST} per APP")
    print(f"CANDIDATE_COLLECTIONS={len(candidates)}")

    if not args.apply:
        print("NO DATABASE CHANGES MADE. Re-run with --apply after reviewing the candidate count.")
        return 0

    completed = 0
    rows_written = 0
    failures = 0
    for index, (row, path, _) in enumerate(candidates, 1):
        collection_id = str(row.get("collection_id") or "")
        try:
            written = persist_top_consumers(collection_id, _raw(path))
            rows_written += written
            completed += 1
            print(f"[{index}/{len(candidates)}] {collection_id}: {written} consumer rows projected")
        except Exception as error:  # Keep the remaining evidence recoverable even if one file is malformed.
            failures += 1
            print(f"[{index}/{len(candidates)}] {collection_id}: FAILED {type(error).__name__}")

    print(f"COMPLETED={completed}")
    print(f"FAILED={failures}")
    print(f"ROWS_PROJECTED={rows_written}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
