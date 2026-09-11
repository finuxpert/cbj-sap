#!/usr/bin/env python3
"""Re-project retained Rundeck raw evidence with the current consumer parser.

Dry-run is the default. Pass --apply explicitly to upsert the wider top-consumer
projection and aggregate multi-process resource fields into PostgreSQL. Raw evidence
is never changed or deleted.
"""
from __future__ import annotations

import argparse
import gzip
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import text

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.db.session import get_engine
from backend.rundeck_consumers import TOP_CONSUMERS_PER_HOST, persist_top_consumers
from backend.rundeck_monitoring import persist_collection
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


def _dev_database_allowed() -> bool:
    database_url = os.getenv("DATABASE_URL", "")
    return "/sphere_rundeck_dev" in database_url or "/sphere-rundeck-dev" in database_url


def _error_summary(error: Exception) -> str:
    """Return a concise single-line diagnostic without dumping SQL parameters."""
    original = getattr(error, "orig", None)
    target = original if isinstance(original, Exception) else error
    text_value = str(target).strip()
    if not text_value:
        text_value = str(error).strip()
    first_line = next((line.strip() for line in text_value.splitlines() if line.strip()), type(target).__name__)
    return first_line[:800]


def _collection_exists(collection_id: str) -> bool:
    engine = get_engine()
    if engine is None:
        raise RuntimeError("Database history is not enabled")
    with engine.connect() as conn:
        value = conn.execute(
            text("SELECT 1 FROM rundeck_collections WHERE collection_id = :collection_id LIMIT 1"),
            {"collection_id": collection_id},
        ).scalar()
    return value is not None


def _ensure_collection_parent(row: dict, raw: bytes, repair_missing_parents: bool) -> bool:
    """Ensure the FK parent exists without rewriting existing collection history.

    Old retained manifests may pre-date database persistence. Only those missing
    parents are re-projected. Existing parents are never passed through
    persist_collection(), which avoids duplicating historical alert rows.
    """
    collection_id = str(row.get("collection_id") or "")
    if _collection_exists(collection_id):
        return False
    if not repair_missing_parents:
        raise RuntimeError(
            "parent rundeck_collections row is missing; rerun with --repair-missing-parents to restore it from retained raw evidence"
        )
    status = persist_collection(row, raw)
    if status != "STORED" or not _collection_exists(collection_id):
        raise RuntimeError(f"failed to restore missing collection parent (persist status={status})")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill SPHERE top-consumer history from retained raw evidence")
    parser.add_argument("--days", type=int, default=90, help="READY collection lookback (default: 90)")
    parser.add_argument("--limit", type=int, default=0, help="optional maximum number of collections; 0 = all")
    parser.add_argument(
        "--collection",
        action="append",
        default=[],
        help="optional exact collection id to process; may be repeated, e.g. --collection rundeck-521900",
    )
    parser.add_argument(
        "--repair-missing-parents",
        action="store_true",
        help="restore missing rundeck_collections parents from retained READY evidence before consumer upsert",
    )
    parser.add_argument("--apply", action="store_true", help="perform PostgreSQL upserts; without this flag only show the plan")
    args = parser.parse_args()

    if args.days < 1 or args.days > 365:
        parser.error("--days must be between 1 and 365")
    if args.limit < 0:
        parser.error("--limit cannot be negative")
    if args.repair_missing_parents and not args.apply:
        parser.error("--repair-missing-parents requires --apply")
    if args.apply and not _dev_database_allowed():
        print("REFUSED: DATABASE_URL is not the isolated Rundeck development database.", file=sys.stderr)
        return 41

    requested = {str(value).strip() for value in args.collection if str(value).strip()}
    since = datetime.now(timezone.utc) - timedelta(days=args.days)
    candidates = []
    for row in collections(ROOT):
        if row.get("status") != "READY":
            continue
        collection_id = str(row.get("collection_id") or "")
        if requested and collection_id not in requested:
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
    print(f"REPAIR_MISSING_PARENTS={'YES' if args.repair_missing_parents else 'NO'}")
    if requested:
        print(f"COLLECTION_FILTER={','.join(sorted(requested))}")
    print(f"CANDIDATE_COLLECTIONS={len(candidates)}")

    if requested:
        found = {str(row.get("collection_id") or "") for row, _, _ in candidates}
        missing = sorted(requested - found)
        if missing:
            print(f"COLLECTION_FILTER_NOT_FOUND={','.join(missing)}")

    if not args.apply:
        print("NO DATABASE CHANGES MADE. Re-run with --apply after reviewing the candidate count.")
        return 0

    completed = 0
    rows_written = 0
    parents_repaired = 0
    failure_details: list[tuple[str, str, str]] = []
    for index, (row, path, _) in enumerate(candidates, 1):
        collection_id = str(row.get("collection_id") or "")
        try:
            raw = _raw(path)
            repaired = _ensure_collection_parent(row, raw, args.repair_missing_parents)
            if repaired:
                parents_repaired += 1
                print(f"[{index}/{len(candidates)}] {collection_id}: parent collection restored from retained evidence")
            written = persist_top_consumers(collection_id, raw)
            rows_written += written
            completed += 1
            print(f"[{index}/{len(candidates)}] {collection_id}: {written} consumer rows projected")
        except Exception as error:  # Keep the remaining evidence recoverable even if one file is malformed.
            error_type = type(error).__name__
            summary = _error_summary(error)
            failure_details.append((collection_id, error_type, summary))
            print(f"[{index}/{len(candidates)}] {collection_id}: FAILED {error_type}: {summary}")

    print(f"COMPLETED={completed}")
    print(f"FAILED={len(failure_details)}")
    print(f"PARENTS_REPAIRED={parents_repaired}")
    print(f"ROWS_PROJECTED={rows_written}")
    if failure_details:
        print("FAILURE_DETAILS_BEGIN")
        for collection_id, error_type, summary in failure_details:
            print(f"{collection_id}\t{error_type}\t{summary}")
        print("FAILURE_DETAILS_END")
        print("RETRY_HINT=Use --collection <id> --apply to retry only a failed collection after fixing the cause.")
    return 1 if failure_details else 0


if __name__ == "__main__":
    raise SystemExit(main())
