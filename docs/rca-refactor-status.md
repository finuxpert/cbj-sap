# SAP RCA Workspace Refactor Status

This document tracks the current RCA workspace refactor state and the next safe work items.

## Current State

The GitHub Actions pipeline is operational:

```text
Commit to main
→ Build SAP RCA Workspace
→ Deploy SAP RCA Workspace to DEV
→ Self-hosted runner on DEV server executes local deploy
```

The self-hosted runner is installed on the DEV server and should run as a systemd service.

Known runner service:

```text
actions.runner.finuxpert-cbj-sap.sapdev-pc-runner.service
```

Runner label used by deploy workflow:

```text
sapdev
```

Deploy workflow file:

```text
.github/workflows/deploy-dev.yml
```

Build workflow file:

```text
.github/workflows/build.yml
```

DEV runbook:

```text
docs/dev-deploy-runbook.md
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
https://sapdev.cbj-kontruksi.com/#/tool/logs
```

Expected UI:

```text
Log Evidence Analyzer V2
Upload Log Evidence
Primary Error
Error Family
Owner Direction
Confidence
Copy Summary
Export JSON
Clear Cache
Uploaded Files
Evidence Server Context
```

### 2. ST03N Impact V2

Updated file:

```text
src/tools/ToolSt03nImpactV2.jsx
```

New shared parser module:

```text
src/tools/parsers/st03nParser.js
```

Shared parser exports:

```text
REQUIRED_ST03N
classifySt03nFile
isSt03nWorkbook
expandSt03nFiles
readSt03nMatrix
findSt03nHeaderIndex
st03nRowsToObjects
summarizeSt03nObjects
parseSt03nFile
buildSt03nAnalysis
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
https://sapdev.cbj-kontruksi.com/#/tool/analyzer
```

Expected UI:

```text
ST03N Impact Analyzer V2
Upload ST03N Pack
Impact Verdict
Dominant Component
Confidence
Completeness
Copy Summary
Export JSON
Clear Cache
Parse Status
Interpretation
Top ST03N Evidence
Component Mix
Uploaded Files
Evidence Server Context
```

## Current Deploy Notes

The deploy workflow runs locally on the DEV server and performs:

```bash
cd /home/sadmin/sap

git fetch origin main
git reset --hard origin/main

sudo chown -R sadmin:sadmin /home/sadmin/sap
sudo rm -rf /home/sadmin/sap/dist

npm install
npm run build

sudo rm -rf /var/www/svr01-dev/sap/*
sudo cp -rv dist/* /var/www/svr01-dev/sap/

sudo chown -R www-data:www-data /var/www/svr01-dev/sap
sudo find /var/www/svr01-dev/sap -type d -exec chmod 755 {} \;
sudo find /var/www/svr01-dev/sap -type f -exec chmod 644 {} \;

sudo nginx -t
sudo systemctl reload nginx

curl -f http://127.0.0.1:8090/health
curl -f https://sapdev.cbj-kontruksi.com/sap-api/health
```

The `sudo chown -R sadmin:sadmin /home/sadmin/sap` and `sudo rm -rf /home/sadmin/sap/dist` steps are intentional to prevent old root-owned Vite output from breaking build with:

```text
EACCES: permission denied, unlink '/home/sadmin/sap/dist/assets/...'
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

## Next Safe Refactor

Next recommended patch:

```text
Create src/tools/parsers/wpScoutParser.js
```

Goal:

```text
- centralize parseHostMetrics
- centralize parseWpRows
- standardize WP-SCOUT row fields
- reduce duplicate parsing logic in InvestigationWorkspaceV2.jsx and ToolComparerClean.jsx
- prepare InvestigationWorkspaceV2.jsx to become an orchestrator instead of a large parser/scoring/UI file
```

Suggested shared WP-SCOUT row fields:

```text
fileName
snapshot
timeLabel
host
sid
pid
inst
wp
type
cpu
mem
rssGb
state
ageRaw
ageMin
rabax
sxpg
jobCount
rxmsg
className
program
errorCode
jobName
raw
```

Do not aggressively refactor `InvestigationWorkspaceV2.jsx` before the shared WP-SCOUT parser exists.

## Smoke Test Checklist

After each deploy, verify:

```text
https://sapdev.cbj-kontruksi.com
https://sapdev.cbj-kontruksi.com/sap-api/health
https://sapdev.cbj-kontruksi.com/#/tool/analyzer
https://sapdev.cbj-kontruksi.com/#/tool/logs
https://sapdev.cbj-kontruksi.com/#/tool/comparer
```

Basic route expectations:

```text
/#/tool/analyzer → ST03N Impact Analyzer V2 should render
/#/tool/logs     → Log Evidence Analyzer V2 should render
/#/tool/comparer → WP-SCOUT Comparator should render
```

## Production Safety

Production deploy is not automated.

Keep DEV and PROD separated:

```text
DEV deploy root: /var/www/svr01-dev/sap
PROD deploy: manual only until explicitly approved
```

The self-hosted runner must only target DEV deployment unless the production workflow is intentionally designed later with manual approval gates.
