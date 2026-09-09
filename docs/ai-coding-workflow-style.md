# AI Coding Workflow Style

This document describes the preferred coding workflow for SPHERE and other CBJ/Finuxpert web apps.

The goal is to improve web apps continuously while keeping the codebase clean, auditable, and easy to continue in a new ChatGPT prompt.

## Working style

Use this pattern for every improvement:

```text
Improve + document + keep rollback easy
```

Do not just make visual patches. Each improvement should also leave a clear trail:

- what changed
- why it changed
- where the file lives
- how it deploys
- what to check after deploy
- what must not be reintroduced

## Preferred implementation approach

### 1. Incremental only

Avoid large rewrites unless explicitly requested.

Preferred:

```text
small patch -> deploy DEV -> smoke test -> continue
```

Avoid:

```text
big rewrite -> many files changed -> hard to debug -> hard rollback
```

### 2. DEV first

For SPHERE:

```text
Repo   : finuxpert/sphere
Branch : dev
Target : sapdev
URL    : https://sapdev.cbj-kontruksi.com
```

Never touch PROD unless explicitly requested.

### 3. Auto deploy on dev push

The DEV deploy workflow should run automatically on push to branch `dev`.

Expected file:

```text
.github/workflows/dev-deploy.yml
```

Expected behavior:

```text
push dev -> auto deploy sapdev
```

Manual workflow is acceptable, but the preferred flow is no manual clicking when possible.

### 4. Keep UI changes structured

For SPHERE, newer UI polish layers must be centralized through:

```text
src/app/enterprise-theme.css
```

Do not import each new UI file directly in `main.jsx`.

Preferred:

```css
@import './enterprise-ui-system.css';
@import './enterprise-navigation.css';
@import './evidence-history-ux.css';
@import './investigation-workspace-ux.css';
@import './log-evidence-ux.css';
@import './st03n-impact-ux.css';
@import './comparer-process-ux.css';
@import './pdf-export-ux.css';
```

`main.jsx` should keep one newer enterprise theme import:

```js
import './app/enterprise-theme.css'
```

### 5. Prefer CSS-only polish before changing logic

When improving UI/UX:

Preferred first pass:

```text
CSS-only polish
```

Only change React/parser logic when CSS cannot solve the problem.

This reduces the chance of breaking:

- upload
- parser
- PDF export
- Evidence API
- tool routing
- lazy loading

### 6. Do not reintroduce unstable runtime hacks

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
stuck loading module
render lag
mobile freeze
hard-to-debug UI state
```

### 7. Use clear build stamps

When a deploy needs to be identifiable, update:

```text
APP_BUILD_STAMP
```

Example:

```js
const APP_BUILD_STAMP = 'sphere-20260909-pdf-export-ux'
```

Use meaningful names, not random text.

### 8. Commit message style

Use short imperative commit messages:

```text
Add Comparator UX polish
Import enterprise theme
Upgrade structured SPHERE PDF report export
Auto deploy sapdev on dev branch push
Document enterprise theme structure
```

Avoid vague commit messages:

```text
update
fix
changes
wip
```

## Preferred web app audit flow

For any web app audit, use this sequence:

### Phase 1: Inventory

Check:

- framework
- entrypoint
- routes
- CSS layers
- build/deploy workflow
- risky runtime hacks
- bundle size warning
- current branch
- target environment

### Phase 2: Safety rules

Confirm:

- DEV only
- no PROD changes
- no nginx/Cloudflare unless requested
- no secret/token commits
- no `.env` real values
- no private key or credential dump

### Phase 3: UI/UX polish

Prioritize:

- navigation
- layout consistency
- readable cards
- evidence/table readability
- mobile spacing
- export/report buttons
- loading/empty/error states

### Phase 4: Maintainability cleanup

After several patches, consolidate:

- central CSS imports
- theme notes
- docs
- repeated style rules
- unused old override files if confirmed safe

### Phase 5: Report and handoff

Every major patch batch should end with a summary:

```text
Repo
Branch
Target URL
Changed files
Commits
Deploy status
Smoke test URLs
Rollback notes
Next recommended step
```

## Standard ChatGPT continuation prompt

Use this when starting a new prompt for this repo:

```text
Lanjut SPHERE coding style.
Repo: finuxpert/sphere
Branch: dev
Target: sapdev
URL: https://sapdev.cbj-kontruksi.com

Working style:
- incremental only
- DEV first, never PROD unless requested
- improve + document + keep rollback easy
- prefer CSS-only polish before changing logic
- keep UI polish centralized through src/app/enterprise-theme.css
- do not import every new CSS file directly in main.jsx
- do not reintroduce MutationObserver/runtime injector/DOM enhancer
- commit messages must be clear
- auto deploy runs on push to dev

Current theme entrypoint:
src/app/enterprise-theme.css

Important docs:
- docs/enterprise-theme-notes.md
- docs/ai-coding-workflow-style.md

Goal:
Audit or improve the requested web app feature while keeping code clean and documented.
```

## Standard audit prompt for other web apps

Use this for another web app repo:

```text
Audit this web app with my coding style:
- incremental only
- DEV/staging first
- no PROD unless requested
- improve + document + keep rollback easy
- avoid large rewrites
- prefer CSS-only UI/UX polish before changing logic
- centralize theme/style imports
- document changed files, commits, deploy status, smoke test URLs, and rollback notes
- do not commit secrets, .env, private keys, tokens, or dumps

Start by checking repo structure, build workflow, deploy target, CSS layers, and risky runtime hacks.
Then propose or apply the safest first patch.
```

## Current SPHERE UI layers

Current newer polish layers:

```text
src/app/enterprise-ui-system.css
src/app/enterprise-navigation.css
src/app/evidence-history-ux.css
src/app/investigation-workspace-ux.css
src/app/log-evidence-ux.css
src/app/st03n-impact-ux.css
src/app/comparer-process-ux.css
src/app/pdf-export-ux.css
```

Current PDF export sources:

```text
src/features/pdf/structuredPdf.js
src/features/cases/casePdfExport.js
src/tools/sphereExport.js
```

Current core tools:

```text
#/tool/comparer
#/tool/analyzer
#/tool/logs
```
