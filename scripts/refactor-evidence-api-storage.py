#!/usr/bin/env python3
"""Deterministically switch evidence_api.py to external storage helpers.

This helper is conservative and intended to run after the model refactor is stable.
It does not change endpoint behavior. It only prepares evidence_api.py to import
shared storage config/helper symbols and removes duplicate local helper definitions
when expected anchors are present.

Run from repository root:

    python3 scripts/refactor-evidence-api-storage.py
    bash scripts/qa-backend-syntax.sh

Then inspect the diff before committing.
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "backend" / "evidence_api.py"

CONFIG_IMPORT = '''try:
    from .storage_config import APP_NAME, ALLOWED_EXT, CASE_DIR, EVIDENCE_DIR, MAX_UPLOAD_MB, META_DIR, REPORT_DIR, STORAGE_ROOT
except Exception:
    from storage_config import APP_NAME, ALLOWED_EXT, CASE_DIR, EVIDENCE_DIR, MAX_UPLOAD_MB, META_DIR, REPORT_DIR, STORAGE_ROOT
'''

HELPER_IMPORT = '''try:
    from .storage_helpers import ensure_dirs, safe_name, safe_case_id, now_iso, read_meta, write_meta, case_path, read_case, write_case
except Exception:
    from storage_helpers import ensure_dirs, safe_name, safe_case_id, now_iso, read_meta, write_meta, case_path, read_case, write_case
'''

LOCAL_CONFIG_BLOCK = '''APP_NAME = "SAP Intelligent RCA Evidence API"
STORAGE_ROOT = Path(os.getenv("SAP_EVIDENCE_ROOT", "/var/www/svr01-dev/sap-data"))
EVIDENCE_DIR = STORAGE_ROOT / "evidence"
META_DIR = STORAGE_ROOT / "metadata"
REPORT_DIR = STORAGE_ROOT / "reports"
CASE_DIR = STORAGE_ROOT / "cases"
MAX_UPLOAD_MB = int(os.getenv("SAP_EVIDENCE_MAX_UPLOAD_MB", "500"))

ALLOWED_EXT = {
    ".zip",
    ".log",
    ".txt",
    ".csv",
    ".xlsx",
    ".xls",
    ".pdf",
    ".json",
}
'''


def replace_once(text: str, old: str, new: str) -> str:
    if old not in text:
        raise SystemExit(f"Expected block not found:\n{old[:240]}")
    return text.replace(old, new, 1)


def remove_function_block(text: str, func_name: str) -> str:
    marker = f"\ndef {func_name}("
    start = text.find(marker)
    if start < 0:
        raise SystemExit(f"Could not find function block: {func_name}")
    next_start = text.find("\ndef ", start + 1)
    next_route = text.find("\n@app.", start + 1)
    candidates = [pos for pos in (next_start, next_route) if pos > start]
    if not candidates:
        raise SystemExit(f"Could not find end of function block: {func_name}")
    end = min(candidates)
    return f"{text[:start]}{text[end:]}"


def main() -> None:
    text = TARGET.read_text(encoding="utf-8")
    original = text

    if "from .storage_config import APP_NAME" not in text:
        anchor = "try:\n    from .case_analytics import build_case_analytics\nexcept Exception:\n    from case_analytics import build_case_analytics\n"
        text = replace_once(text, anchor, f"{anchor}\n{CONFIG_IMPORT}\n{HELPER_IMPORT}")

    if LOCAL_CONFIG_BLOCK in text:
        text = text.replace(LOCAL_CONFIG_BLOCK, "", 1)

    for func_name in [
        "ensure_dirs",
        "safe_name",
        "safe_case_id",
        "now_iso",
        "read_meta",
        "write_meta",
        "case_path",
        "read_case",
        "write_case",
    ]:
        if f"\ndef {func_name}(" in text:
            text = remove_function_block(text, func_name)

    # Keep Path import while upload logic still uses Path(original).suffix.
    # Keep json/os/re imports until later cleanup because DB-first and fallback code still use them.

    if text == original:
        print("No changes needed; evidence_api.py already appears storage-refactored.")
        return

    TARGET.write_text(text, encoding="utf-8")
    print("Updated backend/evidence_api.py to use external storage config/helpers.")
    print("Next: bash scripts/qa-backend-syntax.sh")


if __name__ == "__main__":
    main()
