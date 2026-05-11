# Backend Modularization Status

Project: SAP Intelligent RCA Workspace  
Branch: `dev`  
Scope: backend service-layer extraction only

## Guardrails

- Do not touch PROD.
- Do not change nginx.
- Do not recreate duplicate GitHub workflows.
- Keep incremental patches only.
- Do not reintroduce MutationObserver/runtime injector.
- Keep DB-first/PostgreSQL hybrid behavior unchanged unless explicitly targeted.
- Keep API response contracts unchanged.

## Current Backend Shape

```text
FastAPI Routes
↓
Service Layer
↓
DB-first Helpers
↓
PostgreSQL / File fallback
```

`backend/evidence_api.py` is now a thin FastAPI route layer for the major RCA evidence/case endpoints.

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

## Completed Extractions

### DB-first read middleware

File:

```text
backend/dbfirst_middleware.py
```

Status:
- DB-first read middleware has been extracted out of `backend/evidence_api.py`.
- `backend/evidence_api.py` imports and registers `dbfirst_read_middleware`.
- Hybrid behavior preserved:
  - only GET requests intercepted
  - DB runtime must be enabled
  - empty/missing DB rows fall through to legacy file-backed routes
  - DB exceptions fall through to file-backed route and store fallback reason

### Evidence upload

File:

```text
backend/evidence_upload_service.py
```

Status:
- `/upload` route is already thin.
- Upload behavior preserved.
- Case linking preserved.
- PostgreSQL hybrid best-effort write preserved.
- File fallback behavior preserved.

### Evidence history/read

File:

```text
backend/evidence_history_service.py
```

Service functions:

```python
list_evidence_items()
get_evidence_item()
list_evidence_history_dbfirst()
```

Routes delegated:

```text
GET /evidence
GET /evidence/{evidence_id}
GET /evidence-history
GET /history/evidence
GET /evidence/history
```

### Evidence mutation

File:

```text
backend/evidence_mutation_service.py
```

Service functions:

```python
update_evidence_item()
get_evidence_download_response()
delete_evidence_item()
```

Routes delegated:

```text
POST /evidence/{evidence_id}
GET /evidence/{evidence_id}/download
DELETE /evidence/{evidence_id}
```

Response contracts preserved:
- update evidence metadata returns `ok`, `evidence`, `db_write`
- download evidence returns `FileResponse` with existing 404 behavior
- delete evidence returns `ok`, `deleted`

### Parsed results history

File:

```text
backend/parsed_results_history_service.py
```

Service function:

```python
list_parsed_results_history_dbfirst()
```

Route delegated:

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

### Case service

File:

```text
backend/case_service.py
```

Service functions:

```python
create_case_item()
list_case_items()
get_case_item()
update_case_item()
delete_case_item()
```

Routes delegated:

```text
POST /cases
GET /cases
GET /cases/{case_id}
PATCH /cases/{case_id}
DELETE /cases/{case_id}
```

Response contracts preserved:
- create/update returns `ok`, `case`, `db_write`
- list returns `ok`, `count`, `items`
- get returns `ok`, `case`
- delete returns `ok`, `deleted`

### Parsed result write service

File:

```text
backend/parsed_result_service.py
```

Service function:

```python
add_case_parsed_result()
```

Route delegated:

```text
POST /cases/{case_id}/parsed-results
```

Contract preserved:

```text
ok
result
case
analytics
db_write
```

### Timeline service

File:

```text
backend/timeline_service.py
```

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

```text
backend/mobile_case_service.py
```

Service functions:

```python
list_mobile_case_items()
get_mobile_case_item()
get_mobile_case_analytics_item()
```

Routes delegated:

```text
GET /mobile/cases
GET /mobile/cases/{case_id}
GET /mobile/cases/{case_id}/analytics
```

Response contracts preserved.

### Evidence API cleanup

File:

```text
backend/evidence_api.py
```

Status:
- Major route groups are delegated to service modules.
- Legacy inline business logic was removed from route bodies.
- Unused legacy imports were cleaned.
- `JSONResponse` import is present for explicit DB-first evidence history routes.

## Attempted But Blocked

### Maintenance cleanup service

Attempted target:

```text
backend/maintenance_service.py
```

Reason not completed:
- GitHub connector safety blocked the create-file call because the code contained cleanup/delete operations.

Recommended handling:
- Do not force this via connector.
- Defer until local CLI work is allowed, or make the change manually with normal repo review.

## Latest Relevant Commits

```text
12065bb Clean delegated evidence API imports
42d8a99 Delegate case routes to services
10a39a3 Delegate evidence mutation routes to service
c5d7841 Delegate mobile case routes to service
945e3e37 Add evidence mutation service helpers
72048a6f Use timeline service in parsed result writes
d11a5d78 Add timeline service helpers
8901df06 Add mobile case service wrapper
0f0544de Add parsed result write service
d74d74c7 Add case service wrapper
8fdf5784 Delegate parsed results history route to service
702f5650 Add parsed results history service
```

## Known Auto Deploy Status

Latest previously observed successful auto deploy after helper script commit:

```text
Run ID: 25628363768
Conclusion: success
Title: Add helper to watch latest SAPDEV deploy run
```

Helper script:

```text
scripts/watch-latest-sapdev-run.sh
```

Usage when local CLI is allowed:

```bash
bash scripts/watch-latest-sapdev-run.sh
```

## Next Safest Targets

1. Optional backend syntax/deploy validation through GitHub Actions status only.
2. Add RCA correlation service foundation:

```text
backend/correlation_service.py
```

3. Add persistent RCA session foundation:

```text
backend/session_service.py
```

4. Frontend Evidence History UI integration.

## Validation Commands

Use only when CLI/local validation is allowed:

```bash
cd /home/sadmin/sap
npm run build
bash scripts/qa-backend-syntax.sh
bash scripts/qa-sapdev.sh
```

For GitHub-only flow, rely on the auto deploy workflow run status after each push to `dev`.
