# Next Chat Prompt - SAP Intelligent RCA Workspace

Project:
SAP Intelligent RCA Workspace

Repo:
finuxpert/cbj-sap

Branch aktif:
dev

Local path:
`/home/sadmin/sap`

DEV URL:
https://sapdev.cbj-kontruksi.com

Backend Evidence API:
http://127.0.0.1:8090

Public API:
https://sapdev.cbj-kontruksi.com/sap-api/health

## Current Status

- SAPDEV deploy workflow GREEN from previous verified manual run.
- Official SAPDEV deploy workflow now supports automatic deploy on push to `dev`.
- Manual workflow dispatch is still available as fallback.
- Latest verified manual run ID: `25622541221`.
- Latest verified manual job ID: `75211731726`.
- Previous verified deployed merge/head: `d1b1601`.
- Frontend build passed in verified run.
- Backend syntax QA passed in verified run.
- SAPDEV QA suite passed in verified run.
- Public API contract validation passed in verified run.
- Evidence upload refactor tahap 1 selesai.
- Evidence history/read refactor tahap 1 selesai.

## Latest Commits / Recent Repo Updates

Recent commits pushed to `dev`:

```text
49cf82b9 Delegate evidence history routes to service
8a1f14a8 Move DB-first evidence history response logic to service
4a8a9846 Delegate evidence read routes to service
c5e82f40 Add evidence history service wrapper
0be9174 Document automatic SAPDEV deploy trigger
78d5810 Enable automatic SAPDEV deploy on dev push
```

Important note:
- GitHub connector did not show workflow runs for connector-created commits during the previous chat.
- Auto-deploy trigger is already present in `.github/workflows/dev-deploy.yml`.
- From terminal/local runner, verify with:

```bash
gh run list --workflow 274021726 --limit 10
```

## Completed Recently

### Deploy workflow

- Updated `.github/workflows/dev-deploy.yml`.
- Workflow name changed to `OFFICIAL - SAPDEV Deploy`.
- Pushes to branch `dev` now trigger SAPDEV build/deploy/QA automatically.
- Manual `workflow_dispatch` remains available as fallback with `confirm=DEPLOY_DEV`.
- Official workflow remains the single source of truth.

### Evidence upload refactor

- Created `backend/evidence_upload_service.py`.
- `/upload` route in `backend/evidence_api.py` is thin.
- Upload implementation moved from `backend/evidence_api.py` to `backend/evidence_upload_service.py`.
- Upload flow preserves existing endpoint contract and response shape.
- Optional case linking preserved.
- PostgreSQL hybrid best-effort writes preserved.
- File fallback behavior preserved.

### Evidence history/read refactor

Created:

```text
backend/evidence_history_service.py
```

Current service functions:

```python
list_evidence_items()
get_evidence_item()
list_evidence_history_dbfirst()
```

Routes now delegated to service:

```text
GET /evidence
GET /evidence/{evidence_id}
GET /evidence-history
GET /history/evidence
GET /evidence/history
```

Preserved behavior:
- API response shape remains compatible.
- DB-first evidence history still reads PostgreSQL first.
- File fallback/warning behavior preserved.
- Hybrid mode preserved.
- Route layer in `backend/evidence_api.py` is thinner.

## Official Workflow Notes

- Single official deploy workflow:
  `.github/workflows/dev-deploy.yml`
- Workflow name:
  `OFFICIAL - SAPDEV Deploy`
- Workflow ID:
  `274021726`
- Active runner label:
  `sapdev`
- Automatic deploy trigger:

```bash
git push origin dev
```

- Manual deploy fallback:

```bash
cd /home/sadmin/sap
gh workflow run 274021726 -r dev -f confirm=DEPLOY_DEV
```

- Check latest runs:

```bash
gh run list --workflow 274021726 --limit 10
```

- Watch run:

```bash
gh run watch RUN_ID
```

Important:
- Do not recreate duplicate deploy/validate workflows.
- Official workflow must stay the single source of truth.
- Pushes to `dev` should auto trigger the SAPDEV deploy workflow.
- If GitHub does not start a run for a connector-created workflow edit, push a normal code/docs commit to `dev` and check the workflow run list again.

## Current Architecture

- Frontend: React + Vite
- Backend: FastAPI Evidence API
- DB mode: PostgreSQL hybrid
- API health expected:
  - `case_history=hybrid`
  - `database.enabled=true`
  - `database.configured=true`
  - `database.mode=hybrid`
  - `database.status=ok`

Backend layering direction:

```text
FastAPI Routes
↓
Service Layer
↓
DB-first Read Helpers
↓
PostgreSQL / File fallback
```

