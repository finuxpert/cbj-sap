# SAP Intelligent RCA Workspace - Next Chat Prompt

Project:
SAP Intelligent RCA Workspace

Repo:
finuxpert/cbj-sap

Branch aktif:
dev

Local path:
`/home/sadmin/sap`

DEV URL:
https://sapdev.cbj-kontruksi.com/sap/

Public API:
https://sapdev.cbj-kontruksi.com/sap-api/health

## Current Status

- OFFICIAL SAPDEV deploy workflow is GREEN.
- Only one active workflow should be used:
  `.github/workflows/dev-deploy.yml`
- Workflow name:
  `OFFICIAL - SAPDEV Deploy Manual`
- Workflow ID:
  `274021726`
- Latest known successful run:
  `25621865480`
- Runner:
  `sapdev-pc-runner`
- Active runner label used by workflow:
  `sapdev`
- DEV deploy, frontend build, backend QA, and public API validation passed.
- Runtime prompt has been updated after workflow cleanup and backend audit.

## Official Workflow Notes

- Old/temporary workflows were removed or disabled.
- Do not recreate duplicate deploy/validate workflows.
- Official workflow must stay the single source of truth.
- Official deploy command:
  `gh workflow run 274021726 -r dev -f confirm=DEPLOY_DEV`
- Check latest runs:
  `gh run list --workflow 274021726 --limit 5`
- Watch run:
  `gh run watch RUN_ID`

## Recent Workflow Fixes

- Workflow now installs backend Python dependencies inside:
  `.venv-github-actions`
- Reason:
  Ubuntu 24 blocks direct pip install with PEP 668 / externally-managed-environment.
- Do not use:
  `pip install --break-system-packages`
- `scripts/qa-sapdev.sh` was fixed to read large JSON through stdin instead of environment variables.
- Reason:
  PostgreSQL case data is now large and caused:
  `Argument list too long`

## Current Architecture

- Frontend: React + Vite
- Backend: FastAPI Evidence API
- DB mode: PostgreSQL hybrid
- API health expected:
  `case_history=hybrid`
  `database.enabled=true`
  `database.configured=true`
  `database.mode=hybrid`
  `database.status=ok`

## Core RCA Tools Only

1. RCA Comparator / WP-SCOUT Analyzer
2. ST03N Analyzer
3. Log Triage / Log Evidence V2

## Hard Rules

- Fokus rapihin backend dulu.
- Incremental only.
- Jangan rewrite besar.
- Jangan sentuh PROD.
- Jangan reintroduce MutationObserver/runtime injector.
- Jangan bikin workflow baru kalau tidak perlu.
- Official workflow harus tetap single source of truth.
- Hindari kode sampah: helper kecil, contract jelas, QA tetap jalan.
- Jangan ubah API contract tanpa validasi QA.

## Latest Backend Audit

Command used:

```bash
cd /home/sadmin/sap

wc -l backend/*.py backend/db/*.py 2>/dev/null | sort -n

grep -nE "^@app\\.(get|post|patch|put|delete)" backend/evidence_api.py

python3 - <<'PY'
import ast
from pathlib import Path

path = Path("backend/evidence_api.py")
tree = ast.parse(path.read_text())
items = []
for node in ast.walk(tree):
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        start = node.lineno
        end = getattr(node, "end_lineno", start)
        items.append((end-start+1, start, node.name))
for size, start, name in sorted(items, reverse=True)[:30]:
    print(f"{size:4} lines  L{start:<4} {name}")
PY
```

Backend file sizes:

```text
0 backend/__init__.py
6 backend/db/__init__.py
14 backend/external_models.py
37 backend/storage_config.py
47 backend/maintenance_helpers.py
47 backend/models.py
51 backend/history_serializers.py
54 backend/evidence_helpers.py
61 backend/case_helpers.py
66 backend/model_contracts.py
106 backend/db/session.py
120 backend/storage_helpers.py
121 backend/db/models.py
123 backend/db/repositories.py
200 backend/case_analytics.py
292 backend/dbfirst_read_helpers.py
626 backend/evidence_api.py
1971 total
```

Routes in `backend/evidence_api.py`:

```text
116:@app.get("/health")
132:@app.post("/cases")
160:@app.get("/cases")
187:@app.get("/cases/{case_id}")
192:@app.patch("/cases/{case_id}")
205:@app.delete("/cases/{case_id}")
215:@app.post("/cases/{case_id}/parsed-results")
260:@app.get("/parsed-results-history")
310:@app.get("/mobile/cases")
315:@app.get("/mobile/cases/{case_id}")
321:@app.get("/mobile/cases/{case_id}/analytics")
327:@app.post("/upload")
415:@app.get("/evidence")
428:@app.get("/evidence/{evidence_id}")
433:@app.post("/evidence/{evidence_id}")
446:@app.get("/evidence/{evidence_id}/download")
455:@app.delete("/evidence/{evidence_id}")
465:@app.post("/maintenance/cleanup")
580:@app.get("/evidence-history")
618:@app.get("/history/evidence")
623:@app.get("/evidence/history")
```

