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

log "Backend syntax QA PASS (${#PY_FILES[@]} files)"
