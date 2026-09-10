#!/usr/bin/env bash
set -euo pipefail
SOURCE=/root/rundeck-sphere-dev
test "$(git -C "$SOURCE" branch --show-current)" = rundeck-sphere-dev
test -z "$(git -C "$SOURCE" status --porcelain)"
REVISION=$(git -C "$SOURCE" rev-parse HEAD)
RELEASE=/opt/sphere-rundeck-dev/releases/$REVISION
WEB=/var/www/sphere-dev/releases/$REVISION
PROD_WEB=$(readlink -f /var/www/sphere.astraotoparts.co.id/current)
PROD_API=$(readlink -f /opt/sphere/current)
PROD_HASH=$(sha256sum "$PROD_WEB/index.html")
test -f "$SOURCE/dist/index.html"
grep -q '/dev/assets/' "$SOURCE/dist/index.html"
install -d -m 0755 "$RELEASE" "$WEB"
git -C "$SOURCE" archive HEAD | tar -x -C "$RELEASE"
cp -a "$SOURCE/dist/." "$WEB/"
if ! test -x /opt/sphere-rundeck-dev/venv/bin/python; then
  /opt/sphere/tools/bin/uv venv --python /opt/sphere/current/.venv/bin/python /opt/sphere-rundeck-dev/venv
  /opt/sphere/tools/bin/uv pip install --python /opt/sphere-rundeck-dev/venv/bin/python -r "$RELEASE/backend/requirements.txt"
fi
install -d -o sphere -g sphere -m 0750 /var/lib/sphere/ingestion
for folder in inbox processing archive rejected manifests; do
  install -d -o sphere -g sphere -m 0750 "/var/lib/sphere/ingestion/$folder"
done
ln -sfn "$RELEASE" /opt/sphere-rundeck-dev/current
ln -sfn "$WEB" /var/www/sphere-dev/current

# Database migration is explicitly opt-in during /dev rollout. migrate-dev.sh
# refuses any DATABASE_URL that does not name the isolated Rundeck dev database.
RUN_DEV_MIGRATIONS="$(sed -n 's/^SPHERE_RUN_DEV_MIGRATIONS=//p' /etc/sphere/rundeck-dev.env 2>/dev/null | tail -n 1 | tr -d '\r' || true)"
if [[ "$RUN_DEV_MIGRATIONS" == "true" ]]; then
  "$RELEASE/ops/rundeck/migrate-dev.sh" "$RELEASE"
fi

install -m 0644 "$RELEASE/ops/rundeck/sphere-rundeck-api.service" /etc/systemd/system/
install -m 0644 "$RELEASE/ops/rundeck/sphere-rundeck-poller.service" /etc/systemd/system/
install -m 0644 "$RELEASE/ops/rundeck/sphere-rundeck-poller.timer" /etc/systemd/system/
python3 - <<'PY'
from pathlib import Path

p = Path('/etc/nginx/sites-available/sphere.astraotoparts.co.id')
s = p.read_text()
marker = '    # SPHERE isolated Rundeck development\n'
anchor = '    location = /sap-api'
snippet = Path('/opt/sphere-rundeck-dev/current/ops/rundeck/nginx-dev.conf').read_text().rstrip() + '\n'
assert anchor in s
Path('/root/sphere-nginx-before-dev.conf').write_text(s)
if marker in s:
    start = s.index(marker)
    end = s.index(anchor, start)
    s = s[:start] + marker + snippet + '\n' + s[end:]
else:
    s = s.replace(anchor, marker + snippet + '\n' + anchor, 1)
p.write_text(s)
PY
if ! nginx -t; then
  cp /root/sphere-nginx-before-dev.conf /etc/nginx/sites-available/sphere.astraotoparts.co.id
  exit 1
fi
systemctl daemon-reload
systemctl enable --now sphere-rundeck-api.service sphere-rundeck-poller.timer
systemctl restart sphere-rundeck-api.service
systemctl start sphere-rundeck-poller.service
systemctl reload nginx
test "$(readlink -f /var/www/sphere.astraotoparts.co.id/current)" = "$PROD_WEB"
test "$(readlink -f /opt/sphere/current)" = "$PROD_API"
test "$(sha256sum "$PROD_WEB/index.html")" = "$PROD_HASH"
for attempt in {1..10}; do
  if curl --noproxy '*' -fsS http://127.0.0.1:8091/health; then break; fi
  sleep 1
done
curl --noproxy '*' -fsS https://sphere.astraotoparts.co.id/dev/api/health
curl --noproxy '*' -fsS https://sphere.astraotoparts.co.id/dev/ -o /tmp/sphere-dev-smoke.html
grep -q '/dev/assets/' /tmp/sphere-dev-smoke.html
printf '\nPRODUCTION UNCHANGED\nDEV REVISION %s\n' "$REVISION"