Large functions in `backend/evidence_api.py`:

```text
85 lines  L328  upload_evidence
71 lines  L502  _cbj_sap_rca_dbfirst_read_middleware
47 lines  L261  list_parsed_results_history
42 lines  L216  add_parsed_result
35 lines  L581  _cbj_dbfirst_evidence_history_route
25 lines  L133  create_case
24 lines  L161  list_cases
13 lines  L117  health
10 lines  L434  update_evidence
10 lines  L416  list_evidence
10 lines  L193  update_case
7 lines  L456  delete_evidence
7 lines  L206  delete_case
6 lines  L447  download_evidence
4 lines  L466  cleanup
3 lines  L322  get_mobile_case_analytics
3 lines  L316  get_mobile_case
2 lines  L624  _cbj_dbfirst_evidence_slash_history_route
2 lines  L619  _cbj_dbfirst_history_evidence_route
2 lines  L429  get_evidence
2 lines  L311  list_mobile_cases
2 lines  L188  get_case
2 lines  L112  startup
2 lines  L97   insert_parsed_result_best_effort
2 lines  L94   upsert_evidence_best_effort
2 lines  L91   upsert_case_best_effort
2 lines  L74   check_database
```

## Next Recommended Target

Backend modularization tahap 1. Prioritas aman:

1. Extract logic dari `upload_evidence`.
   - Target helper/service candidate:
     `backend/evidence_upload_service.py`
   - Jangan ubah route contract `/upload`.
   - Route harus tetap tipis: validate input, call service, return response.

2. Setelah itu extract parsed result flow.
   - Target helper/service candidate:
     `backend/parsed_result_service.py`
   - Functions target:
     `add_parsed_result`
     `list_parsed_results_history`

3. Middleware DB-first dibahas belakangan.
   - Jangan langsung rewrite `_cbj_sap_rca_dbfirst_read_middleware` karena itu area sensitif hybrid fallback.

4. Setelah patch backend, wajib validasi:

```bash
cd /home/sadmin/sap
npm run build
bash scripts/qa-backend-syntax.sh
bash scripts/qa-sapdev.sh
```

5. Setelah local QA aman, deploy official:

```bash
gh workflow run 274021726 -r dev -f confirm=DEPLOY_DEV
gh run list --workflow 274021726 --limit 5
gh run watch RUN_ID
```

## Suggested Prompt For New Chat

Lanjut SAP Intelligent RCA Workspace.

Repo: `finuxpert/cbj-sap`
Branch: `dev`
Local: `/home/sadmin/sap`
Runtime doc: `docs/runtime/next-chat-prompt.md`

Status terakhir:
- Official SAPDEV workflow sudah GREEN.
- Workflow tunggal: `.github/workflows/dev-deploy.yml`
- Workflow ID: `274021726`
- Runner label: `sapdev`
- Latest known successful run: `25621865480`
- Backend audit selesai.
- `backend/evidence_api.py` masih paling besar: 626 lines.
- Target sekarang backend cleanup dulu, bukan UI/UX.

Rules:
- Incremental only.
- Jangan rewrite besar.
- Jangan sentuh PROD.
- Jangan bikin workflow baru.
- Jangan reintroduce MutationObserver/runtime injector.
- Jaga API contract tetap sama.
- QA harus tetap jalan.

Next task:
Extract logic dari `upload_evidence` di `backend/evidence_api.py` ke helper/service kecil, misalnya `backend/evidence_upload_service.py`, tanpa mengubah contract endpoint `/upload`. Setelah itu jalankan build + backend QA + SAPDEV QA, lalu official deploy workflow.

## Completed - Evidence Upload Service Refactor

Status:
- PR #3 merged into dev.
- Merge/head deployed: d1b1601.
- Official SAPDEV deploy workflow GREEN.
- Run ID: 25622541221.
- `/upload` route in `backend/evidence_api.py` is now thin.
- Upload implementation moved to `backend/evidence_upload_service.py`.
- Validation passed:
  - npm run build
  - scripts/qa-backend-syntax.sh
  - scripts/qa-sapdev.sh
  - official DEV deploy workflow

Next recommended target:
- Continue backend modularization incrementally.
- Do not touch PROD/nginx/workflow.
- Keep DB-first middleware unchanged unless specifically targeted.
