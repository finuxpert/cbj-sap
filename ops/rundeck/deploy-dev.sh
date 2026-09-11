#!/usr/bin/env bash
set -Eeuo pipefail

SOURCE=/root/rundeck-sphere-dev
API_CURRENT=/opt/sphere-rundeck-dev/current
WEB_CURRENT=/var/www/sphere-dev/current
NGINX_SITE=/etc/nginx/sites-available/sphere.astraotoparts.co.id

# Guard the isolated development deployment with explicit diagnostics.
CURRENT_BRANCH="$(git -C "$SOURCE" branch --show-current)"
if [[ "$CURRENT_BRANCH" != "rundeck-sphere-dev" ]]; then
  echo "DEPLOY BLOCKED: expected branch rundeck-sphere-dev, found ${CURRENT_BRANCH:-unknown}" >&2
  exit 2
fi
if [[ -n "$(git -C "$SOURCE" status --porcelain)" ]]; then
  echo "DEPLOY BLOCKED: working tree is not clean" >&2
  git -C "$SOURCE" status --short >&2
  exit 2
fi

REVISION=$(git -C "$SOURCE" rev-parse HEAD)
RELEASE=/opt/sphere-rundeck-dev/releases/$REVISION
WEB=/var/www/sphere-dev/releases/$REVISION
PREVIOUS_API=$(readlink -f "$API_CURRENT" 2>/dev/null || true)
PREVIOUS_WEB=$(readlink -f "$WEB_CURRENT" 2>/dev/null || true)
PROD_WEB=$(readlink -f /var/www/sphere.astraotoparts.co.id/current)
PROD_API=$(readlink -f /opt/sphere/current)
PROD_RUNDECK_API=$(readlink -f /opt/sphere-rundeck-prod/current 2>/dev/null || true)
PROD_HASH=$(sha256sum "$PROD_WEB/index.html")
NGINX_BACKUP=$(mktemp /root/sphere-nginx-before-dev.XXXXXX)
cp "$NGINX_SITE" "$NGINX_BACKUP"

cleanup() {
  rm -f "$NGINX_BACKUP" \
    /tmp/sphere-dev-health.json \
    /tmp/sphere-dev-evaluation.json \
    /tmp/sphere-dev-platform.json \
    /tmp/sphere-dev-smoke.html \
    /tmp/sphere-dev-public-latest.json \
    /tmp/sphere-prod-public-latest.json \
    /tmp/sphere-prod-public-hosts.json \
    /tmp/sphere-prod-public-platform.json
}

rollback() {
  local status=$?
  trap - ERR
  set +e
  echo
  echo "DEPLOY FAILED - rolling back /dev"
  if [[ -n "$PREVIOUS_API" && -d "$PREVIOUS_API" ]]; then
    ln -sfn "$PREVIOUS_API" "$API_CURRENT"
  fi
  if [[ -n "$PREVIOUS_WEB" && -d "$PREVIOUS_WEB" ]]; then
    ln -sfn "$PREVIOUS_WEB" "$WEB_CURRENT"
  fi
  cp "$NGINX_BACKUP" "$NGINX_SITE"
  systemctl daemon-reload
  systemctl restart sphere-rundeck-api.service
  nginx -t >/dev/null 2>&1 && systemctl reload nginx
  if [[ "$RELEASE" != "$PREVIOUS_API" ]]; then
    rm -rf -- "$RELEASE"
  fi
  if [[ "$WEB" != "$PREVIOUS_WEB" ]]; then
    rm -rf -- "$WEB"
  fi
  echo "DEV ROLLED BACK TO $(basename "${PREVIOUS_API:-unknown}")"
  exit "$status"
}

assert_json_file() {
  local path="$1"
  python3 - "$path" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
raw = path.read_text(errors='replace')
if raw.lstrip().lower().startswith('<!doctype') or raw.lstrip().lower().startswith('<html'):
    raise SystemExit(f"HTML returned where JSON was required: {path}")
json.loads(raw)
PY
}

fetch_json() {
  local url="$1"
  local path="$2"
  curl --noproxy '*' -fsS --max-time 15 "$url" -o "$path"
  assert_json_file "$path"
}

trap rollback ERR
trap cleanup EXIT

