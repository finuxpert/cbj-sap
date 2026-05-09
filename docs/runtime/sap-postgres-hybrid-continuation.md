# SAP Intelligent RCA Workspace - PostgreSQL Hybrid DB Continuation

Last updated: 2026-05-10

Repo:
- GitHub: finuxpert/cbj-sap
- Branch: dev
- Local path: /home/sadmin/sap
- DEV URL: https://sapdev.cbj-kontruksi.com
- Backend API prefix: /sap-api
- Backend service: sap-evidence-api.service

Rules:
- Incremental only.
- Do not rewrite large parts.
- Do not touch PROD.
- Do not delete JSON/file-backed fallback yet.
- Do not reintroduce MutationObserver/runtime injector/recursive DOM injector.
- Do not commit .env, token, private key, password, .venv-db, runtime-status, generated runtime output, or backup files.
- Do not expose credentials.
- Keep frontend behavior compatible.

Current GREEN Status:
- Git synced: dev with origin/dev.
- Latest known sync state: ## dev...origin/dev.

Important commits:
- 2a45d59 Add parsed results history mini panel
- 06f8e00 Extract DB-first read helpers
- 77cf204 Add DB-first parsed results history endpoint
- c36a3f4 Add DB-backed evidence history panel
- 4fecd9c Add PostgreSQL-first reads for SAP RCA hybrid mode
- 84a50b9 Add JSON to PostgreSQL migration script
- 35a03cc Stabilize SAP hybrid DB scripts

PostgreSQL DEV:
- Container: cbj-postgres-dev
- DB: sap_rca_dev
- App user: sap_rca_app
- Migration version: 20260509_0001
- Tables:
  - alembic_version
  - audit_logs
  - case_analytics_cache
  - cases
  - evidence
  - parsed_results
  - reports

Runtime GREEN:
- /sap-api/health:
  - status: ok
  - case_history: hybrid
  - database.enabled: true
  - database.configured: true
  - database.mode: hybrid
  - database.status: ok
- /sap-api/cases:
  - ok: true
  - read_source: postgres
  - mode: hybrid
  - count: 200 or newer
- /sap-api/evidence-history:
  - ok: true
  - read_source: postgres
  - mode: hybrid
  - count: 151 or newer
  - fallback_reason: null
- /sap-api/parsed-results-history:
  - ok: true
  - read_source: postgres
  - mode: hybrid
  - count: 7 or newer
  - fallback_reason: null

Runtime Env:
- Systemd drop-in: /etc/systemd/system/sap-evidence-api.service.d/10-postgres-runtime.conf
- Runtime env local-only: /etc/sap-evidence-api/runtime.env
- PostgreSQL credential local-only: /opt/postgres-sap-dev/.env
- Never commit these files.

Backend Completed:
- PostgreSQL-first read path for /sap-api/cases.
- PostgreSQL-first read path for /sap-api/evidence-history.
- PostgreSQL-first read path for /sap-api/parsed-results-history.
- DB-first helper implementation extracted from backend/evidence_api.py into backend/dbfirst_read_helpers.py.
- backend/evidence_api.py imports helper functions back using the same internal names, preserving endpoint and middleware behavior.
- JSON/file-backed fallback remains available.
- psycopg URL handling uses SQLAlchemy parser.
- Runtime uses psycopg v3 style: postgresql+psycopg://...
- Do not add psycopg2.

Frontend Completed:
- DB-backed Evidence History mini panel.
- DB-backed Parsed Results History mini panel.
- Added listEvidenceHistory() and listParsedResultsHistory() in src/evidence-api-client.js.
- Added src/app/components/EvidenceHistoryMiniPanel.jsx.
- Added src/app/components/ParsedResultsHistoryMiniPanel.jsx.
- Inserted both mini panels into src/app/pages/InvestigationWorkspaceV2.jsx.
- Added styling in src/app/evidence-history-ux.css.
- DEV build validated.

Expected UI:
- Investigation Workspace shows Evidence History panel.
- Investigation Workspace shows Parsed Results History panel.
- Source: postgres.
- Mode: hybrid.
- Evidence total: 151 or newer.
- Parsed results total: 7 or newer.
- Severity pill appears in Parsed Results History.
- Refresh buttons work.

Deploy:
- Local script: /home/sadmin/deploy-sap-dev.sh
- Log: /home/sadmin/deploy-sap-dev.log
- Deploy target: /var/www/svr01-dev/sap
- Manual server deploy command:
  screen -dmS sap-deploy bash -lc '/home/sadmin/deploy-sap-dev.sh'
  tail -f /home/sadmin/deploy-sap-dev.log

GitHub DEV Deploy Workflow:
- Workflow file: .github/workflows/dev-deploy.yml
- Trigger: workflow_dispatch only.
- Confirmation input: DEPLOY_DEV
- Runner labels:
  - self-hosted
  - sapdev-pc-runner
- The workflow validates local path, syncs /home/sadmin/sap to origin/dev, runs npm ci, runs npm run build, runs /home/sadmin/deploy-sap-dev.sh, then validates public API endpoints.
- If runner label is wrong or offline, GitHub Actions job will stay pending.

