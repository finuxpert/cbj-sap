#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

API_PATH = Path("backend/evidence_api.py")
text = API_PATH.read_text(encoding="utf-8")

repo_import = '''\ntry:\n    from .db.repositories import (\n        insert_parsed_result_best_effort,\n        upsert_case_best_effort,\n        upsert_evidence_best_effort,\n    )\nexcept Exception:\n    try:\n        from db.repositories import (\n            insert_parsed_result_best_effort,\n            upsert_case_best_effort,\n            upsert_evidence_best_effort,\n        )\n    except Exception:\n        def upsert_case_best_effort(case_data: dict) -> dict:\n            return {"enabled": False, "written": False, "status": "unavailable"}\n\n        def upsert_evidence_best_effort(meta: dict) -> dict:\n            return {"enabled": False, "written": False, "status": "unavailable"}\n\n        def insert_parsed_result_best_effort(case_id: str, result: dict) -> dict:\n            return {"enabled": False, "written": False, "status": "unavailable"}\n'''

anchor = '''try:\n    from .db.session import check_database\nexcept Exception:\n    try:\n        from db.session import check_database\n    except Exception:\n        def check_database() -> dict:\n            return {"enabled": False, "configured": False, "status": "unavailable"}\n'''

if repo_import.strip() not in text:
    if anchor not in text:
        raise SystemExit("DB session import anchor not found")
    text = text.replace(anchor, anchor + repo_import)

old_create = '''    write_case(data)\n    return {"ok": True, "case": data}\n'''
new_create = '''    write_case(data)\n    db_write = upsert_case_best_effort(data)\n    return {"ok": True, "case": data, "db_write": db_write}\n'''
if old_create in text and new_create not in text:
    text = text.replace(old_create, new_create, 1)

old_parsed = '''    case_data["updated_at"] = now_iso()\n    write_case(case_data)\n    return {"ok": True, "result": result, "case": summarize_case(case_data), "analytics": build_case_analytics(case_data)}\n'''
new_parsed = '''    case_data["updated_at"] = now_iso()\n    write_case(case_data)\n    db_case_write = upsert_case_best_effort(case_data)\n    db_result_write = insert_parsed_result_best_effort(case_data.get("id") or case_id, result)\n    return {\n        "ok": True,\n        "result": result,\n        "case": summarize_case(case_data),\n        "analytics": build_case_analytics(case_data),\n        "db_write": {"case": db_case_write, "parsed_result": db_result_write},\n    }\n'''
if old_parsed in text and new_parsed not in text:
    text = text.replace(old_parsed, new_parsed, 1)

old_upload_meta = '''    write_meta(evidence_id, meta)\n\n    linked_case = None\n'''
new_upload_meta = '''    write_meta(evidence_id, meta)\n    db_evidence_write = upsert_evidence_best_effort(meta)\n\n    linked_case = None\n'''
if old_upload_meta in text and new_upload_meta not in text:
    text = text.replace(old_upload_meta, new_upload_meta, 1)

old_upload_case = '''            case_data["updated_at"] = now_iso()\n            write_case(case_data)\n            linked_case = summarize_case(case_data)\n'''
new_upload_case = '''            case_data["updated_at"] = now_iso()\n            write_case(case_data)\n            db_case_write = upsert_case_best_effort(case_data)\n            linked_case = summarize_case(case_data)\n            linked_case["db_write"] = db_case_write\n'''
if old_upload_case in text and new_upload_case not in text:
    text = text.replace(old_upload_case, new_upload_case, 1)

old_upload_return = '''    return {"ok": True, "evidence": meta, "case": linked_case}\n'''
new_upload_return = '''    return {"ok": True, "evidence": meta, "case": linked_case, "db_write": {"evidence": db_evidence_write}}\n'''
if old_upload_return in text and new_upload_return not in text:
    text = text.replace(old_upload_return, new_upload_return, 1)

API_PATH.write_text(text, encoding="utf-8")
print("Hybrid write patch applied to backend/evidence_api.py")
