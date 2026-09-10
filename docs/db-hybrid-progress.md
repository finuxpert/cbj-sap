# SPHERE PostgreSQL Hybrid Progress

Last updated: 2026-05-09
Branch: `dev`
Project: SAP Intelligent RCA Workspace

## Current Objective

Move SAP Intelligent RCA Workspace from purely file-backed evidence/case history toward a safe PostgreSQL hybrid model.

The migration strategy is intentionally incremental:

1. Keep existing JSON/file-backed behavior working.
2. Add optional PostgreSQL connectivity.
3. Add schema/migration foundation.
4. Add best-effort DB repository writes.
5. Enable endpoint hybrid-write without breaking existing API flow.
6. Later migrate old JSON cases into PostgreSQL.

## Important Rule

Do not rewrite the whole app. Continue with small, rollback-safe patches.

Do not reintroduce:

- MutationObserver runtime injectors
- recursive DOM injectors
- old dashboard enhancer files
- large delayed UI patching

These previously caused blank screens, stuck loading, render lag, and mobile freeze.

## PostgreSQL DEV Foundation

The infra repo now contains PostgreSQL DEV setup assets:

- Repo: `finuxpert/infra`
- Script: `scripts/setup-postgres-dev.sh`
- Workflow: `.github/workflows/setup-postgres-dev.yml`
- Target runner/server: `svr-01`
- Target action: `setup-and-status`

Expected server path after setup:

```text
/opt/postgres-sap-dev
├── docker-compose.yml
├── .env
├── data/
├── backups/
└── connection-info.txt
```

Expected container:

```text
cbj-postgres-dev
postgres:16-alpine
127.0.0.1:5432:5432
```

Expected databases:

```text
sap_rca_dev
portal_dev
trading_ai_dev
shared_dev
```

Expected application users:

```text
sap_rca_app
portal_app
trading_app
shared_app
```

Credential location on server only:

```text
/opt/postgres-sap-dev/.env
```

Do not commit credentials to GitHub.

## SPHERE Backend DB Foundation

Files added/updated in `finuxpert/sphere` branch `dev`:

```text
backend/requirements.txt
backend/db/__init__.py
backend/db/session.py
backend/db/models.py
backend/db/repositories.py
backend/alembic.ini
backend/db/migrations/env.py
backend/db/migrations/script.py.mako
backend/db/migrations/versions/20260509_0001_initial_sap_rca_schema.py
```

Python dependencies added:

```text
SQLAlchemy
psycopg[binary]
alembic
```

Initial PostgreSQL schema:

```text
cases
evidence
parsed_results
reports
audit_logs
case_analytics_cache
alembic_version
```

## Optional DB Health

`backend/evidence_api.py` now exposes optional database status in `/health`.

Expected if DB is not configured:

```json
{
  "case_history": "file-backed",
  "database": {
    "enabled": false,
    "configured": false,
    "status": "not_configured"
  }
}
```

Expected if DB is configured and reachable:

```json
{
  "case_history": "hybrid",
  "database": {
    "enabled": true,
    "configured": true,
    "mode": "hybrid",
    "status": "ok"
  }
}
```

## Best-Effort DB Repository Layer

File:

```text
backend/db/repositories.py
```

Functions:

```text
upsert_case_best_effort()
upsert_evidence_best_effort()
insert_parsed_result_best_effort()
```

Design:

- If DB is disabled, return disabled status.
- If DB errors, return error status.
- Do not break existing file-backed API flow.
- Existing JSON/files remain the compatibility fallback.

## Hybrid Writes Enabled

Commit:

```text
8c85f31ac9ed57fc7d88f228d61de8303ea0c8c3
Enable best-effort hybrid database writes
```

`backend/evidence_api.py` now attempts best-effort PostgreSQL writes for:

```text
POST /cases
PATCH /cases/{case_id}
POST /cases/{case_id}/parsed-results
POST /upload
POST /evidence/{evidence_id}
```

Responses now include `db_write` for troubleshooting.

Expected if DB is disabled:

```json
{
  "ok": true,
  "db_write": {
    "enabled": false,
    "written": false,
    "status": "disabled"
  }
}
```

