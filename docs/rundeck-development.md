# Rundeck development

Source: `rundeck-sphere-dev`, checkout `/root/rundeck-sphere-dev`, URL https://sphere.astraotoparts.co.id/dev/.
Production source: `sphere-prod`, checkout `/root/sphere-prod`; production is not redeployed.
`sphere-dev` is not deployed. `rundeck-sphere-prod` remains reserved until integration stabilizes.

## Runtime

Development webroot `/var/www/sphere-dev/current`, backend `/opt/sphere-rundeck-dev/current`, dedicated venv and API port 8091. Production webroot `/var/www/sphere.astraotoparts.co.id/current` and API port 8090 remain unchanged.

Storage `/var/lib/sphere/ingestion/{inbox,processing,archive,rejected,manifests}`. This data is outside Git. The development API mounts only read-only collection routes; existing PostgreSQL/evidence code and migrations are retained but production evidence writes are not routed from development. Case History API is not available in this isolated collection-only development service.

## Authentication and activation

Provide `/etc/sphere/rundeck-dev.env` using the example in ops/rundeck. Token must have read-only access to Project Linux, the collector job, executions and output. Store the token in a server file readable by the sphere service account, never in Git or browser configuration. Set the exact collector Job ID and five expected hostnames; sample fixture names must not be used. The timer checks once a minute; Rundeck retains its existing ten-minute collection schedule. Without these values the poller reports NOT_CONFIGURED and does not contact Rundeck.

Only origin http://10.14.55.205:4440 is used. HTTP redirects are rejected; no authentication bypass, SSH, SCP, mounts, or SAP connections. Discovery uses the project executions API with a job filter and pagination, following https://docs.rundeck.com/docs/api/. Downloads use `/project/Linux/execution/downloadOutput/<id>`. Actual token compatibility with this UI download route still needs verification against the existing server.

Connectivity on 2026-09-10: TCP PASS. Root, execution 521054 and Download Output all returned HTTP 302 to `/user/login`, zero-byte body, no Content-Type or Content-Disposition. Actual output format is unverified. Do not describe the ingestion as operational until authenticated output is validated.

## Contract

Manifest: collection_id (`rundeck-<execution_id>`), execution_id, status, started_at, finished_at, expected_hosts (list), received_hosts (list), checksum (SHA-256), source (`rundeck`), created_at, size_bytes and raw_path. Additional error field is stored on rejected collections.

PROCESSING is resumable after interruption; terminal execution IDs are deduplicated. A successful execution with exactly the five expected hosts and complete V2.2 snapshot envelopes is READY. Fewer hosts yields PARTIAL. Failed executions, HTML, malformed/truncated envelopes, unexpected hosts and unsupported formats yield FAILED. Raw READY data goes to archive; other terminal data goes to rejected. A single poller lock prevents concurrent ingestion. Atomic manifest replacement publishes the raw artifact only after it exists. Latest selects READY by execution finish time, never PARTIAL.

The initial envelope validator is deliberately restricted to complete WP-SCOUT/V2.2 text. Format support must be confirmed using actual authenticated Download Output before activation; older formats and prefixed/interleaved output are not silently accepted. JavaScript metric parsers and RCA compatibility markers are unchanged. No metrics are parsed in Python.

## Read-only routes

- GET `/dev/api/health`
- GET `/dev/api/collections`
- GET `/dev/api/collections/latest`
- GET `/dev/api/collections/{collection_id}`
- GET `/dev/api/collections/{collection_id}/raw`

No new upload or mutating endpoint. Automatic mode fetches latest READY every minute and passes downloaded text through the same browser upload/parser pipeline. Manual Upload Logs stays available from the source selector. No READY collection shows an explicit waiting message.

## Validation and deployment

Run npm ci, lint, test, build and audit, Python syntax and ingestion tests, and Alembic migration validation before deployment. `ops/rundeck/deploy-dev.sh` requires a clean checkout of the correct branch and a build containing `/dev/assets/`; it preserves production symlink targets and index checksum, installs only the dedicated development services, adds `/dev` nginx locations, checks nginx syntax and smoke tests the development URL. System paths require host permissions.
