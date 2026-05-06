#!/usr/bin/env bash
# sap-deploy.sh — Build & deploy /sap (Vite) dari /home/sadmin/sap ke /var/www/html/sap
#
# Usage:
#   sudo ./sap-deploy.sh
# Env:
#   SRC_DIR=/home/sadmin/sap
#   DEPLOY_DIR=/var/www/html/sap
#   BASE_PATH=/sap/
#   BUILD_USER=sadmin
#   DO_BACKUP=1   # optional: jalankan sap-backup.sh dulu

set -Eeuo pipefail

# Re-run with sudo if not root
if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  exec sudo -E bash "$0" "$@"
fi

SRC_DIR="${SRC_DIR:-/home/sadmin/sap}"
DEPLOY_DIR="${DEPLOY_DIR:-/var/www/html/sap}"
BASE_PATH="${BASE_PATH:-/sap/}"
BUILD_USER="${BUILD_USER:-sadmin}"
DO_BACKUP="${DO_BACKUP:-0}"
BACKUP_SCRIPT="${BACKUP_SCRIPT:-/home/sadmin/sap/sap-backup.sh}"

log(){ echo "[INFO] $*"; }
die(){ echo "[ERR]  $*" >&2; exit 1; }
need_cmd(){ command -v "$1" >/dev/null 2>&1 || die "Command not found: $1"; }

need_cmd nginx
need_cmd rsync
need_cmd node
need_cmd npm

[ -d "$SRC_DIR" ] || die "SRC_DIR tidak ada: $SRC_DIR"
[ -f "$SRC_DIR/package.json" ] || die "package.json tidak ditemukan di $SRC_DIR"

if [ "$DO_BACKUP" = "1" ] && [ -x "$BACKUP_SCRIPT" ]; then
  log "Backup source sebelum deploy..."
  bash "$BACKUP_SCRIPT" || die "Backup gagal"
fi

log "Build Vite (base=${BASE_PATH}) as ${BUILD_USER}"
# pakai arg --base biar aman walau vite.config lupa
NPM_FLAGS="--no-audit --no-fund"

if [ -f "$SRC_DIR/package-lock.json" ]; then
  sudo -u "$BUILD_USER" -H bash -lc "cd '$SRC_DIR' && npm ci $NPM_FLAGS"
else
  sudo -u "$BUILD_USER" -H bash -lc "cd '$SRC_DIR' && npm install $NPM_FLAGS"
fi

# build; prefer arg base (Vite), fallback npm run build biasa
sudo -u "$BUILD_USER" -H bash -lc "cd '$SRC_DIR' && (npm run -s build -- --base='${BASE_PATH}' || npm run build)"

[ -f "$SRC_DIR/dist/index.html" ] || die "Build gagal: dist/index.html tidak ada"

log "Deploy dist -> ${DEPLOY_DIR}"
mkdir -p "$DEPLOY_DIR"
rsync -a --delete "$SRC_DIR/dist/" "$DEPLOY_DIR/"

chown -R www-data:www-data "$DEPLOY_DIR"
find "$DEPLOY_DIR" -type d -exec chmod 755 {} \;
find "$DEPLOY_DIR" -type f -exec chmod 644 {} \;

log "Reload nginx"
nginx -t && systemctl reload nginx

log "Done -> http://<IP>${BASE_PATH}"
