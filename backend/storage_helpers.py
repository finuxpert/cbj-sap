from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from fastapi import HTTPException
except Exception:  # pragma: no cover - keeps helper importable outside FastAPI runtime
    class HTTPException(Exception):  # type: ignore[no-redef]
        def __init__(self, status_code: int, detail: str):
            super().__init__(detail)
            self.status_code = status_code
            self.detail = detail

from .storage_config import CASE_DIR, EVIDENCE_DIR, META_DIR, REPORT_DIR


_MISSING = object()
CASE_ID_RE = re.compile(r"[^A-Za-z0-9._-]+")
FILE_NAME_RE = re.compile(r"[^A-Za-z0-9._ -]+")


def ensure_dirs() -> None:
    for directory in (EVIDENCE_DIR, META_DIR, REPORT_DIR, CASE_DIR):
        directory.mkdir(parents=True, exist_ok=True)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def safe_name(value: str) -> str:
    base = Path(value or "evidence.bin").name
    base = FILE_NAME_RE.sub("_", base).strip(" .")
    return base[:180] or "evidence.bin"


def safe_case_id(case_id: str) -> str:
    text = CASE_ID_RE.sub("-", str(case_id or "")).strip("-._")
    return text[:80]


def case_path(case_id: str) -> Path:
    safe_id = safe_case_id(case_id)
    if not safe_id:
        raise HTTPException(status_code=400, detail="Invalid case id")
    return CASE_DIR / f"{safe_id}.json"


def meta_path(name: str) -> Path:
    safe_id = safe_case_id(name)
    if not safe_id:
        raise HTTPException(status_code=400, detail="Invalid evidence id")
    return META_DIR / f"{safe_id}.json"


def read_json(path: Path, default: Any = _MISSING) -> Any:
    if not path.exists():
        if default is _MISSING:
            raise FileNotFoundError(str(path))
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        if default is _MISSING:
            raise
        return default


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def read_case(case_id: str, default: Any = _MISSING) -> Any:
    try:
        return read_json(case_path(case_id), default)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Case not found")


def write_case(case_or_id: Any, payload: Any = _MISSING) -> None:
    """Write a case JSON file.

    Backward-compatible call forms:
    - write_case(case_data)
    - write_case(case_id, case_data)
    """
    if payload is _MISSING:
        if not isinstance(case_or_id, dict):
            raise HTTPException(status_code=400, detail="Case payload must be a dict")
        case_data = case_or_id
        case_id = case_data.get("id") or case_data.get("case_no")
    else:
        case_id = case_or_id
        case_data = payload

    if not case_id:
        raise HTTPException(status_code=400, detail="Case id missing")
    write_json(case_path(str(case_id)), case_data)


def read_meta(name: str, default: Any = _MISSING) -> Any:
    try:
        return read_json(meta_path(name), default)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Evidence not found")


def write_meta(name: str, payload: Any) -> None:
    write_json(meta_path(name), payload)
