# SAP Intelligent RCA Workspace — Next Chat Prompt

Use this file to continue the project in a new chat without re-explaining the current state.

## Continuation Prompt

```text
Lanjut SAP Intelligent RCA Workspace.

Repo:
- finuxpert/cbj-sap

Branch:
- dev

Mode:
- GitHub connector only
- incremental patch only
- jangan pakai local CLI kecuali saya izinkan
- jangan sentuh PROD/nginx/workflow
- jangan reintroduce MutationObserver/runtime injector
- jangan bikin dashboard/card overload
- fokus operational UX + RCA intelligence
- pertahankan hybrid PostgreSQL/file fallback

Baca dulu:
- docs/runtime/backend-modularization-status.md
- docs/runtime/next-chat-prompt.md

Current Project Direction:
Aplikasi harus evolve dari React SAP parser/dashboard menjadi SAP RCA / Observability Intelligence Workspace.

Current Overall Maturity:
- Overall: 93–94%
- RCA Intelligence: 93%
- UI/UX: 91%
- Animation/Microinteraction: 87%
- Observability Workspace Feel: 94%
- Enterprise Workflow Readiness: 88%
- Mobile UX: 84%

Current Strong Areas:
- structured RCA data model
- weighted RCA scoring
- cross-tool correlation
- replay normalization
- infra telemetry extraction
- infra saturation scoring
- ownership routing foundation
- operational motion system
- observability cockpit feel
- Log Evidence V2 intelligence
- WP-SCOUT/ST03N correlation

Current Backend Status:
- modular service layer aktif
- DB-first middleware aktif
- hybrid PostgreSQL/file fallback aktif
- correlation engine aktif
- weighted RCA scoring aktif
- replay/session normalization aktif
- infra saturation scoring aktif
- normalized RCA fields aktif
- correlation keys aktif
- ownership routing foundation aktif
- route aktif:
  - /cases/{case_id}/correlation
  - /cases/{case_id}/session

Current Frontend Status:
- CaseDetailWithAnalytics modular
- RCAFocusPanel separated
- CorrelationSummary separated
- SessionReplayPanel separated
- operational-motion.css aktif
- mobile-operational-polish.css aktif
- case-history-mobile-density.css aktif
- replay rail motion foundation aktif
- tactical hover/microinteraction aktif

Current Intelligence Features:
- CPU/MEM/SWAP telemetry parsing
- infra saturation scoring
- app vs infra ownership direction
- normalized replay schema
- deterministic RCA scoring
- evidence correlation engine
- incident timeline foundation

Current Weak Areas:
- mobile Log Evidence responsiveness
- historical incident intelligence
- persistent correlation/session DB
- recurring incident detection
- replay rail final UI
- similarity/clustering engine
- cockpit sticky incident strip
- inspectability/raw signal UI

Important UI Direction:
Visual style harus mendekati:
- Grafana Incident
- Kibana Investigation
- Datadog Ops Console
- SAP Focused Run
- enterprise observability cockpit

Bukan:
- generic React admin dashboard
- KPI card overload
- gimmick AI dashboard

Important RCA Direction:
Semua evidence/data yang masuk harus:
- dinormalisasi
- diberi weight
- dijadikan signal
- dikorelasikan
- dijadikan supporting RCA evidence
- dipakai untuk ownership direction
- dipakai untuk historical intelligence

Next Immediate Targets:
1. mobile Log Evidence responsive cleanup
2. compact chart mode mobile
3. sticky incident cockpit strip
4. inspect raw signal / scoring breakdown UI
5. send normalized infra fields from Log Evidence parsed payload
6. persistent correlation/session DB foundation
7. recurring incident clustering
8. historical similarity engine
9. replay rail finalization
10. incident memory/trend intelligence

Start with small GitHub-only patches. Prefer CSS-only when improving mobile UX. Avoid backend contract breaks.
```

## Current Scores

| Area | Score |
|---|---:|
| Overall Product Maturity | 93–94 |
| RCA Intelligence | 93 |
| Backend Architecture | 92 |
| Structured RCA Data Model | 90 |
| Cross-tool Correlation | 90 |
| Root Cause Confidence | 91 |
| Replay / Timeline Engine | 90 |
| Infra Telemetry Foundation | 88 |
| CPU/MEM/SWAP Awareness | 89 |
| App vs Infra Correlation | 88 |
| Ownership Routing Intelligence | 81 |
| Enterprise Workflow Readiness | 88 |
| Observability Workspace Feel | 94 |
| UI/UX Overall | 91 |
| Animation / Motion | 87 |
| Mobile UX | 84 |
| Maintainability | 89 |
| Production-grade Stability | 81 |
| Historical RCA Intelligence | 72 |
| Multi-case Similarity / Clustering | 66 |
| Incident Memory / Trend Engine | 61 |

## Important Recent Commits

```text
2a5b9c4 Add infra saturation scoring to log analysis
b45de0e Extract infra telemetry from generic log evidence
0f2c9ce Load operational motion polish CSS
12e9cfe Add operational UI motion polish
074236b Use normalized RCA fields for correlation
fee74d5 Persist normalized RCA parsed result fields
1aad78b Add normalized RCA parsed result model fields
4511b85 Import case workspace panel CSS
a669474 Tighten mobile RCA chart and decision density
f80f45d Import mobile operational polish CSS
75747ad Add mobile operational polish CSS
1a4cc82 Add mobile density CSS for case history
695532e Add RCA workspace panel CSS
```

## Next Action Plan

### Phase 1 — Immediate UX/RCA polish

1. Fix Log Evidence V2 mobile responsive issues:
   - chart label overflow
   - chart container width
   - card density
   - Case History form height
   - ranking/chart compact mode
2. Add Log Evidence CPU/MEM/SWAP visualization:
   - infra pressure cards
   - system resource timeline
   - saturation verdict panel
3. Send normalized infra fields to parsed result payload from `ToolLogEvidenceV2.jsx`.
4. Add scoring breakdown UI:
   - weighted score components
   - overlap evidence
   - owner direction score
5. Add inspect raw signal panel:
   - normalized_rca
   - correlation_keys
   - source evidence

### Phase 2 — Enterprise intelligence

1. Persistent correlation/session DB foundation.
2. Recurring incident detection.
3. Historical case similarity engine.
4. Incident memory/trend intelligence.
5. Replay rail final UI.
6. Cockpit sticky incident strip.

## Guardrails

- Do not touch PROD.
- Do not change nginx.
- Do not modify GitHub workflows unless explicitly requested.
- Do not use local CLI unless user explicitly permits.
- Keep DB-first/PostgreSQL hybrid behavior unchanged unless explicitly targeted.
- Keep API response contracts backward compatible.
- Avoid MutationObserver/runtime DOM injectors.
- Avoid dashboard/card overload.
- Prefer incremental patches.
- Prefer CSS-only for pure UX/mobile improvements.

## Best Next First Patch

Recommended first patch in next chat:

```text
Fix mobile Log Evidence V2 responsive layout and add compact chart mode. Start with CSS-only patch in existing mobile/operational CSS files. Do not change parser/backend yet.
```
