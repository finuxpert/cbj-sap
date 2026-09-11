# Active SPHERE cleanup

Both source branches were identical before cleanup. Checked frontend JS/CSS import references, package scripts, tracked workflows (none), tests, migration files, nginx, systemd and cron references. Removed CSS has no code import; historical documents are not runtime consumers. One-shot patchers and dispatchers target removed workflows.

Preserved active frontend, backend, FastAPI, PostgreSQL models and initial migration, JavaScript LOG/ST03N parsers, workload analytics, tests, QA, branding and WP Scout collector including RCA compatibility markers. Production runtime was not redeployed.

Removed files:

- `src/app/shell-overrides.css`
- `src/app/sphere-workspace.css`
- `src/app/wp-scout-chart-readability.css`
- `src/app/wp-scout-sphere-cockpit-polish.css`
- `src/comparer-sphere-final.css`
- `src/features/evidence/evidence.css`
- `src/sap-intelligent-investigation.css`
- `src/sap-intelligent-ux.css`
- `src/sapdev-comparer-fix.css`
- `src/sapdev-final-force.css`
- `src/sapdev-polish.css`
- `src/sapdev-premium-overhaul.css`
- `src/sphere-dynatrace.css`
- `src/tools/EvidenceDecisionKit.css`
- `src/tools/ToolComparerClean.css`
- `src/tools/ToolComparerCleanCompact.css`
- `src/tools/ToolComparerCleanVisual.css`
- `src/tools/ToolComparerDynatrace.css`
- `src/tools/ToolComparerPremium.css`
- `src/tools/ToolEvidenceSpecialist.css`
- `scripts/apply-hybrid-write-patch.py`
- `scripts/refactor-evidence-api-models.py`
- `scripts/refactor-evidence-api-storage.py`
- `scripts/run-backend-safe-refactor.sh`
- `scripts/watch-latest-sapdev-run.sh`
- `docs/audit/css-audit.md`
- `docs/audit/tools-audit.md`
- `docs/projects/finuxpert-apps-sap-case-history-handoff-prompt.md`
- `docs/runtime/backend-evidence-api-audit.md`
- `docs/runtime/backend-modularization-status.md`
- `docs/runtime/case-flow-audit.md`
- `docs/runtime/code-cleanup-audit.md`
- `docs/runtime/frontend-audit-development-plan.md`
- `docs/runtime/grafana-integration-plan.md`
- `docs/runtime/next-chat-prompt.md`
- `docs/runtime/sap-db-green-status.md`
- `docs/runtime/sap-db-manual-check-status.md`
- `docs/runtime/sap-postgres-hybrid-continuation.md`
- `docs/runtime/two-workspace-audit-2026-08-24.md`
- `docs/runtime/ui-ux-audit-2026-08-24.md`
- `docs/runtime/workflow-check-2026-05-13.md`
- `docs/validation/dev-latest.md`
