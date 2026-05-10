from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path


def cleanup_old_evidence_files(
    meta_dir: Path,
    evidence_dir: Path,
    *,
    days: int = 90,
) -> int:
    """Delete old JSON/file-backed evidence metadata and evidence files.

    This preserves legacy /maintenance/cleanup behavior:
    - compute cutoff by retention days,
    - read created_at from metadata when available,
    - fall back to metadata file mtime when created_at is invalid,
    - delete stored evidence file when metadata is older than cutoff,
    - delete metadata JSON,
    - ignore malformed/deletion errors best-effort.
    """
    retention_days = max(1, int(days or 90))
    cutoff = datetime.now(timezone.utc).timestamp() - retention_days * 86400
    deleted = 0

    if not meta_dir.exists():
        return deleted

    for meta_file in meta_dir.glob("*.json"):
        try:
            meta = json.loads(meta_file.read_text(encoding="utf-8"))
            created = datetime.fromisoformat(str(meta.get("created_at", "")).replace("Z", "+00:00")).timestamp()
        except Exception:
            created = meta_file.stat().st_mtime

        if created < cutoff:
            try:
                stored = json.loads(meta_file.read_text(encoding="utf-8")).get("stored_filename", "")
                (evidence_dir / stored).unlink(missing_ok=True)
                meta_file.unlink(missing_ok=True)
                deleted += 1
            except Exception:
                pass

    return deleted
