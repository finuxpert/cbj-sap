#!/usr/bin/env bash
set -euo pipefail

# run as root
if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  exec sudo -E bash "$0" "$@"
fi

SRC="/home/sadmin/sap"
BACKUP_DIR="/home/sadmin/Backup/sap-src"
KEEP="${KEEP:-20}"
TS="$(date +%Y%m%d_%H%M%S)"
NAME="sap-src_${TS}"
TAR="${BACKUP_DIR}/${NAME}.tar.gz"
SHA="${TAR}.sha256"
MAN="${BACKUP_DIR}/${NAME}.manifest.txt"

[ -d "$SRC" ] || { echo "[ERR] Source not found: $SRC"; exit 1; }

mkdir -p "$BACKUP_DIR"

# manifest
{
  echo "name: $NAME"
  echo "timestamp: $(date -Iseconds)"
  echo "host: $(hostname)"
  echo "source: $SRC"
  echo "size: $(du -sh "$SRC" | awk '{print $1}')"
  echo "node: $(node -v 2>/dev/null || echo 'N/A')"
  echo "npm: $(npm -v 2>/dev/null || echo 'N/A')"
  if command -v git >/dev/null 2>&1 && [ -d "$SRC/.git" ]; then
    echo "git_head: $(git -C "$SRC" rev-parse --short HEAD 2>/dev/null || true)"
    echo "git_branch: $(git -C "$SRC" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  fi
} > "$MAN"

# backup source (exclude node_modules + cache)
tar -C "/home/sadmin" -czf "$TAR" \
  --exclude='sap/node_modules' \
  --exclude='sap/.vite' \
  --exclude='sap/.cache' \
  --exclude='sap/.turbo' \
  --exclude='sap/.eslintcache' \
  sap

sha256sum "$TAR" > "$SHA"

echo "[OK] Backup source dibuat:"
echo " - $TAR"
echo " - $SHA"
echo " - $MAN"

# retention
mapfile -t backups < <(ls -1t "${BACKUP_DIR}/sap-src_"*.tar.gz 2>/dev/null || true)
if [ "${#backups[@]}" -gt "$KEEP" ]; then
  for b in "${backups[@]:$KEEP}"; do
    rm -f "$b" "$b.sha256" "${b%.tar.gz}.manifest.txt" || true
    echo "[INFO] Hapus backup lama: $b"
  done
fi
