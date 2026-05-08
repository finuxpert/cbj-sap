# SAP RCA Workspace Current Status

Last updated: 2026-05-08

## Project

```text
Project : SAP Intelligent RCA Workspace
Repo    : finuxpert/cbj-sap
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

The workflow includes concurrency:

```yaml
concurrency:
  group: sapdev-deploy
  cancel-in-progress: true
```

This prevents multiple sapdev deploys from piling up.

## Active core tools

Only these 3 RCA tools are core:

```text
#/tool/comparer  -> WP-SCOUT Process / RCA Comparator
#/tool/analyzer  -> ST03N Impact V2
#/tool/logs      -> Log Evidence V2
```

Secondary/helper tools must stay hidden or secondary unless explicitly requested.

## Branding / logo status

Navbar now uses a custom internal SAP RCA Workspace badge:

```text
src/components/SapRcaLogo.jsx
src/app/sap-rca-logo.css
```

Important note:

```text
This is a custom internal SAP RCA mark, not an official SAP logo asset.
```

The badge text is `SAP RCA` and is designed to match the enterprise theme without committing external trademark image files.

## Recent UI/UX work

Newer UI polish is centralized through:

```text
src/app/enterprise-theme.css
```

`main.jsx` should only import the enterprise theme entrypoint, not every polish file individually.

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

## New UI/UX layers

```text
src/app/enterprise-ui-system.css        -> base enterprise tokens/cards/buttons/tables
src/app/sap-rca-logo.css                -> custom SAP RCA badge styling
src/app/enterprise-navigation.css       -> navbar, tool tabs, mobile nav
src/app/evidence-history-ux.css         -> shared Evidence History / server evidence panels
src/app/investigation-workspace-ux.css  -> home dashboard / evidence pack workflow
src/app/log-evidence-ux.css             -> Log Evidence V2 readability
src/app/st03n-impact-ux.css             -> ST03N Impact V2 readability
src/app/comparer-process-ux.css         -> WP-SCOUT Comparator table/filter/chart UX
src/app/pdf-export-ux.css               -> PDF dock and print fallback polish
```

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
https://sapdev.cbj-kontruksi.com/#/tool/comparer
https://sapdev.cbj-kontruksi.com/#/tool/analyzer
https://sapdev.cbj-kontruksi.com/#/tool/logs
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
docs/sap-rca-current-status.md      -> this status handoff file
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
stuck Loading SAP RCA module
render lag
mobile freeze
hard-to-debug UI state
```

## Current safe next steps

Recommended next work, in order:

1. Smoke test sapdev after auto deploy.
2. Test custom SAP RCA badge on desktop/mobile navbar.
3. Test Export PDF on all 3 core tools.
4. If UI is stable, start CSS cleanup of older legacy files carefully.
5. Improve Evidence History functionality, not only visual.
6. Add TanStack Virtual only if large evidence tables are still heavy.
7. Continue modularizing monolith files incrementally.

## New prompt continuation

Use this in a new ChatGPT prompt:

```text
Lanjut SAP RCA Workspace.
Repo: finuxpert/cbj-sap
Branch: dev
Target: sapdev
URL: https://sapdev.cbj-kontruksi.com

Read first:
- docs/sap-rca-current-status.md
- docs/ai-coding-workflow-style.md
- docs/enterprise-theme-notes.md
- docs/dev-deploy-runbook.md

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
Continue improving/auditing SAP RCA Workspace while keeping code clean, documented, and rollback-safe.
```
