#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="amandapay"
SERVICE_NAME="${SERVICE_NAME:-amandapay-api}"
DB_PATH="${AMANDAPAY_DB_PATH:-/var/lib/amandapay/amandapay.sqlite}"
BACKUP_ROOT="${BACKUP_ROOT:-/home/sadmin/backups/amandapay-public}"
KEEP="${KEEP:-30}"
TS="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="${BACKUP_ROOT}/${APP_NAME}_${TS}"

log() { printf '[INFO] %s\n' "$*"; }
warn() { printf '[WARN] %s\n' "$*" >&2; }
die() { printf '[ERR] %s\n' "$*" >&2; exit 1; }

[ -f "$DB_PATH" ] || die "Database tidak ditemukan: $DB_PATH"

mkdir -p "$OUT_DIR"
chmod 700 "$OUT_DIR"

DB_COPY="${OUT_DIR}/amandapay.sqlite"

log "Backup SQLite konsisten dari $DB_PATH"
if node - "$DB_PATH" "$DB_COPY" <<'NODE'
const { DatabaseSync } = require("node:sqlite");
const [dbPath, outPath] = process.argv.slice(2);
const escaped = outPath.replaceAll("'", "''");
const db = new DatabaseSync(dbPath);
db.exec(`VACUUM INTO '${escaped}'`);
db.close();
NODE
then
  log "SQLite VACUUM INTO selesai: $DB_COPY"
else
  warn "VACUUM INTO gagal, fallback copy file SQLite/WAL/SHM."
  cp -a "$DB_PATH" "$DB_COPY"
  [ -f "${DB_PATH}-wal" ] && cp -a "${DB_PATH}-wal" "${DB_COPY}-wal"
  [ -f "${DB_PATH}-shm" ] && cp -a "${DB_PATH}-shm" "${DB_COPY}-shm"
fi

{
  echo "app=$APP_NAME"
  echo "timestamp=$TS"
  echo "created_at=$(date -Iseconds)"
  echo "host=$(hostname)"
  echo "source_db=$DB_PATH"
  echo "backup_dir=$OUT_DIR"
  echo "service=$SERVICE_NAME"
  echo "node=$(node -v 2>/dev/null || echo N/A)"
} > "${OUT_DIR}/manifest.txt"

node - "$DB_COPY" > "${OUT_DIR}/db-summary.json" <<'NODE'
const { DatabaseSync } = require("node:sqlite");
const [dbPath] = process.argv.slice(2);
const db = new DatabaseSync(dbPath);
let keys = [];
try {
  keys = db.prepare("SELECT key, length(value_text) AS bytes, updated_at FROM kv ORDER BY updated_at DESC").all();
} catch {}
console.log(JSON.stringify({ keyCount: keys.length, keys }, null, 2));
db.close();
NODE

if [ -r /etc/amandapay-api.env ]; then
  cp -a /etc/amandapay-api.env "${OUT_DIR}/amandapay-api.env"
else
  warn "Skip /etc/amandapay-api.env karena tidak readable oleh user saat ini."
fi

if command -v systemctl >/dev/null 2>&1; then
  systemctl cat "$SERVICE_NAME" > "${OUT_DIR}/systemd-${SERVICE_NAME}.txt" 2>/dev/null || true
fi

tar -C "$OUT_DIR" -czf "${OUT_DIR}.tar.gz" .
sha256sum "${OUT_DIR}.tar.gz" > "${OUT_DIR}.tar.gz.sha256"
chmod 600 "${OUT_DIR}.tar.gz" "${OUT_DIR}.tar.gz.sha256"

log "Backup dibuat: ${OUT_DIR}.tar.gz"

mapfile -t old_backups < <(find "$BACKUP_ROOT" -maxdepth 1 -type f -name "${APP_NAME}_*.tar.gz" | sort -r)
if [ "${#old_backups[@]}" -gt "$KEEP" ]; then
  for backup in "${old_backups[@]:$KEEP}"; do
    rm -f "$backup" "$backup.sha256"
    rm -rf "${backup%.tar.gz}"
    log "Hapus backup lama: $backup"
  done
fi
