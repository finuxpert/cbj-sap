#!/usr/bin/env bash
set -Eeuo pipefail

# CBJ Portal data backup.
# Run on the production/local server that owns the CBJ portal database.

APP_NAME="cbj-portal"
SERVICE_NAME="${SERVICE_NAME:-cbj-portal-api}"
DB_PATH="${CBJ_DB_PATH:-/var/lib/cbj-portal/cbj.sqlite}"
FALLBACK_DB_PATH="${FALLBACK_DB_PATH:-/home/sadmin/cbj/server/data/cbj.sqlite}"
BACKUP_ROOT="${BACKUP_ROOT:-/home/sadmin/backups/cbj-portal}"
KEEP="${KEEP:-30}"
TS="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="${BACKUP_ROOT}/${APP_NAME}_${TS}"

log() { printf '[INFO] %s\n' "$*"; }
warn() { printf '[WARN] %s\n' "$*" >&2; }
die() { printf '[ERR] %s\n' "$*" >&2; exit 1; }

if [ ! -f "$DB_PATH" ] && [ -f "$FALLBACK_DB_PATH" ]; then
  warn "DB_PATH tidak ada, pakai fallback: $FALLBACK_DB_PATH"
  DB_PATH="$FALLBACK_DB_PATH"
fi

[ -f "$DB_PATH" ] || die "Database tidak ditemukan: $DB_PATH"

mkdir -p "$OUT_DIR"
chmod 700 "$OUT_DIR"

DB_COPY="${OUT_DIR}/cbj.sqlite"
MANIFEST="${OUT_DIR}/manifest.txt"

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

log "Tulis metadata backup"
{
  echo "app=$APP_NAME"
  echo "timestamp=$TS"
  echo "created_at=$(date -Iseconds)"
  echo "host=$(hostname)"
  echo "source_db=$DB_PATH"
  echo "backup_dir=$OUT_DIR"
  echo "service=$SERVICE_NAME"
  echo "node=$(node -v 2>/dev/null || echo N/A)"
  echo "db_size=$(du -h "$DB_PATH" 2>/dev/null | awk '{print $1}')"
  echo "copy_size=$(du -h "$DB_COPY" 2>/dev/null | awk '{print $1}')"
  if command -v systemctl >/dev/null 2>&1; then
    echo "service_active=$(systemctl is-active "$SERVICE_NAME" 2>/dev/null || true)"
  fi
} > "$MANIFEST"

node - "$DB_COPY" > "${OUT_DIR}/db-summary.json" <<'NODE'
const { DatabaseSync } = require("node:sqlite");
const [dbPath] = process.argv.slice(2);
const db = new DatabaseSync(dbPath);
function safe(sql, fallback) {
  try { return db.prepare(sql).all(); } catch { return fallback; }
}
function one(sql, fallback = 0) {
  try { return db.prepare(sql).get()?.value ?? fallback; } catch { return fallback; }
}
const users = safe("select id,email,role,status,last_login_at from users order by email", []);
const projects = safe("select payload from projects", []).map((row) => {
  try { return JSON.parse(row.payload); } catch { return null; }
}).filter(Boolean);
const summary = {
  users,
  userCount: one("select count(*) value from users"),
  projectCount: projects.length,
  totalValue: projects.reduce((sum, p) => sum + Number(p.projectValue || 0), 0),
  totalPaid: projects.reduce((sum, p) => sum + Number(p.paidAmount || 0), 0),
  payments: projects.reduce((sum, p) => sum + (p.payments || []).length, 0),
  history: projects.reduce((sum, p) => sum + (p.history || []).length, 0),
  latestProjects: projects.slice(0, 10).map((p) => ({
    id: p.id,
    projectName: p.projectName,
    clientName: p.clientName,
    updatedAt: p.updatedAt,
    updatedBy: p.updatedBy
  }))
};
console.log(JSON.stringify(summary, null, 2));
db.close();
NODE

if [ -f /etc/cbj-portal.env ]; then
  cp -a /etc/cbj-portal.env "${OUT_DIR}/cbj-portal.env"
fi

if command -v systemctl >/dev/null 2>&1; then
  systemctl cat "$SERVICE_NAME" > "${OUT_DIR}/systemd-${SERVICE_NAME}.txt" 2>/dev/null || true
fi

if [ -d /var/www/prod/current ]; then
  readlink -f /var/www/prod/current > "${OUT_DIR}/current-release.txt" 2>/dev/null || true
fi

tar -C "$OUT_DIR" -czf "${OUT_DIR}.tar.gz" .
sha256sum "${OUT_DIR}.tar.gz" > "${OUT_DIR}.tar.gz.sha256"
chmod 600 "${OUT_DIR}.tar.gz" "${OUT_DIR}.tar.gz.sha256"

log "Backup dibuat: ${OUT_DIR}.tar.gz"
log "Ringkasan: ${OUT_DIR}/db-summary.json"

mapfile -t old_backups < <(find "$BACKUP_ROOT" -maxdepth 1 -type f -name "${APP_NAME}_*.tar.gz" | sort -r)
if [ "${#old_backups[@]}" -gt "$KEEP" ]; then
  for backup in "${old_backups[@]:$KEEP}"; do
    rm -f "$backup" "$backup.sha256"
    rm -rf "${backup%.tar.gz}"
    log "Hapus backup lama: $backup"
  done
fi
