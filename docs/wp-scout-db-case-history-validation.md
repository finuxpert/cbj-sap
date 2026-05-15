# SAP Intelligent RCA Workspace DB Migration Status

PostgreSQL is the source of truth for Case History on the DB-first flow:

- `/cases` and `/mobile/cases` must resolve from PostgreSQL when DB runtime is enabled.
- `/parsed-results-history` is DB-only when DB runtime is enabled.
- `/evidence-history` is DB-only when DB runtime is enabled.
- Legacy JSON under `/var/www/svr01-dev/sap-data/cases` is no longer the source of truth for Case History.
- File storage remains binary-evidence-only under `/var/www/svr01-dev/sap-data`.

## WP-SCOUT Manual Validation

Use SAPDEV after deploy and validate this exact sequence:

1. Open `https://sapdev.cbj-kontruksi.com/#/tool/comparer`.
2. Upload one or more WP-SCOUT files and click `Upload & Analyze`.
3. Confirm RCA analysis appears and `Create Case` becomes available only after a new title is filled.
4. Enter `New Case Title`, then click `Create Case`.
5. Confirm `Linked Case` changes from `Not linked yet` to `CASE-*`.
6. Confirm `Save to Case History` becomes enabled only after the case is linked.
7. Click `Save to Case History`.
8. Confirm parsed result save succeeds and linked evidence upload succeeds.
9. Confirm `Evidence History · postgres` appears and rows are shown for the uploaded WP-SCOUT evidence.
10. If no evidence exists yet for the current filter, confirm the empty state reads `No DB evidence found yet.`

## Backend Validation

Validate these endpoints on SAPDEV:

- `/sap-api/health`
  - `case_history = db`
  - `case_history_source_of_truth = postgres`
  - `file_storage_role = binary-evidence-only`
- `/sap-api/mobile/cases`
  - new `CASE-*` is present after create
- `/sap-api/cases/{CASE-*}`
  - linked `parsed_results` and `evidence` are present after explicit save
- `/sap-api/evidence-history?tool=comparer&limit=5`
  - `read_source = postgres`

## Grafana Views

The SQL file [`docs/sql/grafana-rca-views.sql`](docs/sql/grafana-rca-views.sql) defines:

- `grafana_rca_cases`
- `grafana_rca_parsed_results`
- `grafana_rca_evidence`
- `grafana_rca_case_summary`

These views are not auto-applied by the app. Apply them manually to `sap_rca_dev` during DEV rollout or DB migration work.
