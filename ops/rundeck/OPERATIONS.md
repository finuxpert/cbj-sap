# SPHERE Rundeck Development Operations

This runbook applies only to `rundeck-sphere-dev` and the isolated `/dev` runtime.

## Deployment

Run QA before activation:

```bash
cd /root/rundeck-sphere-dev
git pull --ff-only origin rundeck-sphere-dev
bash -n ops/rundeck/deploy-dev.sh
/opt/sphere-rundeck-dev/venv/bin/python -m unittest backend.tests.test_rundeck
npm run qa
bash ops/rundeck/deploy-dev.sh
```

`deploy-dev.sh` stages the backend and frontend release, validates Nginx, activates the
new symlinks, performs API and browser smoke checks, and automatically restores the
previous `/dev` symlinks and Nginx configuration when activation fails. Production
symlinks and the production index hash are verified unchanged on every successful deploy.

The release janitor retains `SPHERE_RELEASES_KEEP` revisions, default `5`, under both:

- `/opt/sphere-rundeck-dev/releases`
- `/var/www/sphere-dev/releases`

## Rundeck credentials

Never place Rundeck tokens in Git, frontend code, browser storage, or application logs.

Reader credential:

- source file: `/etc/sphere/rundeck-readonly.token`
- runtime credential name: `rundeck-reader`
- consumer: `sphere-rundeck-poller.service`
- intended ACL: execution and output read only for the approved SPHERE job scope

Runner credential:

- source file: `/etc/sphere/rundeck-runner.token`
- runtime credential name: `rundeck-runner`
- consumer: `sphere-rundeck-api.service` only when the source file exists
- intended ACL: run and execution read only for the exact approved SPHERE job

The deploy script enforces `root:sphere` ownership and mode `0640`. The Python runtime
prefers systemd's `$CREDENTIALS_DIRECTORY` and keeps the configured token file only as a
rollout fallback.

Keep `RUNDECK_COLLECT_NOW_ENABLED=false` until an authenticated user identity is enforced
in front of the mutating API route.

## Collection-cycle consistency

`GET /dev/api/history/hosts/latest` returns APP1 through APP5 from one latest READY
Rundeck Collection Cycle. It must never assemble a landscape from independent per-host
latest rows. If the latest manifest and the latest database projection differ, the UI
withholds the operational host table until a complete aligned cycle is available.

## Platform Health

Operational status is exposed at:

```text
/dev/api/platform/health
```

Signals include:

- Rundeck collector state and credential mode
- filesystem usage
- inode usage
- raw evidence file count and size
- PostgreSQL size, connection count and long transactions
- WAL size when the PostgreSQL role is permitted to inspect it
- retention last success or last failure
- backup status marker
- backend and frontend release counts

The detailed Platform Health table is collapsed by default in the SAP cockpit.

## Retention

Raw evidence, rejected evidence, manifests and PostgreSQL monitoring history follow
`SPHERE_RETENTION_DAYS`, default `90` days. Maintenance is time-gated by
`SPHERE_MAINTENANCE_INTERVAL_SECONDS`, default `21600` seconds.

Successful maintenance writes:

```text
/var/lib/sphere/ingestion/maintenance.json
```

A retention exception writes only its failure type and timestamp to:

```text
/var/lib/sphere/ingestion/maintenance-error.json
```

No credential or Rundeck response body is written to either status file.

## Backup status contract

A future backup job can publish its latest state to
`SPHERE_BACKUP_STATUS_FILE`, default `/var/lib/sphere/ingestion/backup.json`.

Example:

```json
{
  "status": "OK",
  "last_success": "2026-09-10T18:00:00+07:00",
  "type": "pg_dump-and-raw-evidence"
}
```

Platform Health reports `NOT_CONFIGURED` until a backup job owns this marker. The health
endpoint does not perform backups itself.

## First checks during an incident

```bash
systemctl status sphere-rundeck-api.service sphere-rundeck-poller.timer sphere-rundeck-poller.service --no-pager -l
journalctl -u sphere-rundeck-api.service -u sphere-rundeck-poller.service -n 100 --no-pager
curl -fsS https://sphere.astraotoparts.co.id/dev/api/health
curl -fsS https://sphere.astraotoparts.co.id/dev/api/platform/health
```

Treat the PostgreSQL projection as query storage and the compressed Rundeck raw log as
RCA evidence. Do not delete the raw archive as a database-repair shortcut.
