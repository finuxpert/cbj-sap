from __future__ import annotations

from typing import Any

try:
    from .evidence_helpers import collect_file_evidence
except Exception:
    from evidence_helpers import collect_file_evidence

try:
    from .storage_config import META_DIR
except Exception:
    from storage_config import META_DIR

try:
    from .storage_helpers import read_meta
except Exception:
    from storage_helpers import read_meta


def list_evidence_items(
    *,
    tool: str = "",
    sid: str = "",
    q: str = "",
    limit: int = 100,
) -> dict[str, Any]:
    """Return legacy /evidence response shape from file-backed metadata.

    This service is intentionally thin for Phase 1 hybrid safety:
    - preserves the existing JSON/file-backed behavior,
    - keeps response shape stable,
    - creates a future seam for DB-first evidence history reads.
    """
    items = collect_file_evidence(
        META_DIR,
        tool=tool,
        sid=sid,
        q=q,
        limit=limit,
    )
    return {"ok": True, "count": len(items), "items": items}


def get_evidence_item(evidence_id: str) -> dict[str, Any]:
    """Return legacy /evidence/{id} response shape."""
    return {"ok": True, "evidence": read_meta(evidence_id)}
