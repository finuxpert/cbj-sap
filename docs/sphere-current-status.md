# SPHERE Current Status

Last updated: 2026-05-08

## Project

```text
Project : SAP Intelligent RCA Workspace
Repo    : finuxpert/sphere
Branch  : dev
Target  : sapdev
URL     : https://sapdev.cbj-kontruksi.com
API     : https://sapdev.cbj-kontruksi.com/sap-api/health
```

## Current deploy model

DEV deploy is now automatic on push to branch `dev`.

```text
push dev -> GitHub Actions -> self-hosted runner sapdev -> npm build -> deploy to /var/www/svr01-dev/sap
```

Main deploy workflow:

```text
.github/workflows/deploy-dev.yml
```

Validation/report workflow:

```text
.github/workflows/dev-validate-report.yml
docs/validation/dev-latest.md
```

The validation report records build status, deployed asset count, live HTTP status, and Evidence API health.

## Active core tools

Only these 3 RCA tools are core:

```text
#/tool/comparer  -> WP-SCOUT Process / RCA Comparator
#/tool/analyzer  -> ST03N Impact V2
#/tool/logs      -> Log Evidence V2
```

Secondary/helper tools must stay hidden or secondary unless explicitly requested.

## Branding / logo status

Navbar uses a custom internal SPHERE badge:

```text
src/components/SapRcaLogo.jsx
src/app/sap-rca-logo.css
```

Important note:

```text
This is a custom internal SPHERE mark, not an official SAP logo asset.
```

The badge text is `SPHERE` and is designed to match the enterprise theme without committing external trademark image files.

## Current CSS / UI state

UI polish has been centralized.

`src/main.jsx` now imports only:

```text
src/index.css
src/app/enterprise-theme.css
```

Do not add new UI CSS imports directly to `src/main.jsx`.

Current enterprise theme import order:

```css
@import './enterprise-ui-system.css';
@import './sap-rca-logo.css';
@import './enterprise-navigation.css';
@import './evidence-history-ux.css';
@import './investigation-workspace-ux.css';
@import './log-evidence-ux.css';
@import './st03n-impact-ux.css';
@import './comparer-process-ux.css';
@import './pdf-export-ux.css';
```

Current enterprise UI layers:

```text
src/app/enterprise-ui-system.css        -> base enterprise tokens/cards/buttons/tables
src/app/sap-rca-logo.css                -> custom SPHERE badge styling
src/app/enterprise-navigation.css       -> navbar, tool tabs, mobile nav
src/app/evidence-history-ux.css         -> shared Evidence History / server evidence panels
src/app/investigation-workspace-ux.css  -> home dashboard / evidence pack workflow
src/app/log-evidence-ux.css             -> Log Evidence V2 readability
src/app/st03n-impact-ux.css             -> ST03N Impact V2 readability
src/app/comparer-process-ux.css         -> WP-SCOUT Comparator table/filter/chart UX
src/app/pdf-export-ux.css               -> PDF dock and print fallback polish
```

Legacy/direct CSS imports disabled but retained for rollback:

```text
src/sapdev-polish.css
src/sapdev-comparer-fix.css
src/sapdev-premium-overhaul.css
src/sapdev-final-force.css
src/sap-intelligent-ux.css
src/sap-intelligent-investigation.css
src/sap-dynatrace-rca.css
src/app/shell-overrides.css
src/app/rca-workspace.css
src/features/evidence/evidence.css
```

Evidence structural layout was moved from:

```text
src/features/evidence/evidence.css
```

into:

```text
src/app/evidence-history-ux.css
```

CSS cleanup audit document:

```text
docs/css-cleanup-audit.md
```

## Latest validation status

Latest runtime validation report:

```text
docs/validation/dev-latest.md
```

Last green runtime commit from the validation report:

```text
60603c6 - Simplify main CSS entrypoint imports
```

Validation summary:

```text
Build      : green
HTTP       : 200 on https://sapdev.cbj-kontruksi.com/sap/
API Health : ok on /sap-api/health
Asset count: 17
Build time : 6.66s
```

Treat `docs/validation/dev-latest.md` as the runner-written source of truth for sapdev validation.

## PDF export status

Structured PDF export has been upgraded.

Main files:

```text
src/features/pdf/ToolExportDock.jsx
src/features/pdf/structuredPdf.js
```

Current PDF export behavior:

- structured report, not screenshot-based
- supports Comparator, ST03N, and Log Evidence pages
- collects visible decision cards, evidence ranking, panels, table/list rows
- includes executive summary
- includes recommended Basis/RCA actions
- includes evidence handling notes
- includes footer and page numbering
- file name is tool-specific

Smoke test paths:

```text
https://sapdev.cbj-kontruksi.com/sap/#/tool/comparer
https://sapdev.cbj-kontruksi.com/sap/#/tool/analyzer
https://sapdev.cbj-kontruksi.com/sap/#/tool/logs
```

Then click:

```text
Export PDF
```

## Documentation added/updated

```text
docs/enterprise-theme-notes.md      -> enterprise CSS structure and rules
docs/ai-coding-workflow-style.md    -> preferred AI coding/audit workflow
docs/dev-deploy-runbook.md          -> updated dev auto-deploy runbook
docs/css-cleanup-audit.md           -> CSS cleanup/rollback audit
docs/qa-checklist.md                -> visual/manual QA checklist after CSS consolidation
docs/validation/dev-latest.md       -> runner-written latest DEV validation report
docs/sphere-current-status.md      -> this status handoff file
```

## Coding style rules

Preferred style:

```text
improve + document + keep rollback easy
```

Rules:

- incremental only
- DEV first
- never touch PROD unless explicitly requested
- prefer CSS-only polish before changing parser/business logic
- keep newer UI polish centralized through `src/app/enterprise-theme.css`
- do not import each new CSS file directly in `main.jsx`
- keep commit messages clear
- document meaningful architecture/deploy/style changes

## Things not to reintroduce

Never reintroduce:

```text
MutationObserver UI patcher
recursive DOM injector
runtime dashboard enhancer
delayed heavy UI patching
large FORCE_UI_CSS override layer
```

These previously caused:

```text
blank screen
stuck Loading SPHERE module
render lag
mobile freeze
hard-to-debug UI state
```

## Current safe next steps

Recommended next work, in order:

1. Smoke test sapdev visually after CSS consolidation.
2. Verify desktop/mobile navbar and custom SPHERE badge.
3. Test Evidence Archive/Uploader/History on the 3 core tool pages.
4. Test Export PDF on all 3 core tools.
5. If visual QA is green, delete or archive unused legacy CSS in a later dedicated cleanup only after rollback window.
6. Improve Evidence History functionality, not only visual.
7. Add TanStack Virtual only if large evidence tables are still heavy.
8. Continue modularizing monolith files incrementally.

## New prompt continuation

Use this in a new ChatGPT prompt:

```text
Lanjut SPHERE.
Repo: finuxpert/sphere
Branch: dev
Target: sapdev
URL: https://sapdev.cbj-kontruksi.com

Read first:
- docs/sphere-current-status.md
- docs/ai-coding-workflow-style.md
- docs/enterprise-theme-notes.md
- docs/dev-deploy-runbook.md
- docs/css-cleanup-audit.md
- docs/qa-checklist.md
- docs/validation/dev-latest.md

Working style:
- incremental only
- DEV first, never PROD unless requested
- improve + document + keep rollback easy
- prefer CSS-only polish before changing parser/business logic
- keep UI polish centralized through src/app/enterprise-theme.css
- do not import every new CSS file directly in main.jsx
- do not reintroduce MutationObserver/runtime injector/DOM enhancer
- auto deploy runs on push to dev

Goal:
Continue improving/auditing SPHERE while keeping code clean, documented, and rollback-safe.
```
