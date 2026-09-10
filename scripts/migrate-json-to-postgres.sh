#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/root/rundeck-sphere-dev}"
POSTGRES_ENV="${POSTGRES_ENV:-/etc/sphere/rundeck-db.env}"
VENV_DIR="${VENV_DIR:-${APP_DIR}/backend-venv}"
STORAGE_ROOT="${STORAGE_ROOT:-/var/lib/sphere-dev/evidence}"
DRY_RUN="${DRY_RUN:-0}"

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-sap_rca_dev}"
DB_USER="${DB_USER:-sap_rca_app}"
DB_MODE="${DB_MODE:-hybrid}"

log() {
  printf '\n[json-to-postgres] %s\n' "$*"
}

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

[ -d "$APP_DIR" ] || fail "APP_DIR not found: ${APP_DIR}"
[ -f "$POSTGRES_ENV" ] || fail "PostgreSQL env not found: ${POSTGRES_ENV}"
[ -x "${VENV_DIR}/bin/python" ] || fail "Python venv not found: ${VENV_DIR}"

cd "$APP_DIR"

set -a
# shellcheck disable=SC1090
source "$POSTGRES_ENV"
set +a

: "${SAP_RCA_APP_PASSWORD:?SAP_RCA_APP_PASSWORD missing in ${POSTGRES_ENV}}"

export DB_MODE
export DATABASE_URL="postgresql+psycopg://${DB_USER}:${SAP_RCA_APP_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
export PYTHONPATH="$APP_DIR"

log "Installing backend dependencies into runtime venv"
"${VENV_DIR}/bin/python" -m pip install -r backend/requirements.txt >/dev/null

log "Running JSON/file-backed to PostgreSQL migration"
"${VENV_DIR}/bin/python" backend/scripts/migrate_json_to_postgres.py \
  --storage-root "$STORAGE_ROOT" \
  $( [ "$DRY_RUN" = "1" ] && printf '%s' "--dry-run" || true )
