#!/usr/bin/env bash
set -Eeuo pipefail

SOURCE=/root/rundeck-sphere-prod
API_ROOT=/opt/sphere-rundeck-prod
API_CURRENT=$API_ROOT/current
API_RELEASES=$API_ROOT/releases
WEB_ROOT=/var/www/sphere.astraotoparts.co.id
WEB_CURRENT=$WEB_ROOT/current
WEB_RELEASES=$WEB_ROOT/releases
NGINX_SITE=/etc/nginx/sites-available/sphere.astraotoparts.co.id
SERVICE=sphere-rundeck-prod-api.service

[[ $EUID -eq 0 ]] || { echo "DEPLOY BLOCKED: run as root" >&2; exit 2; }
[[ -d "$SOURCE/.git" ]] || { echo "DEPLOY BLOCKED: $SOURCE is not a git checkout" >&2; exit 2; }
CURRENT_BRANCH="$(git -C "$SOURCE" branch --show-current)"
[[ "$CURRENT_BRANCH" == "rundeck-sphere-prod" ]] || { echo "DEPLOY BLOCKED: expected rundeck-sphere-prod, found ${CURRENT_BRANCH:-unknown}" >&2; exit 2; }
[[ -z "$(git -C "$SOURCE" status --porcelain)" ]] || { echo "DEPLOY BLOCKED: production checkout is not clean" >&2; git -C "$SOURCE" status --short >&2; exit 2; }

git -C "$SOURCE" fetch origin rundeck-sphere-prod
LOCAL_HEAD="$(git -C "$SOURCE" rev-parse HEAD)"
REMOTE_HEAD="$(git -C "$SOURCE" rev-parse origin/rundeck-sphere-prod)"
[[ "$LOCAL_HEAD" == "$REMOTE_HEAD" ]] || { echo "DEPLOY BLOCKED: local HEAD $LOCAL_HEAD != origin $REMOTE_HEAD" >&2; exit 2; }

REVISION="$LOCAL_HEAD"
SHORT="${REVISION:0:12}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
API_RELEASE="$API_RELEASES/$REVISION"
WEB_RELEASE="$WEB_RELEASES/${STAMP}-${SHORT}"
PREVIOUS_API="$(readlink -f "$API_CURRENT" 2>/dev/null || true)"
PREVIOUS_WEB="$(readlink -f "$WEB_CURRENT" 2>/dev/null || true)"
LEGACY_API="$(readlink -f /opt/sphere/current 2>/dev/null || true)"
DEV_API="$(readlink -f /opt/sphere-rundeck-dev/current 2>/dev/null || true)"
DEV_WEB="$(readlink -f /var/www/sphere-dev/current 2>/dev/null || true)"
NGINX_BACKUP="$(mktemp /root/sphere-nginx-before-prod.XXXXXX)"
cp -a "$NGINX_SITE" "$NGINX_BACKUP"

cleanup() {
  rm -f \
    "$NGINX_BACKUP" \
    /tmp/sphere-prod-rundeck-health.json \
    /tmp/sphere-prod-root-health.json \
    /tmp/sphere-prod-sap-health.json \
    /tmp/sphere-prod-latest.json \
    /tmp/sphere-prod-evaluation.json \
    /tmp/sphere-prod-smoke.html \
    /tmp/sphere-dev-smoke-after-prod.html
}

rollback() {
  local status=$?
  trap - ERR
  set +e
  echo
  echo "PRODUCTION DEPLOY FAILED - rolling back"
  if [[ -n "$PREVIOUS_WEB" && -d "$PREVIOUS_WEB" ]]; then
    ln -sfn "$PREVIOUS_WEB" "$WEB_CURRENT"
  fi
  if [[ -n "$PREVIOUS_API" && -d "$PREVIOUS_API" ]]; then
    ln -sfn "$PREVIOUS_API" "$API_CURRENT"
    systemctl restart "$SERVICE" >/dev/null 2>&1 || true
  else
    rm -f "$API_CURRENT"
    systemctl stop "$SERVICE" >/dev/null 2>&1 || true
  fi
  cp -a "$NGINX_BACKUP" "$NGINX_SITE"
  nginx -t >/dev/null 2>&1 && systemctl reload nginx >/dev/null 2>&1 || true
  [[ "$WEB_RELEASE" == "$PREVIOUS_WEB" ]] || rm -rf -- "$WEB_RELEASE"
  [[ "$API_RELEASE" == "$PREVIOUS_API" ]] || rm -rf -- "$API_RELEASE"
  echo "PRODUCTION ROLLED BACK TO WEB=$(basename "${PREVIOUS_WEB:-unknown}") API=$(basename "${PREVIOUS_API:-none}")"
  exit "$status"
}

trap rollback ERR
trap cleanup EXIT

smoke_fetch() {
  local label=$1
  local url=$2
  local output=$3
  local attempt
  echo "SMOKE ${label}"
  for attempt in 1 2 3; do
    if curl --noproxy '*' -fsS --max-time 10 "$url" -o "$output"; then
      return 0
    fi
    echo "SMOKE RETRY ${label} attempt=${attempt}" >&2
    sleep 1
  done
  echo "SMOKE FAILED ${label}: ${url}" >&2
  return 1
}

