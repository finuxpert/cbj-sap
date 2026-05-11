# Next Chat Prompt - SAP Intelligent RCA Workspace

Project:
SAP Intelligent RCA Workspace

Repo:
`finuxpert/cbj-sap`

Branch aktif:
`dev`

Local path:
`/home/sadmin/sap`

DEV URL:
https://sapdev.cbj-kontruksi.com

Backend Evidence API:
http://127.0.0.1:8090

Public API:
https://sapdev.cbj-kontruksi.com/sap-api/health

## Working Mode

- Full ChatGPT + GitHub connector only.
- Jangan test lewat local CLI kecuali user mengizinkan.
- Jangan sentuh PROD.
- Jangan ubah nginx.
- Jangan recreate duplicate workflow.
- Jangan rewrite besar.
- Incremental only.
- Jangan reintroduce MutationObserver/runtime injector.
- DB-first/PostgreSQL hybrid behavior jangan diubah kecuali memang targetnya.
- API response contract harus tetap sama.
- Keep file fallback safe.

## Deploy / Workflow Status

- SAPDEV deploy workflow auto-deploy on push to `dev` sudah aktif.
- Manual workflow dispatch tetap fallback.
- Single official workflow tetap `.github/workflows/dev-deploy.yml`.
- Workflow name: `OFFICIAL - SAPDEV Deploy`.
- Workflow ID: `274021726`.
- Active runner label: `sapdev`.
- Latest verified manual deploy:
  - Run ID: `25622541221`
  - Job ID: `75211731726`
  - Result: success
- Latest observed successful auto deploy after helper script commit:
  - Run ID: `25628363768`
  - Conclusion: success
  - Title: `Add helper to watch latest SAPDEV deploy run`
- Helper script exists:
  - `scripts/watch-latest-sapdev-run.sh`

Useful helper if local CLI is allowed later:

```bash
bash scripts/watch-latest-sapdev-run.sh
```

## Current Architecture

- Frontend: React + Vite
- Backend: FastAPI Evidence API
- DB mode: PostgreSQL hybrid
- Backend layering direction:

```text
FastAPI Routes
↓
Middleware / Service Layer
↓
DB-first Read Helpers
↓
PostgreSQL / File fallback
```

Expected API health markers:

```text
case_history=hybrid
database.enabled=true
database.configured=true
database.mode=hybrid
database.status=ok
```

## Core RCA Tools Only

1. RCA Comparator / WP-SCOUT Analyzer
2. ST03N Analyzer
3. Log Triage / Log Evidence V2

## Current Service Layer Files

```text
backend/case_service.py
backend/dbfirst_middleware.py
backend/dbfirst_read_helpers.py
backend/evidence_history_service.py
backend/evidence_mutation_service.py
backend/evidence_upload_service.py
backend/mobile_case_service.py
backend/parsed_result_service.py
backend/parsed_results_history_service.py
backend/timeline_service.py
```

## Completed Backend Modularization

### Evidence upload

File:
`backend/evidence_upload_service.py`

Status:
- `/upload` route is already thin.
- Upload behavior preserved.
- Case linking preserved.
- PostgreSQL hybrid best-effort write preserved.
- File fallback behavior preserved.

### Evidence history/read

File:
`backend/evidence_history_service.py`

Service functions:

```python
list_evidence_items()
get_evidence_item()
list_evidence_history_dbfirst()
```

Routes already delegated:

```text
GET /evidence
GET /evidence/{evidence_id}
GET /evidence-history
GET /history/evidence
GET /evidence/history
```

### Parsed results history

File:
`backend/parsed_results_history_service.py`

Route already delegated:

```text
GET /parsed-results-history
```

Contract preserved:

```text
ok
read_source
mode
count
parsed_results
fallback_reason
```

### DB-first read middleware

File:
`backend/dbfirst_middleware.py`

Status:
- DB-first read middleware has been extracted out of `backend/evidence_api.py`.
- `backend/evidence_api.py` imports and registers `dbfirst_read_middleware`.
- Hybrid behavior preserved:
  - only GET requests intercepted
  - DB runtime must be enabled
  - empty/missing DB rows fall through to legacy file-backed routes
  - DB exceptions fall through to file-backed route and store fallback reason
- Commit references:
  - `3b0223d1d90016188590cd91f989c838d3a0d1e2` create middleware module
  - `40049845d765db7e8e15800ad578cdbca3c4388e` register middleware

### Case service foundation

File:
`backend/case_service.py`

Service functions:

```python
create_case_item()
list_case_items()
get_case_item()
update_case_item()
delete_case_item()
```

Status:
- Service file exists.
- Route delegation from `backend/evidence_api.py` is still pending.

### Parsed result write service

File:
`backend/parsed_result_service.py`

Service function:

```python
add_case_parsed_result()
```

Status:
- Service file exists.
- It preserves existing response contract:

```text
ok
result
case
analytics
db_write
```

- It uses `timeline_service.py` for timeline event append.
- Route delegation from `backend/evidence_api.py` is still pending.

