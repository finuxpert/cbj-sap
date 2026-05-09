# SAP RCA PostgreSQL Hybrid DB Green Status

Checked at: 2026-05-09

## Result

PostgreSQL Hybrid DB validation is GREEN.

## Confirmed

- PostgreSQL container `cbj-postgres-dev` is healthy.
- `/opt/postgres-sap-dev/.env` contains required app DB credentials.
- `sap_rca_dev` owner is `sap_rca_app`.
- `sap_rca_app` has USAGE and CREATE privilege on schema `public`.
- Alembic migration completed successfully.
- Initial SAP RCA schema exists:
  - alembic_version
  - audit_logs
  - case_analytics_cache
  - cases
  - evidence
  - parsed_results
  - reports
- DB layer smoke test succeeded:
  - check_database(): ok
  - upsert_case_best_effort(): ok
  - upsert_evidence_best_effort(): ok
  - insert_parsed_result_best_effort(): ok

## Smoke Rows

- CASE-SMOKE-DB-LAYER
- evidence-smoke-db-layer
- parsed-smoke-db-layer

## Important Runtime Fixes Found

- Use virtualenv on Ubuntu 24.04 because system pip is blocked by PEP 668.
- Use SQLAlchemy driver URL `postgresql+psycopg://` because repo dependency uses `psycopg[binary]`, not `psycopg2`.
- Ensure database/schema ownership and privileges before running Alembic.
