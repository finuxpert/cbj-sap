from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def collect_file_parsed_results_history(
    case_dir: Path,
    *,
    case_id: str = "",
    tool: str = "",
    limit: int = 100,
) -> list[dict[str, Any]]:
    """Collect parsed result history from JSON/file-backed case storage.

    This preserves the legacy fallback behavior used by evidence_api.py:
    - scan case JSON files newest first,
    - optionally filter by case id and tool,
    - copy each parsed result row,
    - add case_id when missing,
    - cap returned rows by limit.
    """
    rows: list[dict[str, Any]] = []
    limit = max(1, min(int(limit or 100), 500))
    case_filter = str(case_id or "")
    tool_filter = str(tool or "").lower()

    if not case_dir.exists():
        return rows

    for case_file in sorted(case_dir.glob("*.json"), key=lambda path: path.stat().st_mtime, reverse=True):
        try:
            case_data = json.loads(case_file.read_text(encoding="utf-8"))
        except Exception:
            continue

        current_case_id = str(case_data.get("id") or case_data.get("case_no") or "")
        if case_filter and current_case_id != case_filter:
            continue

        for item in case_data.get("parsed_results", []) or []:
            if tool_filter and str(item.get("tool", "")).lower() != tool_filter:
                continue
            row = dict(item)
            row.setdefault("case_id", current_case_id)
            rows.append(row)
            if len(rows) >= limit:
                return rows

    return rows
