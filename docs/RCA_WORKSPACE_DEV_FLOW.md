# SAP RCA Workspace Development Flow

This document is the working handoff for continuing SAP RCA Workspace / SAP Basis Evidence Analyzer development without repeating prior context.

## Repository and Environment

- Repository: `finuxpert/cbj-sap`
- Active branch: `ui/compact-rca-mockup`
- Server path: `/home/sadmin/actions-runner/_work/cbj-sap/cbj-sap`
- Dev URL ST03N: `https://sapdev.cbj-kontruksi.com/#/st03n`
- Dev URL LOG: `https://sapdev.cbj-kontruksi.com/#/log`
- Deploy root: `/var/www/svr01-dev/sap`
- Frontend stack: Vite + React + CSS
- Current routing: hash route `/st03n` and `/log`

## Hard Rules

Do not change:

- backend/parser contract unless explicitly requested
- upload/analyze/export behavior
- deploy script
- sudoers
- runner config
- other web roots
- unrelated tools/pages

Avoid heavy UI/runtime libraries:

- no framer-motion
- no Lenis
- no CountUp
- no tsparticles
- do not reintroduce ECharts until layout is stable and wrapper is properly controlled

Use real uploaded/cached evidence only. Do not add dummy demo data.

## Standard Build and Deploy Command

Use this from the server:

```bash
cd /home/sadmin/actions-runner/_work/cbj-sap/cbj-sap && git fetch origin && git checkout ui/compact-rca-mockup && git pull origin ui/compact-rca-mockup && npm run build && sudo rsync -av --delete dist/ /var/www/svr01-dev/sap/ && sudo chown -R www-data:www-data /var/www/svr01-dev/sap && echo "DONE sap-dev RCA deployed. Hard refresh Ctrl+F5."
```

## Clean Baseline Status

Legacy RCA files and old global CSS were cleaned up. `src/main.jsx` now only imports `index.css`. RCA shell/dashboard CSS is scoped under the RCA feature.

Previously removed legacy files included:

- `src/app/rca-workspace.css`
- `src/app/rca-final-ui.css`
- `src/app/rca-log-ui.css`
- `src/app/st03n-status-ui.css`
- `src/app/log-polish-ui.css`
- `src/app/shell-overrides.css`
- `src/app/st03n-responsive-ui.css`
- `src/tools/EnterpriseRcaMockup.css`
- `src/tools/installEnterpriseRcaPhase*.js`
- `src/tools/ToolSt03nImpact*.jsx`
- `src/tools/ToolLogEvidence*.jsx`
- `src/tools/ToolLogs*.jsx`
- old `.bak` dashboard files

## Current RCA File Structure

```text
src/features/rca/
  shared/
    RcaShell.css
    RcaDashboard.css
    RcaEvidenceKit.jsx
    RcaEvidenceKit.css
    rca-utils.js

  st03n/
    St03nPage.jsx
    St03nPage.css
    St03nOffenderTable.jsx
    st03n-parser.js

  log/
    LogPage.jsx
    LogPage.css
```

Compatibility route remains in:

```text
src/tools/index.js
```

Active route imports:

```js
st03n: () => import('../features/rca/st03n/St03nPage.jsx')
log: () => import('../features/rca/log/LogPage.jsx')
```

Shell import:

```js
src/App.jsx -> import './features/rca/shared/RcaShell.css'
```

## ST03N Current Status

ST03N is now a technical workload evidence page, not an RCA summary page.

Implemented:

- header: `ST03N Workload Analyzer`
- technical filters: System, Time Window, Evidence Pack, Files
- upload ST03N evidence pack
- KPI strip:
  - Selected Window
  - Total Dialog Steps
  - Peak Response Time
  - Average Response Time
  - Peak DB Time
  - Files Parsed
- active tabs:
  - Time Profile
  - Workload Overview
  - Top Response Time
  - Top DB Accesses
  - Transaction Profile
- each tab renders different content
- no CPU/memory server data on ST03N
- footer: Uploaded Files and Parse Status

ST03N tab behavior:

- Time Profile: Time Profile chart, Workload Overview, Top Response Time, Top DB Accesses
- Workload Overview: workload table plus average response/DB/wait charts
- Top Response Time: response offender table and trend
- Top DB Accesses: DB access table and trend
- Transaction Profile: Transaction Profile Standard table

Known ST03N caveat:

- chart x-axis currently uses parsed metric sequence labels like `T01`, `T02`, because parser has not yet extracted real time buckets from ST03N evidence.

## LOG Current Status

LOG was redesigned into a technical Work Process / System Log Console.

Implemented:

- header: `Log Evidence Console`
- technical filters: System, Time Window, Evidence Pack, Files
- upload log evidence
- KPI strip:
  - Primary Error
  - Error Family
  - Owner
  - Bad WP
  - Peak CPU
  - Max RSS / Swap
- active tabs:
  - Overview
  - Error Analysis
  - Work Process
  - Job Analysis
  - System Resources

LOG tab behavior:

- Overview: Top Error Code, Error Hits Over Time, Top Resource Consumer
- Error Analysis: Error Ranking, Error Hits Over Time, Error Code Distribution
- Work Process: Long Running Work Process / Jobs, Work Process by Type
- Job Analysis: Job / Program Mapping, Program Frequency
- System Resources: APP Server Resource Summary, CPU by APP Server, RSS by APP Server, APP Server Resource Matrix, Top Resource Consumer, RCA Explanation

LOG parser extracts where available:

- time label
- host / app server
- PID
- WP number
- WP type
- CPU percentage
- RSS GB
- physical memory / swap if present
- status class CRIT/WARN/OK
- program
- error code
- job name
- duration seconds if available

Latest LOG polish:

- Added host-level resource calculation via `buildHostResourceSummary`.
- System Resources now groups CPU/RSS/swap/bad WP by APP server instead of only showing timeline aggregation.
- Added APP Server cards showing peak CPU, max RSS, swap, bad WP, PID/WP, program, job, and error.
- Added APP Server Resource Matrix table for SAP Basis triage.
- Added RCA Explanation block that connects symptom, suspect process, error mapping, and recommended action.

Known LOG caveats:

- KPI `Bad WP`, `Peak CPU`, and `Max RSS / Swap` can show zero if cached analysis was created before parser changes or if the parsed rows do not carry the expected fields. Try Clear Cache and re-upload evidence before changing code.
- Host-level APP server charts depend on logs carrying `Hostname:` or `## WP-SCOUT @ <host>` context. Generic SM21/ST22/dev_w text without host context will group as `UNKNOWN`.
- User wants final LOG to show 5 APP server load, high swap, high CPU, job consuming CPU, PID, job name, program, and error explanation.

## Important Real-World Investigation Flow

For SAP slowness around a reported time, e.g. user says SAP was slow at 13:00:

1. collect logs from roughly 12:00 to 13:30
2. review WP-SCOUT / work process snapshots first
3. identify CRIT/WARN work processes
4. correlate:
   - time
   - APP server
   - PID
   - WP number
   - WP type
   - CPU
   - RSS
   - swap
   - job name
   - ABAP program
   - SAP error code
5. map to likely owner:
   - Basis
   - ABAP
   - Functional / Data owner
