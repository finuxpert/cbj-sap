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

- SAPDEV deploy workflow GREEN.
- Official SAPDEV deploy workflow now supports automatic deploy on push to `dev`.
- Manual workflow dispatch is still available as fallback.
- Latest official manual deploy run GREEN.
- Latest verified run ID: `25622541221`.
- Latest verified job ID: `75211731726`.
- Job: `Build, deploy, and QA SAPDEV`.
- PR #3 already merged into `dev`.
- Merge/head deployed: `d1b1601`.
- Frontend build passed.
- Backend syntax QA passed.
- SAPDEV QA suite passed.
- Public API contract validation passed.
- Evidence upload refactor tahap 1 selesai.

## Completed Recently

- Created `backend/evidence_upload_service.py`.
- `/upload` route in `backend/evidence_api.py` is now thin.
- Upload implementation moved from `backend/evidence_api.py` to `backend/evidence_upload_service.py`.
- Upload flow still preserves existing endpoint contract and response shape.
- Optional case linking still preserved.
- PostgreSQL hybrid best-effort writes still preserved.
- File fallback behavior still preserved.
- Official deploy workflow verified these steps successfully:
  - Sync DEV branch and validate build
  - Install backend Python requirements
  - Deploy DEV web bundle
  - Validate local Evidence API
  - Validate public SAPDEV API contracts
  - Run full SAPDEV QA suite
  - Workflow success summary
  - Show recent deploy log
- Updated `.github/workflows/dev-deploy.yml` so pushes to `dev` trigger SAPDEV build/deploy/QA automatically.

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
gh run list --workflow 274021726 --limit 5
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
- Avoid breaking existing `/sap-api/health`, `/sap-api/history`, `/sap-api/evidence`, and `/sap-api/upload`.
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

Latest verified deploy:

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
Split evidence history/list/read logic from backend/evidence_api.py
Suggested new service file: backend/evidence_history_service.py
```

Scope guidance:

1. Keep routes in `backend/evidence_api.py` thin.
2. Move read/list/history logic to service/helper functions.
3. Keep API response contracts exactly the same.
4. Keep PostgreSQL hybrid mode safe.
5. Keep file fallback safe.
6. Do not rewrite DB-first middleware yet.
7. Validate after every small patch.

Suggested target functions/routes to inspect first:

```text
@app.get("/evidence")
@app.get("/evidence/{evidence_id}")
@app.get("/evidence-history")
@app.get("/history/evidence")
@app.get("/evidence/history")
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
- SAPDEV deploy workflow GREEN.
- Official workflow auto deploy on push to `dev` sudah aktif.
- Manual dispatch tetap tersedia sebagai fallback.
- Latest verified run ID: `25622541221`.
- PR #3 sudah merged ke `dev`.
- Merge/head deployed: `d1b1601`.
- Evidence upload refactor tahap 1 selesai.
- `backend/evidence_upload_service.py` sudah aktif.
- `/upload` route di `backend/evidence_api.py` sudah tipis.
- Build, backend syntax QA, SAPDEV QA, dan public API contract validation passed.

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
Split evidence history/list/read logic dari `backend/evidence_api.py` ke `backend/evidence_history_service.py`.

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
