#!/usr/bin/env bash
set -euo pipefail

log() {
  printf '\n[qa-backend-syntax] %s\n' "$*"
}

log "Discover backend Python modules"
mapfile -t PY_FILES < <(find backend -type f -name '*.py' \
  ! -path '*/__pycache__/*' \
  ! -path '*/.venv/*' \
  ! -path '*/venv/*' \
  | sort)

if [ "${#PY_FILES[@]}" -eq 0 ]; then
  echo "ERROR: no backend Python files found" >&2
  exit 1
fi

printf '%s\n' "${PY_FILES[@]}"

log "Compile backend Python modules"
python3 -m py_compile "${PY_FILES[@]}"

log "Import backend models"
python3 - <<'PY'
from backend.models import CaseCreate, CaseUpdate, EvidenceUpdate, ParsedResultCreate

assert CaseCreate(title='QA').title == 'QA'
assert CaseUpdate(status='CLOSED').status == 'CLOSED'
assert EvidenceUpdate(title='Evidence').title == 'Evidence'
assert ParsedResultCreate(tool='QA').tool == 'QA'
print('OK: backend.models import smoke passed')
PY

log "Validate external model handoff"
python3 - <<'PY'
from backend.external_models import (
    CaseCreate,
    CaseUpdate,
    EvidenceUpdate,
    ParsedResultCreate,
)

assert CaseCreate(title='QA').title == 'QA'
assert CaseUpdate(status='OPEN').status == 'OPEN'
assert EvidenceUpdate(tool='QA').tool == 'QA'
assert ParsedResultCreate(tool='QA').tool == 'QA'
print('OK: external backend model handoff passed')
PY

log "Validate backend model contracts"
python3 - <<'PY'
from backend.model_contracts import validate_model_contracts

missing = validate_model_contracts()
assert not missing, f'Model contract mismatch: {missing}'
print('OK: backend model contracts passed')
PY

log "Validate backend storage config"
python3 - <<'PY'
from backend.storage_config import (
    ALLOWED_EXT,
    APP_NAME,
    CASE_DIR,
    EVIDENCE_DIR,
    MAX_UPLOAD_MB,
    META_DIR,
    REPORT_DIR,
    STORAGE_ROOT,
    storage_snapshot,
)

snapshot = storage_snapshot()
assert APP_NAME == 'SAP Intelligent RCA Evidence API'
assert str(STORAGE_ROOT)
assert str(EVIDENCE_DIR).startswith(str(STORAGE_ROOT))
assert str(META_DIR).startswith(str(STORAGE_ROOT))
assert str(REPORT_DIR).startswith(str(STORAGE_ROOT))
assert str(CASE_DIR).startswith(str(STORAGE_ROOT))
assert '.zip' in ALLOWED_EXT
assert '.log' in ALLOWED_EXT
assert MAX_UPLOAD_MB >= 100
assert snapshot['app_name'] == APP_NAME
print('OK: backend storage config passed')
PY

log "Validate backend storage helpers"
python3 - <<'PY'
from backend.storage_helpers import (
    case_path,
    ensure_dirs,
    meta_path,
    now_iso,
    safe_case_id,
    safe_name,
)

ensure_dirs()
assert safe_name('SAP LOG 01.txt') == 'SAP LOG 01.txt'
assert safe_name('../unsafe?.txt') == 'unsafe_.txt'
assert safe_case_id('CASE/2026:01') == 'CASE-2026-01'
assert str(case_path('CASE-1')).endswith('.json')
assert str(meta_path('meta-1')).endswith('.json')
assert 'T' in now_iso()
print('OK: backend storage helpers passed')
PY

log "Validate storage helper compatibility contracts"
TMP_STORAGE_ROOT="$(mktemp -d)" python3 - <<'PY'
import importlib
import os
from pathlib import Path

os.environ['SAP_EVIDENCE_ROOT'] = os.environ['TMP_STORAGE_ROOT']

import backend.storage_config as storage_config
storage_config = importlib.reload(storage_config)

import backend.storage_helpers as storage_helpers
storage_helpers = importlib.reload(storage_helpers)

storage_helpers.ensure_dirs()

legacy_case = {
    'id': 'CASE-QA-LEGACY',
    'case_no': 'CASE-QA-LEGACY',
    'title': 'Legacy write_case(dict) QA',
}
storage_helpers.write_case(legacy_case)
assert storage_helpers.read_case('CASE-QA-LEGACY')['title'] == 'Legacy write_case(dict) QA'

explicit_case = {
    'id': 'CASE-QA-EXPLICIT',
    'case_no': 'CASE-QA-EXPLICIT',
    'title': 'Explicit write_case(id, dict) QA',
}
storage_helpers.write_case('CASE-QA-EXPLICIT', explicit_case)
assert storage_helpers.read_case('CASE-QA-EXPLICIT')['title'] == 'Explicit write_case(id, dict) QA'

