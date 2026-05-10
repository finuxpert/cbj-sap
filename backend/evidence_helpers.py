from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def collect_file_evidence(
    meta_dir: Path,
    *,
    tool: str = "",
    sid: str = "",
    q: str = "",
    limit: int = 100,
) -> list[dict[str, Any]]:
    """Collect evidence metadata from JSON/file-backed storage.

    This preserves the legacy /evidence list behavior:
    - scan metadata JSON newest first,
    - skip broken JSON files,
    - optionally filter by tool, sid, and free-text query,
    - include tags in free-text search,
    - cap results by limit.
    """
    rows: list[dict[str, Any]] = []
    limit = max(1, min(int(limit or 100), 500))
    tool_filter = str(tool or "").lower()
    sid_filter = str(sid or "").lower()
    q_filter = str(q or "").lower()

    if not meta_dir.exists():
        return rows

    for meta_file in sorted(meta_dir.glob("*.json"), key=lambda path: path.stat().st_mtime, reverse=True):
        try:
            meta = json.loads(meta_file.read_text(encoding="utf-8"))
        except Exception:
            continue

        if tool_filter and str(meta.get("tool", "")).lower() != tool_filter:
            continue
        if sid_filter and str(meta.get("sid", "")).lower() != sid_filter:
            continue
        if q_filter:
            haystack = " ".join(str(meta.get(key, "")) for key in ["title", "note", "original_filename", "sid", "tool"])
            haystack += " " + " ".join(meta.get("tags", []) or [])
            if q_filter not in haystack.lower():
                continue

        rows.append(meta)
        if len(rows) >= limit:
            return rows

    return rows
