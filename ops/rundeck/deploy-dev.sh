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
PROD_HASH=$(sha256sum "$PROD_WEB/index.html")
NGINX_BACKUP=$(mktemp /root/sphere-nginx-before-dev.XXXXXX)
cp "$NGINX_SITE" "$NGINX_BACKUP"

cleanup() {
  rm -f "$NGINX_BACKUP" /tmp/sphere-dev-health.json /tmp/sphere-dev-evaluation.json /tmp/sphere-dev-platform.json /tmp/sphere-dev-smoke.html
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

# Prepare candidate Nginx config before changing current release symlinks.
python3 - "$NGINX_SITE" "$RELEASE/ops/rundeck/nginx-dev.conf" <<'PY'
from pathlib import Path
import sys

p = Path(sys.argv[1])
snippet_path = Path(sys.argv[2])
s = p.read_text()
marker = '    # SPHERE isolated Rundeck development\n'
anchor = '    location = /sap-api'
snippet = snippet_path.read_text().rstrip() + '\n'
assert anchor in s
if marker in s:
    start = s.index(marker)
    end = s.index(anchor, start)
    s = s[:start] + marker + snippet + '\n' + s[end:]
else:
    s = s.replace(anchor, marker + snippet + '\n' + anchor, 1)
p.write_text(s)
PY
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

# Local API restart is allowed a bounded warm-up window; transient connection
# refusals are suppressed so deployment output only reports a real failure.
HEALTH_OK=0
for attempt in {1..20}; do
  if curl --noproxy '*' -fsS --max-time 3 http://127.0.0.1:8091/health -o /tmp/sphere-dev-health.json 2>/dev/null; then
    HEALTH_OK=1
    break
  fi
  sleep 1
done
test "$HEALTH_OK" = 1
cat /tmp/sphere-dev-health.json

# v1.19+ evaluation SQL is part of the release contract. Fail and roll back if
# the endpoint cannot evaluate the current 1-day window against the existing DB.
curl --noproxy '*' -fsS --max-time 15 \
  'http://127.0.0.1:8091/evaluation/workloads?period=1d&type=ALL&limit=5' \
  -o /tmp/sphere-dev-evaluation.json
grep -q '"period":"1d"' /tmp/sphere-dev-evaluation.json
cat /tmp/sphere-dev-evaluation.json

curl --noproxy '*' -fsS --max-time 10 https://sphere.astraotoparts.co.id/dev/ -o /tmp/sphere-dev-smoke.html
grep -q '/dev/assets/' /tmp/sphere-dev-smoke.html

test "$(readlink -f /var/www/sphere.astraotoparts.co.id/current)" = "$PROD_WEB"
test "$(readlink -f /opt/sphere/current)" = "$PROD_API"
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
curl --noproxy '*' -fsS --max-time 10 https://sphere.astraotoparts.co.id/dev/api/platform/health -o /tmp/sphere-dev-platform.json
cat /tmp/sphere-dev-platform.json

trap - ERR
printf '\nPRODUCTION UNCHANGED\nDEV REVISION %s\nROLLBACK READY %s\nRELEASES RETAINED %s\n' \
  "$REVISION" "$(basename "${PREVIOUS_API:-none}")" "$KEEP"
