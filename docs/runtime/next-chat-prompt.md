# SAP Intelligent RCA Workspace — Next Chat Prompt

Use this file to continue the project in a new chat without re-explaining the current state.

## Continuation Prompt — Full DB Case History + Grafana-ready RCA Ingestion

```text
Lanjut SAP Intelligent RCA Workspace — Case History sekarang diarahkan full DB supaya UI/API/Grafana pakai satu source of truth.

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
- fokus full PostgreSQL Case History, Grafana readiness, real SAP ingestion quality, RCA normalization, dan Case History stability
- pertahankan API contract semampunya, tapi DB adalah source of truth untuk Case History
- file system hanya untuk binary evidence storage, bukan source of truth Case History

Current infra:
- DEV URL: https://sapdev.cbj-kontruksi.com
- Backend service: sap-evidence-api.service
- Backend internal API: http://127.0.0.1:8090
- Public API path: https://sapdev.cbj-kontruksi.com/sap-api
- PostgreSQL container: cbj-postgres-dev
- Database: sap_rca_dev
- Storage root: /var/www/svr01-dev/sap-data
- File storage role: binary evidence only
- Legacy case JSON path exists but must not be used as Case History source of truth

Validated baseline:
- DB clean-state already validated.
- Strict DB-first reads active.
- Legacy JSON leakage closed for /cases and /mobile/cases.
- QA auto-seeding disabled by default.
- Case delete cascade works end-to-end.
- SID/environment inference works during case creation and parsed-result normalization.
- Official SAPDEV workflow cleans previous Vite dist before build to avoid old EACCES asset unlink issue.

Recent case-flow stabilization commits:
- 673af3c15571c43733672532dd64b085666e3887 — Clean SAPDEV build output before Vite build.
- fbafce5 — Align SAPDEV QA marker with case history save label.
- f88b327 — Harden API JSON parsing for deploy build.
- 81a0ec5 — Await create case action in panel.
- df4b2b1 — Harden create case link flow.
- 22ae144 — Improve API error response handling.
- dd98004 — Stop WP-SCOUT upload from saving case history.
- e365baf — Create identity-only RCA cases.
- 300a34f97cbb3b724b2436c5a0e6f75f272ec2c5 — Pass explicit save intent through case link panel.
- 79cf161890dfddaed8ed7353be3db7df2afe4bc1 — Use direct explicit save flag for case history writes.
- 0fd0106081c861c4e3a30129385aa4daa1ffb219 — Forward explicit save intent from Log Evidence panel.
- 47325ee593f7e9dacdd14dcdb074031e396639ec — Keep case identity fields stable after parsed result save.
- 6233234d72bd9f77e62ad16d2b0f8396007b0902 — Add case flow regression QA contract.
- e2397a18dca52f5a9124e918826e4b003ddac6af — Run case flow regression QA in SAPDEV deploy.
- 56cce3e614a5117296d29f195f3892571089811f — Keep case flow QA isolated from DEV database.

Recent full-DB/Grafana direction commits:
- 4b439aaa1467e9d789a9ab51f1029f194c89ca07 — Make parsed results history DB-only when database is enabled.
- 863ef38dda0799dfd405c3b8e71c667c559174be — Make evidence history DB-only for Grafana consistency.
- 3bd90d881b16b1a2b8dffbd40e393de7de7de6da — Report DB mode consistently for DB-first reads.
- 1415e640128d880c54cef413a08e3cb38da636b0 — Require DB write success for case mutations when DB is enabled.
- 6ba2f78871deac05609cd97c6ff5b9d718c9a087 — Require DB write success for parsed result persistence.
- ff12803ec89e4375672c824461ba069e6194ed8c — Require DB write success for evidence uploads.
- 5d45b0ae65ea5fefd5e786c32be493c386ab88c9 — Report Case History as DB source of truth in health.

Full DB Case History contract:
1. /cases, /mobile/cases, single case detail:
   - read PostgreSQL through DB-first middleware when DB runtime is enabled
   - no legacy JSON fallback for Case History UI/Grafana state

2. /parsed-results-history:
   - DB-only when DB runtime is enabled
   - returns read_source=postgres
   - no fallback to JSON parsed_results

3. /evidence-history:
   - DB-only when DB runtime is enabled
   - returns read_source=postgres
   - no fallback to file metadata

4. Mutations:
   - create/update case requires DB write success when DB is enabled
   - save parsed result requires DB case update and parsed_result insert success when DB is enabled
   - upload evidence stores binary file on disk but requires DB metadata write success when DB is enabled
   - API must not claim success if PostgreSQL write failed, because Grafana depends on DB

5. File system:
   - still used for uploaded evidence binaries
   - not the source of truth for Case History, parsed results, or evidence history

Case flow contract:
1. Upload & Analyze:
   - analyzes only
   - must not save parsed_results automatically
   - must not upload evidence to Case History automatically

2. Create Case:
   - identity-only case
   - status OPEN
   - case_stage INTAKE
   - severity INFO for frontend identity flow
   - summary/top_anomaly/top_suspect empty
   - SID/environment may be explicit from UI or inferred by backend

3. Save to Case History:
   - requires explicit UI save intent
   - writes parsed_results
   - uploads linked evidence files
   - may classify case_stage and severity
   - must not overwrite case title, summary, top_anomaly, or top_suspect
   - RCA findings remain inside parsed_results / normalized_rca

Regression QA added:
- scripts/qa-case-flow-contracts.sh
- Runs from .github/workflows/dev-deploy.yml after scripts/qa-backend-syntax.sh
- Uses temp SAP_EVIDENCE_ROOT
- Forces DB_MODE=file and DATABASE_URL="" so it is non-mutating and does not touch PostgreSQL DEV
- Asserts DB is disabled during QA
- Asserts parsed result does not overwrite identity fields

Important QA notes:
- Do not use old contaminated cases like CASE-20260515-001.
- Use fresh cases such as ISSUE-5 / ISSUE-6 / CASE generated after latest deploy.
- Before Save to Case History: parsed-results-history?case_id=CASE_ID should return 0 from PostgreSQL.
- After Save to Case History: parsed result count should be > 0 and evidence_count > 0 if files were uploaded.
- Grafana should query PostgreSQL tables directly: cases, parsed_results, evidence.

Known operational note:
- GitHub connector commits update branch dev, but may not expose workflow_dispatch in available tools.
- If workflow_runs are empty for connector commits, the repo patch is still applied but SAPDEV may not be redeployed until the official workflow is triggered by GitHub Actions.

Recommended next focus:
1. Confirm OFFICIAL - SAPDEV Deploy runs against latest dev commit and passes qa-case-flow-contracts.sh.
2. QA real UI Create Case from WP-SCOUT/Log Evidence V2 using a new case.
3. Validate Upload & Analyze does not save automatically.
4. Validate explicit Save to Case History writes parsed result/evidence and keeps identity stable.
5. Build Grafana SQL views/panels from PostgreSQL only.
6. Continue real SAP sample quality pass: WP-SCOUT/SM21/ST22/dev_w taxonomy and normalized RCA fields.

Primary files:
- src/features/cases/CaseLinkPanel.jsx
- src/features/cases/useCaseHistoryLink.js
- src/tools/ToolLogEvidenceV2.jsx
- src/evidence-api-client.js
- backend/evidence_api.py
- backend/case_service.py
- backend/parsed_result_service.py
- backend/dbfirst_middleware.py
- backend/dbfirst_read_helpers.py
- backend/db/repositories.py
- backend/evidence_history_service.py
- backend/evidence_upload_service.py
- backend/parsed_results_history_service.py
- scripts/qa-case-flow-contracts.sh
- .github/workflows/dev-deploy.yml

Guardrails:
- Incremental only.
- Do not touch PROD.
- Do not touch nginx unless explicitly requested.
- Do not reintroduce runtime injectors/MutationObserver.
- Do not rewrite large frontend modules.
- Prefer backend-safe compatibility and small focused patches.
```

## Current Scores

| Area | Score |
|---|---:|
| DB source-of-truth architecture | 92 |
| Case lifecycle maintenance | 96 |
| Delete cascade safety | 96 |
| QA pollution control | 98 |
| Case flow stability | 94 |
| Grafana readiness | 88 |
| Real SAP ingestion foundation | 88 |
| RCA normalization engine | 87 |
| Frontend ingestion UX | 82 |
| ST03N structured persistence | 72 |
| Overall RCA workspace maturity | 91 |

## Best Next First Patch

```text
After SAPDEV deploy is confirmed green, add PostgreSQL/Grafana-focused SQL views or documented queries for cases, parsed_results, and evidence. Then strengthen real SAP sample normalization for WP-SCOUT/SM21/ST22/dev_w evidence with non-mutating fixtures/contract tests.
```
