# SAP Intelligent RCA Workspace — Next Chat Prompt

Use this file to continue the project in a new chat without re-explaining the current state.

## Continuation Prompt — DB-first RCA Ingestion + Real SAP Sample Quality

```text
Lanjut SAP Intelligent RCA Workspace — fokus DB-first RCA ingestion dan real SAP sample quality.

Repo:
- finuxpert/cbj-sap

Branch:
- dev

Mode:
- GitHub connector only
- incremental patch only
- jangan pakai local CLI kecuali saya izinkan
- jangan sentuh PROD/nginx kecuali diminta eksplisit
- jangan reintroduce MutationObserver/runtime injector
- jangan rewrite besar
- fokus real SAP ingestion quality, RCA normalization, PostgreSQL persistence, dan Case History stability
- pertahankan API contract
- pertahankan hybrid PostgreSQL/file fallback selama transisi

Current infra:
- DEV URL: https://sapdev.cbj-kontruksi.com
- Backend service: sap-evidence-api.service
- Backend internal API: http://127.0.0.1:8090
- Public API path: https://sapdev.cbj-kontruksi.com/sap-api
- PostgreSQL container: cbj-postgres-dev
- Database: sap_rca_dev
- Storage root: /var/www/svr01-dev/sap-data
- Legacy case JSON path: /var/www/svr01-dev/sap-data/cases

Current status:
- DB clean-state sudah berhasil divalidasi beberapa kali.
- Legacy JSON leakage sudah ditutup dengan strict DB-first reads.
- File-based dummy/QA cases sudah dibersihkan/diarsipkan.
- QA auto pollution dari workflow sudah dihentikan.
- Case delete cascade sudah bekerja end-to-end.
- SID/environment inference sudah berhasil dites via API.
- Real lifecycle sudah valid: create case -> upload evidence -> save parsed result -> delete cascade.

Latest validated manual API result:
- Created case title: H1P PRD CONVT_NO_NUMBER test
- Result: sid=H1P, environment=PRD, severity=CRIT, db_write.status=ok

Important recent commits:
- 6df968118042182a82ff3b6eccac561a498a8d5d — Make DB-first case reads strict for clean state
- c11166a83b622c744bf0e48a1787d3a3ed6cb9fb — Make mobile case flow DB-first
- 0deee3bff57f17b96cce4fc42711a8083fbc8cda — Stop SAPDEV deploy from seeding QA cases
- 9c5ee17a7ad003e66a6a5baf3b505c90567f47c9 — Normalize RCA parsed result persistence
- bd8a68100b4d49ec0ee38d4825769ffc1ccf70b8 — Add DB cascade delete for case maintenance
- c0e1cc6db9965b165607581eba12913b5406c278 — Wire case delete endpoint to DB cascade
- b6e72f83c7cd1d44c36bd78c19e50e3989cba2eb — Surface normalized RCA fields from DB reads
- 7c023881d530bf848f9fdecc42410080e08d3131 — Add SID and environment inference for cases

What is now fixed:
1. /cases DB-first strict mode:
   - Empty PostgreSQL returns empty response, not legacy JSON fallback.
   - Response keeps both `cases` and `items` for frontend compatibility.

2. /mobile/cases DB-first:
   - Mobile/history panels no longer leak legacy JSON cases in clean state.

3. QA workflow no longer pollutes DB:
   - Deploy workflow no longer runs mutating QA automatically.
   - Mutating QA requires explicit manual opt-in.

4. RCA parsed result normalization:
   - backend/parsed_result_service.py normalizes SID, environment, hosts, severity, top_suspect taxonomy, and case stage.
   - Initial taxonomy includes ABAP conversion/data format, ABAP runtime dump, background job failure, WP saturation, DB response time, enqueue contention, RFC communication, and memory pressure.

5. DB read enrichment:
   - backend/dbfirst_read_helpers.py promotes result_json.normalized_rca into top-level API fields.
   - Parsed results can expose sid, environment, hosts, affected_hosts, instances, workprocesses, jobs, programs, transactions, users, error_signatures, log_families, correlation_keys, evidence_ids, and rca_model_version.

6. Case delete cascade:
   - DELETE /cases/{id} now removes case, parsed_results, evidence, reports, audit_logs, analytics_cache, and legacy JSON file if present.
   - Validated by deleting CASE-20260515-001 and CASE-20260515-002, then count returned to 0.

7. SID/environment inference during case creation:
   - backend/case_service.py infers SID/env from title, summary, anomaly, and suspect.
   - Validated with title `H1P PRD CONVT_NO_NUMBER test`.

Known issues / gaps:
1. Frontend Log Evidence V2 still has old UX for case metadata; backend now handles inference but UI does not expose explicit SID/env inputs yet.
2. ToolLogEvidenceV2.jsx stores selected case id in localStorage. After DB cleanup, browser can keep stale case id and cause 404 when saving parsed result.
3. Upload can happen before current case exists if stale case id is selected or user saves in wrong order.
4. Need frontend guard to clear stale CASE_KEY when selected case no longer exists.
5. Need manual SID/env fields in CaseLinkPanel for Log Evidence V2.
6. Need stronger evidence upload ordering: create/select case first, then save parsed result + upload evidence.
7. Current DB schema stores normalized RCA mostly in result_json.normalized_rca; read helper promotes it to top-level API fields.
8. Case stage may still need stronger DB persistence/model migration later.
9. Grafana panels may need refresh/update to use enriched fields.
10. ST03N structured persistence still needs deeper model.

Recommended next patch:
- Patch src/tools/ToolLogEvidenceV2.jsx incrementally:
  1. Add SID input and Environment select in CaseLinkPanel.
  2. Store metadata state: sid/environment.
  3. Send sid/environment in createCase payload.
  4. Send sid/environment in saveParsedResult payload.
  5. Send sid in uploadEvidence metadata.
  6. Validate selected case id before save; if 404, clear CASE_KEY and show message.
  7. Clarify UX text: Create/select case first, then save parsed summary and evidence.

After that:
- Upload one real SAP sample from Log Evidence V2.
- Validate cases count, parsed_results count, evidence count.
- Confirm case_stage becomes CLASSIFIED after parsed result.
- Confirm top_suspect canonical if taxonomy matches.
- Confirm sid/environment populated either from UI or inference.
- Confirm delete cascade returns all counts to 0.

Primary files for next patch:
- src/tools/ToolLogEvidenceV2.jsx
- src/evidence-api-client.js
- backend/case_service.py
- backend/parsed_result_service.py
- backend/dbfirst_read_helpers.py
- backend/db/repositories.py
- backend/evidence_upload_service.py

Guardrails:
- Incremental only.
- Do not touch PROD.
- Do not touch nginx unless explicitly requested.
- Do not reintroduce runtime injectors/MutationObserver.
- Do not rewrite large frontend modules.
- Prefer backend-safe compatibility and frontend small UX improvement.
```

## Current Scores

| Area | Score |
|---|---:|
| DB-first read architecture | 94 |
| Case lifecycle maintenance | 95 |
| Delete cascade safety | 96 |
| QA pollution control | 96 |
| Real SAP ingestion foundation | 88 |
| RCA normalization engine | 86 |
| Frontend ingestion UX | 74 |
| ST03N structured persistence | 72 |
| Grafana RCA aggregation | 80 |
| Overall RCA workspace maturity | 88 |

## Best Next First Patch

```text
Patch ToolLogEvidenceV2.jsx incrementally to add SID/environment metadata controls, pass them through createCase/saveParsedResult/uploadEvidence, and clear stale localStorage case id when backend returns 404. Keep backend unchanged unless required by build.
```
