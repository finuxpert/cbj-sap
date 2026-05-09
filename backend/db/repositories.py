from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .models import Case, Evidence, ParsedResult
from .session import db_enabled, session_scope


def _parse_dt(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str) and value:
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except Exception:
            pass
    return datetime.now(timezone.utc)


def _tags_to_json(value: Any) -> dict:
    if isinstance(value, dict):
        return value
    if isinstance(value, list):
        return {"items": value}
    return {"items": []}


def upsert_case_best_effort(case_data: dict) -> dict:
    if not db_enabled():
        return {"enabled": False, "written": False, "status": "disabled"}
    try:
        case_id = case_data.get("id") or case_data.get("case_no")
        if not case_id:
            return {"enabled": True, "written": False, "status": "missing_case_id"}
        with session_scope() as session:
            obj = session.get(Case, str(case_id))
            if obj is None:
                obj = Case(id=str(case_id), case_no=str(case_data.get("case_no") or case_id), title=str(case_data.get("title") or case_id))
                session.add(obj)
            obj.case_no = str(case_data.get("case_no") or case_id)
            obj.title = str(case_data.get("title") or case_id)
            obj.sid = str(case_data.get("sid") or "")
            obj.environment = str(case_data.get("environment") or "")
            obj.severity = str(case_data.get("severity") or "INFO").upper()
            obj.status = str(case_data.get("status") or "OPEN").upper()
            obj.summary = str(case_data.get("summary") or "")
            obj.top_anomaly = str(case_data.get("top_anomaly") or "")
            obj.top_suspect = str(case_data.get("top_suspect") or "")
            obj.created_by = str(case_data.get("created_by") or "")
            obj.created_at = _parse_dt(case_data.get("created_at"))
            obj.updated_at = _parse_dt(case_data.get("updated_at"))
        return {"enabled": True, "written": True, "status": "ok"}
    except Exception as exc:
        return {"enabled": True, "written": False, "status": "error", "error": str(exc)}


def upsert_evidence_best_effort(meta: dict) -> dict:
    if not db_enabled():
        return {"enabled": False, "written": False, "status": "disabled"}
    try:
        evidence_id = meta.get("id")
        if not evidence_id:
            return {"enabled": True, "written": False, "status": "missing_evidence_id"}
        stored_filename = str(meta.get("stored_filename") or "")
        stored_path = str(meta.get("stored_path") or "")
        if not stored_path and stored_filename:
            stored_path = str(Path("evidence") / stored_filename)
        with session_scope() as session:
            obj = session.get(Evidence, str(evidence_id))
            if obj is None:
                obj = Evidence(id=str(evidence_id))
                session.add(obj)
            obj.case_id = str(meta.get("case_id") or "") or None
            obj.tool = str(meta.get("tool") or "unknown")
            obj.sid = str(meta.get("sid") or "")
            obj.title = str(meta.get("title") or "")
            obj.original_filename = str(meta.get("original_filename") or "")
            obj.stored_filename = stored_filename
            obj.stored_path = stored_path
            obj.checksum_sha256 = str(meta.get("checksum_sha256") or "")
            obj.size_bytes = int(meta.get("size_bytes") or 0)
            obj.mime_type = str(meta.get("mime_type") or "")
            obj.ext = str(meta.get("ext") or "")
            obj.note = str(meta.get("note") or "")
            obj.tags = _tags_to_json(meta.get("tags"))
            obj.created_at = _parse_dt(meta.get("created_at"))
            obj.updated_at = _parse_dt(meta.get("updated_at"))
        return {"enabled": True, "written": True, "status": "ok"}
    except Exception as exc:
        return {"enabled": True, "written": False, "status": "error", "error": str(exc)}


def insert_parsed_result_best_effort(case_id: str, result: dict) -> dict:
    if not db_enabled():
        return {"enabled": False, "written": False, "status": "disabled"}
    try:
        result_id = result.get("id")
        if not case_id or not result_id:
            return {"enabled": True, "written": False, "status": "missing_id"}
        with session_scope() as session:
            if session.get(ParsedResult, str(result_id)) is not None:
                return {"enabled": True, "written": False, "status": "already_exists"}
            obj = ParsedResult(
                id=str(result_id),
                case_id=str(case_id),
                evidence_id=result.get("evidence_id") or None,
                tool=str(result.get("tool") or "unknown"),
                parser_version=str(result.get("parser_version") or ""),
                verdict=str(result.get("verdict") or ""),
                severity=str(result.get("severity") or "INFO").upper(),
                confidence=float(result.get("confidence") or 0),
                top_anomaly=str(result.get("top_anomaly") or ""),
                top_suspect=str(result.get("top_suspect") or ""),
                summary=str(result.get("summary") or ""),
                result_json=result.get("result_json") or {},
                created_at=_parse_dt(result.get("created_at")),
            )
            session.add(obj)
        return {"enabled": True, "written": True, "status": "ok"}
    except Exception as exc:
        return {"enabled": True, "written": False, "status": "error", "error": str(exc)}
