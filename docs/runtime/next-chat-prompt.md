# SAP Intelligent RCA Workspace — Next Chat Prompt

Use this file to continue the project in a new chat without re-explaining the current state.

## Ultra-short user prompt for next chat

```text
cek repo
```

When the user only says `cek repo`, interpret it as:
- Read this runtime prompt first.
- Continue SAP Intelligent RCA Workspace from branch `dev`.
- Use GitHub connector only.
- Do a safe repository audit for kode sampah / technical debt.
- Start by creating or updating `docs/runtime/code-cleanup-audit.md` with findings.
- Do not delete files or change behavior until usage is proven.

## Continuation Prompt — SPHERE Code Audit / Kode Sampah Cleanup

```text
Lanjut SAP Intelligent RCA Workspace — fokus audit kode sampah / technical debt cleanup.

Repo:
- finuxpert/cbj-sap

Branch:
- dev

Mode:
- GitHub connector only
- incremental audit + patch only
- kalau user cuma bilang "cek repo", baca docs/runtime/next-chat-prompt.md dan mulai audit repo dari sini
- jangan pakai local CLI kecuali saya izinkan
- jangan sentuh PROD/nginx/workflow/deploy kecuali diminta eksplisit
- jangan reintroduce MutationObserver/runtime injector
- jangan rewrite besar
- jangan ubah API contract
- jangan ganggu DB-first Case History
- jangan hapus file sebelum ada bukti jelas file itu orphan/dead/duplicate
- audit dulu, baru patch kecil dan aman

Current infra:
- DEV URL: https://sapdev.cbj-kontruksi.com
- Backend service: sap-evidence-api.service
- Backend internal API: http://127.0.0.1:8090
- Public API path: https://sapdev.cbj-kontruksi.com/sap-api
- PostgreSQL container: cbj-postgres-dev
- Database: sap_rca_dev
- Storage root: /var/www/svr01-dev/sap-data
- File storage role: binary evidence only
- Case History source of truth: PostgreSQL

Core tools:
1. WP-SCOUT Process / RCA Comparator
2. ST03N Impact V2
3. Log Evidence V2

Validated DB baseline:
- DB clean-state validated.
- Strict DB-first reads active.
- Legacy JSON leakage closed for /cases and /mobile/cases.
- QA auto-seeding disabled by default.
- Case delete cascade works end-to-end.
- SID/environment inference works during case creation and parsed-result normalization.
- Parsed results history and evidence history are DB-only when DB runtime is enabled.
- Case mutations, parsed result persistence, and evidence metadata writes require DB write success when DB is enabled.

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

Current UI/UX cockpit status:
- SAPDEV screenshot validated after UI polish.
- WP-SCOUT dashboard has dark observability cockpit feel.
- Offender Queue is the main anchor.
- Right-side chart stack contains:
  - Trend – CPU / Mem / Swap
  - Top RSS offender ranking
  - Host pressure ranking
- Executive Incident Ribbon now exists as a real React component, not only CSS label.
- Chart readability has been improved with dedicated CSS override layer, but final screenshot still needs verification after deploy/build.
- PDF export dock remains floating bottom-right.
- Mobile polish exists but still needs deeper card/drawer interaction.

Recent important commits:
- 674a34e78907dc3fcc40ffba1c5c7ed29e026410 — Add WP-SCOUT executive incident ribbon component.
- b9700b2cdbc1440f6f7c6c0b1cdaebc9442a3de8 — Style WP-SCOUT executive incident ribbon.
- 61e8b4ccefaa2e797664cb4aad658aff4331110b — Add WP-SCOUT chart readability override.
- 9cfefb6ffa8bbc98a3c1e3b312d804fae0f01266 — Load WP-SCOUT chart readability layer.
- b69b7f2eca45f5d2b6434f2031dec984d19d7eb2 — Harden WP-SCOUT chart visual cleanup.
- 4580fcb38cfb4c95f156fa47be3ceaadab6f4ac6 — Update runtime prompt for code cleanup audit.

Current key files:
- docs/runtime/next-chat-prompt.md
- docs/runtime/code-cleanup-audit.md (target file to create/update during audit)
- src/main.jsx
- src/app/wp-scout-rca-cockpit-polish.css
- src/app/wp-scout-chart-readability.css
- src/app/mobile-operational-polish.css
- src/tools/ToolComparerClean.jsx
- src/tools/ToolComparerClean.css
- src/tools/ToolComparerCleanVisual.css
- src/tools/ToolComparerDynatrace.css
- src/tools/ToolComparerCleanCompact.css
- src/tools/ToolComparerDirectHydrated.jsx
- src/features/pdf/ToolExportDock.jsx
- src/features/pdf/structuredPdf.js
- src/features/cases/CaseLinkPanel.jsx
- src/features/cases/useCaseHistoryLink.js
- src/evidence-api-client.js
- backend/evidence_api.py
- backend/case_service.py
- backend/parsed_result_service.py
- backend/dbfirst_middleware.py
- backend/db/repositories.py
- scripts/qa-case-flow-contracts.sh
- .github/workflows/dev-deploy.yml

Audit target — kode sampah / technical debt:
1. Audit duplicate CSS layers:
   - ToolComparerClean.css
   - ToolComparerCleanVisual.css
   - ToolComparerDynatrace.css
   - ToolComparerCleanCompact.css
   - wp-scout-rca-cockpit-polish.css
   - wp-scout-chart-readability.css
   - mobile-operational-polish.css
   Goal: identify overlap, pseudo-content hacks, duplicated selectors, aggressive :has(), and chart overrides that should be merged or removed.

2. Audit React monolith / dead components:
   - ToolComparerClean.jsx is still large.
   - Check if old/unused comparer components, hydrated variants, or helper tools are still imported.
   - Do not delete unless search proves no imports/usages.

3. Audit old runtime enhancer / injector leftovers:
   - Never reintroduce MutationObserver.
   - Search for MutationObserver, runtime enhancer, dashboard enhancer, delayed DOM patching, recursive DOM patch, setTimeout UI hacks.
   - If only dead comments/docs exist, document first before removal.

4. Audit CSS pseudo-content used as real UI:
   - RCA Insight Panel currently may still be pseudo-content in CSS.
   - LIVE RCA SIGNAL pseudo badge caused chart overlap.
   - Prefer real React components over CSS pseudo UI.

5. Audit chart readability implementation:
   - Verify if wp-scout-chart-readability.css is actually imported after competing component CSS.
   - If override layer cannot win, move focused cleanup into component CSS or remove source pseudo rules.
   - Do not touch chart data/parser logic unless necessary.

6. Audit Case History / DB-first safety:
   - Ensure no cleanup breaks explicit save intent.
   - Ensure no cleanup hides CaseLinkPanel critical controls.
   - Preserve useCaseHistoryLink contract.

7. Audit bundle/performance:
   - Look for large unused imports, duplicated CSS imports, old dashboard/helper modules still bundled.
   - Keep patch incremental.

Known UI gaps after latest chart patches:
1. Need visual verification after deploy/build for chart cleanup.
2. Top RSS / Host pressure chart labels may still need JSX margin tuning if CSS cannot fully fix it.
3. Host/PID labels in bar charts may need shorter labels.
4. Offender Queue still needs click row detail drawer.
5. RCA Insight Panel should become real React panel, not CSS pseudo-content.
6. Case History flow should become compact tab/slide-over after parsed state.
7. Mobile should eventually switch offender table to card rows.

Recommended next audit order:
1. Search repo for MutationObserver/runtime/dashboard enhancer leftovers.
2. Search imports/usages for old comparer/helper files.
3. Map CSS import order and duplicate selectors around WP-SCOUT cockpit/chart.
4. Produce a small audit report in docs/runtime/code-cleanup-audit.md.
5. Apply only safe cleanup patch:
   - remove confirmed orphan CSS/imports
   - remove pseudo-content chart badge source if safe
   - consolidate chart readability override if safe
   - no API/backend behavior changes

Guardrails:
- Incremental only.
- Do not touch PROD.
- Do not touch nginx unless explicitly requested.
- Do not touch GitHub workflow/deploy unless explicitly requested.
- Do not reintroduce runtime injectors/MutationObserver.
- Do not rewrite large frontend modules.
- Prefer audit documentation before deletion.
- Prefer build-safe React/CSS patches.
- Avoid aggressive CSS that clips critical Case History save controls.
```

## Best Next First Patch

```text
Start with code cleanup audit only. Search for MutationObserver/runtime enhancer leftovers, duplicate WP-SCOUT CSS layers, and orphan comparer/helper files. Create docs/runtime/code-cleanup-audit.md with findings and recommended safe patches. Do not delete code until usage is proven.
```
