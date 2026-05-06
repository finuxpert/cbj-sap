#!/usr/bin/env bash
set -Eeuo pipefail

SERVICE_NAME="${SERVICE_NAME:-amandapay-api}"
DB_PATH="${AMANDAPAY_DB_PATH:-/var/lib/amandapay/amandapay.sqlite}"
BACKUP_TAR="${BACKUP_TAR:-}"
RESTORE_CONFIRM="${RESTORE_CONFIRM:-}"
PRE_RESTORE_ROOT="${PRE_RESTORE_ROOT:-/home/sadmin/backups/amandapay-public/pre-restore}"

log() { printf '[INFO] %s\n' "$*"; }
warn() { printf '[WARN] %s\n' "$*" >&2; }
die() { printf '[ERR] %s\n' "$*" >&2; exit 1; }

[ -n "$BACKUP_TAR" ] || die "Set BACKUP_TAR=/path/to/backup.tar.gz"
[ -f "$BACKUP_TAR" ] || die "Backup tar tidak ditemukan: $BACKUP_TAR"
[ "$RESTORE_CONFIRM" = "YES" ] || die "Set RESTORE_CONFIRM=YES untuk lanjut restore"

WORK_DIR="$(mktemp -d)"
cleanup() { rm -rf "$WORK_DIR"; }
trap cleanup EXIT

tar -C "$WORK_DIR" -xzf "$BACKUP_TAR"
[ -f "$WORK_DIR/amandapay.sqlite" ] || die "amandapay.sqlite tidak ditemukan di backup"

mkdir -p "$(dirname "$DB_PATH")" "$PRE_RESTORE_ROOT"

if [ -f "$DB_PATH" ]; then
  PRE="${PRE_RESTORE_ROOT}/amandapay-pre-restore_$(date +%Y%m%d-%H%M%S).sqlite"
  log "Snapshot DB sebelum restore: $PRE"
  if ! node - "$DB_PATH" "$PRE" <<'NODE'
const { DatabaseSync } = require("node:sqlite");
const [dbPath, outPath] = process.argv.slice(2);
const escaped = outPath.replaceAll("'", "''");
const db = new DatabaseSync(dbPath);
db.exec(`VACUUM INTO '${escaped}'`);
db.close();
NODE
  then
    warn "Snapshot konsisten gagal, fallback copy DB file."
    cp -a "$DB_PATH" "$PRE"
    [ -f "${DB_PATH}-wal" ] && cp -a "${DB_PATH}-wal" "${PRE}-wal"
    [ -f "${DB_PATH}-shm" ] && cp -a "${DB_PATH}-shm" "${PRE}-shm"
  fi
fi

if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files | grep -q "^${SERVICE_NAME}\.service"; then
  sudo systemctl stop "$SERVICE_NAME"
fi

cp -a "$WORK_DIR/amandapay.sqlite" "$DB_PATH"
rm -f "${DB_PATH}-wal" "${DB_PATH}-shm"
chmod 600 "$DB_PATH" || true
chown sadmin:sadmin "$DB_PATH" || true

if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files | grep -q "^${SERVICE_NAME}\.service"; then
  sudo systemctl start "$SERVICE_NAME"
  sudo systemctl is-active --quiet "$SERVICE_NAME"
fi

node - "$DB_PATH" <<'NODE'
const { DatabaseSync } = require("node:sqlite");
const [dbPath] = process.argv.slice(2);
const db = new DatabaseSync(dbPath);
const keys = db.prepare("SELECT count(*) AS count FROM kv").get().count;
console.log(JSON.stringify({ ok: true, dbPath, keys }, null, 2));
db.close();
NODE

log "Restore selesai."
