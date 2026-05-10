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
- 3c14979 Add deploy workflow failure summary
- 2d8f121 Remove redundant DEV validation deploy workflow
- 482cf9a Serialize DEV validation report deploy
- d0ebf41 Validate backend storage config module
- cd338f1 Add backend storage config module
- e057fbc Add backend model refactor workflow
- f75b46d Add deterministic backend model refactor helper
- 1f33774 Validate external backend model handoff
- 7c5f570 Add external model handoff module
- 6b23178 Validate backend model contracts in QA
- aa2b2d6 Add backend model contract helpers
- cf6a736 Add backend Pydantic models module
- f39a92e Compile all backend python files in QA
- bb8dd66 Tighten sapdev QA runtime checks
- 3238843 Style parsed results history filters
- b62787a Add parsed results history filters
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
  - count: 203 or newer
- /sap-api/evidence-history:
  - ok: true
  - read_source: postgres
  - mode: hybrid
  - count: 154 or newer
  - fallback_reason: null
- /sap-api/parsed-results-history:
  - ok: true
  - read_source: postgres
  - mode: hybrid
  - count: 10 or newer
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
- Backend QA now compiles all backend Python files.
- Backend QA now validates model imports, model contracts, external model handoff, storage config, and FastAPI route imports.
- Added backend modularization prep modules:
  - backend/models.py
  - backend/model_contracts.py
  - backend/external_models.py
  - backend/storage_config.py
- Added deterministic refactor helper:
  - scripts/refactor-evidence-api-models.py
- Added manual backend model refactor workflow:
  - .github/workflows/backend-model-refactor.yml

Frontend Completed:
- DB-backed Evidence History mini panel.
- DB-backed Parsed Results History mini panel.
- Added listEvidenceHistory() and listParsedResultsHistory() in src/evidence-api-client.js.
- Added src/app/components/EvidenceHistoryMiniPanel.jsx.
- Added src/app/components/ParsedResultsHistoryMiniPanel.jsx.
- Inserted both mini panels into src/app/pages/InvestigationWorkspaceV2.jsx.
- Added styling in src/app/evidence-history-ux.css.
- Parsed Results History now has frontend-only tool filter, severity filter, case/keyword search, visible count, reset, copy case, and copy suspect actions.
- DEV build validated.

Expected UI:
- Investigation Workspace shows Evidence History panel.
- Investigation Workspace shows Parsed Results History panel.
- Source: postgres.
- Mode: hybrid.
- Evidence total: 154 or newer.
- Parsed results total: 10 or newer.
- Severity pill appears in Parsed Results History.
- Refresh buttons work.
- Parsed Results filters work:
  - Tool
  - Severity
  - Case / keyword
  - Reset
- Quick copy actions work:
  - Copy case
  - Copy suspect

GitHub Actions / Workflow Status:
- Operational deploy workflow:
  - Name: Deploy SAP RCA Workspace to sapdev
  - File: .github/workflows/deploy-sapdev.yml
  - Workflow ID: 273264105
  - Trigger: push to dev and workflow_dispatch
  - Concurrency group: sapdev-deploy
  - cancel-in-progress: true
  - Runs backend syntax QA, npm build, deploy to /var/www/svr01-dev/sap, nginx reload, sap-evidence-api restart, and sapdev QA.
  - Adds success/failure summary in GitHub Actions UI.
- Build workflow:
  - File: .github/workflows/build.yml
  - Safe parallel build-only workflow.
- SAP DEV Validate workflow:
  - File: .github/workflows/sap-dev-validate.yml
  - Safe audit/artifact workflow, does not deploy runtime.
- Backend model refactor workflow:
  - File: .github/workflows/backend-model-refactor.yml
  - Manual workflow_dispatch only.
  - Serialized with group backend-model-refactor.
  - Runs deterministic model refactor helper, backend QA, then commits model-refactor diff to dev if changed.
- Removed workflow:
  - .github/workflows/dev-validate-report.yml
  - Removed because it duplicated deployment to /var/www/svr01-dev/sap and created deploy race risk.

Deploy:
- Local script: /home/sadmin/deploy-sap-dev.sh
- Log: /home/sadmin/deploy-sap-dev.log
- Deploy target: /var/www/svr01-dev/sap
- Manual server deploy command:
  screen -dmS sap-deploy bash -lc '/home/sadmin/deploy-sap-dev.sh'
  tail -f /home/sadmin/deploy-sap-dev.log

GitHub DEV Deploy Workflow:
- Current operational workflow file: .github/workflows/deploy-sapdev.yml
- Workflow name: Deploy SAP RCA Workspace to sapdev
- Workflow ID: 273264105
- Trigger: push to dev or workflow_dispatch.
- Runner: self-hosted sapdev-pc-runner.
- Manual command:

```bash
gh workflow run 273264105 --repo finuxpert/cbj-sap --ref dev
```

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
1. Let deploy-sapdev workflow validate the latest workflow cleanup commit.
2. Run backend-model-refactor workflow manually only when ready to switch evidence_api.py to external models.
3. After model switch is green, extract storage helper functions in small chunks.
4. Keep backend/evidence_api.py cleanup incremental.
5. Do not remove fallback yet.
6. Do not touch DB schema without explicit approval.
7. Optional later: add external notification via Telegram/Slack only after secrets are configured safely in GitHub Actions.

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

```bash
gh workflow run 273264105 --repo finuxpert/cbj-sap --ref dev
```

Latest validation after deploy:

- `/sap-api/health`: status `ok`, case_history `hybrid`, database status `ok`
- `/sap-api/cases`: read_source `postgres`, mode `hybrid`, count `203`
- `/sap-api/evidence-history`: read_source `postgres`, mode `hybrid`, count `154`, fallback_reason `null`
- `/sap-api/parsed-results-history`: read_source `postgres`, mode `hybrid`, count `10`, fallback_reason `null`

Note:

`.github/workflows/dev-deploy.yml` exists locally/on branch work, but GitHub CLI returned `HTTP 404` for direct workflow dispatch by filename. Current operational manual deploy path is `deploy-sapdev.yml`.

## Update - 2026-05-10 Workflow cleanup and backend QA hardening

Latest commits:
- 3c14979 Add deploy workflow failure summary
- 2d8f121 Remove redundant DEV validation deploy workflow
- d0ebf41 Validate backend storage config module
- cd338f1 Add backend storage config module
- e057fbc Add backend model refactor workflow
- f75b46d Add deterministic backend model refactor helper
- 1f33774 Validate external backend model handoff
- 7c5f570 Add external model handoff module
- 6b23178 Validate backend model contracts in QA
- cf6a736 Add backend Pydantic models module

Completed:
- Removed redundant `dev-validate-report.yml` workflow because it duplicated deploy behavior and could race with `deploy-sapdev.yml`.
- Kept `deploy-sapdev.yml` as the only workflow that deploys to `/var/www/svr01-dev/sap`.
- Added success/failure GitHub Actions summaries to the deploy workflow.
- Added backend syntax/import/contract QA coverage.
- Added backend model modularization preparation.
- Added backend storage config module and QA validation.

Current workflow policy:
- Build/audit workflows may run in parallel.
- Runtime deploy workflows must be serialized through `sapdev-deploy`.
- Refactor workflows that push to `dev` must be manually triggered and serialized.
- External Telegram/Slack notification is not enabled yet because it requires GitHub Actions secrets.
