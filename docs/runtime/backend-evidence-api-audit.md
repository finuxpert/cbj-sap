# SPHERE Backend Evidence API Audit

Generated: 2026-05-10
Branch: `dev`
Runtime: PostgreSQL Hybrid with JSON/file fallback
Service: `sap-evidence-api.service`

## Current backend state

The active backend API is centered around:

- `backend/evidence_api.py`
- FastAPI service
- Evidence file storage
- Case history storage
- Parsed result persistence
- DB-first read helpers
- JSON/file fallback
- Hybrid runtime health reporting

## What is healthy

- Backend exposes a clear `/health` endpoint.
- Storage paths are configurable through environment variables.
- Upload file types are restricted through an allowlist.
- File names and case IDs are sanitized before filesystem use.
- PostgreSQL DB writes are best-effort and do not remove JSON/file writes.
- DB-first reads are additive and fall back to file-backed behavior.
- Case, evidence, mobile case detail, and parsed result endpoints are available.
- `scripts/qa-sapdev.sh` now validates hybrid runtime read contracts.

## Current technical debt

### 1. Monolithic API file

`backend/evidence_api.py` currently mixes:

- FastAPI app initialization
- CORS configuration
- storage path constants
- filesystem helpers
- Pydantic models
- case routes
- evidence routes
- upload handling
- parsed result routes
- mobile routes
- maintenance routes
- DB-first middleware
- DB-first explicit routes

This makes small backend changes harder to review and increases regression risk.

### 2. Additive DB-first patch style

The DB-first layer is currently safe, but it is appended as a patch block. This is acceptable for incremental delivery, but it should eventually be normalized into clearer service/router modules.

Current rule: do not rewrite this in one large patch.

### 3. Response shape duplication

Repeated response fields appear in multiple endpoints:

- `ok`
- `read_source`
- `mode`
- `count`
- `fallback_reason`

A later cleanup can add small helper functions, but endpoint response shape must stay compatible.

### 4. QA-generated records

The deploy QA creates validation cases and evidence. The QA script now auto-closes the generated case after success, but old QA records may still exist in the dataset.

Recommended future cleanup:

- Add server-side filter for `created_by=qa-sapdev`
- Add admin-only cleanup for old QA evidence/cases
- Do not delete real investigation data automatically

## Safe extraction map

Refactor only in this order, one small commit at a time.

### Step 1 — Models

Extract Pydantic models only:

- `EvidenceUpdate`
- `CaseCreate`
- `CaseUpdate`
- `ParsedResultCreate`

Proposed file:

```text
backend/models.py
```

Risk: low.

Validation:

```bash
python -m py_compile backend/evidence_api.py backend/models.py
sudo systemctl restart sap-evidence-api.service
curl -s http://127.0.0.1:8090/health
```

### Step 2 — Storage helpers

Extract filesystem helper functions:

- `ensure_dirs`
- `safe_name`
- `safe_case_id`
- `now_iso`
- `case_path`
- `read_case`
- `write_case`
- `read_meta`
- `write_meta`

Proposed file:

```text
backend/storage.py
```

Risk: medium because path constants and environment variables must remain identical.

### Step 3 — Case service helpers

Extract case summarization helpers:

- `make_case_no`
- `summarize_case`
- `mobile_case_payload`

Proposed file:

```text
backend/case_service.py
```

Risk: low-medium.

### Step 4 — DB-first runtime helpers

Keep using existing:

```text
backend/dbfirst_read_helpers.py
```

Do not merge or rewrite this until case/evidence extraction is stable.

### Step 5 — Routers

Only after helpers are stable, split routes:

```text
backend/routers/cases.py
backend/routers/evidence.py
backend/routers/history.py
backend/routers/mobile.py
backend/routers/maintenance.py
```

Risk: medium-high. Do not start here.

## Endpoint compatibility rules

Preserve these response fields where already present:

- `ok`
- `case`
- `items`
- `cases`
- `evidence`
- `parsed_results`
- `read_source`
- `mode`
- `count`
- `fallback_reason`
- `db_write`

Do not rename these without frontend changes and QA validation.

## Runtime rules

Do not change without explicit approval:

- `/sap-api` public route
- service name `sap-evidence-api.service`
- storage root `/var/www/svr01-dev/sap-data`
- DB schema
- JSON/file fallback
- upload allowlist behavior
- nginx or Cloudflare configuration

## Backend QA checklist

### Local syntax check

```bash
python -m py_compile backend/evidence_api.py
python -m py_compile backend/dbfirst_read_helpers.py
python -m py_compile backend/case_analytics.py
```

### Runtime service check

```bash
sudo systemctl restart sap-evidence-api.service
sudo systemctl status sap-evidence-api.service --no-pager
curl -s http://127.0.0.1:8090/health | jq
```

### Public API checks

```bash
curl -s https://sapdev.cbj-kontruksi.com/sap-api/health | jq '{status:.status, case_history:.case_history, database:.database}'
curl -s https://sapdev.cbj-kontruksi.com/sap-api/cases | jq '{ok:.ok, read_source:.read_source, mode:.mode, count:.count}'
curl -s https://sapdev.cbj-kontruksi.com/sap-api/evidence-history | jq '{ok:.ok, read_source:.read_source, mode:.mode, count:.count, fallback_reason:(.fallback_reason // null)}'
curl -s https://sapdev.cbj-kontruksi.com/sap-api/parsed-results-history | jq '{ok:.ok, read_source:.read_source, mode:.mode, count:.count, fallback_reason:(.fallback_reason // null)}'
```

### Deploy QA

```bash
bash scripts/qa-sapdev.sh
```

## Recommended next backend patch

Next safest code refactor:

1. Extract Pydantic models to `backend/models.py`.
2. Update imports in `backend/evidence_api.py`.
3. Run py_compile and deploy QA.

This is low-risk because it does not modify endpoint logic, database behavior, or fallback behavior.

## Non-goals for now

Do not do these yet:

- Full FastAPI router split
- DB schema migration
- endpoint rename
- authentication layer
- background cleanup job
- destructive data cleanup
- automatic deletion of old evidence
- runtime path changes
