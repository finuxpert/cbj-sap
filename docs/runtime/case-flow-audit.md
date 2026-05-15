# SAP Intelligent RCA Workspace - Case Flow Audit

## Objective

Stabilize the RCA persistence model so the application is predictable, DB-first ready, and Grafana-readable.

Core rule: one incident or RCA equals one case. One case can have many parsed results and many evidence files. Tools append findings; tools do not rename or redefine the case identity.

## Target user flow

1. Upload and Analyze
2. Create or Link Case
3. Save Result to Case History

Upload only parses evidence and updates tool analysis state. Create Case only creates and links a case in the current session. Save Result appends parsed result and evidence to the linked case.

## Shared frontend contract

The canonical frontend flow lives in these shared files:

- src/features/cases/CaseLinkPanel.jsx
- src/features/cases/useCaseHistoryLink.js
- src/features/cases/caseHistoryLinkUtils.js

All core tools should use these shared modules instead of local persistence flows.

## Tool-specific metadata

Tools may pass small metadata through context, such as SID, environment, or parser version. Metadata must not create a separate persistence flow.

## Backend identity model

Case identity fields must remain immutable after creation:

- id
- case_no
- title
- top_anomaly
- top_suspect
- created_at
- created_by

Parsed results can still append tool-specific findings and update operational state such as severity and case_stage.

## Cleanup status

Completed in this pass:

- Shared CaseLinkPanel normalized.
- CaseLinkPanel no longer special-cases WP-SCOUT by description text.
- Shared CaseLinkPanel supports child metadata fields for tool-specific inputs.
- useCaseHistoryLink supports SID and environment context.
- Log Evidence migrated to shared CaseLinkPanel and shared useCaseHistoryLink.
- Log Evidence duplicate helper and local persistence flow removed.
- Backend update_case_item ignores immutable identity fields.
- UI wording avoids the Auto-save concept.

Known follow-up risk:

- WP-SCOUT still contains an old upload-path call to persistAnalysis after parsing. The preferred cleanup is to remove that call directly from ToolComparerClean.jsx after build validation, because the file is large and chart-heavy.

## Grafana readiness target

Grafana should read PostgreSQL, not React state.

Primary tables:

- cases
- parsed_results
- evidence

Recommended views:

- grafana_sap_cases
- grafana_sap_case_activity
- grafana_sap_parsed_results
- grafana_sap_evidence
- grafana_sap_rca_summary
- grafana_sap_tool_quality

Recommended panels:

- Total active cases
- Cases by severity
- Cases by stage
- Parsed result count by tool
- Evidence uploaded by tool
- Top suspect taxonomy
- SID and environment distribution
- Latest critical cases
- Case activity timeline
- Upload-to-save funnel
- Parser confidence trend

## Definition of Done

- Core tools share one case-linking flow.
- Upload only analyzes evidence.
- Create Case only creates or links a case.
- Save explicitly appends parsed results and evidence.
- No selected case is restored from localStorage.
- Case identity stays stable after creation.
- Case History displays stable case identity.
- PostgreSQL contains cases, parsed_results, and evidence rows for one test incident.
- Grafana can query RCA operational data from PostgreSQL views or direct tables.
