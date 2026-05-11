# Backend Modularization Status

Project: SAP Intelligent RCA Workspace  
Branch: `dev`  
Scope: backend service-layer extraction, RCA intelligence foundation, frontend RCA workflow cleanup

## Guardrails

- Do not touch PROD.
- Do not change nginx.
- Do not recreate duplicate GitHub workflows.
- Keep incremental patches only.
- Do not reintroduce MutationObserver/runtime injector.
- Keep DB-first/PostgreSQL hybrid behavior unchanged unless explicitly targeted.
- Keep API response contracts unchanged.
- GitHub connector mode only unless local CLI is explicitly allowed.

## Current Architecture Shape

```text
FastAPI Routes
↓
Service Layer
↓
DB-first Helpers
↓
PostgreSQL / File fallback
↓
Frontend RCA Case Detail / PDF / Replay UI
```

`backend/evidence_api.py` is now a thin FastAPI route layer for the major RCA evidence/case endpoints.

## Current Backend Service Files

```text
backend/case_service.py
backend/correlation_service.py
backend/dbfirst_middleware.py
backend/dbfirst_read_helpers.py
backend/evidence_history_service.py
backend/evidence_mutation_service.py
backend/evidence_upload_service.py
backend/mobile_case_service.py
backend/parsed_result_service.py
backend/parsed_results_history_service.py
backend/session_service.py
backend/timeline_service.py
```

## Current Frontend RCA Case Detail Files

```text
src/app/pages/CaseDetailWithAnalytics.jsx
src/app/pages/RCAFocusPanel.jsx
src/app/pages/CorrelationSummary.jsx
src/app/pages/SessionReplayPanel.jsx
src/app/pages/rca-panel-utils.js
```

## Completed Backend Work

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
- `/upload` route is thin.
- Upload behavior preserved.
- Case linking preserved.
- PostgreSQL hybrid best-effort write preserved.
- File fallback behavior preserved.

### Evidence history/read

File:

```text
backend/evidence_history_service.py
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

Routes delegated:

```text
GET /mobile/cases
GET /mobile/cases/{case_id}
GET /mobile/cases/{case_id}/analytics
```

Response contracts preserved.

### RCA correlation service

File:

```text
backend/correlation_service.py
```

Core functions:

```python
normalize_parsed_result()
correlate_parsed_results()
build_recommended_actions()
correlate_case()
```

Route exposed:

```text
GET /cases/{case_id}/correlation
```

Status:
- Deterministic RCA correlation foundation exists.
- No external AI call.
- No DB schema change.
- Does not mutate case data.
- Supports WP-SCOUT / RCA Comparator, ST03N, and Log Triage tool aliases.

### RCA session service

File:

```text
backend/session_service.py
```

Core functions:

```python
summarize_session()
build_session_replay()
create_session_from_case()
get_session_item()
```

Route exposed:

```text
GET /cases/{case_id}/session
```

Status:
- Additive only.
- No DB migration.
- No persistent session store yet.
- Builds case-session payload from existing case data.
- Replay merges evidence events, parsed results, case timeline, and correlation signals.

Response shape:

```text
ok
mode
session_id
case_id
summary
correlation
replay
```

## Completed Frontend Work

### RCA correlation panel

Files:

```text
src/evidence-api-client.js
src/app/pages/CaseDetailWithAnalytics.jsx
src/app/pages/CorrelationSummary.jsx
```

Status:
- `getCaseCorrelation(caseId)` API helper exists.
- Case detail analytics page fetches `/cases/{case_id}/correlation` separately from mobile case analytics.
- UI shows `RCA Correlation Summary` with severity, confidence, correlated tool count, affected host count, top root cause, related workprocesses, correlation sources, and recommended actions.
- Failure to load correlation does not block case detail rendering.
- DOM markers are present for structured PDF extraction:
  - `data-rca-correlation="true"`
  - `data-correlation-severity`
  - `data-correlation-confidence`
  - `data-correlation-root-cause`

### RCA focus panel

File:

```text
src/app/pages/RCAFocusPanel.jsx
```

Status:
- Sticky RCA Focus panel added to case detail.
- Shows primary suspect, confidence, impact, next check, and evidence state.
- Goal is to reduce generic-card feel and make the case detail page more operational.

### Session replay UI

Files:

```text
src/evidence-api-client.js
src/app/pages/SessionReplayPanel.jsx
```

Status:
- `getCaseSession(caseId)` API helper exists.
- `getCaseReplay(caseId)` now prefers `/cases/{case_id}/session` and falls back to legacy case-based replay.
- Case detail page shows `Investigation Replay Timeline` when replay data is available.
- Replay currently renders as a compact event list; visual timeline upgrade is still pending.

### Case detail cleanup

Files:

```text
src/app/pages/CaseDetailWithAnalytics.jsx
src/app/pages/RCAFocusPanel.jsx
src/app/pages/CorrelationSummary.jsx
src/app/pages/SessionReplayPanel.jsx
src/app/pages/rca-panel-utils.js
```

Status:
- `CaseDetailWithAnalytics.jsx` is now closer to page orchestration only.
- RCA Focus, Correlation Summary, and Session Replay panels have been extracted.
- Shared helpers moved to `rca-panel-utils.js`.
- This reduced component monolith risk and makes next CSS/mobile cleanup safer.

### PDF RCA correlation summary

File:

```text
src/features/pdf/structuredPdf.js
```

Status:
- Structured PDF export can collect the visible RCA correlation panel from DOM markers.
- PDF includes optional `RCA Correlation Summary` section when the panel is present.
- PDF section includes severity, confidence, top root cause, correlation metrics, and recommended correlation actions.
- Fallback-safe: if no correlation panel exists, the existing PDF format continues normally.
- Screenshot-based export was not introduced.

## Current Progress Estimate

```text
Backend Architecture: 86%
RCA Engine / Intelligence: 76%
UI/UX Platform: 81%
Mobile View: 79%
Maintainability: 84%
Observability Workspace Feel: 78%
Production-grade Stability: 72%
Enterprise Workflow Readiness: 66%
```

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
c709494 Use extracted RCA case detail panels
15228ac Extract session replay panel component
f5ef775 Extract correlation summary component
d0bcba3 Extract RCA focus panel component
8362aa7 Extract RCA panel utility helpers
37b37ca Add RCA focus panel to case detail
8deb8cc Add session replay timeline panel
76adfcf Add case session API client helper
f6c9dbb Add case session route
c21542f Add RCA session service foundation
20b0046 Include RCA correlation summary in PDF export
bb0f978 Add correlation DOM markers for PDF export
e684346 Add RCA correlation summary panel
d6ac496 Add case correlation API client helper
682489e Add case correlation route
96649b9 Add RCA correlation service foundation
12065bb Clean delegated evidence API imports
42d8a99 Delegate case routes to services
10a39a3 Delegate evidence mutation routes to service
c5d7841 Delegate mobile case routes to service
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

1. Optional frontend/deploy validation through GitHub Actions status only.
2. CSS cleanup for extracted case detail panels:
   - move inline styles from panel components to CSS classes
   - compact spacing
   - mobile-safe sticky behavior
3. Replay Timeline Visual Upgrade:
   - vertical timeline rail
   - severity marker
   - collapsible detail
   - compact mobile mode
4. Audit duplicate panels/cards across case detail and analytics.
5. Update PDF with session replay appendix after replay UI is stable.

## Validation Commands

Use only when CLI/local validation is allowed:

```bash
cd /home/sadmin/sap
npm run build
bash scripts/qa-backend-syntax.sh
bash scripts/qa-sapdev.sh
```

For GitHub-only flow, rely on the auto deploy workflow run status after each push to `dev`.