Validation Commands:
- cd /home/sadmin/sap
- git status -sb
- git log --oneline -8
- curl -s https://sapdev.cbj-kontruksi.com/sap-api/health | jq '{status:.status, case_history:.case_history, database:.database}'
- curl -s https://sapdev.cbj-kontruksi.com/sap-api/cases | jq '{ok:.ok, read_source:.read_source, mode:.mode, count:.count, first_id:(.cases[0].id // null)}'
- curl -s https://sapdev.cbj-kontruksi.com/sap-api/evidence-history | jq '{ok:.ok, read_source:.read_source, mode:.mode, count:.count, first_id:(.evidence[0].id // null), fallback_reason:(.fallback_reason // null)}'
- curl -s https://sapdev.cbj-kontruksi.com/sap-api/parsed-results-history | jq '{ok:.ok, read_source:.read_source, mode:.mode, count:.count, first_id:(.parsed_results[0].id // null), fallback_reason:(.fallback_reason // null)}'

No changes:
- PROD untouched.
- DB schema untouched.
- Nginx/Cloudflare untouched.
- JSON/file-backed fallback preserved.

Next safe targets:
1. Validate GitHub Actions DEV Deploy workflow using manual Run workflow with confirm=DEPLOY_DEV.
2. If workflow is pending, verify runner labels for sapdev-pc-runner and adjust .github/workflows/dev-deploy.yml only if needed.
3. Improve Parsed Results History mini panel UX with filters for tool, severity, and case_id.
4. Add drill-down from Parsed Results History row to case detail/mobile case view if existing route supports it.
5. Add lightweight backend query filters for parsed-results-history if needed, while preserving response shape and fallback.
6. Continue cleanup of backend/evidence_api.py only in small chunks.
7. Do not remove fallback yet.

## Update - 2026-05-10 DB-first helper refactor

Latest commit:
- 06f8e00 Extract DB-first read helpers

Completed:
- Added DB-first parsed results history endpoint:
  - GET /sap-api/parsed-results-history
  - read_source: postgres
  - mode: hybrid
  - fallback_reason: null
- Extracted DB-first read helper implementation from backend/evidence_api.py into:
  - backend/dbfirst_read_helpers.py
- backend/evidence_api.py now imports helper functions back using the same internal names, preserving endpoint/middleware behavior.

Validation:
- python3 -m py_compile backend/evidence_api.py backend/dbfirst_read_helpers.py: OK
- sap-evidence-api.service: active/running
- /sap-api/health:
  - status: ok
  - case_history: hybrid
  - database.status: ok
- /sap-api/cases:
  - read_source: postgres
  - mode: hybrid
  - count: 198
- /sap-api/evidence-history:
  - read_source: postgres
  - mode: hybrid
  - count: 149
  - fallback_reason: null
- /sap-api/parsed-results-history:
  - read_source: postgres
  - mode: hybrid
  - count: 5
  - fallback_reason: null

No changes:
- PROD untouched.
- Frontend untouched.
- DB schema untouched.
- Nginx/Cloudflare untouched.
- JSON/file-backed fallback preserved.

## Update - 2026-05-10 Parsed Results UI and DEV workflow

Latest commits:
- 2a45d59 Add parsed results history mini panel
- dbf35e8 Document DB-first helper refactor
- 06f8e00 Extract DB-first read helpers

Completed:
- Added Parsed Results History mini panel to Investigation Workspace.
- Added listParsedResultsHistory() API client.
- Added severity pill styling for INFO/WARN/CRIT style status display.
- Added manual GitHub Actions DEV Deploy workflow:
  - .github/workflows/dev-deploy.yml
  - workflow_dispatch confirmation input DEPLOY_DEV
  - self-hosted runner label sapdev-pc-runner
  - runs npm ci, npm run build, /home/sadmin/deploy-sap-dev.sh, and public API validation.

Last runtime validation:
- /sap-api/health:
  - status: ok
  - case_history: hybrid
  - database.status: ok
- /sap-api/cases:
  - read_source: postgres
  - mode: hybrid
  - count: 200
- /sap-api/evidence-history:
  - read_source: postgres
  - mode: hybrid
  - count: 151
  - fallback_reason: null
- /sap-api/parsed-results-history:
  - read_source: postgres
  - mode: hybrid
  - count: 7
  - fallback_reason: null

Recommended next development:
1. Run and validate the new GitHub Actions DEV Deploy workflow.
2. Confirm the workflow runner label matches the actual self-hosted runner.
3. Improve Parsed Results History mini panel with filter controls.
4. Add a safe case drill-down action from parsed result rows.
5. Add small test/validation docs for hybrid DB endpoints.
6. Keep all future changes incremental.

## DEV Deploy Workflow Validation - GREEN

Latest validated DEV/sapdev manual deploy uses the registered GitHub Actions workflow:

- Workflow name: Deploy SAP RCA Workspace to sapdev
- Workflow file: `.github/workflows/deploy-sapdev.yml`
- Workflow ID: `273264105`
- Trigger: `workflow_dispatch`
- Branch: `dev`
- Runner: `sapdev-pc-runner`

Command used:

\```bash
gh workflow run 273264105 --repo finuxpert/cbj-sap --ref dev
\```

Latest validation after deploy:

- `/sap-api/health`: status `ok`, case_history `hybrid`, database status `ok`
- `/sap-api/cases`: read_source `postgres`, mode `hybrid`, count `203`
- `/sap-api/evidence-history`: read_source `postgres`, mode `hybrid`, count `154`, fallback_reason `null`
- `/sap-api/parsed-results-history`: read_source `postgres`, mode `hybrid`, count `10`, fallback_reason `null`

Note:

`.github/workflows/dev-deploy.yml` exists locally/on branch work, but GitHub CLI returned `HTTP 404` for direct workflow dispatch by filename. Current operational manual deploy path is `deploy-sapdev.yml`.
