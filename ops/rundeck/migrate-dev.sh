#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-/opt/sphere-rundeck-dev/current}"
ENV_FILE="${SPHERE_RUNDECK_ENV_FILE:-/etc/sphere/rundeck-dev.env}"
PYTHON=/opt/sphere-rundeck-dev/venv/bin/python

test -d "$ROOT"
test -f "$ENV_FILE"
test -x "$PYTHON"

value() {
  local key="$1"
  sed -n "s/^${key}=//p" "$ENV_FILE" | tail -n 1 | tr -d '\r'
}

DB_MODE="$(value DB_MODE)"
DATABASE_URL="$(value DATABASE_URL)"

case "$DB_MODE" in
  db|hybrid) ;;
  *)
    echo "SPHERE /dev database migration skipped: DB_MODE=$DB_MODE"
    exit 0
    ;;
esac

if [[ -z "$DATABASE_URL" ]]; then
  echo "Refusing migration: DATABASE_URL is empty" >&2
  exit 40
fi

# Hard guard against accidentally running Rundeck-development migrations on the
# production SPHERE database. The dev database name must be explicit.
case "$DATABASE_URL" in
  *"/sphere_rundeck_dev"*|*"/sphere-rundeck-dev"*) ;;
  *)
    echo "Refusing migration: DATABASE_URL is not the isolated Rundeck dev database" >&2
    exit 41
    ;;
esac

export DB_MODE DATABASE_URL
cd "$ROOT"
"$PYTHON" -m alembic -c backend/alembic.ini upgrade head