test -f "$SOURCE/dist/index.html"
grep -q '/dev/assets/' "$SOURCE/dist/index.html"
install -d -m 0755 "$RELEASE" "$WEB"
git -C "$SOURCE" archive HEAD | tar -x -C "$RELEASE"
cp -a "$SOURCE/dist/." "$WEB/"
python3 -m compileall -q "$RELEASE/backend"

if ! test -x /opt/sphere-rundeck-dev/venv/bin/python; then
  /opt/sphere/tools/bin/uv venv --python /opt/sphere/current/.venv/bin/python /opt/sphere-rundeck-dev/venv
  /opt/sphere/tools/bin/uv pip install --python /opt/sphere-rundeck-dev/venv/bin/python -r "$RELEASE/backend/requirements.txt"
fi

install -d -o sphere -g sphere -m 0750 /var/lib/sphere/ingestion
for folder in inbox processing archive rejected manifests; do
  install -d -o sphere -g sphere -m 0750 "/var/lib/sphere/ingestion/$folder"
done

# Credentials stay server-side. systemd copies them into the private runtime
# credential directory; the legacy env paths remain fallback-only.
test -s /etc/sphere/rundeck-readonly.token
chown root:sphere /etc/sphere/rundeck-readonly.token
chmod 0640 /etc/sphere/rundeck-readonly.token
if test -s /etc/sphere/rundeck-runner.token; then
  chown root:sphere /etc/sphere/rundeck-runner.token
  chmod 0640 /etc/sphere/rundeck-runner.token
fi

# Database migration is opt-in and guarded by migrate-dev.sh against any non-dev DB.
RUN_DEV_MIGRATIONS="$(sed -n 's/^SPHERE_RUN_DEV_MIGRATIONS=//p' /etc/sphere/rundeck-dev.env 2>/dev/null | tail -n 1 | tr -d '\r' || true)"
if [[ "$RUN_DEV_MIGRATIONS" == "true" ]]; then
  "$RELEASE/ops/rundeck/migrate-dev.sh" "$RELEASE"
fi

# Replace only the DEV managed block. The updater refuses any legacy migration
# that would consume a production marker, preventing a DEV deploy from deleting
# the production /api routing block.
python3 "$RELEASE/ops/rundeck/update-nginx-block.py" \
  --site "$NGINX_SITE" \
  --snippet "$RELEASE/ops/rundeck/nginx-dev.conf" \
  --name DEV \
  --anchor '    location = /sap-api' \
  --legacy-marker '    # SPHERE isolated Rundeck development' \
  --protect '    # SPHERE production Rundeck API routing' \
  --protect '    # BEGIN SPHERE PROD ROUTING'

grep -q '# BEGIN SPHERE DEV ROUTING' "$NGINX_SITE"
grep -q '# END SPHERE DEV ROUTING' "$NGINX_SITE"
grep -Eq '# SPHERE production Rundeck API routing|# BEGIN SPHERE PROD ROUTING' "$NGINX_SITE"
nginx -t

install -m 0644 "$RELEASE/ops/rundeck/sphere-rundeck-api.service" /etc/systemd/system/
install -m 0644 "$RELEASE/ops/rundeck/sphere-rundeck-poller.service" /etc/systemd/system/
install -m 0644 "$RELEASE/ops/rundeck/sphere-rundeck-poller.timer" /etc/systemd/system/

# Runner credential is optional while Collect Now remains disabled.
install -d -m 0755 /etc/systemd/system/sphere-rundeck-api.service.d
RUNNER_DROPIN=/etc/systemd/system/sphere-rundeck-api.service.d/10-rundeck-runner-credential.conf
if test -s /etc/sphere/rundeck-runner.token; then
  cat > "$RUNNER_DROPIN" <<'EOF'
[Service]
LoadCredential=rundeck-runner:/etc/sphere/rundeck-runner.token
EOF
  chmod 0644 "$RUNNER_DROPIN"
else
  rm -f "$RUNNER_DROPIN"
fi

systemctl daemon-reload

# Transactional activation. Any failing command below triggers rollback().
ln -sfn "$RELEASE" "$API_CURRENT"
ln -sfn "$WEB" "$WEB_CURRENT"
systemctl enable sphere-rundeck-api.service sphere-rundeck-poller.timer >/dev/null
systemctl restart sphere-rundeck-api.service
systemctl enable --now sphere-rundeck-poller.timer >/dev/null
systemctl start sphere-rundeck-poller.service
systemctl reload nginx

