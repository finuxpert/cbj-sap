# SAP RCA Workspace

SAP Basis root-cause-analysis workspace for WP-SCOUT process evidence, ST03N workload impact, SAP log evidence, and Case History.

Current application baseline: **v0.1.0**.

## Active routes

- `#/` — RCA dashboard
- `#/tool/comparer` — WP-SCOUT Process
- `#/tool/analyzer` — ST03N Impact V2
- `#/tool/logs` — Log Evidence V2
- `#/cases` — Case History
- `#/about` — Runbook
- `#/contact` — Ops

Backward-compatible aliases are kept for existing bookmarks:

- `#/st03n` → `#/tool/analyzer`
- `#/log` → `#/tool/logs`

## Development

Use the `dev` branch as the SAPDEV source of truth.

```bash
npm ci
npm run qa
npm run dev
```

`npm run qa` runs lint and the production Vite build. Do not treat a UI-only browser check as sufficient validation for parser, Case History, or Evidence API changes.

## Development guardrails

- Refactor the active component or owning stylesheet; do not create new `final`, `fix`, `premium`, `clean-v2`, or dated patch files for ordinary UI changes.
- Keep tool-specific CSS owned by its route/component instead of adding more global CSS to `src/main.jsx`.
- Do not remove files based on filename alone. Confirm the active import chain first; several historical-looking comparer files are still used by the hydrated WP-SCOUT route.
- Keep parser/evidence behavior separate from visual cleanup.
- Preserve explicit-save behavior for Case History.
- Run `npm run qa` before merging to `dev`.

## SAPDEV deployment

The official SAPDEV workflow is manual and deploys the `dev` branch through `.github/workflows/dev-deploy.yml`. Merging code and deploying it are separate actions.

Relevant documentation:

- [Development deploy runbook](docs/dev-deploy-runbook.md)
- [Code cleanup audit](docs/runtime/code-cleanup-audit.md)
- [Frontend audit and development plan](docs/runtime/frontend-audit-development-plan.md)
- [QA checklist](docs/qa-checklist.md)
- [Current SAP RCA status](docs/sap-rca-current-status.md)

Production backup/deploy/rollback procedures remain documented separately and are not part of frontend cleanup work.
