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

## Current legacy CSS imports still active in main.jsx

```text
src/sapdev-comparer-fix.css
src/sap-intelligent-ux.css
src/sap-intelligent-investigation.css
src/features/evidence/evidence.css
src/app/shell-overrides.css
src/app/rca-workspace.css
src/sap-dynatrace-rca.css
src/app/enterprise-theme.css
```

## Disabled legacy CSS files retained for rollback

```text
src/sapdev-polish.css
src/sapdev-premium-overhaul.css
src/sapdev-final-force.css
```

## Rollback

If QA finds regression on sapdev, restore the disabled imports in `src/main.jsx` as needed:

```js
import './sapdev-polish.css'
import './sapdev-premium-overhaul.css'
import './sapdev-final-force.css'
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
- PDF dock still visible
- Export PDF works on all 3 core tools
- evidence/table readability still OK

## Next recommended cleanup

Audit the remaining active legacy CSS imports one by one. Start with `src/sap-intelligent-ux.css` and `src/sap-intelligent-investigation.css`, but do not disable both at once. Keep each patch small and rollbackable.