# Local API restart is allowed a bounded warm-up window.
HEALTH_OK=0
for attempt in {1..20}; do
  if curl --noproxy '*' -fsS --max-time 3 http://127.0.0.1:8091/health -o /tmp/sphere-dev-health.json 2>/dev/null; then
    HEALTH_OK=1
    break
  fi
  sleep 1
done
test "$HEALTH_OK" = 1
assert_json_file /tmp/sphere-dev-health.json
cat /tmp/sphere-dev-health.json

# Evaluation SQL is part of the release contract.
fetch_json 'http://127.0.0.1:8091/evaluation/workloads?period=1d&type=ALL&limit=5' /tmp/sphere-dev-evaluation.json
grep -q '"period":"1d"' /tmp/sphere-dev-evaluation.json
grep -q '"wp_excess_association_pct"' /tmp/sphere-dev-evaluation.json
cat /tmp/sphere-dev-evaluation.json

# Public DEV web and API must both resolve through Nginx.
curl --noproxy '*' -fsS --max-time 10 https://sphere.astraotoparts.co.id/dev/ -o /tmp/sphere-dev-smoke.html
grep -q '/dev/assets/' /tmp/sphere-dev-smoke.html
fetch_json 'https://sphere.astraotoparts.co.id/dev/api/collections/latest' /tmp/sphere-dev-public-latest.json
grep -q '"collection_id"' /tmp/sphere-dev-public-latest.json

# Cross-environment contract: a DEV deploy is not successful unless the existing
# production Rundeck routes still return JSON. This specifically prevents the
# HTML-as-JSON incident caused by an over-broad Nginx block replacement.
fetch_json 'https://sphere.astraotoparts.co.id/api/collections/latest' /tmp/sphere-prod-public-latest.json
grep -q '"collection_id"' /tmp/sphere-prod-public-latest.json
fetch_json 'https://sphere.astraotoparts.co.id/api/history/hosts/latest' /tmp/sphere-prod-public-hosts.json
fetch_json 'https://sphere.astraotoparts.co.id/api/platform/health' /tmp/sphere-prod-public-platform.json
grep -q '"status"' /tmp/sphere-prod-public-platform.json

test "$(readlink -f /var/www/sphere.astraotoparts.co.id/current)" = "$PROD_WEB"
test "$(readlink -f /opt/sphere/current)" = "$PROD_API"
if [[ -n "$PROD_RUNDECK_API" ]]; then
  test "$(readlink -f /opt/sphere-rundeck-prod/current 2>/dev/null || true)" = "$PROD_RUNDECK_API"
fi
test "$(sha256sum "$PROD_WEB/index.html")" = "$PROD_HASH"

# Keep a bounded rollback window instead of accumulating every deploy forever.
KEEP="$(sed -n 's/^SPHERE_RELEASES_KEEP=//p' /etc/sphere/rundeck-dev.env 2>/dev/null | tail -n 1 | tr -d '\r' || true)"
[[ "$KEEP" =~ ^[1-9][0-9]*$ ]] || KEEP=5
prune_releases() {
  local root=$1
  local current=$2
  local keep=$3
  local kept=0
  local path
  local -a releases=()
  mapfile -t releases < <(
    find "$root" -mindepth 1 -maxdepth 1 -type d -regextype posix-extended -regex '.*/[0-9a-f]{40}' -printf '%T@ %p\n' \
      | sort -nr | awk '{print $2}'
  )
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
prune_releases /opt/sphere-rundeck-dev/releases "$(readlink -f "$API_CURRENT")" "$KEEP"
prune_releases /var/www/sphere-dev/releases "$(readlink -f "$WEB_CURRENT")" "$KEEP"

# Report platform health only after release cleanup so the visible count is final.
fetch_json 'https://sphere.astraotoparts.co.id/dev/api/platform/health' /tmp/sphere-dev-platform.json
cat /tmp/sphere-dev-platform.json

trap - ERR
printf '\nPRODUCTION ROUTING VERIFIED\nPRODUCTION UNCHANGED\nDEV REVISION %s\nROLLBACK READY %s\nRELEASES RETAINED %s\n' \
  "$REVISION" "$(basename "${PREVIOUS_API:-none}")" "$KEEP"
