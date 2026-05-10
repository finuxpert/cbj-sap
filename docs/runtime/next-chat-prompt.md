# Next Chat Continuation Prompt - SAP Intelligent RCA Workspace

Use this prompt to continue work in a new ChatGPT conversation.

```text
Lanjut SAP Intelligent RCA Workspace.

Repo:
- finuxpert/cbj-sap

Branch:
- dev

Local path:
- /home/sadmin/sap

DEV URL:
- https://sapdev.cbj-kontruksi.com

Backend API:
- /sap-api

Backend service:
- sap-evidence-api.service

Main runbook:
- docs/runtime/sap-postgres-hybrid-continuation.md

Current architecture:
- Frontend: React + Vite
- Backend: FastAPI
- Runtime DB mode: PostgreSQL Hybrid
- JSON/file fallback wajib tetap dipertahankan
- DEV deploy via GitHub Actions self-hosted runner

Important rules:
- Incremental only
- Jangan rewrite besar
- Jangan sentuh PROD
- Jangan hapus JSON/file fallback
- Jangan reintroduce MutationObserver/runtime injector/recursive DOM injector
- Jangan commit env/token/private key/password/.venv-db/runtime-status/generated output/backup files
- Jangan expose credentials
- Keep frontend behavior compatible
- Jangan ubah DB schema kecuali diminta jelas
- Jangan ubah nginx/cloudflare kecuali diminta jelas

Latest validated runtime status:
- PostgreSQL Hybrid DB runtime GREEN
- /sap-api/health:
  - status ok
  - case_history hybrid
  - database.enabled true
  - database.configured true
  - database.mode hybrid
  - database.status ok
- /sap-api/cases:
  - read_source postgres
  - mode hybrid
  - count 203 or newer
- /sap-api/evidence-history:
  - read_source postgres
  - mode hybrid
  - count 154 or newer
  - fallback_reason null
- /sap-api/parsed-results-history:
  - read_source postgres
  - mode hybrid
  - count 10 or newer
  - fallback_reason null

Current workflow set:
- .github/workflows/deploy-sapdev.yml
- .github/workflows/build.yml
- .github/workflows/sap-dev-validate.yml
- .github/workflows/backend-safe-refactor.yml

Removed workflows:
- .github/workflows/dev-validate-report.yml
- .github/workflows/backend-model-refactor.yml
- .github/workflows/backend-storage-refactor.yml

Operational deploy workflow:
- Name: Deploy SAP RCA Workspace to sapdev
- File: .github/workflows/deploy-sapdev.yml
- Workflow ID: 273264105
- Trigger: push to dev and workflow_dispatch
- Concurrency group: sapdev-deploy
- Deploy target: /var/www/svr01-dev/sap
- Runs backend syntax QA, npm build, deploy, nginx reload, sap-evidence-api restart, and sapdev QA
- Has GitHub Actions success/failure summary

Manual deploy command:
- gh workflow run 273264105 --repo finuxpert/cbj-sap --ref dev

Backend safe refactor workflow:
- File: .github/workflows/backend-safe-refactor.yml
- Trigger: workflow_dispatch only
- Required confirmation input: APPLY_BACKEND_REFACTOR
- Purpose:
  - switch backend/evidence_api.py to external backend models
  - switch backend/evidence_api.py to external storage config/helpers
  - run backend QA after each phase
  - commit diff to dev only if QA passes

Backend safe refactor trigger script:
- scripts/run-backend-safe-refactor.sh

Command:
cd /home/sadmin/sap
bash scripts/run-backend-safe-refactor.sh

Monitor:
gh run watch --repo finuxpert/cbj-sap
gh run view --repo finuxpert/cbj-sap --log-failed

Backend modularization prep DONE:
- backend/models.py
- backend/model_contracts.py
- backend/external_models.py
- backend/storage_config.py
- backend/storage_helpers.py
- scripts/refactor-evidence-api-models.py
- scripts/refactor-evidence-api-storage.py
- scripts/run-backend-safe-refactor.sh
- .github/workflows/backend-safe-refactor.yml

Backend QA coverage:
- compile all backend Python files
- import backend models
- validate external model handoff
- validate model contracts
- validate storage config
- validate storage helpers
- import FastAPI app
- verify critical routes:
  - /health
  - /cases
  - /upload
  - /parsed-results-history
  - /evidence-history

Frontend completed:
- Evidence History mini panel
- Parsed Results History mini panel
- frontend-only filters:
  - Tool
  - Severity
  - Case / keyword
  - Reset
- quick copy actions:
  - Copy case
  - Copy suspect

Latest important commits:
- 41352c7 Add backend safe refactor trigger script
- 08df09c Remove redundant backend storage refactor workflow
- cebd1bf Remove redundant backend model refactor workflow
- 55caa29 Add combined backend safe refactor workflow
- a4bfb38 Add deterministic backend storage refactor helper
- 7cfba86 Validate backend storage helpers in QA
- bd3b292 Add backend storage helper module
- 3c14979 Add deploy workflow failure summary
- 2d8f121 Remove redundant DEV validation deploy workflow
- d0ebf41 Validate backend storage config module
- cd338f1 Add backend storage config module
- f75b46d Add deterministic backend model refactor helper
- cf6a736 Add backend Pydantic models module

Current next safest step:
1. Pull latest dev on server.
2. Run backend safe refactor trigger script.
3. Monitor workflow.
4. If workflow commits to dev, wait for deploy-sapdev workflow.
5. Validate runtime endpoints.
6. Continue incremental backend/evidence_api.py cleanup only after runtime GREEN.

First server commands:
cd /home/sadmin/sap
git fetch origin
git checkout dev
git reset --hard origin/dev
git status -sb
git log --oneline --decorate --graph -10

Run backend refactor:
bash scripts/run-backend-safe-refactor.sh

Runtime validation:
curl -s https://sapdev.cbj-kontruksi.com/sap-api/health | jq '{status:.status, case_history:.case_history, database:.database}'
curl -s https://sapdev.cbj-kontruksi.com/sap-api/cases | jq '{ok:.ok, read_source:.read_source, mode:.mode, count:.count}'
curl -s https://sapdev.cbj-kontruksi.com/sap-api/evidence-history | jq '{ok:.ok, read_source:.read_source, mode:.mode, count:.count, fallback_reason:(.fallback_reason // null)}'
curl -s https://sapdev.cbj-kontruksi.com/sap-api/parsed-results-history | jq '{ok:.ok, read_source:.read_source, mode:.mode, count:.count, fallback_reason:(.fallback_reason // null)}'

Do not:
- touch PROD
- remove fallback
- change DB schema
- change nginx/cloudflare
- rewrite backend in one shot
- expose credentials
```