meta = {'id': 'evidence-qa-001', 'title': 'Meta QA'}
storage_helpers.write_meta('evidence-qa-001', meta)
assert storage_helpers.read_meta('evidence-qa-001')['title'] == 'Meta QA'

try:
    storage_helpers.read_case('CASE-NOT-FOUND')
except Exception as exc:
    assert getattr(exc, 'status_code', None) == 404
else:
    raise AssertionError('read_case missing object should raise HTTPException 404')

try:
    storage_helpers.read_meta('evidence-not-found')
except Exception as exc:
    assert getattr(exc, 'status_code', None) == 404
else:
    raise AssertionError('read_meta missing object should raise HTTPException 404')

root = Path(os.environ['TMP_STORAGE_ROOT'])
assert (root / 'cases' / 'CASE-QA-LEGACY.json').exists()
assert (root / 'cases' / 'CASE-QA-EXPLICIT.json').exists()
assert (root / 'metadata' / 'evidence-qa-001.json').exists()
print('OK: storage helper compatibility contracts passed')
PY

log "Validate case helpers"
python3 - <<'PY'
from backend.case_helpers import mobile_case_payload, summarize_case

case_data = {
    'id': 'CASE-QA-HELPERS',
    'case_no': 'CASE-QA-HELPERS',
    'title': 'Case helper QA',
    'sid': 'QA1',
    'environment': 'DEV',
    'status': 'OPEN',
    'evidence': [{'id': 'ev1'}],
    'reports': [{'id': 'r1'}],
    'parsed_results': [{
        'tool': 'Log Evidence',
        'severity': 'WARN',
        'summary': 'Parsed summary',
        'top_anomaly': 'QA_ANOMALY',
        'top_suspect': 'QA_SUSPECT',
    }],
    'timeline': [{'id': 't1'}],
}
summary = summarize_case(case_data)
assert summary['id'] == 'CASE-QA-HELPERS'
assert summary['tool'] == 'Log Evidence'
assert summary['severity'] == 'WARN'
assert summary['evidence_count'] == 1
assert summary['report_count'] == 1
mobile = mobile_case_payload(case_data)
assert mobile['executive_summary'] == 'Parsed summary'
assert mobile['top_problem']['label'] == 'QA_SUSPECT'
assert mobile['parsed_results'][0]['top_anomaly'] == 'QA_ANOMALY'
assert 'analytics' in mobile
print('OK: case helper contracts passed')
PY

log "Validate history serializers"
TMP_HISTORY_ROOT="$(mktemp -d)" python3 - <<'PY'
import json
import os
from pathlib import Path

from backend.history_serializers import collect_file_parsed_results_history

case_dir = Path(os.environ['TMP_HISTORY_ROOT']) / 'cases'
case_dir.mkdir(parents=True, exist_ok=True)

(case_dir / 'CASE-HIST-001.json').write_text(json.dumps({
    'id': 'CASE-HIST-001',
    'case_no': 'CASE-HIST-001',
    'parsed_results': [
        {'id': 'r1', 'tool': 'Log Evidence', 'top_anomaly': 'A1'},
        {'id': 'r2', 'tool': 'ST03N', 'top_anomaly': 'A2'},
    ],
}), encoding='utf-8')

(case_dir / 'CASE-HIST-002.json').write_text(json.dumps({
    'id': 'CASE-HIST-002',
    'case_no': 'CASE-HIST-002',
    'parsed_results': [
        {'id': 'r3', 'tool': 'Log Evidence', 'top_anomaly': 'A3'},
    ],
}), encoding='utf-8')

all_rows = collect_file_parsed_results_history(case_dir, limit=10)
assert len(all_rows) == 3
assert {row['case_id'] for row in all_rows} == {'CASE-HIST-001', 'CASE-HIST-002'}

case_rows = collect_file_parsed_results_history(case_dir, case_id='CASE-HIST-001', limit=10)
assert len(case_rows) == 2
assert all(row['case_id'] == 'CASE-HIST-001' for row in case_rows)

tool_rows = collect_file_parsed_results_history(case_dir, tool='Log Evidence', limit=10)
assert len(tool_rows) == 2
assert all(row['tool'] == 'Log Evidence' for row in tool_rows)

limited_rows = collect_file_parsed_results_history(case_dir, limit=1)
assert len(limited_rows) == 1

missing_rows = collect_file_parsed_results_history(case_dir / 'missing', limit=10)
assert missing_rows == []
print('OK: history serializer contracts passed')
PY

log "Import FastAPI app"
python3 - <<'PY'
from backend.evidence_api import app

assert app.title == 'SAP Intelligent RCA Evidence API'
paths = {route.path for route in app.routes}
required = {'/health', '/cases', '/upload', '/parsed-results-history', '/evidence-history'}
missing = sorted(required - paths)
assert not missing, f'Missing FastAPI routes: {missing}'
print(f'OK: evidence_api app import smoke passed ({len(paths)} routes)')
PY

log "Backend syntax QA PASS (${#PY_FILES[@]} files)"
