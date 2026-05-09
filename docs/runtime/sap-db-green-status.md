# SAP RCA PostgreSQL Hybrid DB - GREEN Status

Last validated: 2026-05-09 23:48 WIB
Environment: DEV
Repo branch: dev
API: https://sapdev.cbj-kontruksi.com/sap-api
Backend service: sap-evidence-api.service
PostgreSQL container: cbj-postgres-dev
Database: sap_rca_dev
Runtime mode: hybrid

## Current Status

PostgreSQL Hybrid DB is GREEN end-to-end on DEV.

Validated items:

- PostgreSQL DEV container is healthy.
- Database sap_rca_dev exists.
- App user sap_rca_app owns sap_rca_dev.
- App user has USAGE and CREATE on schema public.
- Alembic migration is applied.
- Migration version: 20260509_0001.
- Runtime API uses DB_MODE=hybrid.
- Runtime API uses SQLAlchemy driver style postgresql+psycopg.
- Runtime backend dependency is installed in backend-venv.
- /sap-api/health returns database status ok.
- POST /sap-api/cases writes to PostgreSQL with db_write.status = ok.
- JSON/file-backed migration script has been added and executed successfully.

## Latest Runtime Health

Expected health database block:

enabled=true
configured=true
mode=hybrid
status=ok

## Latest API Write Test

POST /sap-api/cases returned:

db_write.enabled=true
db_write.written=true
db_write.status=ok

Generated test case:

CASE-20260509-034 - DEV PostgreSQL Hybrid API Smoke

## JSON to PostgreSQL Migration Result

Migration script:

scripts/migrate-json-to-postgres.sh
backend/scripts/migrate_json_to_postgres.py

Migration source:

/var/www/svr01-dev/sap-data

Migration summary:

json_files=395
ok=true
errors=0
cases=194
evidence=145
parsed_results=1
reports=0
audit_logs=0

## Important Runtime Notes

- Do not commit /etc/sap-evidence-api/runtime.env.
- Do not commit /opt/postgres-sap-dev/.env.
- Do not commit .venv-db/.
- Do not remove JSON/file-backed fallback yet.
- PostgreSQL runtime env is injected through systemd drop-in:
  /etc/systemd/system/sap-evidence-api.service.d/10-postgres-runtime.conf
- Runtime env file:
  /etc/sap-evidence-api/runtime.env
- DB scripts use project-local virtualenv .venv-db.
- Backend service uses backend-venv.

## Related Commits

SAP repo:

35a03cc Stabilize SAP hybrid DB scripts
84a50b9 Add JSON to PostgreSQL migration script

Infra repo:

845456f Fix PostgreSQL DEV schema privileges

## Next Recommended Targets

1. Add API/listing support to read case history from PostgreSQL first, fallback JSON second.
2. Add Evidence History UI backed by /sap-api.
3. Add parsed result migration mapping if old parser JSON formats are identified.
4. Add backup job for sap_rca_dev.
5. Add safe rollback doc for switching DB_MODE=file if needed.
