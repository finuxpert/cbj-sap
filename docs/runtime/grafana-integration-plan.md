# Grafana Integration Plan — SAP RCA Workspace

Purpose: define the safe integration pattern between SAP Intelligent RCA Workspace, PostgreSQL, and Grafana without duplicating RCA investigation features.

## Design Principle

Grafana is not the RCA input or investigation screen.

- SAP RCA Workspace remains the operational workspace for intake, evidence upload, parsing, RCA correlation, case detail, session replay, and PDF reports.
- PostgreSQL remains the shared persistence layer.
- Grafana reads curated PostgreSQL views for monitoring, comparison, and management/NOC visibility.

## Target Workflow

```text
User reports: SAP is slow
↓
SAP RCA creates temporary investigation case
↓
User uploads evidence per SID/host/app/tool
↓
Parser/analyzer stores normalized parsed_results
↓
Case is classified and auto-renamed from RCA output
↓
PostgreSQL stores case + evidence + parsed_results + node metrics
↓
Grafana reads curated SQL views
↓
Grafana panels link back to SAP RCA case detail
```

## Case Naming Model

### Initial temporary name

Before root cause is known, the case should not require a final manual name.

Recommended temporary format:

```text
SAP Slowness Investigation - <SID> - <YYYY-MM-DD HH:mm>
```

Example:

```text
SAP Slowness Investigation - H1P - 2026-05-13 14:20
```

### Final auto-classified name

After parsed results and correlation are available, the case can be renamed automatically.

Recommended final format:

```text
<SID> - <Primary Root Cause / Top Suspect> - <Impact Type> - <YYYY-MM-DD>
```

Examples:

```text
H1P - Dialog WP High CPU - SAP Slowness - 2026-05-13
H1P - ST03N High Response Time - SAP Slowness - 2026-05-13
H1P - DB Wait / Lock Contention - SAP Slowness - 2026-05-13
H1P - Background Job Bottleneck - SAP Slowness - 2026-05-13
```

## Recommended Case Stages

Use a lightweight case stage field for Grafana and UI status.

```text
INTAKE
WAITING_EVIDENCE
ANALYZING
CLASSIFIED
RESOLVED
```

Meaning:

- `INTAKE`: report was received, but evidence is not uploaded yet.
- `WAITING_EVIDENCE`: case exists and is waiting for WP-SCOUT/ST03N/log files.
- `ANALYZING`: evidence exists and parser/RCA is being used.
- `CLASSIFIED`: RCA has produced top suspect/root cause/confidence.
- `RESOLVED`: case has final remediation/result.

## Data Ownership

| Layer | Responsibility |
|---|---|
| SAP RCA Workspace | Intake, evidence upload, parsing, RCA, PDF report |
| FastAPI `/sap-api` | Case/evidence/parsed-result API |
| PostgreSQL | Durable RCA data store |
| SQL views | Grafana-ready curated data |
| Grafana | Monitoring, trends, comparison, executive/NOC visibility |

## Grafana Scope

Grafana should display:

- Pending/unclassified RCA cases.
- Open critical cases.
- SAP slowness trend.
- Evidence upload trend.
- Case aging.
- RCA confidence trend.
- Top root causes.
- App/server comparison per case.
- Backend/API/database health.

Grafana should not duplicate:

- Evidence upload.
- Full RCA detail analysis.
- Long raw evidence rendering.
- PDF report generation.
- Case editing workflow.

## App1–App5 / Multi-node Comparison

For cases involving multiple SAP application servers, the workflow should support per-node evidence and metrics.

Example nodes:

```text
app1
app2
app3
app4
app5
```

Recommended normalized metric fields:

```text
case_id
sid
environment
host
instance
metric_time
cpu_pct
mem_pct
swap_si
dialog_wp_busy
background_wp_busy
response_time_ms
db_time_ms
queue_time_ms
error_count
severity
suspect_score
source_tool
```

Grafana can compare:

- CPU app1 vs app2 vs app3 vs app4 vs app5.
- Memory pressure by app server.
- Swap pressure by app server.
- Dialog/background workprocess pressure.
- Response time, DB time, and queue time.
- Error count by host/tool.
- Suspect score by host.

SAP RCA should still remain the source of truth for the final RCA narrative.

## Recommended SQL Views

### `grafana_sap_rca_cases`

Purpose: one row per RCA case for Grafana case overview.

Recommended columns:

```text
time
case_id
case_no
title
sid
environment
severity
status
case_stage
summary
top_anomaly
top_suspect
confidence
evidence_count
parsed_result_count
created_at
updated_at
resolved_at
case_url
```

### `grafana_sap_pending_cases`

Purpose: show intake/waiting/analyzing cases that are not yet classified.

Recommended filters:

```text
case_stage IN ('INTAKE', 'WAITING_EVIDENCE', 'ANALYZING')
```

### `grafana_sap_case_node_compare`

Purpose: one row per case + host/app metric sample.

Recommended columns:

```text
time
case_id
sid
environment
host
instance
cpu_pct
mem_pct
swap_si
dialog_wp_busy
background_wp_busy
response_time_ms
db_time_ms
queue_time_ms
error_count
severity
suspect_score
source_tool
case_url
```

### `grafana_sap_evidence_flow`

Purpose: evidence upload and analysis throughput.

Recommended columns:

```text
time
evidence_id
case_id
sid
tool
title
original_filename
size_bytes
case_stage
case_url
```

## Example Grafana Panels

### SAP RCA Command Center

- Open Cases
- Critical Cases
- Pending RCA Cases
- Cases Waiting Evidence
- Latest Classified RCA
- Top Root Cause
- RCA Confidence Trend
- Evidence Upload Trend
- API/DB Health

### SAP App Server Compare

- CPU by App Server
- Memory by App Server
- Swap Activity by App Server
- Dialog WP Busy by App Server
- Response Time by App Server
- Suspect Score by App Server
- Latest Evidence by Host

## Link Back to SAP RCA

Grafana rows should include a link back to the case detail page.

Recommended pattern:

```text
https://sapdev.cbj-kontruksi.com/cases/<case_id>
```

If the deployed router uses a different case path, adjust the SQL view link only. Do not hard-code Grafana-specific routes inside core RCA logic.

## Incremental Implementation Roadmap

### Phase 1 — Documentation and view design

- Keep runtime unchanged.
- Document temporary case naming and case stages.
- Define Grafana SQL views.
- Define app1–app5 comparison fields.

### Phase 2 — Backend data model alignment

- Add optional `case_stage` to case payloads.
- Add optional auto-title suggestion/update logic after parsed result save.
- Preserve existing API contracts.
- Keep file fallback compatible.

### Phase 3 — PostgreSQL views

- Add read-only SQL views for Grafana.
- Create a dedicated read-only Grafana DB user.
- Avoid exposing raw evidence file paths/secrets.

### Phase 4 — Grafana dashboard

- Add PostgreSQL datasource.
- Build SAP RCA Command Center dashboard.
- Build per-case app1–app5 comparison dashboard.
- Add data links back to SAP RCA case detail.

## Guardrails

- Do not use Grafana as the input screen.
- Do not duplicate RCA analysis UI inside Grafana.
- Do not expose raw file paths, secrets, tokens, or sensitive payloads in Grafana views.
- Keep Grafana read-only.
- Keep SAP RCA as the system of record.
- Keep changes incremental and rollback-safe.
