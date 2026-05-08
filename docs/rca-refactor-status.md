# SAP RCA Workspace Refactor Status

This document tracks the current RCA workspace refactor state and the next safe work items.

## Current State

The SAP RCA Workspace is now evolving from a parser-only toolset into a persistent RCA investigation workspace.

Current stable foundation:

```text
React + Vite frontend
FastAPI Evidence API
File-backed Evidence and Case History persistence
DEV deploy to sapdev
```

Known DEV URL:

```text
https://sapdev.cbj-kontruksi.com/sap/
```

Known API health URL:

```text
https://sapdev.cbj-kontruksi.com/sap-api/health
```

Expected API health response shape:

```json
{"status":"ok","service":"SAP Intelligent RCA Evidence API","storage_root":"/var/www/svr01-dev/sap-data","max_upload_mb":500}
```

## Core Product Scope

Keep the application focused on only these 3 RCA tools:

```text
1. RCA Comparator / WP-SCOUT Analyzer
2. ST03N Analyzer
3. Log Triage / Log Evidence Analyzer
```

Avoid reintroducing these old patterns:

```text
MutationObserver
recursive DOM injector
runtime dashboard enhancer
delayed UI patching
old shortcut overlay
large CSS override hacks
old comparer/st03n dashboard enhancer files
```

These previously caused blank screen, loading stuck, render lag, and mobile freeze.

## Case History V1 Status

Case History V1 is implemented as file-backed JSON persistence first. PostgreSQL is intentionally deferred.

Backend storage:

```text
/var/www/svr01-dev/sap-data/cases
```

Implemented API endpoints:

```text
GET    /cases
POST   /cases
GET    /cases/{id}
PATCH  /cases/{id}
POST   /cases/{id}/parsed-results
GET    /mobile/cases
GET    /mobile/cases/{id}
```

Frontend routes:

```text
#/cases       → Case History list
#/cases/{id}  → Case Detail / Management RCA Snapshot
```

Frontend files:

```text
src/app/pages/CaseHistory.jsx
src/app/pages/CaseDetail.jsx
src/features/cases/CaseCard.jsx
src/features/cases/casePdfExport.js
```

Current Case History capabilities:

```text
- mobile-friendly case list using /sap-api/mobile/cases
- mobile-friendly case detail using /sap-api/mobile/cases/{id}
- case cards with severity/status/SID/evidence count/top problem
- detail view with management summary, top problem, stats, timeline, parsed results, linked evidence
- Export PDF from Case History list
- Export PDF from Case Detail
```

PDF export helper:

```text
src/features/cases/casePdfExport.js
```

PDF output examples:

```text
sap-rca-case-history-YYYY-MM-DD-HH-MM-SS.pdf
sap-rca-case-CASE-ID-YYYY-MM-DD-HH-MM-SS.pdf
```

Existing RCA tool PDF export remains separate and should not be merged aggressively:

```text
src/features/pdf/structuredPdf.js
src/features/pdf/ToolExportDock.jsx
```

## Mobile Navigation Status

Mobile nav/dropdown was fixed with a React portal rendered into `document.body` and a solid overlay. The previous blur/floating menu issue is resolved.

Important file:

```text
src/components/Navbar.jsx
```

Do not reintroduce CSS-only mobile nav overlays that depend on old `.mobilePanel` / `.mobileMenuItem` cascade behavior.

## DEV Deploy Workflow

A DEV deploy workflow exists:

```text
.github/workflows/deploy-sapdev.yml
```

Workflow name:

```text
Deploy SAP RCA Workspace to sapdev
```

Triggers:

```text
push to dev
workflow_dispatch
```

Runner:

```text
self-hosted
```

Deploy root:

```text
/var/www/svr01-dev/sap
```

Workflow validates deployed bundle contains:

```text
sap-rca-case-history
Export PDF
```

And validates:

```text
https://sapdev.cbj-kontruksi.com/sap-api/health
```

Manual verification command:

