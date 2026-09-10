# SPHERE Frontend Audit & Development Plan

Generated: 2026-05-10
Branch: `dev`
Runtime target: `sapdev`

## Current safe architecture

The frontend is now focused around the intended SAP Intelligent RCA workspace surface:

- React + Vite app shell
- Route-based pages for Home, About, Contact, Case History, and Case Detail
- Lazy-loaded core tools only:
  - WP-SCOUT Process / RCA Comparator
  - ST03N Impact V2
  - Log Evidence V2
- Evidence API integration through `/sap-api`
- PostgreSQL Hybrid backend mode with JSON/file fallback preserved

## Current validated runtime baseline

Latest known GREEN baseline before this audit:

- DEV deploy target: `/var/www/svr01-dev/sap`
- Public route: `https://sapdev.cbj-kontruksi.com/sap/`
- Backend API: `/sap-api`
- Runtime mode: PostgreSQL Hybrid
- JSON/file fallback must remain available

## What looks healthy

- App shell is no longer dominated by duplicated dashboard widgets.
- Tool loading is centralized through `src/tools/index.js`.
- Only the 3 intended RCA tools are exposed through the active tool registry.
- No runtime injector / MutationObserver pattern was found in the initial connector search.
- Parsed Results History panel has safe frontend-only filters and copy actions.
- Deploy workflow already performs build, deploy, nginx validation, Evidence API restart, and `scripts/qa-sapdev.sh`.

## Development priorities

### P0 — Stability guardrails

Do not change these without explicit approval:

- DB schema
- PostgreSQL Hybrid read/write behavior
- JSON/file fallback
- nginx / Cloudflare routing
- Evidence storage paths
- Runtime service name: `sap-evidence-api.service`
- 3-core-tool route model

### P1 — Frontend QA baseline

A new package script exists:

```bash
npm run qa
```

It runs:

```bash
npm run lint && npm run build
```

Recommended use:

- Use `npm run build` for deploy workflow until lint is proven clean.
- Use `npm run qa` during cleanup PRs / local validation.
- Only wire `npm run qa` into deploy workflow after lint passes consistently.

### P2 — Dependency hygiene

Candidate dependencies to verify before removal:

- `html2canvas`
- `dexie`
- `idb-keyval`
- `sql.js`
- `framer-motion`
- `date-fns`

Do not remove directly from `package.json` only. If removing dependencies, update `package-lock.json` through npm so `npm ci` remains valid.

Recommended safe flow:

```bash
cd /home/sadmin/sap
git checkout dev
git pull origin dev
npm run build
npm run lint
npm uninstall <candidate-package>
npm run build
npm run lint
git diff -- package.json package-lock.json
git commit -am "Remove unused frontend dependency <name>"
git push origin dev
```

### P3 — Bundle size reduction

Known heavy runtime chunks from latest validation reports include:

- `recharts`
- `jspdf`
- `xlsx`
- `jszip`

Current recommendation:

- Keep lazy loading for tools.
- Keep PDF/export libraries dynamically imported when possible.
- Avoid importing XLSX/JSZip/PDF libraries from app shell or shared UI components.
- Keep chart-heavy logic inside the relevant tool modules.

### P4 — Monolith reduction

`InvestigationWorkspaceV2.jsx` is still a major technical debt area. Split only in small chunks.

Suggested extraction order:

1. file classification and ZIP expansion helpers
2. WP-SCOUT parsing helpers
3. ST03N workbook parsing helpers
4. suspect scoring helpers
5. PDF report exporter
6. persistence/upload helper functions
7. presentation-only panels

Rules:

- Do not rewrite the full page in one patch.
- Preserve current behavior and exported report content.
- After each extraction, run build and smoke-test the tool.

### P5 — UX improvements

Safe next UX improvements:

- Expand/collapse parsed result row details
- Copy quick actions for case, suspect, error code, program
- Severity row accent
- Sticky mini summary inside Investigation Workspace
- Evidence History ↔ Parsed Results correlation badge

Higher-risk UX improvements requiring route confirmation:

- Clickable case drill-down from parsed result rows
- Deep-link to case detail
- Cross-panel navigation state

## QA checklist after each frontend patch

### Build

```bash
npm run build
```

### Optional strict QA

```bash
npm run qa
```

### Runtime API checks

```bash
curl -s https://sapdev.cbj-kontruksi.com/sap-api/health | jq '{status:.status, case_history:.case_history, database:.database}'
curl -s https://sapdev.cbj-kontruksi.com/sap-api/cases | jq '{ok:.ok, read_source:.read_source, mode:.mode, count:.count}'
curl -s https://sapdev.cbj-kontruksi.com/sap-api/evidence-history | jq '{ok:.ok, read_source:.read_source, mode:.mode, count:.count, fallback_reason:(.fallback_reason // null)}'
curl -s https://sapdev.cbj-kontruksi.com/sap-api/parsed-results-history | jq '{ok:.ok, read_source:.read_source, mode:.mode, count:.count, fallback_reason:(.fallback_reason // null)}'
```

### UI smoke test

- Open `https://sapdev.cbj-kontruksi.com`
- Confirm app loads without blank screen
- Open Investigation Workspace
- Confirm Parsed Results History loads
- Test filters:
  - Tool
  - Severity
  - Case / keyword
  - Reset
- Test quick actions:
  - Copy case
  - Copy suspect
- Open 3 core tools:
  - WP-SCOUT Process
  - ST03N Impact V2
  - Log Evidence V2
- Confirm Evidence API status is still healthy

## Cleanup rules

Never commit:

- `.env`
- token / password / private key
- `.venv-db`
- runtime-status output
- generated output
- local backup files
- database dumps

Never reintroduce:

- MutationObserver UI injector
- recursive DOM injector
- runtime dashboard enhancer
- delayed heavy UI patcher

## Current recommendation

Continue with small, auditable changes:

1. Keep deploy workflow build-first for now.
2. Use `npm run qa` manually until lint is confirmed green.
3. Remove unused dependencies one by one only from a real npm environment.
4. Split `InvestigationWorkspaceV2.jsx` incrementally.
5. Keep backend and schema untouched unless explicitly required.
