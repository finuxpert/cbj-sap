# SAP Intelligent RCA Workspace — Next Chat Prompt

Use this file to continue the project in a new chat without re-explaining the current state.

## Continuation Prompt — SAP RCA Cockpit UI + DB-first Case History

```text
Lanjut SAP Intelligent RCA Workspace.

Repo:
- finuxpert/cbj-sap

Branch:
- dev

Mode:
- GitHub connector only
- incremental patch only
- jangan pakai local CLI kecuali saya izinkan
- jangan sentuh PROD/nginx/workflow kecuali diminta eksplisit
- jangan reintroduce MutationObserver/runtime injector
- jangan rewrite besar
- pertahankan API contract
- pertahankan DB-first Case History sebagai source of truth
- fokus lanjut UI/UX cockpit, real SAP RCA readability, RCA insight panel, chart readability, offender drilldown, dan PDF/report polish

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
- WP-SCOUT dashboard now has strong dark observability cockpit feel.
- Offender Queue is now the main anchor.
- Right-side chart stack contains:
  - Trend – CPU / Mem / Swap
  - Top RSS offender ranking
  - Host pressure ranking
- RCA Insight Panel fills the previous empty left-lower space with operational guidance.
- Chart readability improved: brighter labels, larger chart height on desktop, stronger axis/legend contrast.
- Offender table improved with zebra rows, sticky header, severity left strip, and hover emphasis.
- PDF export dock is cleaner and remains floating bottom-right.
- Mobile polish exists but still needs deeper card/drawer interaction.

Recent UI cockpit commits:
- e751ce8ab8d5ade78c2a0dec36c9386eb2a5dd3a — Add WP-SCOUT RCA cockpit UI polish layer import.
- 69b41ec9d37670491c19509fa14ae9b4490e1a5c — Fix missing WP-SCOUT RCA cockpit polish stylesheet.
- d48f36dc7df20b3c628b82a7bbd73aad90cba89e — Polish WP-SCOUT RCA mobile cockpit phase 2.
- 92b8ff531b13e421e22d1974a73f658d11cf3ae9 — Harden RCA cockpit mobile UX and fallback states.
- 031bbd4205e59cc608bb03938c1d0b4acb297c32 — Refine WP-SCOUT RCA cockpit visual balance.
- 3797052299fc88ac5ad60a86902cf5475c09cacc — Improve RCA insight panel and chart readability.

Current key files:
- src/main.jsx
- src/app/wp-scout-rca-cockpit-polish.css
- src/app/mobile-operational-polish.css
- src/tools/ToolComparerClean.jsx
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

Current visual audit score:
- Enterprise feel: 88
- Observability cockpit: 89
- RCA readability: 84
- Executive readability: 72
- SAP Basis usability: 87
- Mobile readiness: 78
- Product polish: 83

Known UI gaps:
1. Top area still feels form-heavy because Evidence Intake / Workflow / Case History consume too much space.
2. Need real Executive Incident Ribbon component, not only CSS labels.
3. Offender Queue still needs click row detail drawer.
4. Charts improved but still need anomaly windows, better chart grouping, and no-overlap badges.
5. Case History flow should become compact tab / slide-over after parsed state.
6. Need AI/RCA narrative panel from actual data, not CSS pseudo-content.
7. Mobile should eventually switch offender table to card rows.

Recommended next implementation order:
1. Add real Executive Incident Ribbon component in ToolComparerClean.jsx using topRow/stats:
   - CRITICAL MEMORY PRESSURE
   - host, PID, WP type, RSS, score, job, action
   - place between stats/FindingCard or above Offender Queue
   - keep incremental and build-safe

2. Add Offender Detail Drawer:
   - selected row state
   - click offender row to show details
   - raw evidence, host, PID, job, RSS, age, score, recommended SAP checks
   - desktop side panel, mobile bottom sheet if possible

3. Replace CSS pseudo RCA Insight Panel with real React panel:
   - immediate focus
   - correlation checks
   - next actions
   - content derived from topRow/stats/resourceTrend

4. Improve chart readability further:
   - move LIVE RCA SIGNAL badge so it does not overlap chart labels
   - add anomaly window marker for swap spike / RSS spike
   - increase chart panel min-height only where needed

5. Collapse or tab Workflow/Case History after parsed state:
   - avoid hiding required save flow completely
   - make save flow accessible but not dominant

6. Continue DB/Grafana work only after UI state remains stable:
   - PostgreSQL views/panels from cases, parsed_results, evidence
   - real SAP sample normalization for WP-SCOUT/SM21/ST22/dev_w

Guardrails:
- Incremental only.
- Do not touch PROD.
- Do not touch nginx unless explicitly requested.
- Do not reintroduce runtime injectors/MutationObserver.
- Do not rewrite large frontend modules.
- Prefer build-safe React/CSS patches.
- Avoid aggressive CSS that clips critical Case History save controls.
```

## Best Next First Patch

```text
Add a real Executive Incident Ribbon in ToolComparerClean.jsx using topRow and stats, then add CSS in wp-scout-rca-cockpit-polish.css. Keep it incremental, no API/backend changes, and no runtime injector.
```
