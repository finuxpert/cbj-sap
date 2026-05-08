# SAP RCA Workspace QA Checklist

Use this checklist for every SAP RCA Workspace DEV deployment and for future web app audits.

## Scope

```text
Repo   : finuxpert/cbj-sap
Branch : dev
Target : sapdev
URL    : https://sapdev.cbj-kontruksi.com
API    : https://sapdev.cbj-kontruksi.com/sap-api/health
```

## QA philosophy

Preferred QA style:

```text
small patch -> auto deploy dev -> smoke test -> document result -> continue
```

Always prioritize:

- no blank screen
- no runtime injector
- no MutationObserver patcher
- no parser regression
- no broken PDF export
- no PROD change
- clean rollback path

## Pre-checks

### 1. Deploy workflow

Expected:

```text
push dev -> auto deploy sapdev
```

Workflow file:

```text
.github/workflows/deploy-dev.yml
```

Expected deploy source:

```bash
git fetch origin dev
git reset --hard origin/dev
```

Expected runner:

```yaml
runs-on: [self-hosted, sapdev]
```

Expected concurrency:

```yaml
concurrency:
  group: sapdev-deploy
  cancel-in-progress: true
```

### 2. Build command

Expected:

```bash
npm install
npm run build
```

### 3. API health

Expected:

```text
https://sapdev.cbj-kontruksi.com/sap-api/health
```

Expected result:

```text
HTTP 200 / healthy response
```

## Browser smoke test

Open with hard refresh:

```text
Ctrl + F5
```

### Dashboard

URL:

```text
https://sapdev.cbj-kontruksi.com
```

Check:

- page loads without blank screen
- custom SAP RCA badge appears in navbar
- navbar tabs are visible on desktop
- mobile menu works on small screen
- dashboard cards/panels are readable
- no console error blocking render

### WP-SCOUT Comparator

URL:

```text
https://sapdev.cbj-kontruksi.com/#/tool/comparer
```

Check:

- tool loads without stuck `Loading RCA module…`
- `Upload & Analyze` button visible
- Offender Queue panel visible
- filters/search visible
- severity badges render: CRIT/WARN/OK
- PDF export dock visible
- Evidence History panel visible

### ST03N Impact V2

URL:

```text
https://sapdev.cbj-kontruksi.com/#/tool/analyzer
```

Check:

- tool loads without stuck `Loading RCA module…`
- `Upload ST03N Pack` button visible
- Decision cards visible
- Parse Status visible
- chart panels render without layout collapse
- PDF export dock visible

### Log Evidence V2

URL:

```text
https://sapdev.cbj-kontruksi.com/#/tool/logs
```

Check:

- tool loads without stuck `Loading RCA module…`
- `Upload Log Evidence` button visible
- Evidence panel above tool visible
- Decision cards visible
- Error Evidence Ranking visible after data/cache
- PDF export dock visible

## PDF export smoke test

Run on all 3 core tools:

```text
#/tool/comparer
#/tool/analyzer
#/tool/logs
```

Click:

```text
Export PDF
```

Expected PDF sections:

- Executive Summary
- Decision Summary
- Top Evidence / Ranking
- Findings Detail
- Recommended Basis / RCA Actions
- Evidence Handling Notes
- footer with page number

Expected behavior:

- PDF downloads without crashing page
- PDF filename is tool-specific
- no screenshot-only PDF
- content is structured text from active tool state

## Visual QA

Check desktop and mobile widths.

### Navbar

- custom SAP RCA badge visible
- active tab visible
- no overlap between logo and tool tabs
- mobile menu opens and closes

### Enterprise theme

Theme entrypoint:

```text
src/app/enterprise-theme.css
```

New polish files must be imported here, not directly in `main.jsx`.

### CSS safety

Avoid:

- random new import in `main.jsx`
- broad body-level hacks that break mobile
- MutationObserver/runtime injector
- oversized FORCE_UI_CSS override
- unsupported or risky selectors when simple selectors work

## Code-level QA

### Route check

Expected core routes:

```text
#/tool/comparer
#/tool/analyzer
#/tool/logs
```

Expected source:

```text
src/tools/index.js
```

### PDF source check

Expected source:

```text
src/features/pdf/ToolExportDock.jsx
src/features/pdf/structuredPdf.js
```

### Theme source check

Expected source:

```text
src/app/enterprise-theme.css
```

### Branding source check

Expected source:

```text
src/components/SapRcaLogo.jsx
src/app/sap-rca-logo.css
```

Note:

```text
Custom internal SAP RCA badge only. Not official SAP logo asset.
```

## Regression red flags

Stop and fix if any appear:

- blank screen
- stuck `Loading RCA module…`
- navbar missing
- upload button missing
- PDF export throws error
- mobile page freezes
- Evidence API health fails
- nginx health check fails in deploy workflow
- deploy job queues because runner is offline

## Post-QA handoff note

After QA, update a short status note with:

```text
Date
Commit checked
Deploy status
URLs checked
Pass/fail summary
Known issues
Next recommended action
```
