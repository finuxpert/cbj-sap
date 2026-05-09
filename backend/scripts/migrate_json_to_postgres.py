from __future__ import annotations

import argparse
import json
import os
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.db.session import check_database
from backend.db.repositories import (
    upsert_case_best_effort,
    upsert_evidence_best_effort,
    insert_parsed_result_best_effort,
)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_json(path: Path) -> Any | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        return {"__load_error__": str(exc), "__path__": str(path)}


def as_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        for key in ("cases", "items", "data", "results", "evidence", "parsed_results"):
            if isinstance(value.get(key), list):
                return value[key]
        return [value]
    return []


def pick_case_id(obj: dict[str, Any], fallback: str) -> str:
    return str(
        obj.get("id")
        or obj.get("case_id")
        or obj.get("case_no")
        or obj.get("caseNumber")
        or fallback
    )


def normalize_case(obj: dict[str, Any], source_file: Path) -> dict[str, Any]:
    fallback = source_file.stem
    case_id = pick_case_id(obj, fallback)
    case_no = str(obj.get("case_no") or obj.get("caseNumber") or obj.get("case") or case_id)

    return {
        "id": case_id,
        "case_no": case_no,
        "title": str(obj.get("title") or obj.get("name") or obj.get("summary") or case_no),
        "sid": str(obj.get("sid") or obj.get("SID") or ""),
        "environment": str(obj.get("environment") or obj.get("env") or ""),
        "severity": str(obj.get("severity") or obj.get("level") or "INFO").upper(),
        "status": str(obj.get("status") or "OPEN").upper(),
        "summary": str(obj.get("summary") or obj.get("description") or ""),
        "top_anomaly": str(obj.get("top_anomaly") or obj.get("topAnomaly") or ""),
        "top_suspect": str(obj.get("top_suspect") or obj.get("topSuspect") or ""),
        "created_by": str(obj.get("created_by") or obj.get("createdBy") or "json-migration"),
        "created_at": obj.get("created_at") or obj.get("createdAt") or utc_now(),
        "updated_at": obj.get("updated_at") or obj.get("updatedAt") or utc_now(),
    }


def normalize_evidence(obj: dict[str, Any], source_file: Path, default_case_id: str | None = None) -> dict[str, Any]:
    evidence_id = str(
        obj.get("id")
        or obj.get("evidence_id")
        or obj.get("evidenceId")
        or source_file.stem
    )
    stored_filename = str(obj.get("stored_filename") or obj.get("storedFilename") or obj.get("filename") or source_file.name)
    original_filename = str(obj.get("original_filename") or obj.get("originalFilename") or obj.get("filename") or stored_filename)

    return {
        "id": evidence_id,
        "case_id": str(obj.get("case_id") or obj.get("caseId") or default_case_id or "") or None,
        "tool": str(obj.get("tool") or obj.get("source") or "json-migration"),
        "sid": str(obj.get("sid") or obj.get("SID") or ""),
        "title": str(obj.get("title") or original_filename),
        "original_filename": original_filename,
        "stored_filename": stored_filename,
        "stored_path": str(obj.get("stored_path") or obj.get("storedPath") or obj.get("path") or ""),
        "checksum_sha256": str(obj.get("checksum_sha256") or obj.get("sha256") or ""),
        "size_bytes": int(obj.get("size_bytes") or obj.get("sizeBytes") or 0),
        "mime_type": str(obj.get("mime_type") or obj.get("mimeType") or ""),
        "ext": str(obj.get("ext") or Path(stored_filename).suffix),
        "note": str(obj.get("note") or ""),
        "tags": obj.get("tags") or ["json-migration"],
        "created_at": obj.get("created_at") or obj.get("createdAt") or utc_now(),
        "updated_at": obj.get("updated_at") or obj.get("updatedAt") or utc_now(),
    }


def normalize_parsed_result(obj: dict[str, Any], source_file: Path, default_case_id: str | None = None) -> tuple[str, dict[str, Any]]:
    case_id = str(obj.get("case_id") or obj.get("caseId") or default_case_id or "")
    result_id = str(obj.get("id") or obj.get("result_id") or obj.get("resultId") or f"parsed-{source_file.stem}")

    result = {
        "id": result_id,
        "evidence_id": obj.get("evidence_id") or obj.get("evidenceId"),
        "tool": str(obj.get("tool") or obj.get("parser") or "json-migration"),
        "parser_version": str(obj.get("parser_version") or obj.get("parserVersion") or ""),
        "verdict": str(obj.get("verdict") or obj.get("status") or ""),
        "severity": str(obj.get("severity") or "INFO").upper(),
        "confidence": float(obj.get("confidence") or 0),
        "top_anomaly": str(obj.get("top_anomaly") or obj.get("topAnomaly") or ""),
        "top_suspect": str(obj.get("top_suspect") or obj.get("topSuspect") or ""),
        "summary": str(obj.get("summary") or ""),
        "result_json": obj.get("result_json") or obj.get("resultJson") or obj,
        "created_at": obj.get("created_at") or obj.get("createdAt") or utc_now(),
    }
    return case_id, result


