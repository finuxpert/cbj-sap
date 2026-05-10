from __future__ import annotations

from typing import Any

try:
    from .case_helpers import mobile_case_payload
except Exception:
    from case_helpers import mobile_case_payload

try:
    from .case_service import list_case_items
except Exception:
    from case_service import list_case_items

try:
    from .storage_helpers import read_case
except Exception:
    from storage_helpers import read_case


def list_mobile_case_items(limit: int = 50) -> dict[str, Any]:
    """Preserve the existing /mobile/cases contract via the case service layer."""
    return list_case_items(limit=limit)


def get_mobile_case_item(case_id: str) -> dict[str, Any]:
    """Return the mobile-shaped case payload without changing response shape."""
    case_data = read_case(case_id)
    return {"ok": True, "case": mobile_case_payload(case_data)}


def get_mobile_case_analytics_item(case_id: str) -> dict[str, Any]:
    """Return mobile analytics for a case with the existing response contract."""
    case_data = read_case(case_id)
    return {
        "ok": True,
        "case_id": case_data.get("id") or case_data.get("case_no"),
        "analytics": mobile_case_payload(case_data).get("analytics"),
    }
