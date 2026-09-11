#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="${SPHERE_RELEASE_ROOT:-/opt/sphere-rundeck-dev/current}"
ENV_FILE="${SPHERE_RUNDECK_ENV_FILE:-/etc/sphere/rundeck-dev.env}"
PYTHON=/opt/sphere-rundeck-dev/venv/bin/python
SCRIPT="$ROOT/ops/rundeck/backfill-consumers.py"

test -d "$ROOT"
test -f "$ENV_FILE"
test -x "$PYTHON"
test -f "$SCRIPT"

value() {
  local key="$1"
  sed -n "s/^${key}=//p" "$ENV_FILE" | tail -n 1 | tr -d '\r'
}

DB_MODE="$(value DB_MODE)"
DATABASE_URL="$(value DATABASE_URL)"
INGESTION_ROOT="$(value SPHERE_INGESTION_ROOT)"
TOP_DEPTH="$(value SPHERE_TOP_CONSUMERS_PER_HOST)"

case "$DB_MODE" in
  db|hybrid) ;;
  *)
    echo "SPHERE /dev consumer backfill skipped: DB_MODE=$DB_MODE"
    exit 0
    ;;
esac

case "$DATABASE_URL" in
  *"/sphere_rundeck_dev"*|*"/sphere-rundeck-dev"*) ;;
  *)
    echo "REFUSED: DATABASE_URL is not the isolated Rundeck dev database" >&2
    exit 41
    ;;
esac

[[ -n "$INGESTION_ROOT" ]] || INGESTION_ROOT=/var/lib/sphere/ingestion
[[ "$TOP_DEPTH" =~ ^[1-9][0-9]*$ ]] || TOP_DEPTH=30

ARGS=(
  "DB_MODE=$DB_MODE"
  "DATABASE_URL=$DATABASE_URL"
  "SPHERE_INGESTION_ROOT=$INGESTION_ROOT"
  "SPHERE_TOP_CONSUMERS_PER_HOST=$TOP_DEPTH"
)

if [[ "$(id -un)" == "sphere" ]]; then
  exec env "${ARGS[@]}" "$PYTHON" "$SCRIPT" "$@"
fi

exec runuser -u sphere -- env "${ARGS[@]}" "$PYTHON" "$SCRIPT" "$@"