require_contains() {
  local label=$1
  local file=$2
  local pattern=$3
  if ! grep -q "$pattern" "$file"; then
    echo "SMOKE FAILED ${label}: expected pattern ${pattern}" >&2
    head -c 500 "$file" >&2 || true
    echo >&2
    return 1
  fi
  echo "SMOKE PASS ${label}"
}

# Build output must be production-root aware before activation.
test -f "$SOURCE/dist/index.html"
grep -q '/assets/' "$SOURCE/dist/index.html"
if grep -q '/dev/assets/' "$SOURCE/dist/index.html"; then
  echo "DEPLOY BLOCKED: dist still references /dev/assets/" >&2
  exit 2
fi

install -d -m 0755 "$API_RELEASES" "$WEB_RELEASES" "$API_RELEASE" "$WEB_RELEASE"
git -C "$SOURCE" archive HEAD | tar -x -C "$API_RELEASE"
cp -a "$SOURCE/dist/." "$WEB_RELEASE/"
python3 -m compileall -q "$API_RELEASE/backend"

# Create a production Python environment once, then keep dependencies aligned.
if [[ ! -x "$API_ROOT/venv/bin/python" ]]; then
  install -d -m 0755 "$API_ROOT"
  if [[ -x /opt/sphere/tools/bin/uv && -x /opt/sphere-rundeck-dev/venv/bin/python ]]; then
    /opt/sphere/tools/bin/uv venv --python /opt/sphere-rundeck-dev/venv/bin/python "$API_ROOT/venv"
    /opt/sphere/tools/bin/uv pip install --python "$API_ROOT/venv/bin/python" -r "$API_RELEASE/backend/requirements.txt"
  else
    python3 -m venv "$API_ROOT/venv"
    "$API_ROOT/venv/bin/pip" install -r "$API_RELEASE/backend/requirements.txt"
  fi
else
  if [[ -x /opt/sphere/tools/bin/uv ]]; then
    /opt/sphere/tools/bin/uv pip install --python "$API_ROOT/venv/bin/python" -r "$API_RELEASE/backend/requirements.txt"
  else
    "$API_ROOT/venv/bin/pip" install -r "$API_RELEASE/backend/requirements.txt"
  fi
fi

# Production API reads the same normalized monitoring database/raw evidence as the
# collector. Seed its environment from the proven dev configuration on first deploy,
# but Collect Now is hard-disabled in the production service unit.
if [[ ! -f /etc/sphere/rundeck-prod.env ]]; then
  test -f /etc/sphere/rundeck-dev.env
  install -o root -g sphere -m 0640 /etc/sphere/rundeck-dev.env /etc/sphere/rundeck-prod.env
fi

# Install/refresh the production API service before activation.
install -m 0644 "$API_RELEASE/ops/rundeck/sphere-rundeck-prod-api.service" "/etc/systemd/system/$SERVICE"
systemctl daemon-reload

# Replace only the PROD routing block and preserve any DEV managed block that was
# inserted later before the shared /sap-api anchor. The previous implementation
# replaced everything from the legacy PROD marker to /sap-api, which could consume
# the DEV routing block and make /dev/ fall through to the production SPA.
python3 - "$NGINX_SITE" "$API_RELEASE/ops/rundeck/nginx-prod.conf" <<'PY'
from pathlib import Path
import sys

site = Path(sys.argv[1])
snippet_path = Path(sys.argv[2])
text = site.read_text()
snippet = snippet_path.read_text().rstrip() + '\n'
legacy = '    # SPHERE production Rundeck API routing\n'
begin = '    # BEGIN SPHERE PROD ROUTING\n'
end = '    # END SPHERE PROD ROUTING\n'
anchor = '    location = /sap-api { return 308 /sap-api/; }'
dev_markers = (
    '    # BEGIN SPHERE DEV ROUTING\n',
    '    # SPHERE isolated Rundeck development',
)
block = begin + snippet + end

if anchor not in text:
    raise SystemExit('Nginx anchor not found: location = /sap-api { return 308 /sap-api/; }')

has_begin = begin in text
has_end = end in text
if has_begin != has_end:
    raise SystemExit('Unbalanced managed PROD routing markers')

if has_begin:
    start = text.index(begin)
    finish = text.index(end, start) + len(end)
    text = text[:start] + block + text[finish:]
elif legacy in text:
    start = text.index(legacy)
    anchor_pos = text.index(anchor, start)
    finish = anchor_pos
    for marker in dev_markers:
        pos = text.find(marker, start, anchor_pos)
        if pos != -1:
            finish = min(finish, pos)
    text = text[:start] + block + '\n' + text[finish:]
else:
    text = text.replace(anchor, block + '\n' + anchor, 1)

site.write_text(text)
PY

