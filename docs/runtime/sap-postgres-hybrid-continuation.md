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
- ab58c21 Update DEV validation report [skip ci]
- c36a3f4 Add DB-backed evidence history panel
- 4fecd9c Add PostgreSQL-first reads for SAP RCA hybrid mode
- e5eb9d5 Document SAP PostgreSQL hybrid GREEN status
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
  - count: 197
  - first_id: CASE-20260510-001
- /sap-api/evidence-history:
  - ok: true
  - read_source: postgres
  - mode: hybrid
  - count: 148
  - first_id: 20260510-001058-038e11ea
  - fallback_reason: null

Runtime Env:
- Systemd drop-in: /etc/systemd/system/sap-evidence-api.service.d/10-postgres-runtime.conf
- Runtime env local-only: /etc/sap-evidence-api/runtime.env
- PostgreSQL credential local-only: /opt/postgres-sap-dev/.env
- Never commit these files.

Backend Completed:
- Commit 4fecd9c added PostgreSQL-first read path for /sap-api/cases.
- Commit 4fecd9c added PostgreSQL-first /sap-api/evidence-history endpoint.
- JSON/file-backed fallback remains available.
- psycopg URL handling was fixed using SQLAlchemy parser.
- Runtime uses psycopg v3 style: postgresql+psycopg://...
- Do not add psycopg2.

Frontend Completed:
- Commit c36a3f4 added DB-backed Evidence History UI panel.
- Added listEvidenceHistory() in src/evidence-api-client.js.
- Added src/app/components/EvidenceHistoryMiniPanel.jsx.
- Inserted Evidence History panel into src/app/pages/InvestigationWorkspaceV2.jsx.
- Added styling in src/app/evidence-history-ux.css.
- DEV build and deploy completed.

Expected UI:
- Investigation Workspace shows Evidence History panel.
- Source: postgres.
- Mode: hybrid.
- Total: 148 or newer.

Deploy:
- Script: /home/sadmin/deploy-sap-dev.sh
- Log: /home/sadmin/deploy-sap-dev.log
- Deploy target: /var/www/svr01-dev/sap
- Deploy command:
  screen -dmS sap-deploy bash -lc '/home/sadmin/deploy-sap-dev.sh'
  tail -f /home/sadmin/deploy-sap-dev.log

Validation Commands:
- cd /home/sadmin/sap
- git status -sb
- git log --oneline -8
- curl -s https://sapdev.cbj-kontruksi.com/sap-api/health | jq '{status:.status, case_history:.case_history, database:.database}'
- curl -s https://sapdev.cbj-kontruksi.com/sap-api/cases | jq '{ok:.ok, read_source:.read_source, mode:.mode, count:.count, first_id:(.cases[0].id // null)}'
- curl -s https://sapdev.cbj-kontruksi.com/sap-api/evidence-history | jq '{ok:.ok, read_source:.read_source, mode:.mode, count:.count, first_id:(.evidence[0].id // null), fallback_reason:(.fallback_reason // null)}'

Next Targets:
1. Visual QA Evidence History panel in DEV.
2. Add parsed_results history DB-first.
3. Refactor DB-first patch from backend/evidence_api.py into a small helper module.
4. Keep fallback behavior unchanged.
5. Do not deploy PROD yet.

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

Next safe targets:
1. Add small frontend mini panel for parsed_results history, if useful.
2. Add parsed-results-history check into any repo-tracked validation/runbook if not already tracked.
3. Continue cleanup of backend/evidence_api.py only in small chunks.
4. Do not remove fallback yet.