```bash
grep -R -q "sap-rca-case-history" /var/www/svr01-dev/sap/assets/*.js \
  && echo "OK: Case History PDF export found" \
  || echo "NG: Case History PDF export not found"

grep -R -q "Export PDF" /var/www/svr01-dev/sap/assets/*.js \
  && echo "OK: Export PDF button found" \
  || echo "NG: Export PDF button not found"

curl -fsS https://sapdev.cbj-kontruksi.com/sap-api/health && echo
```

Recent server verification showed:

```text
OK: Case History PDF export found
OK: Export PDF button found
{"status":"ok","service":"SAP Intelligent RCA Evidence API","storage_root":"/var/www/svr01-dev/sap-data","max_upload_mb":500}
```

## Completed Refactors

### 1. Log Evidence V2

Updated file:

```text
src/tools/ToolLogEvidenceV2.jsx
```

Current improvements:

```text
- uses shared utility helpers from src/tools/evidence-utils.js
- uses EvidenceDecisionKit shared components
- includes Copy Summary / Export JSON / Clear Cache toolbar
- includes Uploaded Files panel
- includes Evidence Server Context panel
- uses clearer confidence explanation
- uses buildOwnerAction() for better owner-directed recommendation
```

Test route:

```text
https://sapdev.cbj-kontruksi.com/sap/#/tool/logs
```

### 2. ST03N Impact V2

Updated file:

```text
src/tools/ToolSt03nImpactV2.jsx
```

Shared parser module:

```text
src/tools/parsers/st03nParser.js
```

Current improvements:

```text
- removed duplicated ZIP/workbook/header parsing logic from ToolSt03nImpactV2.jsx
- centralized ST03N file classification
- centralized ST03N metric summarization
- reused EvidenceDecisionKit shared components
- added Copy Summary / Export JSON / Clear Cache toolbar
- added Uploaded Files panel
- added Evidence Server Context panel
- kept decision-first view: Impact Verdict, Dominant Component, Confidence, Completeness
```

Test route:

```text
https://sapdev.cbj-kontruksi.com/sap/#/tool/analyzer
```

## Runner Operations

Check runner service:

```bash
systemctl list-units --type=service | grep actions.runner
sudo systemctl status actions.runner.finuxpert-cbj-sap.sapdev-pc-runner.service --no-pager
```

Follow runner logs:

```bash
sudo journalctl -u actions.runner.finuxpert-cbj-sap.sapdev-pc-runner.service -f
```

Do not use this wildcard status form:

```bash
sudo systemctl status 'actions.runner.*' --no-pager
```

`systemctl` may escape the wildcard and return an invalid unit name.

## Next Safe Work

Recommended next patch:

```text
Integrate Log Evidence auto-save parsed summary into Case History.
```

Goal:

```text
Upload once → persist evidence → parse → save parsed summary to case → open again from mobile → export management PDF.
```

Suggested sequence:

```text
1. Add case selector / create case action near Log Evidence upload flow.
2. Save parser output to POST /cases/{id}/parsed-results.
3. Link evidence ID to case where possible.
4. Add report persistence after PDF export.
5. Add Management Summary page once parsed result persistence is stable.
```

Do not start PostgreSQL migration yet.

## Smoke Test Checklist

After each deploy, verify:

```text
https://sapdev.cbj-kontruksi.com/sap/
https://sapdev.cbj-kontruksi.com/sap-api/health
https://sapdev.cbj-kontruksi.com/sap/#/cases
https://sapdev.cbj-kontruksi.com/sap/#/tool/analyzer
https://sapdev.cbj-kontruksi.com/sap/#/tool/logs
https://sapdev.cbj-kontruksi.com/sap/#/tool/comparer
```

Basic route expectations:

```text
/#/cases          → Case History list should render with Export PDF
/#/cases/{id}     → Case Detail should render with Export PDF
/#/tool/analyzer  → ST03N Impact Analyzer V2 should render
/#/tool/logs      → Log Evidence Analyzer V2 should render
/#/tool/comparer  → WP-SCOUT Comparator should render
```

## Production Safety

Production deploy is not automated.

Keep DEV and PROD separated:

```text
DEV deploy root: /var/www/svr01-dev/sap
PROD deploy: manual only until explicitly approved
```

The self-hosted runner must only target DEV deployment unless the production workflow is intentionally designed later with manual approval gates.