Expected if DB write succeeds:

```json
{
  "ok": true,
  "db_write": {
    "enabled": true,
    "written": true,
    "status": "ok"
  }
}
```

## Migration Runner

Script:

```text
scripts/run-sap-db-migration.sh
```

Workflow:

```text
.github/workflows/sap-db-migration.yml
```

Purpose:

- Read local DB credential from `/opt/postgres-sap-dev/.env`
- Set `DATABASE_URL`
- Install backend requirements
- Run Alembic migration
- Collect table/status output
- Write runtime status to:

```text
/home/sadmin/sap/runtime-status/sap-db-migration-status.md
```

Workflow copies runtime status into repo path:

```text
docs/runtime/sap-db-migration-status.md
```

## DB Layer Smoke Test

Script:

```text
scripts/test-sap-db-layer.sh
```

Workflow:

```text
.github/workflows/sap-db-layer-smoke.yml
```

Purpose:

- Test `check_database()`
- Test `upsert_case_best_effort()`
- Test `upsert_evidence_best_effort()`
- Test `insert_parsed_result_best_effort()`

Smoke objects:

```text
CASE-SMOKE-DB-LAYER
evidence-smoke-db-layer
parsed-smoke-db-layer
```

Expected success:

```json
{
  "database": { "enabled": true, "status": "ok" },
  "case_write": { "written": true, "status": "ok" },
  "evidence_write": { "written": true, "status": "ok" },
  "parsed_result_write": { "written": true, "status": "ok" }
}
```

## GitHub Connector Limitation Encountered

The ChatGPT GitHub connector can edit repository files and read workflow run details if a `run_id` is provided.

However, it does not expose a working `workflow_dispatch` tool in this chat, and push-triggered auto-once workflows created from the connector did not produce readable workflow runs/status files.

Therefore, workflows must be triggered from GitHub UI or by an existing run ID supplied by the user.

## Correct Execution Order

Run from GitHub UI or server:

1. Infra PostgreSQL DEV setup:

```text
Repo: finuxpert/infra
Workflow: Setup PostgreSQL DEV
Runner: svr-01
Action: setup-and-status
```

2. SAP DB migration:

```text
Repo: finuxpert/sphere
Workflow: SPHERE DB Migration
Runner: sapdev-pc-runner
Action: migrate-and-status
```

3. SAP DB layer smoke test:

```text
Repo: finuxpert/sphere
Workflow: SPHERE DB Layer Smoke Test
Runner: sapdev-pc-runner
```

4. Deploy SAP DEV after DB health/migration/smoke is green.

5. Test API:

```bash
curl -s https://sapdev.cbj-kontruksi.com/sap-api/health | jq
```

6. Test create case and confirm `db_write.status`.

## Manual Server Commands If Needed

PostgreSQL DEV setup on `svr-01`:

```bash
cd /tmp && rm -rf infra-run && \
git clone git@github.com:finuxpert/infra.git infra-run && \
cd infra-run && \
chmod +x scripts/setup-postgres-dev.sh && \
scripts/setup-postgres-dev.sh
```

SAP migration on SAP server:

```bash
cd /home/sadmin/sap
git fetch origin
git checkout dev
git pull origin dev
chmod +x scripts/run-sap-db-migration.sh
scripts/run-sap-db-migration.sh
```

DB smoke test:

```bash
cd /home/sadmin/sap
git pull origin dev
chmod +x scripts/test-sap-db-layer.sh
scripts/test-sap-db-layer.sh
cat /home/sadmin/sap/runtime-status/sap-db-layer-smoke-status.md
```

## Next Engineering Tasks

1. Confirm PostgreSQL DEV container exists and health is OK.
2. Confirm Alembic migration created tables.
3. Confirm DB layer smoke test writes rows successfully.
4. Deploy branch `dev` to SAP DEV environment.
5. Validate `/sap-api/health` shows database status.
6. Validate `POST /cases` returns `db_write.status = ok`.
7. Create JSON-to-PostgreSQL migration script for old case history.
8. Later add DB read path behind fallback, but do not remove JSON fallback yet.
