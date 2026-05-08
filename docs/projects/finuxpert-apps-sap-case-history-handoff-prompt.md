# SAP RCA Workspace — Case History V1 Handoff Prompt

Use this prompt to continue work in a new chat without repeating the full context.

```text
Project:
SAP Intelligent Platform / SAP RCA Workspace

Repo:
finuxpert/cbj-sap

Branch:
dev

DEV target:
sapdev

DEV URL:
https://sapdev.cbj-kontruksi.com/sap/

Evidence API:
https://sapdev.cbj-kontruksi.com/sap-api/health

Architecture:
- Frontend: React + Vite
- Backend: FastAPI Evidence API
- Evidence storage root: /var/www/svr01-dev/sap-data
- DEV deploy root: /var/www/svr01-dev/sap
- Self-hosted runner available on DEV server
- PROD must not be touched

Core RCA tools:
- #/tool/comparer → WP-SCOUT Analyzer
- #/tool/analyzer → ST03N Impact V2
- #/tool/logs → Log Evidence V2

Important rules:
- incremental only
- DEV first
- do not touch PROD
- do not rewrite to Next.js yet
- do not reintroduce MutationObserver/runtime injector
- do not create FORCE_UI_CSS giant override
- do not restore old Dynatrace/global CSS
- do not break current upload/parser/PDF flow
- keep mobile-friendly viewing for history/report pages
- desktop remains the primary upload/parsing workspace

Current stable state:
- build green previously
- HTTP 200 previously
- API health OK
- mobile nav/dropdown fixed using React portal and solid overlay
- RCA chart readability improved
- WP-SCOUT mobile/table/chart UX hardened
- CSS consolidation done
- main.jsx imports only:
  - src/index.css
  - src/app/enterprise-theme.css

Case History V1 backend foundation:
- NO PostgreSQL yet
- file-backed JSON persistence first
- storage path: /var/www/svr01-dev/sap-data/cases
- existing Evidence API flow preserved
- persistent cases
- persistent parsed results
- persistent timeline
- evidence ↔ case linking
- mobile-friendly case summary response

Case History API endpoints already added:
- GET    /cases
- POST   /cases
- GET    /cases/{id}
- PATCH  /cases/{id}
- POST   /cases/{id}/parsed-results
- GET    /mobile/cases
- GET    /mobile/cases/{id}

Frontend Case History implemented:
- src/app/pages/CaseHistory.jsx
- src/app/pages/CaseDetail.jsx
- src/features/cases/CaseCard.jsx
- src/features/cases/casePdfExport.js
- route #/cases lists cases using /sap-api/mobile/cases
- route #/cases/{id} opens case detail using /sap-api/mobile/cases/{id}
- card Open links use path route #/cases/CASE-ID

PDF export implemented:
- Case History list has Export PDF
- Case Detail has Export PDF
- helper: src/features/cases/casePdfExport.js
- output examples:
  - sap-rca-case-history-YYYY-MM-DD-HH-MM-SS.pdf
  - sap-rca-case-CASE-ID-YYYY-MM-DD-HH-MM-SS.pdf
- Existing RCA tool PDF export remains separate:
  - src/features/pdf/structuredPdf.js
  - src/features/pdf/ToolExportDock.jsx

DEV deploy workflow added:
- .github/workflows/deploy-sapdev.yml
- workflow name: Deploy SAP RCA Workspace to sapdev
- triggers:
  - push to dev
  - workflow_dispatch
- runs-on: self-hosted
- deploys dist to /var/www/svr01-dev/sap
- reloads nginx
- verifies bundle contains:
  - sap-rca-case-history
  - Export PDF
- verifies API health

Recent verification from server:
- deployed bundle contains Case History PDF export
- deployed bundle contains Export PDF button
- API health returned:
  {"status":"ok","service":"SAP Intelligent RCA Evidence API","storage_root":"/var/www/svr01-dev/sap-data","max_upload_mb":500}

Manual verification commands:
cd /home/sadmin/sap

grep -R -q "sap-rca-case-history" /var/www/svr01-dev/sap/assets/*.js \
  && echo "OK: Case History PDF export found" \
  || echo "NG: Case History PDF export not found"

grep -R -q "Export PDF" /var/www/svr01-dev/sap/assets/*.js \
  && echo "OK: Export PDF button found" \
  || echo "NG: Export PDF button not found"

curl -fsS https://sapdev.cbj-kontruksi.com/sap-api/health && echo

Recommended next work:
1. Integrate Log Evidence auto-save parsed summary into Case History.
2. Add create/link case selector in upload/parser flow.
3. Persist generated PDF metadata/report record to Evidence API.
4. Add Management Summary page for one case.
5. Add report history under each case.
6. Later: PostgreSQL migration, but not yet.

Start next task from here.
```
