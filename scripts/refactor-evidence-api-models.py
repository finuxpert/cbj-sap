#!/usr/bin/env python3
"""Deterministically switch evidence_api.py to external Pydantic models.

This helper is intentionally conservative:
- Only edits backend/evidence_api.py.
- Inserts the external model import near the top of the file.
- Removes the inline model class block between mobile_case_payload() and startup().
- Removes now-unused BaseModel/Optional imports only when safe.
- Fails loudly if expected anchors are not found.

Run from repository root:

    python3 scripts/refactor-evidence-api-models.py
    bash scripts/qa-backend-syntax.sh

Then inspect the diff before committing.
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "backend" / "evidence_api.py"

EXTERNAL_IMPORT = '''try:
    from .external_models import CaseCreate, CaseUpdate, EvidenceUpdate, ParsedResultCreate
except Exception:
    from external_models import CaseCreate, CaseUpdate, EvidenceUpdate, ParsedResultCreate
'''


def replace_once(text: str, old: str, new: str) -> str:
    if old not in text:
        raise SystemExit(f"Expected block not found:\n{old[:240]}")
    return text.replace(old, new, 1)


def main() -> None:
    text = TARGET.read_text(encoding="utf-8")
    original = text

    if "from .external_models import CaseCreate" not in text:
        anchor = "try:\n    from .case_analytics import build_case_analytics\nexcept Exception:\n    from case_analytics import build_case_analytics\n"
        text = replace_once(text, anchor, f"{anchor}\n{EXTERNAL_IMPORT}")

    model_start = text.find("\n\nclass EvidenceUpdate(")
    startup_anchor = text.find("\n\n@app.on_event(\"startup\")")
    if model_start < 0 or startup_anchor < 0 or model_start > startup_anchor:
        raise SystemExit("Could not locate inline model block safely")

    removed_block = text[model_start:startup_anchor]
    required_markers = [
        "class EvidenceUpdate(",
        "class CaseCreate(",
        "class CaseUpdate(",
        "class ParsedResultCreate(",
    ]
    missing = [marker for marker in required_markers if marker not in removed_block]
    if missing:
        raise SystemExit(f"Inline model block missing expected markers: {missing}")

    text = f"{text[:model_start]}\n{text[startup_anchor:]}"

    if "BaseModel" not in text:
        text = text.replace("from pydantic import BaseModel\n", "")
    if "Optional[" not in text and "Optional" not in EXTERNAL_IMPORT:
        text = text.replace("from typing import Optional\n", "")

    if text == original:
        print("No changes needed; evidence_api.py already appears refactored.")
        return

    TARGET.write_text(text, encoding="utf-8")
    print("Updated backend/evidence_api.py to use external Pydantic models.")
    print("Next: bash scripts/qa-backend-syntax.sh")


if __name__ == "__main__":
    main()
