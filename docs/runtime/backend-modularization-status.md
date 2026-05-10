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

## Completed Extractions

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

```text
backend/parsed_results_history_service.py
```

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

Status:
- Service file exists.
- Route delegation from `backend/evidence_api.py` is not completed yet because a full-file connector update was blocked.
- Next attempt should patch route imports/functions in smaller chunks or from local CLI if allowed later.

### Parsed result write service

File:

```text
backend/parsed_result_service.py
```

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

Status:
- Service file exists.
- Route delegation from `backend/evidence_api.py` is pending.

### Evidence mutation service

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

Status:
- Service file exists.
- Route delegation from `backend/evidence_api.py` is pending.
- Response contracts preserved:
  - update evidence metadata
  - download evidence FileResponse
  - delete evidence metadata/file

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

## Known Auto Deploy Status

Latest observed successful auto deploy after helper script commit:

```text
Run ID: 25628363768
Conclusion: success
Title: Add helper to watch latest SAPDEV deploy run
```

Helper script:

```text
scripts/watch-latest-sapdev-run.sh
```

Usage:

```bash
bash scripts/watch-latest-sapdev-run.sh
```

## Next Safest Targets

1. Thin-route delegation in `backend/evidence_api.py`, one route group at a time:

```text
/cases
/cases/{case_id}
/cases/{case_id}/parsed-results
/mobile/cases
/mobile/cases/{case_id}
/mobile/cases/{case_id}/analytics
/evidence/{evidence_id}/download
/evidence/{evidence_id} update/delete
```

2. DB-first middleware isolation:

```text
backend/dbfirst_middleware.py
```

3. RCA correlation engine foundation:

```text
backend/correlation_service.py
```

4. Persistent RCA session foundation:

```text
backend/session_service.py
```

## Validation Commands

Use only when CLI/local validation is allowed:

```bash
cd /home/sadmin/sap
npm run build
bash scripts/qa-backend-syntax.sh
bash scripts/qa-sapdev.sh
```

For GitHub-only flow, rely on the auto deploy workflow run status after each push to `dev`.
