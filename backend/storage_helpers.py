from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .storage_config import CASE_DIR, META_DIR


SAFE_RE = re.compile(r"[^A-Za-z0-9._-]+")


def ensure_dirs() -> None:
    CASE_DIR.mkdir(parents=True, exist_ok=True)
    META_DIR.mkdir(parents=True, exist_ok=True)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def safe_name(value: str) -> str:
    cleaned = SAFE_RE.sub("_", str(value or "").strip())
    cleaned = cleaned.strip("._")
    return cleaned or "unknown"


def safe_case_id(case_id: str) -> str:
    return safe_name(case_id)


def case_path(case_id: str) -> Path:
    return CASE_DIR / f"{safe_case_id(case_id)}.json"


def meta_path(name: str) -> Path:
    return META_DIR / f"{safe_name(name)}.json"


def read_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def read_case(case_id: str, default: Any = None) -> Any:
    return read_json(case_path(case_id), default)


def write_case(case_id: str, payload: Any) -> None:
    write_json(case_path(case_id), payload)


def read_meta(name: str, default: Any = None) -> Any:
    return read_json(meta_path(name), default)


def write_meta(name: str, payload: Any) -> None:
    write_json(meta_path(name), payload)
