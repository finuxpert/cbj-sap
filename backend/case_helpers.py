from __future__ import annotations

from datetime import datetime
from typing import Any

try:
    from .case_analytics import build_case_analytics
except Exception:
    from case_analytics import build_case_analytics

try:
    from .storage_config import CASE_DIR
except Exception:
    from storage_config import CASE_DIR


def make_case_no() -> str:
    prefix = datetime.now().strftime("CASE-%Y%m%d")
    existing = sorted(CASE_DIR.glob(f"{prefix}-*.json")) if CASE_DIR.exists() else []
    return f"{prefix}-{len(existing) + 1:03d}"


def summarize_case(case_data: dict[str, Any]) -> dict[str, Any]:
    reports = case_data.get("reports") or []
    evidence = case_data.get("evidence") or []
    results = case_data.get("parsed_results") or []
    latest_result = results[-1] if results else {}
    return {
        "id": case_data.get("id"),
        "case_no": case_data.get("case_no"),
        "title": case_data.get("title"),
        "sid": case_data.get("sid", ""),
        "environment": case_data.get("environment", ""),
        "tool": case_data.get("tool") or latest_result.get("tool", ""),
        "severity": case_data.get("severity", latest_result.get("severity", "INFO")),
        "status": case_data.get("status", "OPEN"),
        "summary": case_data.get("summary") or latest_result.get("summary", ""),
        "top_anomaly": case_data.get("top_anomaly") or latest_result.get("top_anomaly", ""),
        "top_suspect": case_data.get("top_suspect") or latest_result.get("top_suspect", ""),
        "evidence_count": len(evidence),
        "report_count": len(reports),
        "created_at": case_data.get("created_at"),
        "updated_at": case_data.get("updated_at"),
    }


def mobile_case_payload(case_data: dict[str, Any]) -> dict[str, Any]:
    summary = summarize_case(case_data)
    return {
        **summary,
        "executive_summary": summary.get("summary") or "No RCA summary saved yet.",
        "top_problem": {
            "label": summary.get("top_suspect") or summary.get("top_anomaly") or "Pending analysis",
            "reason": summary.get("top_anomaly") or "Upload and parse evidence to generate anomaly detail.",
        },
        "timeline": case_data.get("timeline", [])[-20:],
        "parsed_results": case_data.get("parsed_results", [])[-10:],
        "reports": case_data.get("reports", []),
        "evidence": case_data.get("evidence", []),
        "analytics": build_case_analytics(case_data),
    }
