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

## Current Status

- SAPDEV deploy workflow auto-deploy on push to `dev` sudah aktif.
- Manual workflow dispatch tetap tersedia sebagai fallback.
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
- Helper script added:
  - `scripts/watch-latest-sapdev-run.sh`

## GitHub-only / ChatGPT-only Working Mode

Current working preference:
- Lanjut via ChatGPT + GitHub connector only.
- Jangan test lewat local CLI unless explicitly allowed later.
- Use GitHub auto deploy workflow result after each push as validation signal.
- Do not ask user to run CLI for every small step.

Useful GitHub helper when local CLI is allowed:

```bash
bash scripts/watch-latest-sapdev-run.sh
```

## Core Guardrails

- Jangan sentuh PROD.
- Jangan ubah nginx.
- Jangan recreate duplicate workflow.
- Jangan rewrite besar.
- Incremental only.
- Jangan reintroduce MutationObserver/runtime injector.
- DB-first/PostgreSQL hybrid behavior jangan diubah kecuali memang targetnya.
- API response contract harus tetap sama.
- Keep file fallback safe.
- Avoid breaking existing endpoints:
  - `/sap-api/health`
  - `/sap-api/history`
  - `/sap-api/evidence`
  - `/sap-api/upload`
  - `/sap-api/evidence-history`
  - `/sap-api/parsed-results-history`

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

## Core RCA Tools Only

1. RCA Comparator / WP-SCOUT Analyzer
2. ST03N Analyzer
3. Log Triage / Log Evidence V2

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

Service function:

```python
list_parsed_results_history_dbfirst()
```

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
- Route delegation from `backend/evidence_api.py` is not completed yet because a full-file GitHub connector update was blocked.
- Next attempt should patch route imports/functions in smaller chunks, or do local CLI when allowed later.

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

- It now uses `timeline_service.py` for timeline event append.
- Route delegation from `backend/evidence_api.py` is pending.

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
- Route delegation from `backend/evidence_api.py` is pending.

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
- Route delegation from `backend/evidence_api.py` is pending.
- Response contracts preserved:
  - update evidence metadata
  - download evidence FileResponse
  - delete evidence metadata/file

### Backend modularization status doc

File:
`docs/runtime/backend-modularization-status.md`

Status:
- Documents service layer status, pending route delegation, blocked maintenance service attempt, and next safe targets.

## Current Service Layer Files

```text
backend/case_service.py
backend/evidence_history_service.py
backend/evidence_mutation_service.py
backend/evidence_upload_service.py
backend/mobile_case_service.py
backend/parsed_result_service.py
backend/parsed_results_history_service.py
backend/timeline_service.py
backend/dbfirst_read_helpers.py
```

## Latest Relevant Commits

```text
30ec693d Document backend modularization status
945e3e37 Add evidence mutation service helpers
72048a6f Use timeline service in parsed result writes
d11a5d78 Add timeline service helpers
8901df06 Add mobile case service wrapper
0f0544de Add parsed result write service
d74d74c7 Add case service wrapper
0134f0e1 Add helper to watch latest SAPDEV deploy run
8fdf5784 Delegate parsed results history route to service
702f5650 Add parsed results history service
```

## Attempted But Blocked

### Maintenance cleanup service

Attempted target:
`backend/maintenance_service.py`

Reason not completed:
- GitHub connector safety blocked the create-file call because the code contained cleanup/delete operations.

Recommended handling:
- Do not force this via connector.
- Defer until local CLI work is allowed, or make the change manually with normal repo review.

### Full-file evidence_api.py route delegation

Attempted target:
- delegate case routes to `case_service.py`

Reason not completed:
- GitHub connector blocked large full-file update.

Recommended handling:
- Use smaller patches only.
- Prefer creating service files and documenting status via GitHub connector.
- If local CLI is allowed later, do the import/body route delegation locally and validate.

## Next Safest Targets

Recommended next target:

```text
backend/dbfirst_middleware.py
```

Goal:
- isolate DB-first read middleware logic out of `backend/evidence_api.py`.
- keep API contract unchanged.
- keep hybrid PostgreSQL/file fallback behavior unchanged.

Alternative next targets:

```text
backend/correlation_service.py
backend/session_service.py
```

Or, if small patching to `evidence_api.py` is possible:

```text
thin-route delegation one route group at a time:
/cases
/cases/{case_id}
/cases/{case_id}/parsed-results
/mobile/cases
/mobile/cases/{case_id}
/mobile/cases/{case_id}/analytics
/evidence/{evidence_id}/download
/evidence/{evidence_id} update/delete
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
- Latest observed successful auto deploy: Run ID `25628363768`, conclusion `success`.
- Helper script exists: `scripts/watch-latest-sapdev-run.sh`.
- Backend service modularization sudah lanjut.
- Services sudah ada:
  - `backend/case_service.py`
  - `backend/evidence_history_service.py`
  - `backend/evidence_mutation_service.py`
  - `backend/evidence_upload_service.py`
  - `backend/mobile_case_service.py`
  - `backend/parsed_result_service.py`
  - `backend/parsed_results_history_service.py`
  - `backend/timeline_service.py`
- `parsed_result_service.py` sudah pakai `timeline_service.py`.
- `parsed-results-history` route sudah delegate ke service.
- Evidence upload/history/read sudah delegate ke service.
- Case/mobile/evidence mutation service files sudah ada, tapi route delegation dari `evidence_api.py` masih pending.
- Maintenance cleanup service attempt diblok GitHub connector safety, jangan dipaksa via connector.

Rules:
- Jangan rewrite besar.
- Incremental only.
- Jangan recreate duplicate workflow.
- Jangan reintroduce MutationObserver/runtime injector.
- DB-first/PostgreSQL hybrid behavior jangan diubah kecuali targetnya.
- API response contract harus tetap sama.

Target berikutnya:
Prioritaskan isolate DB-first middleware ke `backend/dbfirst_middleware.py`, atau lanjut service-layer foundation yang tidak butuh full-file rewrite.
