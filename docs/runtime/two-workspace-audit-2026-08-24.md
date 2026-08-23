# SAP RCA Two-Workspace Audit — 2026-08-24

Target baseline: `v0.2.0`
Branch: `refactor/two-workspace-sap-analysis-v0.2.0`

## Decision

The application should expose only two primary SAP analysis workspaces:

1. **ST03N Analysis** — workload/performance evidence.
2. **Log Analysis** — error, trace, job/program, infra signal, and process evidence.

Case History remains a shared persistence/correlation capability, not a third analysis workspace.

## Functional mapping

| Existing area | v0.2.0 destination | Reason |
| --- | --- | --- |
| ST03N Impact V2 | ST03N Analysis | Owns response time, DB time, wait time, workload completeness, dominant component, and top workload offender. |
| WP-SCOUT Process | Log Analysis → Process Evidence | WP-SCOUT rows are process/log evidence: PID, WP, CPU/RSS, job, program, error code, recurrence. Log Evidence V2 already parses WP-SCOUT input. |
| Log Evidence V2 | Log Analysis → Log Evidence | Owns SM21/ST22/dev_w/job logs, error families, owner direction, infra saturation, job/program mapping, and timeline. |
| Dashboard / InvestigationWorkspace V2 | Retired from active routing | It duplicates ST03N and WP-SCOUT parsing and creates a third investigation surface with overlapping conclusions. |
| Dashboard cross-tool correlation | Case Detail / RCA Analytics | Cross-tool capability is preserved by the existing Case History correlation API and `CorrelationSummary`, which shows correlated sources, affected hosts, workprocesses, confidence, root cause, and recommended actions. |
| Case History | Embedded shared utility + internal `#/cases` route | Required for explicit persistence, correlation, audit trail, and case detail. It should not compete with analysis tools in primary navigation. |
| Runbook page | Removed from primary routing | Current page is only a short placeholder. Action guidance already exists in ST03N/Log results and repository runbooks remain in docs. |
| Ops page | Removed from primary routing | Current page is a placeholder. Operational ownership is more useful when derived from Log Analysis owner direction. |
| PDF export | Context-aware utility | ST03N keeps analyzer export; Log Evidence keeps logs export; Process Evidence preserves comparer export internally. |
| Evidence API archive | Shared utility | Log archive remains on Log Evidence; ST03N keeps server/evidence context in its own analysis flow. |

## Why the old Dashboard can be retired safely

The dashboard's useful cross-tool concept is not being deleted. `CaseDetailWithAnalytics` already loads backend case correlation, and `CorrelationSummary` renders correlated tools/sources, related workprocesses, affected hosts, confidence, top root cause, next check, and recommended actions. This is a better location for combined RCA because correlation should happen after evidence from ST03N and Log has been linked to the same case.

The resulting workflow is:

1. Analyze workload in ST03N.
2. Analyze errors/process evidence in Log.
3. Link both results to one Case History case.
4. Review cross-tool correlation in that case's RCA Analytics.

This preserves the combined-analysis value without keeping a duplicate Dashboard parser/workbench.

## Navigation model

Primary navigation contains only:

- `ST03N Analysis`
- `Log Analysis`

Inside Log Analysis there are two views:

- `Log Evidence`
- `Process Evidence · WP-SCOUT`

This keeps WP-SCOUT capability without presenting it as a third top-level product.

## Compatibility routes

- `#/` → ST03N Analysis
- `#/st03n` → ST03N Analysis
- `#/log` → Log Analysis
- `#/tool/comparer` → Log Analysis / Process Evidence
- `#/wpscout` and `#/wp-scout` → Log Analysis / Process Evidence
- old Runbook/Ops routes normalize into the relevant analysis workspace
- `#/cases` and `#/cases/:id` remain internal history/detail routes

## UI/UX audit

### ST03N

Keep the current white/blue decision-first presentation. Do not reintroduce broad responsive overrides. Future ST03N changes should focus on:

- move verdict/confidence/completeness ahead of persistence controls after visual validation;
- improve long Y-axis label handling;
- keep parser behavior isolated from layout refactors;
- retain explicit Case History save.

### Log

Log becomes the umbrella for operational evidence. The workspace should answer two different questions without mixing them in one screen:

- **Log Evidence:** what error happened, how often, who owns it, and what action is recommended?
- **Process Evidence:** which PID/WP/job/program is recurring or consuming resources around the incident window?

A small internal mode switch is preferable to one giant page because each evidence type has different density and interaction needs.

## Code cleanup implications

The following become legacy candidates after the two-workspace branch is build-green and import validation confirms no active references:

- `src/app/pages/Home.jsx`
- `src/app/pages/InvestigationWorkspace.jsx`
- `src/app/pages/InvestigationWorkspaceV2.jsx`
- their dashboard-only CSS layers
- `src/app/pages/About.jsx`
- `src/app/pages/Contact.jsx`

Do **not** delete `ToolComparerClean.jsx` or its active dependencies yet. They are still loaded by `ToolComparerDirectHydrated.jsx`, now as the Process Evidence view inside Log Analysis.

Old `ToolAnalyzer*`, `ToolSt03nImpact.jsx`, and `ToolLogEvidence.jsx` files should be handled in a separate legacy cleanup pass only after repository-wide import checks and a successful production build.

## Validation gate

Before merging this architecture into `dev`:

1. `npm ci`
2. `npm run build` must succeed.
3. Verify `#/`, `#/st03n`, and `#/tool/analyzer` show ST03N Analysis.
4. Verify `#/log` and `#/tool/logs` show Log Evidence.
5. Verify `#/tool/logs/process` shows WP-SCOUT Process Evidence.
6. Verify old `#/tool/comparer` opens Log Analysis / Process Evidence.
7. Verify top desktop/mobile navigation contains only ST03N and Log.
8. Verify `Analysis History` from both Case Link panels opens `#/cases`.
9. Verify create/link/save Case History remains explicit and functional.
10. Save ST03N and Log/Process evidence to the same case and verify Case Detail RCA Analytics correlates sources/workprocesses/hosts.
11. Verify PDF export selects analyzer/logs/comparer output according to the current view.

Known repository-wide lint debt from the pre-v0.2.0 codebase should be cleaned in a dedicated PR; do not mix mass lint rewrites with this routing/IA change.
