#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/home/sadmin/sap}"
POSTGRES_ENV="${POSTGRES_ENV:-/opt/postgres-sap-dev/.env}"
STATUS_DIR="${APP_DIR}/runtime-status"
STATUS_FILE="${STATUS_DIR}/sap-db-migration-status.md"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-sap_rca_dev}"
DB_USER="${DB_USER:-sap_rca_app}"
DB_MODE="${DB_MODE:-hybrid}"

log() {
  printf '\n[sap-db-migration] %s\n' "$*"
}

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

log "Validating app directory"
[ -d "$APP_DIR" ] || fail "APP_DIR not found: ${APP_DIR}"
cd "$APP_DIR"

log "Validating PostgreSQL credential file"
[ -f "$POSTGRES_ENV" ] || fail "Credential file not found: ${POSTGRES_ENV}"
# shellcheck disable=SC1090
source "$POSTGRES_ENV"

: "${SAP_RCA_APP_PASSWORD:?SAP_RCA_APP_PASSWORD missing in ${POSTGRES_ENV}}"
DATABASE_URL="postgresql://${DB_USER}:${SAP_RCA_APP_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
export DATABASE_URL DB_MODE

log "Installing backend dependencies"
python3 -m pip install -r backend/requirements.txt

log "Running Alembic migration"
python3 -m alembic -c backend/alembic.ini upgrade head

log "Collecting DB status"
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
  echo ""
  echo "## Alembic Version"
  echo '```text'
  docker exec cbj-postgres-dev psql -U cbj_admin -d "${DB_NAME}" -tAc "SELECT version_num FROM alembic_version;" 2>/dev/null || true
  echo '```'
  echo ""
  echo "## Tables"
  echo '```text'
  docker exec cbj-postgres-dev psql -U cbj_admin -d "${DB_NAME}" -c "\\dt" 2>/dev/null || true
  echo '```'
  echo ""
  echo "## Health Import Check"
  echo '```text'
  python3 - <<'PY'
import os
os.environ.setdefault('DB_MODE', 'hybrid')
from backend.db.session import check_database
print(check_database())
PY
  echo '```'
  echo ""
  echo "> Credentials are intentionally not printed."
} | tee "$STATUS_FILE"

log "Done. Status written to ${STATUS_FILE}"