def looks_like_case(obj: dict[str, Any], path: Path) -> bool:
    name = path.as_posix().lower()
    return "case" in name or any(k in obj for k in ("case_no", "caseNumber", "severity", "status", "summary"))


def looks_like_evidence(obj: dict[str, Any], path: Path) -> bool:
    name = path.as_posix().lower()
    return "evidence" in name or any(k in obj for k in ("evidence_id", "evidenceId", "stored_filename", "original_filename", "checksum_sha256"))


def looks_like_parsed(obj: dict[str, Any], path: Path) -> bool:
    name = path.as_posix().lower()
    return "parsed" in name or any(k in obj for k in ("parser_version", "parserVersion", "result_json", "resultJson", "verdict", "confidence"))


def main() -> int:
    parser = argparse.ArgumentParser(description="Migrate SAP RCA JSON/file-backed metadata to PostgreSQL.")
    parser.add_argument("--storage-root", default="/var/www/svr01-dev/sap-data")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    storage_root = Path(args.storage_root)
    if not storage_root.exists():
        raise SystemExit(f"storage root not found: {storage_root}")

    db_status = check_database()
    if db_status.get("status") != "ok":
        raise SystemExit(f"database is not ready: {db_status}")

    counters: Counter[str] = Counter()
    errors: list[dict[str, str]] = []

    json_files = sorted(storage_root.rglob("*.json"))

    for path in json_files:
        rel = path.relative_to(storage_root)
        loaded = load_json(path)
        if isinstance(loaded, dict) and "__load_error__" in loaded:
            counters["load_error"] += 1
            errors.append({"file": str(rel), "error": loaded["__load_error__"]})
            continue

        for item in as_list(loaded):
            if not isinstance(item, dict):
                counters["skipped_non_object"] += 1
                continue

            try:
                if looks_like_case(item, rel):
                    case = normalize_case(item, path)
                    counters["case_seen"] += 1
                    if not args.dry_run:
                        res = upsert_case_best_effort(case)
                        counters[f"case_{res.get('status')}"] += 1

                    # nested evidence / parsed results if present
                    for ev in as_list(item.get("evidence")):
                        if isinstance(ev, dict):
                            meta = normalize_evidence(ev, path, default_case_id=case["id"])
                            counters["evidence_seen"] += 1
                            if not args.dry_run:
                                res = upsert_evidence_best_effort(meta)
                                counters[f"evidence_{res.get('status')}"] += 1

                    for pr in as_list(item.get("parsed_results") or item.get("parsedResults")):
                        if isinstance(pr, dict):
                            case_id, result = normalize_parsed_result(pr, path, default_case_id=case["id"])
                            counters["parsed_seen"] += 1
                            if not args.dry_run:
                                res = insert_parsed_result_best_effort(case_id, result)
                                counters[f"parsed_{res.get('status')}"] += 1
                    continue

                if looks_like_evidence(item, rel):
                    meta = normalize_evidence(item, path)
                    counters["evidence_seen"] += 1
                    if not args.dry_run:
                        res = upsert_evidence_best_effort(meta)
                        counters[f"evidence_{res.get('status')}"] += 1
                    continue

                if looks_like_parsed(item, rel):
                    case_id, result = normalize_parsed_result(item, path)
                    counters["parsed_seen"] += 1
                    if not args.dry_run:
                        res = insert_parsed_result_best_effort(case_id, result)
                        counters[f"parsed_{res.get('status')}"] += 1
                    continue

                counters["skipped_unknown"] += 1
            except Exception as exc:
                counters["error"] += 1
                errors.append({"file": str(rel), "error": str(exc)})

    summary = {
        "ok": counters.get("error", 0) == 0,
        "dry_run": args.dry_run,
        "storage_root": str(storage_root),
        "json_files": len(json_files),
        "database": db_status,
        "counts": dict(sorted(counters.items())),
        "errors": errors[:20],
    }

    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0 if summary["ok"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
