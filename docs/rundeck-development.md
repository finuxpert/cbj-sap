# Rundeck development

Source: `rundeck-sphere-dev`, checkout `/root/rundeck-sphere-dev`, URL https://sphere.astraotoparts.co.id/dev/.
Production source: `sphere-prod`, checkout `/root/sphere-prod`; production is not redeployed.
`sphere-dev` is not deployed. `rundeck-sphere-prod` remains reserved until integration stabilizes.

## Runtime

Development webroot `/var/www/sphere-dev/current`, backend `/opt/sphere-rundeck-dev/current`, dedicated venv and API port 8091. Production webroot `/var/www/sphere.astraotoparts.co.id/current` and API port 8090 remain unchanged.

Storage `/var/lib/sphere/ingestion/{inbox,processing,archive,rejected,manifests}`. This data is outside Git. The development API mounts only read-only collection routes; existing PostgreSQL/evidence code and migrations are retained but production evidence writes are not routed from development. Case History API is not available in this isolated collection-only development service.

## Authentication and activation

Provide `/etc/sphere/rundeck-dev.env` using the example in `ops/rundeck`. The token must have read-only access to Project `Linux`, the collector job, execution history and output. Store the token in `/etc/sphere/rundeck-readonly.token`, readable by the `sphere` service account, never in Git or browser configuration.

The poller is configured by stable job identity rather than Job UUID:

- `RUNDECK_PROJECT=Linux`
- `RUNDECK_JOB_GROUP=SAP/AOP`
- `RUNDECK_JOB_NAME=[Critical]-[Daily Check] SPHERE SAP Work Proccess Check`
- five expected AOP hostnames

The current Job UUID is observed only for diagnostics and may change when the Rundeck workflow is recreated. A replacement workflow remains compatible when project, group and normalized job name stay the same.

The timer checks once a minute; Rundeck retains its existing ten-minute collection schedule. Initial activation ingests only the newest matching execution and does not backfill the historical execution backlog.

Only origin `http://10.14.55.205:4440` is used. HTTP redirects are rejected; no authentication bypass, SSH, SCP, mounts, or SAP connections.

## Verified connectivity

Validated on 2026-09-10 with the dedicated read-only token:

- API v44 execution `521054`: HTTP 200
- project: `Linux`
- status: `succeeded`
- successful nodes: 5/5 (`AOPH1PAPPDC` through `AOPH5PAPPDC`)
- execution output API: HTTP 200
- `completed=true`
- `execCompleted=true`
- 1,355 output entries
- node identity available per API entry
- SPHERE server to Rundeck API: HTTP 200
- development API `/dev/api/health`: HTTP 200
- production URL and development URL both remained HTTP 200

The poller uses `/api/44/project/<project>/executions` with stable job filters, then `/api/44/execution/<id>/output?format=json&offset=0`. It requires completed output and converts the returned log entries to plain text before passing them to the existing collection validator and JavaScript parser pipeline.

## Contract

Manifest: collection_id (`rundeck-<execution_id>`), execution_id, status, started_at, finished_at, expected_hosts (list), received_hosts (list), checksum (SHA-256), source (`rundeck`), created_at, size_bytes and raw_path. Additional error field is stored on rejected collections.

PROCESSING is resumable after interruption; terminal execution IDs are deduplicated. A successful execution with exactly the five expected hosts and complete V2.2 snapshot envelopes is READY. Fewer hosts yields PARTIAL. Failed executions, HTML, malformed/truncated envelopes, unexpected hosts and unsupported formats yield FAILED. Raw READY data goes to archive; other terminal data goes to rejected. A single poller lock prevents concurrent ingestion. Atomic manifest replacement publishes the raw artifact only after it exists. Latest selects READY by execution finish time, never PARTIAL.

The envelope validator is deliberately restricted to complete WP-SCOUT/V2.2 text. JavaScript metric parsers and RCA compatibility markers are unchanged. No metrics are parsed in Python.

## Read-only routes

- GET `/dev/api/health`
- GET `/dev/api/collections`
- GET `/dev/api/collections/latest`
- GET `/dev/api/collections/{collection_id}`
- GET `/dev/api/collections/{collection_id}/raw`

No new upload or mutating endpoint. Automatic mode fetches latest READY every minute and passes downloaded text through the same browser upload/parser pipeline. Manual Upload Logs stays available from the source selector. No READY collection shows an explicit waiting message.

## Validation and deployment

Run npm ci, lint, test, build and audit, Python syntax and ingestion tests, and Alembic migration validation before deployment. `ops/rundeck/deploy-dev.sh` requires a clean checkout of the correct branch and a build containing `/dev/assets/`; it preserves production symlink targets and index checksum, installs only the dedicated development services, adds `/dev` nginx locations, checks nginx syntax and smoke tests the development URL. System paths require host permissions.
