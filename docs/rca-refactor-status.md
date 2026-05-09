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
Backend-generated case analytics
Case maintenance controls
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
{"status":"ok","service":"SAP Intelligent RCA Evidence API","storage_root":"/var/www/svr01-dev/sap-data","max_upload_mb":500,"case_history":"file-backed","analytics":"enabled"}
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
GET     /cases
POST    /cases
GET     /cases/{id}
PATCH   /cases/{id}
DELETE  /cases/{id}
POST    /cases/{id}/parsed-results
GET     /mobile/cases
GET     /mobile/cases/{id}
GET     /mobile/cases/{id}/analytics
```

Frontend routes:

```text
#/cases       → Case History list and maintenance
#/cases/{id}  → Case RCA Dashboard / Case Detail
```

Frontend files:

```text
src/app/pages/CaseHistory.jsx
src/app/pages/CaseDetail.jsx
src/app/pages/CaseDetailWithAnalytics.jsx
src/app/pages/CaseAnalytics.jsx
src/features/cases/CaseCard.jsx
src/features/cases/casePdfExport.js
src/evidence-api-client.js
```

Backend files:

```text
backend/evidence_api.py
backend/case_analytics.py
```

Current Case History capabilities:

```text
- mobile-friendly case list using /sap-api/mobile/cases
- mobile-friendly case detail using /sap-api/mobile/cases/{id}
- backend-generated analytics using /sap-api/mobile/cases/{id}/analytics
- case cards with severity/status/SID/evidence count/top problem
- detail dashboard with management summary, top signal, source, confidence, timeline, CPU/memory/swap, severity, anomaly, job, program, and parsed confidence
- detail view with management summary, top problem, stats, timeline, parsed results, linked evidence
- Export PDF from Case History list
- Export PDF from Case Detail
- bulk maintenance controls on Case History
```

## Case Maintenance Controls

Case History now includes a maintenance bar below the visible case summary.

UI actions:

```text
Select visible
Unselect visible
Clear
Archive selected
Delete selected
```

Per-card selection:

```text
Each case card has a Select checkbox.
Selected cards get a highlighted border.
```

Bulk archive behavior:

```text
Archive selected → PATCH /cases/{id} with status ARCHIVED
```

Bulk delete behavior:

```text
Delete selected → browser prompt requires typing DELETE
DELETE /cases/{id}
```

Safety note:

```text
DELETE /cases/{id} removes the case JSON from /var/www/svr01-dev/sap-data/cases only.
It does not delete physical evidence files under /var/www/svr01-dev/sap-data/evidence.
```

Manual delete validation:

```bash
curl -X DELETE -s https://sapdev.cbj-kontruksi.com/sap-api/cases/CASE-TEST-ID | jq
```

Expected success shape:

```json
{"ok":true,"deleted":"CASE-TEST-ID"}
```

## Backend Analytics Status

Case analytics are generated server-side in:

```text
backend/case_analytics.py
```

Mobile case payload includes:

```text
case.analytics
```

Dedicated analytics endpoint:

```text
GET /mobile/cases/{id}/analytics
```

Analytics fields:

```text
severity
tools
evidence_sources
anomalies
jobs
programs
confidence
timeline
system_resources
summary
has_data
```

Resource chart extraction supports:

```text
result_json.system_resources
result_json.resources
result_json.cpu_mem_swap
result_json.host_metrics
result_json.resourceTimeline
result_json.resource_timeline
result_json.metrics.*
result_json.sap.*
result_json.rows
result_json.evidenceRows
result_json.parsedRows
```

CPU / memory / swap field aliases:

```text
CPU: cpu, cpuPct, cpu_percent, cpu_pct, cpu_usage, cpuUsage, cpuUtilization
Memory: mem, memory, memoryPct, memory_pct, mem_pct, memory_percent, memPercent, mem_percent, memory_usage, memoryUsage, rssPct, rssGb, rssGB, rss_gb, rss
Swap: swap, swapPct, swap_pct, swap_percent, swapPercent, swap_usage, swapUsage
```

Validation example:

```bash
curl -s https://sapdev.cbj-kontruksi.com/sap-api/mobile/cases/CASE-20260508-022/analytics \
  | jq '.ok, .analytics.has_data, .analytics.summary, .analytics.system_resources[0:3]'
```

## Case Dashboard Analytics UI

Case detail route now renders a dashboard-first layout through:

```text
src/app/pages/CaseDetailWithAnalytics.jsx
```

Analytics component:

```text
src/app/pages/CaseAnalytics.jsx
```

Analytics UI sections:

```text
Top Signal
Dominant Source
Avg Confidence
Timeline Signal
CPU / Memory / Swap
Severity Split
Tool / Evidence Source
Top Error / Anomaly
Top JobName
Top Program
Parsed Confidence
```

Current UX decisions:

```text
- long category labels use horizontal bar charts
- Parsed Confidence uses compact progress rows, not vertical bars
- Full Case Detail is collapsed below analytics by default
- CPU / Memory / Swap uses separate legend pills and distinct line colors
```

## PDF Export Status

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

grep -R -q "Case Maintenance" /var/www/svr01-dev/sap/assets/*.js \
  && echo "OK: Case Maintenance UI found" \
  || echo "NG: Case Maintenance UI not found"

grep -R -q "Delete selected" /var/www/svr01-dev/sap/assets/*.js \
  && echo "OK: Bulk delete UI found" \
  || echo "NG: Bulk delete UI not found"

curl -fsS https://sapdev.cbj-kontruksi.com/sap-api/health && echo
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
- persists system resource timeline where rows expose CPU/memory/swap data
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
Case Maintenance V2: add range filter, delete archived only, and optional orphan evidence cleanup report.
```

Suggested sequence:

```text
1. Add date range filter for old QA/test cases.
2. Add quick filter for title prefix QA Backend Frontend Case.
3. Add delete archived only action.
4. Add dry-run orphan evidence report before touching physical evidence files.
5. Do not delete physical evidence automatically until orphan reporting is trusted.
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
/#/cases          → Case History list should render with Export PDF and Case Maintenance
/#/cases/{id}     → Case RCA Dashboard should render analytics and collapsed Full Case Detail
/#/tool/analyzer  → ST03N Impact Analyzer V2 should render
/#/tool/logs      → Log Evidence Analyzer V2 should render
/#/tool/comparer  → WP-SCOUT Comparator should render
```

Maintenance smoke test:

```text
1. Open /#/cases.
2. Select one non-critical QA/test case.
3. Click Archive selected and confirm.
4. Verify active/archived counts update.
5. For delete test, select only QA/test case.
6. Click Delete selected.
7. Type DELETE.
8. Verify case disappears from list.
```

Backend smoke test:

```bash
curl -s https://sapdev.cbj-kontruksi.com/sap-api/health | jq
curl -s https://sapdev.cbj-kontruksi.com/sap-api/mobile/cases/CASE-20260508-022/analytics | jq '.analytics.summary'
```

## Production Safety

Production deploy is not automated.

Keep DEV and PROD separated:

```text
DEV deploy root: /var/www/svr01-dev/sap
PROD deploy: manual only until explicitly approved
```

The self-hosted runner must only target DEV deployment unless the production workflow is intentionally designed later with manual approval gates.
