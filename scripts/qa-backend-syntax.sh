#!/usr/bin/env bash
set -euo pipefail

log() {
  printf '\n[qa-backend-syntax] %s\n' "$*"
}

log "Compile FastAPI backend modules"
python3 -m py_compile backend/evidence_api.py
python3 -m py_compile backend/case_analytics.py
python3 -m py_compile backend/dbfirst_read_helpers.py

if [ -f backend/db/session.py ]; then
  python3 -m py_compile backend/db/session.py
fi

if [ -f backend/db/repositories.py ]; then
  python3 -m py_compile backend/db/repositories.py
fi

log "Backend syntax QA PASS"
