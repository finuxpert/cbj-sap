# SAP Intelligent RCA Workspace — Next Chat Prompt

Use this file to continue the project in a new chat without re-explaining the current state.

## Continuation Prompt — Focus PDF Export Evolution

```text
Lanjut SAP Intelligent RCA Workspace — fokus EXPORT PDF saja.

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
- jangan rewrite besar
- fokus khusus PDF export engine dan report quality
- pertahankan API contract
- pertahankan hybrid PostgreSQL/file fallback

Baca dulu:
- docs/runtime/backend-modularization-status.md
- docs/runtime/next-chat-prompt.md
- src/features/pdf/structuredPdf.js
- src/features/pdf/ToolExportDock.jsx

Current project state:
Aplikasi core sudah matang sebagai SAP RCA / Observability Intelligence Workspace. Fokus berikutnya bukan RCA logic/UI utama, tapi kualitas EXPORT PDF agar menjadi enterprise report/presentation-ready.

Current overall app maturity:
- Core RCA Engine: 97–98%
- Operational UI/UX: 97–98%
- Observability Workspace Feel: 98%
- PDF Export Engine: 92–94% setelah patch terakhir

Current PDF export status:
- Structured PDF export aktif untuk comparer, analyzer, logs.
- Export entry: src/features/pdf/ToolExportDock.jsx
- Main engine: src/features/pdf/structuredPdf.js
- Export memakai jsPDF.
- PDF sudah bukan screenshot full page.
- PDF mengambil structured DOM state.
- PDF sudah punya executive cover.
- PDF sudah punya KPI cards.
- PDF sudah capture SVG/Recharts chart ke PNG.
- PDF sudah punya Visual Evidence / Charts section.
- PDF sudah filter noisy panel seperti Case History, Evidence History, Download/Refresh list.
- PDF sudah punya native RCA Visual Analytics block:
  - confidence gauge foundation
  - severity indicator
  - offender score bars
  - top evidence mini analytics
- Export tetap fallback ke window.print() kalau gagal.

Recent important PDF commits:
- cb2f7ebd Upgrade structured PDF export with visual charts
- fd116df Add native PDF RCA visual analytics

Recent broader UX/RCA commits:
- c060389 Add incident timeline rail and compact ranking mode
- 79f04e1 Improve RCA visual hierarchy and severity emphasis
- 05bc83d Polish remaining RCA workspace UI surfaces
- 27ee2b9 Improve RCA timeline rail and mobile density UX
- ea9db55 Add historical RCA similarity foundation

Known PDF issues / next gaps:
1. Need validate build after latest PDF patch because jsPDF `pdf.arc?.(...)` may not exist or may not render as intended.
2. Native confidence gauge should be made safer using supported jsPDF primitives only.
3. Need landscape analytics page mode for wide charts.
4. Need better chart pagination and sizing.
5. Need incident timeline native PDF graph, not only captured Recharts.
6. Need infra saturation gauge/bar section:
   - CPU
   - MEM
   - SWAP
   - bottleneck
   - owner direction
7. Need offender heatmap / host pressure matrix for WP-SCOUT.
8. Need RCA relationship map:
   - Error
   - Program
   - Job
   - Host
   - WP/PID
   - Timeline
9. Need appendix mode for long tables/list data.
10. Need PDF theme polish closer to SAP observability report:
   - stronger section cards
   - cleaner whitespace
   - less text dump
   - more visual report blocks

Priority next patch:
1. Audit and harden src/features/pdf/structuredPdf.js for build safety.
2. Replace unsupported/fragile gauge drawing with jsPDF-safe primitives.
3. Add native infra pressure bars from collected DOM text.
4. Add native timeline mini-graph from incident rail/timeline text where possible.
5. Add PDF section: RCA Visual Summary with severity, confidence, owner, bottleneck, and top evidence bars.
6. Keep changes incremental and isolated to src/features/pdf/structuredPdf.js unless absolutely needed.

Important rule:
Do not touch backend, nginx, PROD, workflows, or app RCA logic. Focus only export PDF quality.
```

## Current Scores

| Area | Score |
|---|---:|
| Core RCA Engine | 97–98 |
| Operational UI/UX | 97–98 |
| Observability Workspace Feel | 98 |
| Log Evidence V2 | 97 |
| WP-SCOUT / RCA Comparator | 94–95 |
| ST03N Impact Analyzer | 92–94 |
| Case History / Evidence Persistence | 92 |
| RCA Correlation Engine | 95 |
| Historical Similarity Foundation | 84 |
| PDF Export Engine | 92–94 |
| PDF Visual Quality | 89–91 |
| PDF Executive Readability | 90–92 |

## PDF Engine Files

### Primary files

```text
src/features/pdf/ToolExportDock.jsx
src/features/pdf/structuredPdf.js
```

### Current export behavior

- `ToolExportDock.jsx` renders floating Export PDF button for:
  - comparer
  - analyzer
  - logs
- It calls `exportStructuredPdf(slug)`.
- If export fails, it falls back to `window.print()`.
- `structuredPdf.js` builds report from DOM using:
  - `buildReportFromDom(slug)`
  - `collectDecisionCards()`
  - `collectRows()`
  - `collectPanels()`
  - `collectChartImages()`
- Chart export captures Recharts/SVG into PNG using canvas.
- Native PDF analytics block is drawn directly with jsPDF.

## PDF Evolution Roadmap

### Phase 1 — Stabilize current export

1. Check latest GitHub Action/build status.
2. Fix any syntax/runtime risk in `structuredPdf.js`.
3. Avoid unsupported jsPDF APIs.
4. Ensure export still works if chart capture fails.
5. Ensure PDF generation works on mobile and desktop.

### Phase 2 — Better visual report blocks

1. Native confidence/severity gauge using safe shapes.
2. Native infra pressure bars.
3. Native top evidence bar chart.
4. Native incident timeline mini graph.
5. Better section spacing/card layout.

### Phase 3 — Advanced enterprise report

1. Landscape visual analytics page.
2. WP-SCOUT host/PID offender heatmap.
3. ST03N component mix visual.
4. Log Evidence error-family distribution visual.
5. RCA relationship graph.
6. Appendix pagination system.

## Guardrails

- Do not touch PROD.
- Do not change nginx.
- Do not modify GitHub workflows unless explicitly requested.
- Do not use local CLI unless user explicitly permits.
- Keep API contracts unchanged.
- Keep DB-first/PostgreSQL hybrid behavior unchanged.
- Avoid MutationObserver/runtime DOM injectors.
- Avoid large rewrites.
- Prefer incremental patches.
- Focus on PDF export only in the next chat.

## Best Next First Patch

Recommended first patch in next chat:

```text
Audit src/features/pdf/structuredPdf.js, remove/replace fragile jsPDF arc usage, add safe native RCA visual summary bars, and verify latest deploy/build status via GitHub connector.
```
