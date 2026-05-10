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

log "Validate backend model contracts"
python3 - <<'PY'
from backend.model_contracts import validate_model_contracts

missing = validate_model_contracts()
assert not missing, f'Model contract mismatch: {missing}'
print('OK: backend model contracts passed')
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