### Timeline service

File:
`backend/timeline_service.py`

Service functions:

```python
build_parsed_result_timeline_event()
append_parsed_result_timeline_event()
```

Status:
- Used by `parsed_result_service.py`.
- Timeline event shape preserved:

```text
id
time
severity
title
description
tool
```

### Mobile case service

File:
`backend/mobile_case_service.py`

Service functions:

```python
list_mobile_case_items()
get_mobile_case_item()
get_mobile_case_analytics_item()
```

Status:
- Service file exists.
- Route delegation from `backend/evidence_api.py` is still pending.
- A small connector patch was attempted after middleware extraction, but latest re-check showed it was not committed. Do not assume mobile route delegation is done.

### Evidence mutation service

File:
`backend/evidence_mutation_service.py`

Service functions:

```python
update_evidence_item()
get_evidence_download_response()
delete_evidence_item()
```

Status:
- Service file exists.
- Route delegation from `backend/evidence_api.py` is still pending.
- Response contracts preserved in service:
  - update evidence metadata
  - download evidence FileResponse
  - delete evidence metadata/file

## Known Issue Before Next Patch

After DB-first middleware extraction, `backend/evidence_api.py` still has explicit evidence-history routes using `JSONResponse`, but current import line may still be:

```python
from fastapi.responses import FileResponse
```

Next patch should first ensure it becomes:

```python
from fastapi.responses import FileResponse, JSONResponse
```

Then proceed with one small route delegation group only.

## Attempted But Blocked / Deferred

### Maintenance cleanup service

Attempted target:
`backend/maintenance_service.py`

Reason not completed:
- GitHub connector safety blocked create-file because code contained cleanup/delete operations.

Recommended handling:
- Do not force this via connector.
- Defer until local CLI work is allowed, or make the change manually with normal repo review.

### Full-file evidence_api.py route delegation

Attempted target:
- delegate case routes to `case_service.py`

Reason not completed:
- GitHub connector previously blocked or failed on large full-file update.

Recommended handling:
- Use smaller patches only.
- Patch one route group at a time.
- If local CLI is allowed later, do import/body route delegation locally and validate.

## Next Safest Targets

Recommended next patch order:

1. Fix `JSONResponse` import in `backend/evidence_api.py` if still missing.
2. Delegate mobile route group only:

```text
/mobile/cases
/mobile/cases/{case_id}
/mobile/cases/{case_id}/analytics
```

Use service functions:

```python
list_mobile_case_items()
get_mobile_case_item()
get_mobile_case_analytics_item()
```

3. Then delegate evidence mutation route group:

```text
/evidence/{evidence_id} update
/evidence/{evidence_id}/download
/evidence/{evidence_id} delete
```

4. Then delegate case route group:

```text
/cases
/cases/{case_id}
/cases/{case_id}/parsed-results
```

## Validation Commands

Use only when CLI/local validation is allowed:

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

For GitHub-only flow:
- rely on auto deploy workflow run status after each push to `dev`.
- use GitHub Actions run result as validation signal.

## Suggested Prompt For New Chat

Lanjut SAP Intelligent RCA Workspace dari `docs/runtime/next-chat-prompt.md`.

Repo:
`finuxpert/cbj-sap`

Branch:
`dev`

Mode kerja:
Full ChatGPT + GitHub connector only. Jangan test lewat local CLI kecuali saya izinkan. Jangan sentuh PROD/nginx/workflow.

Baca juga:
`docs/runtime/backend-modularization-status.md`

Status terakhir:
- SAPDEV auto deploy on push to `dev` sudah aktif.
- Manual dispatch tetap fallback.
- Latest observed successful auto deploy lama: Run ID `25628363768`, conclusion `success`.
- Helper script exists: `scripts/watch-latest-sapdev-run.sh`.
- Backend service modularization sudah lanjut.
- DB-first read middleware sudah berhasil diextract ke `backend/dbfirst_middleware.py`.
- `backend/evidence_api.py` sudah register `dbfirst_read_middleware`.
- Evidence upload/history/read sudah delegate ke service.
- `parsed-results-history` route sudah delegate ke service.
- `parsed_result_service.py` sudah pakai `timeline_service.py`.
- Case/mobile/evidence mutation service files sudah ada, tapi route delegation dari `evidence_api.py` masih pending.
- Mobile route delegation sempat dicoba, tapi latest re-check menunjukkan belum committed; jangan anggap sudah selesai.
- Maintenance cleanup service attempt diblok GitHub connector safety, jangan dipaksa via connector.

Rules:
- Jangan rewrite besar.
- Incremental only.
- Jangan recreate duplicate workflow.
- Jangan reintroduce MutationObserver/runtime injector.
- DB-first/PostgreSQL hybrid behavior jangan diubah kecuali targetnya.
- API response contract harus tetap sama.

Target berikutnya:
1. Re-check `backend/evidence_api.py`.
2. Fix missing `JSONResponse` import if still missing.
3. Delegate mobile route group to `backend/mobile_case_service.py` in one small safe patch.