grep -q '# BEGIN SPHERE PROD ROUTING' "$NGINX_SITE"
grep -q '# END SPHERE PROD ROUTING' "$NGINX_SITE"
grep -Eq '# BEGIN SPHERE DEV ROUTING|# SPHERE isolated Rundeck development' "$NGINX_SITE"
nginx -t

# Transactional activation. Any failure below restores previous web/API/Nginx.
ln -sfn "$API_RELEASE" "$API_CURRENT"
ln -sfn "$WEB_RELEASE" "$WEB_CURRENT"
systemctl enable "$SERVICE" >/dev/null
systemctl restart "$SERVICE"
systemctl reload nginx

# Local production Rundeck API warm-up.
API_OK=0
for attempt in {1..20}; do
  if curl --noproxy '*' -fsS --max-time 3 http://127.0.0.1:8092/health -o /tmp/sphere-prod-rundeck-health.json 2>/dev/null; then
    API_OK=1
    break
  fi
  sleep 1
done
[[ "$API_OK" = 1 ]] || { echo "SMOKE FAILED local Rundeck API health" >&2; exit 1; }
echo "SMOKE PASS local Rundeck API health"

# Public smoke tests: legacy API via new /api fallback, Rundeck routes, root bundle,
# existing /sap-api compatibility, and isolated /dev runtime. Each public request is
# retried to avoid rolling production back on a one-off proxy/CDN/network transient.
smoke_fetch "legacy /api/health" "https://sphere.astraotoparts.co.id/api/health" /tmp/sphere-prod-root-health.json
require_contains "legacy /api/health" /tmp/sphere-prod-root-health.json 'case_history'

smoke_fetch "legacy /sap-api/health" "https://sphere.astraotoparts.co.id/sap-api/health" /tmp/sphere-prod-sap-health.json
require_contains "legacy /sap-api/health" /tmp/sphere-prod-sap-health.json 'case_history'

smoke_fetch "Rundeck collections" "https://sphere.astraotoparts.co.id/api/collections/latest" /tmp/sphere-prod-latest.json
require_contains "Rundeck collections" /tmp/sphere-prod-latest.json 'collection_id'

smoke_fetch "Rundeck evaluation" "https://sphere.astraotoparts.co.id/api/evaluation/workloads?period=1d&type=ALL&limit=1" /tmp/sphere-prod-evaluation.json
require_contains "Rundeck evaluation" /tmp/sphere-prod-evaluation.json '"items"'

smoke_fetch "PROD web" "https://sphere.astraotoparts.co.id/" /tmp/sphere-prod-smoke.html
require_contains "PROD web" /tmp/sphere-prod-smoke.html '/assets/'

smoke_fetch "DEV web isolation" "https://sphere.astraotoparts.co.id/dev/" /tmp/sphere-dev-smoke-after-prod.html
require_contains "DEV web isolation" /tmp/sphere-dev-smoke-after-prod.html '/dev/assets/'

# Guardrails: legacy Evidence API and isolated dev release were not replaced.
echo "GUARD legacy API unchanged"
[[ "$(readlink -f /opt/sphere/current 2>/dev/null || true)" = "$LEGACY_API" ]] || { echo "GUARD FAILED legacy API changed" >&2; exit 1; }
echo "GUARD PASS legacy API unchanged"

echo "GUARD DEV API unchanged"
[[ "$(readlink -f /opt/sphere-rundeck-dev/current 2>/dev/null || true)" = "$DEV_API" ]] || { echo "GUARD FAILED DEV API changed" >&2; exit 1; }
echo "GUARD PASS DEV API unchanged"

echo "GUARD DEV web unchanged"
[[ "$(readlink -f /var/www/sphere-dev/current 2>/dev/null || true)" = "$DEV_WEB" ]] || { echo "GUARD FAILED DEV web changed" >&2; exit 1; }
echo "GUARD PASS DEV web unchanged"

# Retain a bounded rollback window for production Rundeck API and web releases.
KEEP=5
prune_releases() {
  local root=$1
  local current=$2
  local keep=$3
  local kept=0
  local path
  local -a releases=()
  [[ -d "$root" ]] || return 0
  mapfile -t releases < <(find "$root" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr | awk '{print $2}')
  for path in "${releases[@]}"; do
    if [[ "$path" == "$current" ]]; then
      kept=$((kept + 1))
      continue
    fi
    if (( kept < keep )); then
      kept=$((kept + 1))
      continue
    fi
    rm -rf -- "$path"
  done
}
prune_releases "$API_RELEASES" "$(readlink -f "$API_CURRENT")" "$KEEP"
prune_releases "$WEB_RELEASES" "$(readlink -f "$WEB_CURRENT")" "$KEEP"

trap - ERR
printf '\nPRODUCTION DEPLOY SUCCESS\nREVISION %s\nWEB %s\nRUNDECK API %s\nLEGACY API UNCHANGED %s\nDEV UNCHANGED %s\nROLLBACK WEB %s\n' \
  "$REVISION" "$(readlink -f "$WEB_CURRENT")" "$(readlink -f "$API_CURRENT")" "$LEGACY_API" "$DEV_API" "${PREVIOUS_WEB:-none}"