Current service files:

```text
backend/evidence_upload_service.py
backend/evidence_history_service.py
backend/dbfirst_read_helpers.py
```

## Core RCA Tools Only

1. RCA Comparator / WP-SCOUT Analyzer
2. ST03N Analyzer
3. Log Triage / Log Evidence V2

## Hard Rules

- Jangan sentuh PROD.
- Jangan ubah nginx kalau tidak diminta.
- Jangan recreate duplicate GitHub workflows.
- Jangan reintroduce MutationObserver/runtime injector.
- Jangan bikin rewrite besar.
- Incremental only.
- Keep DB-first / PostgreSQL hybrid behavior unchanged unless specifically targeted.
- Keep file fallback safe.
- Avoid breaking existing `/sap-api/health`, `/sap-api/history`, `/sap-api/evidence`, `/sap-api/upload`, `/sap-api/evidence-history`, `/sap-api/parsed-results-history`.
- Keep API response contract exactly the same unless intentionally versioned.
- Validate after every small backend change.

## Known Good Local Validation

```bash
cd /home/sadmin/sap
npm run build
bash scripts/qa-backend-syntax.sh
bash scripts/qa-sapdev.sh
```

Expected QA result:

```text
[qa-sapdev] QA PASS: backend API, hybrid reads, case persistence, linked evidence, and all core frontend RCA tool markers verified
```

## Known Good Deploy Validation

Latest verified manual deploy:

```text
Run ID : 25622541221
Job ID : 75211731726
Result : success
```

Successful workflow steps:

```text
Sync DEV branch and validate build
Install backend Python requirements
Deploy DEV web bundle
Validate local Evidence API
Validate public SAPDEV API contracts
Run full SAPDEV QA suite
Workflow success summary
Show recent deploy log
```

`Workflow failure summary` may be skipped when there is no failure; that is normal.

## Next Recommended Target

Continue backend modularization incrementally.

Best next module candidate:

```text
Split parsed-results-history logic from backend/evidence_api.py into a service.
Suggested new service file: backend/parsed_results_history_service.py
```

Suggested target route:

```text
@app.get("/parsed-results-history")
```

Scope guidance:

1. Keep route in `backend/evidence_api.py` thin.
2. Move DB-first parsed results history logic to service/helper function.
3. Keep response contract exactly the same:
   - `ok`
   - `read_source`
   - `mode`
   - `count`
   - `parsed_results`
   - `fallback_reason`
4. Keep PostgreSQL hybrid mode safe.
5. Keep file fallback safe via `collect_file_parsed_results_history()`.
6. Do not rewrite DB-first middleware yet.
7. Do not touch PROD/nginx.
8. Validate after the patch.

After that:

```text
case service layer
timeline service
correlation engine
persistent RCA session
```

## Suggested Prompt For New Chat

Lanjut SAP Intelligent RCA Workspace dari `docs/runtime/next-chat-prompt.md`.

Repo:
`finuxpert/cbj-sap`

Branch:
`dev`

Local:
`/home/sadmin/sap`

Status terakhir:
- SAPDEV deploy workflow auto-deploy on push to `dev` sudah aktif.
- Manual dispatch tetap tersedia sebagai fallback.
- Latest verified manual run ID: `25622541221`.
- Evidence upload refactor tahap 1 selesai.
- `backend/evidence_upload_service.py` sudah aktif.
- `/upload` route di `backend/evidence_api.py` sudah tipis.
- Evidence history/read refactor tahap 1 selesai.
- `backend/evidence_history_service.py` sudah aktif.
- Routes `/evidence`, `/evidence/{id}`, `/evidence-history`, `/history/evidence`, `/evidence/history` sudah delegate ke service.
- Recent latest commit: `49cf82b9 Delegate evidence history routes to service`.
- Build/QA verified previously; latest auto-deploy run should be checked with `gh run list --workflow 274021726 --limit 10`.

Rules:
- Jangan sentuh PROD.
- Jangan ubah nginx.
- Jangan recreate duplicate workflow.
- Jangan rewrite besar.
- Incremental only.
- Jangan reintroduce MutationObserver/runtime injector.
- DB-first/PostgreSQL hybrid behavior jangan diubah kecuali memang targetnya.
- API response contract harus tetap sama.

Target berikutnya:
Split `parsed-results-history` logic dari `backend/evidence_api.py` ke `backend/parsed_results_history_service.py`.

Wajib validasi:

```bash
cd /home/sadmin/sap
npm run build
bash scripts/qa-backend-syntax.sh
bash scripts/qa-sapdev.sh
```

Deploy DEV otomatis:

```bash
git push origin dev
```
