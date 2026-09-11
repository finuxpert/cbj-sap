#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/root/rundeck-sphere-dev}"
POSTGRES_ENV="${POSTGRES_ENV:-/etc/sphere/rundeck-db.env}"
VENV_DIR="${VENV_DIR:-${APP_DIR}/.venv-db}"
STATUS_DIR="${APP_DIR}/runtime-status"
STATUS_FILE="${STATUS_DIR}/sap-db-migration-status.md"

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-sap_rca_dev}"
DB_USER="${DB_USER:-sap_rca_app}"
DB_MODE="${DB_MODE:-hybrid}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-sphere-postgres-dev}"

log() {
  printf '\n[sap-db-migration] %s\n' "$*"
}

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

require_file() {
  [ -f "$1" ] || fail "Required file not found: $1"
}

log "Validating app directory"
[ -d "$APP_DIR" ] || fail "APP_DIR not found: ${APP_DIR}"
cd "$APP_DIR"

log "Validating PostgreSQL credential file"
require_file "$POSTGRES_ENV"

set -a
# shellcheck disable=SC1090
source "$POSTGRES_ENV"
set +a

: "${SAP_RCA_APP_PASSWORD:?SAP_RCA_APP_PASSWORD missing in ${POSTGRES_ENV}}"

log "Preparing project-local Python virtualenv"
python3 -m venv "$VENV_DIR"
# shellcheck disable=SC1091
source "${VENV_DIR}/bin/activate"

python -m pip install --upgrade pip >/dev/null
python -m pip install -r backend/requirements.txt >/dev/null

export DB_MODE
export DATABASE_URL="postgresql+psycopg://${DB_USER}:${SAP_RCA_APP_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

log "Running Alembic migration"
python -m alembic -c backend/alembic.ini upgrade head

log "Collecting safe DB status"
mkdir -p "$STATUS_DIR"

{
  echo "# SAP RCA DB Migration Status"
  echo ""
  echo "Last checked: $(date -Is)"
  echo "App dir: ${APP_DIR}"
  echo "DB host: ${DB_HOST}"
  echo "DB port: ${DB_PORT}"
  echo "DB name: ${DB_NAME}"
  echo "DB user: ${DB_USER}"
  echo "DB mode: ${DB_MODE}"
  echo "Driver: postgresql+psycopg"
  echo "Virtualenv: ${VENV_DIR}"
  echo ""
  echo "## Alembic Version"
  echo '```text'
  docker exec "$POSTGRES_CONTAINER" psql -U cbj_admin -d "${DB_NAME}" -tAc "SELECT version_num FROM alembic_version;" 2>/dev/null || true
  echo '```'
  echo ""
  echo "## Tables"
  echo '```text'
  docker exec "$POSTGRES_CONTAINER" psql -U cbj_admin -d "${DB_NAME}" -tAc "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;" 2>/dev/null || true
  echo '```'
  echo ""
  echo "## DB Health"
  echo '```json'
  python - <<'PY'
import json
from backend.db.session import check_database
print(json.dumps(check_database(), indent=2, sort_keys=True))
PY
  echo '```'
  echo ""
  echo "> Credentials are intentionally not printed."
} | tee "$STATUS_FILE"

log "Done. Status written to ${STATUS_FILE}"
