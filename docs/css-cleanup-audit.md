# SAP RCA CSS Cleanup Audit

Date: 2026-05-08  
Target: sapdev  
Branch: dev  

## Scope

This audit starts the incremental cleanup of older global CSS layers that are now duplicated or overridden by:

```text
src/app/enterprise-theme.css
```

## Current direction

New UI/UX polish should stay centralized through:

```text
src/app/enterprise-theme.css
```

Do not add new visual CSS imports directly to:

```text
src/main.jsx
```

## Cleanup patch 1

Disabled this legacy import in `src/main.jsx`:

```js
import './sapdev-final-force.css'
```

The file was not deleted.

### Why this was a safe first candidate

`sapdev-final-force.css` is a high-specificity emergency override layer with broad `!important` rules for:

- navbar/mobile button behavior
- homepage hero sizing
- comparer section nav suppression
- comparer chart grid sizing
- generic panel/table/badge polish
- PDF dock compact styling
- mobile spacing and dock positioning

Most of these areas are now owned by centralized enterprise theme layers:

```text
src/app/enterprise-ui-system.css
src/app/enterprise-navigation.css
src/app/comparer-process-ux.css
src/app/pdf-export-ux.css
```

## Cleanup patch 2

Disabled this older base polish import in `src/main.jsx`:

```js
import './sapdev-polish.css'
```

The file was not deleted.

### Why this candidate was chosen before premium overhaul

`sapdev-polish.css` mostly contains older global styling for:

- body background
- navbar
- buttons
- generic cards/panels
- homepage hero
- table wrappers
- mobile spacing

These areas are now covered by:

```text
src/app/enterprise-ui-system.css
src/app/enterprise-navigation.css
src/app/investigation-workspace-ux.css
```

## Cleanup patch 3

Disabled this legacy premium overhaul import in `src/main.jsx`:

```js
import './sapdev-premium-overhaul.css'
```

The file was not deleted.

### Why this was disabled now

A focused repo search did not find active source references for the main legacy selectors from this file, including:

```text
premiumHome
premiumHero
premiumFlowGrid
premiumFlowCard
premiumLauncher
premiumInfoCard
cmpWrap
cmpTopbar
cmpMain
cmpSectionNav
```

Current homepage routing renders `InvestigationWorkspaceV2`, and current visual ownership is centralized in enterprise theme layers.

## Cleanup patch 4

Disabled this legacy SAP intelligent UX override import in `src/main.jsx`:

```js
import './sap-intelligent-ux.css'
```

The file was not deleted.

### Why this was disabled now

`sap-intelligent-ux.css` mostly contains broad global overrides for:

- brand/nav emphasis
- uploader/drop-zone treatment
- empty states
- analyzer upload pseudo-labels
- table zebra rows
- severity chip glow
- PDF dock mobile scaling

These areas are already covered more cleanly by centralized layers:

```text
src/app/enterprise-ui-system.css
src/app/enterprise-navigation.css
src/app/investigation-workspace-ux.css
src/app/log-evidence-ux.css
src/app/st03n-impact-ux.css
src/app/comparer-process-ux.css
src/app/pdf-export-ux.css
```

## Cleanup patch 5

Disabled this legacy SAP intelligent investigation override import in `src/main.jsx`:

```js
import './sap-intelligent-investigation.css'
```

The file was not deleted.

### Why this was disabled now

Despite the file name, this layer is mostly scoped to `.appShell.isTool`, not the current homepage `InvestigationWorkspaceV2` route. It contains broad tool-mode overrides for:

- navbar glow and brand emphasis
- upload workflow pseudo-copy
- file input button styling
- KPI/card/panel header emphasis
- empty table helper text
- button hover/active transforms
- mobile tool background and panel shadows
- chart drop shadows
- disabled button styling

These behaviors are now better centralized through enterprise theme layers and tool-specific UX files.

## Cleanup patch 6

Disabled this legacy comparer emergency import in `src/main.jsx`:

```js
import './sapdev-comparer-fix.css'
```

The file was not deleted.

### Why this was disabled now

`sapdev-comparer-fix.css` was an emergency CSS layer for older comparer markup. It handled:

- old global `.btn` collisions from ToolComparer CSS
- `.cmpWrap` horizontal containment
- `.cmpTopbar` density
- `.cmpMain` two-column layout forcing
- `.cmpSectionNav` floating overlay fix
- `.cmpChartReportGrid` and chart overflow
- `.cmpVt*` virtual table polish

A focused repo search did not find active source references for the main old comparer selectors such as:

```text
cmpWrap
cmpTopbar
cmpMain
cmpSectionNav
cmpVtRow
cmpChartReportGrid
```

Current comparer UX ownership should stay in:

```text
src/app/comparer-process-ux.css
```

which is loaded through:

```text
src/app/enterprise-theme.css
```

## Cleanup patch 7

Disabled this legacy Dynatrace-inspired observability import in `src/main.jsx`:

```js
import './sap-dynatrace-rca.css'
```

The file was not deleted.

### Why this was disabled now

`sap-dynatrace-rca.css` was a broad visual theme for Comparator, ST03N, Logs, charts, tables, and print/PDF readability. It also globally restyled Recharts primitives such as bars, lines, axis text, and tooltips.

A focused repo search did not find active source references for its main legacy selectors, including:

```text
cmpCleanShell
st03n-clean
toolLogs
logsTool
rcaTool
rcaPanel
rcaCard
cmpCleanChart
```

Current observability/tool visual ownership should stay in centralized enterprise layers and tool-specific files imported by:

```text
src/app/enterprise-theme.css
```

## Cleanup patch 8

Disabled this legacy shell override import in `src/main.jsx`:

```js
import './app/shell-overrides.css'
```

The file was not deleted.

### Why this was disabled now

`shell-overrides.css` was a kill-switch layer for old floating/shortcut nav UI and compact PDF dock behavior. It broadly hid selectors such as section nav, jump nav, restore bar, shortcut, quick nav, mini nav, floating nav, anchor nav, and TOC patterns.

A focused repo search did not find active source references for the old shell override selectors, including:

```text
cmpSectionNav
cmpRestoreBar
JumpNav
RestoreBar
FloatingNav
AnchorNav
```

PDF dock styling and print behavior should now be owned by:

```text
src/app/pdf-export-ux.css
```

which is loaded through:

```text
src/app/enterprise-theme.css
```

## Current CSS imports still active in main.jsx

```text
src/features/evidence/evidence.css
src/app/rca-workspace.css
src/app/enterprise-theme.css
```

## Disabled legacy CSS files retained for rollback

```text
src/sapdev-polish.css
src/sapdev-comparer-fix.css
src/sapdev-premium-overhaul.css
src/sapdev-final-force.css
src/sap-intelligent-ux.css
src/sap-intelligent-investigation.css
src/sap-dynatrace-rca.css
src/app/shell-overrides.css
```

## Rollback

If QA finds regression on sapdev, restore the disabled imports in `src/main.jsx` as needed:

```js
import './sapdev-polish.css'
import './sapdev-comparer-fix.css'
import './sapdev-premium-overhaul.css'
import './sapdev-final-force.css'
import './sap-intelligent-ux.css'
import './sap-intelligent-investigation.css'
import './sap-dynatrace-rca.css'
import './app/shell-overrides.css'
```

Then run:

```bash
npm run build
git add src/main.jsx
git commit -m "Restore legacy sapdev CSS imports"
git push origin dev
```

## QA focus after deploy

Check these URLs after auto deploy:

```text
https://sapdev.cbj-kontruksi.com
https://sapdev.cbj-kontruksi.com/#/tool/comparer
https://sapdev.cbj-kontruksi.com/#/tool/analyzer
https://sapdev.cbj-kontruksi.com/#/tool/logs
```

Verify:

- no blank screen
- navbar desktop/mobile still works
- SAP RCA logo still visible
- homepage Investigation Workspace still readable
- comparer layout is not broken
- old floating/shortcut nav does not reappear
- PDF dock still visible and does not block content
- Export PDF works on all 3 core tools
- evidence/table readability still OK
- charts remain readable without the legacy Dynatrace override

## Next recommended cleanup

Audit the remaining active imports in this order:

1. `src/app/rca-workspace.css`
2. `src/features/evidence/evidence.css`

Do not disable more than one remaining CSS file per patch unless QA is already green.
