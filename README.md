# SAP RCA Workspace

SAP Basis root-cause-analysis workspace focused on two primary analysis surfaces: ST03N workload/performance analysis and unified Log/process evidence analysis.

Current application baseline: **v0.2.0**.

## Primary workspaces

- `#/st03n` / `#/tool/analyzer` — **ST03N Analysis**
- `#/log` / `#/tool/logs` — **Log Analysis**
- `#/tool/logs/process` — Log Analysis → **Process Evidence · WP-SCOUT**

The application intentionally exposes only ST03N and Log in primary desktop/mobile navigation.

## Shared analysis utilities

Case History is retained as an internal persistence and audit capability:

- `#/cases` — Analysis History
- `#/cases/:id` — case detail and analytics

Both ST03N and Log keep explicit create/link/save Case History flows. History is opened from the Case Link panel rather than occupying a third primary navigation slot.

Backward-compatible routes:

- `#/` → ST03N Analysis
- `#/tool/comparer` → Log Analysis / Process Evidence
- `#/wpscout` / `#/wp-scout` → Log Analysis / Process Evidence
- old Runbook/Ops routes normalize to the relevant analysis workspace

## Functional ownership

- **ST03N Analysis:** response time, DB time, wait time, workload completeness, dominant component, top workload offender.
- **Log Analysis / Log Evidence:** SM21, ST22, dev_w, job logs, error family, owner direction, infra saturation, job/program mapping, occurrence timeline.
- **Log Analysis / Process Evidence:** WP-SCOUT PID/WP/job/program/error/resource correlation.
- **Case History:** shared persistence, audit trail, and cross-evidence correlation.

See [Two-workspace audit](docs/runtime/two-workspace-audit-2026-08-24.md) for the architecture mapping and cleanup plan.

## Development

Use the `dev` branch as the SAPDEV source of truth.

```bash
npm ci
npm run build
```

`npm run build` is the current production-bundle gate. `npm run qa` also runs repository-wide ESLint and currently exposes pre-existing legacy lint debt; clean that debt in a dedicated PR rather than mixing mass lint changes into analysis routing/UI work.

## Development guardrails

- Refactor the active component or owning stylesheet; do not create new `final`, `fix`, `premium`, `clean-v2`, or dated patch files for ordinary UI changes.
- Keep tool-specific CSS owned by its route/component instead of adding more global CSS to `src/main.jsx`.
- Do not remove files based on filename alone. Confirm the active import chain first; historical-looking comparer files are still used by Log Analysis → Process Evidence.
- Keep parser/evidence behavior separate from visual cleanup.
- Preserve explicit-save behavior for Case History.
- Run `npm run build` before merging to `dev`.

## SAPDEV deployment

The official SAPDEV workflow deploys the `dev` branch through `.github/workflows/dev-deploy.yml`. Merging code and deploying it are separate actions.

Relevant documentation:

- [Development deploy runbook](docs/dev-deploy-runbook.md)
- [Two-workspace audit](docs/runtime/two-workspace-audit-2026-08-24.md)
- [Code cleanup audit](docs/runtime/code-cleanup-audit.md)
- [Frontend audit and development plan](docs/runtime/frontend-audit-development-plan.md)
- [QA checklist](docs/qa-checklist.md)
- [Current SAP RCA status](docs/sap-rca-current-status.md)

Production backup/deploy/rollback procedures remain documented separately and are not part of frontend cleanup work.
