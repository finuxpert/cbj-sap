\
#!/usr/bin/env bash
# sap-rollback.sh — Pilih backup SOURCE -> restore -> build -> deploy -> reload nginx
#
# Default:
#   SRC=/home/sadmin/sap
#   WEBROOT=/var/www/html/sap   (ini yang dipakai Nginx /sap/)
#   BACKUP_DIR=/home/sadmin/Backup/sap-src
#
# Usage:
#   sudo ./sap-rollback.sh                 # auto pilih jika hanya 1 backup; kalau banyak -> prompt
#   sudo ./sap-rollback.sh <file.tar.gz>   # langsung restore file itu
#
# Fix v2: Menu/prompt ditulis ke STDERR supaya TARGET hanya berisi path file backup (tidak tercampur teks menu).

set -Eeuo pipefail

# Re-run with sudo if not root
if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  exec sudo -E bash "$0" "$@"
fi

SRC="${SRC:-/home/sadmin/sap}"
WEBROOT="${WEBROOT:-/var/www/html/sap}"
BACKUP_DIR="${BACKUP_DIR:-/home/sadmin/Backup/sap-src}"
BACKUP_SCRIPT="${BACKUP_SCRIPT:-/home/sadmin/sap/sap-backup.sh}"
BUILD_USER="${BUILD_USER:-sadmin}"

log(){ echo "[INFO] $*" >&2; }
warn(){ echo "[WARN] $*" >&2; }
die(){ echo "[ERR]  $*" >&2; exit 1; }

need_cmd(){ command -v "$1" >/dev/null 2>&1 || die "Command not found: $1"; }
need_cmd tar
need_cmd rsync
need_cmd nginx
need_cmd sha256sum

pick_backup() {
  mapfile -t files < <(ls -1t "${BACKUP_DIR}/sap-src_"*.tar.gz 2>/dev/null || true)
  [ "${#files[@]}" -gt 0 ] || die "Tidak ada backup di $BACKUP_DIR"

  # kalau cuma 1 backup, auto pilih biar ga nunggu input
  if [ "${#files[@]}" -eq 1 ]; then
    log "Hanya 1 backup ditemukan -> auto pilih: $(basename "${files[0]}")"
    printf '%s\n' "${files[0]}"
    return 0
  fi

  echo "Pilih backup SOURCE yang mau di-restore:" >&2
  local i=1
  for f in "${files[@]}"; do
    echo "  [$i] $(basename "$f")" >&2
    i=$((i+1))
  done

  local n=""
  if [ -r /dev/tty ]; then
    # prompt ke stderr + baca dari tty
    printf "Nomor (1-%d): " "${#files[@]}" >&2
    read -r n </dev/tty
  else
    warn "Tidak ada /dev/tty -> auto pilih backup terbaru"
    printf '%s\n' "${files[0]}"
    return 0
  fi

  [[ "$n" =~ ^[0-9]+$ ]] && [ "$n" -ge 1 ] && [ "$n" -le "${#files[@]}" ] || die "Pilihan invalid"
  printf '%s\n' "${files[$((n-1))]}"
}

TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  TARGET="$(pick_backup)"
else
  # kalau user kasih nama pendek
  [ -f "$TARGET" ] || { [ -f "${BACKUP_DIR}/${TARGET}" ] && TARGET="${BACKUP_DIR}/${TARGET}"; }
fi
[ -f "$TARGET" ] || die "Backup file tidak ditemukan: $TARGET"

log "Backup dipilih: $TARGET"

# verify sha if exists
if [ -f "${TARGET}.sha256" ]; then
  log "Verifikasi SHA256..."
  (cd "$(dirname "$TARGET")" && sha256sum -c "$(basename "${TARGET}.sha256")") >&2
else
  warn "sha256 tidak ada, skip verifikasi."
fi

# Safety backup current source (kalau script ada)
if [ -x "$BACKUP_SCRIPT" ]; then
  log "Safety backup source sebelum rollback..."
  bash "$BACKUP_SCRIPT" >/dev/null || warn "Safety backup gagal (skip)"
else
  warn "Backup script tidak ada/ga executable: $BACKUP_SCRIPT (skip safety backup)"
fi

TMP="$(mktemp -d /tmp/sap_src_restore_XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

log "Extract backup ke temp: $TMP"
tar -xzf "$TARGET" -C "$TMP"

[ -d "$TMP/sap" ] || die "Struktur archive tidak ada folder 'sap'"

log "Restore source -> $SRC"
mkdir -p "$SRC"
rsync -a --delete "$TMP/sap/" "$SRC/"

chown -R "${BUILD_USER}:${BUILD_USER}" "$SRC"
find "$SRC" -type d -exec chmod 755 {} \;
find "$SRC" -type f -exec chmod 644 {} \;

need_cmd node
need_cmd npm

log "Build mulai (as ${BUILD_USER})..."
NPM_FLAGS="--no-audit --no-fund"

if [ -f "$SRC/package-lock.json" ]; then
  sudo -u "$BUILD_USER" -H bash -lc "cd '$SRC' && npm ci $NPM_FLAGS"
else
  sudo -u "$BUILD_USER" -H bash -lc "cd '$SRC' && npm install $NPM_FLAGS"
fi
sudo -u "$BUILD_USER" -H bash -lc "cd '$SRC' && npm run build"

[ -f "$SRC/dist/index.html" ] || die "Build gagal: dist/index.html tidak ada"

log "Deploy dist -> $WEBROOT"
mkdir -p "$WEBROOT"
rsync -a --delete "$SRC/dist/" "$WEBROOT/"

chown -R www-data:www-data "$WEBROOT"
find "$WEBROOT" -type d -exec chmod 755 {} \;
find "$WEBROOT" -type f -exec chmod 644 {} \;

log "Nginx test & reload"
nginx -t >&2
systemctl reload nginx || systemctl restart nginx

log "Smoke test header"
curl -sI "http://127.0.0.1/sap/" | egrep "HTTP/|Content-Length|Last-Modified|ETag|Server" || true

echo "[OK] Rollback + Build + Deploy selesai. Cek: http://<IP>/sap/"
