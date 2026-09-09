# SPHERE PostgreSQL Hybrid Continuation

Last updated: 2026-05-09
Branch: dev
Project: SAP Intelligent RCA Workspace

## Current Status

PostgreSQL Hybrid DB validation is GREEN on DEV.

Reference status file:

```text
docs/runtime/sap-db-green-status.md
```

Confirmed:

- PostgreSQL container `cbj-postgres-dev` is healthy.
- Local credential file exists at `/opt/postgres-sap-dev/.env` on the server only.
- Target database `sap_rca_dev` exists.
- App DB user `sap_rca_app` owns `sap_rca_dev`.
- `sap_rca_app` has schema `public` usage/create privilege.
- Alembic migration completed successfully.
- Migration version is `20260509_0001`.
- DB layer smoke test succeeded.

Created tables:

```text
alembic_version
audit_logs
case_analytics_cache
cases
evidence
parsed_results
reports
```

Smoke rows:

```text
CASE-SMOKE-DB-LAYER
evidence-smoke-db-layer
parsed-smoke-db-layer
```

## Important Runtime Findings

1. Ubuntu 24.04 blocks direct system pip usage because of PEP 668.
   - Migration and smoke scripts should use a project-local Python virtual environment.

2. The backend dependency uses psycopg v3.
   - Runtime DB URLs must use the SQLAlchemy psycopg v3 driver style.
   - Do not rely on psycopg2 unless the dependency is intentionally added.

3. Alembic requires schema create privilege.
   - Database owner and public schema privilege must be corrected before migration.

4. File-backed JSON remains fallback.
   - Do not remove file-backed case/evidence storage yet.

## Next Engineering Tasks

1. Patch `scripts/run-sap-db-migration.sh` permanently:
   - use project-local virtualenv;
   - use psycopg v3 SQLAlchemy driver;
   - keep credentials local only;
   - output status without secrets.

2. Patch `scripts/test-sap-db-layer.sh` permanently:
   - use the same virtualenv path;
   - use psycopg v3 SQLAlchemy driver;
   - keep short smoke output.

3. Patch infra repo `finuxpert/infra` script `scripts/setup-postgres-dev.sh`:
   - ensure app users exist;
   - ensure databases exist;
   - ensure database owner is app user;
   - ensure schema `public` has usage/create privilege for app user.

4. Deploy `dev` to SAP DEV.

5. Validate public backend health:

```bash
curl -s https://sapdev.cbj-kontruksi.com/sap-api/health | jq
```

6. Validate API hybrid write:
   - create a case through `/sap-api/cases`;
   - confirm response has `db_write.status = ok`;
   - confirm row exists in PostgreSQL.

7. Create JSON-to-PostgreSQL migration script for old file-backed case history.

8. Later add DB read path behind fallback, but do not remove JSON fallback.

## Guardrails

- Incremental patch only.
- Do not touch PROD.
- Do not commit `.env`, tokens, private keys, or DB passwords.
- Do not commit `.venv-db/`.
- Do not reintroduce MutationObserver/runtime DOM injectors.
- Do not rewrite large frontend modules during DB stabilization.
