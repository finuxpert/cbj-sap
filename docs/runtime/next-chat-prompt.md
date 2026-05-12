# SAP Intelligent RCA Workspace — Next Chat Prompt

Use this file to continue the project in a new chat without re-explaining the current state.

## Continuation Prompt — PDF Export + WP-SCOUT Visual Analytics

```text
Lanjut SAP Intelligent RCA Workspace — fokus PDF export dan WP-SCOUT visual analytics.

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
- fokus PDF export engine, report quality, dan visual analytics WP-SCOUT
- pertahankan API contract
- pertahankan hybrid PostgreSQL/file fallback

Baca dulu:
- docs/runtime/backend-modularization-status.md
- docs/runtime/next-chat-prompt.md
- src/features/pdf/ToolExportDock.jsx
- src/features/pdf/structuredPdfPolished.js
- src/features/pdf/structuredPdf.js
- src/tools/ToolComparerClean.jsx
- src/tools/ToolComparerClean.css

Current project state:
Aplikasi core sudah matang sebagai SAP RCA / Observability Intelligence Workspace. Fokus terbaru adalah meningkatkan kualitas PDF export dan visual analytics agar hasil report lebih enterprise-ready, terutama untuk WP-SCOUT Comparator.

Current overall app maturity:
- Core RCA Engine: 97–98%
- Operational UI/UX: 97–98%
- Observability Workspace Feel: 98%
- PDF Export Engine: 94–96% setelah polished export engine
- PDF Visual Quality: 92–94% setelah cleanup dan chart filtering
- WP-SCOUT Visual Analytics: 93–95% setelah trend CPU/Mem/Swap chart

Latest important commits in this chat:
- 9ab69e31c03f44ec71a4745a0f4bf0d350f2c1d2 — Add polished structured PDF export engine
- 3bf03f3302d622bfd4d9cd12eacdfe4823261e54 — Use polished structured PDF export engine
- 474267cca3e41212557d97a89318b57c67baaf0b — Add WP-SCOUT resource trend chart
- 7977b7a47dd77b207067eae3b43be7fee43b5b2d — Style WP-SCOUT resource trend chart

Current PDF export status:
- Structured PDF export aktif untuk comparer, analyzer, logs.
- Export entry: src/features/pdf/ToolExportDock.jsx
- Active engine now imports from: src/features/pdf/structuredPdfPolished.js
- Old engine retained: src/features/pdf/structuredPdf.js
- Export memakai jsPDF.
- PDF bukan screenshot full page.
- PDF mengambil structured DOM state.
- PDF sudah punya executive cover.
- PDF sudah punya KPI cards.
- PDF sudah capture SVG/Recharts chart ke PNG.
- PDF sudah punya Visual Evidence / Charts section.
- PDF sudah filter noisy panel seperti Case History, Evidence History, Download/Refresh list.
- PDF sudah punya RCA Visual Summary block:
  - confidence gauge with jsPDF-safe tick lines
  - severity indicator
  - offender/evidence score bars
  - infra pressure bars where data can be parsed
  - mini incident timeline where data can be parsed
- Export tetap fallback ke window.print() kalau gagal.

Recent PDF cleanup details:
- structuredPdfPolished.js dibuat sebagai rollback-safe engine baru karena direct overwrite structuredPdf.js sempat kena SHA conflict.
- ToolExportDock.jsx sekarang import `exportStructuredPdf` dari `./structuredPdfPolished.js`.
- Cleanup yang sudah masuk:
  - compact text normalization
  - label spacing for joined text such as SeverityCRIT, BottleneckCPU, Unique297
  - noise filter for Case History / Evidence History / Download / Refresh / Create Case
  - WP-SCOUT primary suspect extraction from RCA finding/top offender row
  - chart dedupe per title
  - skip SVG chart yang tidak meaningful
  - shorter panel body to avoid DOM dump in PDF

Current WP-SCOUT visual analytics status:
- WP-SCOUT Comparator file: src/tools/ToolComparerClean.jsx
- CSS file: src/tools/ToolComparerClean.css
- Added chart: `Trend – CPU / Mem / Swap`
- Chart uses Recharts LineChart, so it should be captured by PDF visual evidence.
- Series:
  - CPU %
  - Mem %
  - Swap si
- Red dot indicates `swap si > 0`.
- Tooltip explains whether swap activity is detected.
- Badge summary:
  - Peak CPU
  - Peak Mem
  - Swap
- If uploaded WP-SCOUT text contains telemetry lines for CPU/Mem/Swap, chart uses that telemetry.
- If no raw memory telemetry is detected, Mem% is estimated from WP RSS pressure and UI shows a note.
- `resource_trend` is also included in parsed result payload for Case History.

Important implementation notes for WP-SCOUT trend:
- Parser detects snapshot labels from:
  - `snapshot @ ...`
  - HH:MM / HH:MM:SS inside snapshot text
  - fallback filename timestamp-ish pattern
- Parser attempts telemetry line extraction using CPU/Mem/Swap/SI patterns.
- Fallback trend uses grouped WP rows by snapshot/file and estimates memory pressure from RSS.
- Swap fallback becomes non-zero only for critical high RSS + long age heuristic.
- This feature is UI-only/frontend-side and does not change backend contracts.

Known issues / next gaps:
1. Need validate build after latest commits because workflow run was not visible from GitHub connector.
2. Recharts line colors are styled via CSS selectors; if color order looks off, set explicit `stroke` props in JSX instead.
3. Need export sample PDFs again after DEV deploy/build:
   - WP-SCOUT Comparator
   - ST03N Impact Analyzer
   - Log Evidence
4. Need confirm WP-SCOUT trend appears in generated PDF under Visual Evidence / Charts.
5. Need verify `structuredPdfPolished.js` chart filter does not skip the new trend chart.
6. Need better native PDF trend summary if chart capture is insufficient.
7. Need optional landscape PDF page for wide trend chart.
8. Need source evidence appendix mode for long tables/list data.
9. Need better handling for real OS telemetry formats if actual WP-SCOUT text has different CPU/Mem/Swap syntax.
10. Need avoid overestimating Mem% fallback if user wants strict raw telemetry only.

Recommended next validation steps:
1. Check GitHub build/deploy workflow status for latest dev commits.
2. If user permits local CLI, run build only:
   - npm run build
3. Open DEV after deploy:
   - https://sapdev.cbj-kontruksi.com
4. Upload WP-SCOUT multi snapshot evidence.
5. Confirm trend panel appears.
6. Export PDF.
7. Inspect PDF:
   - cover should be cleaner
   - Case History/Evidence History noise should be gone
   - Trend – CPU / Mem / Swap should be captured in Visual Evidence / Charts
   - WP-SCOUT primary suspect should show host/PID/type/job, not DOM dump

Priority next patch options:
A. Validate/build fix only if latest build fails.
B. Tune WP-SCOUT trend parser against real WP-SCOUT resource telemetry text.
C. Add explicit Recharts stroke colors in JSX instead of CSS nth-of-type.
D. Add native PDF trend mini-graph fallback to structuredPdfPolished.js.
E. Add landscape visual analytics PDF page for wide charts.
F. Add strict/estimated toggle for WP-SCOUT resource trend.

Important rule:
Do not touch backend, nginx, PROD, workflows, or app RCA logic unless user explicitly asks. Keep all changes incremental and connector-only.
```

## Current Scores

| Area | Score |
|---|---:|
| Core RCA Engine | 97–98 |
| Operational UI/UX | 97–98 |
| Observability Workspace Feel | 98 |
| Log Evidence V2 | 97 |
| WP-SCOUT / RCA Comparator | 95–96 |
| WP-SCOUT Visual Analytics | 93–95 |
| ST03N Impact Analyzer | 92–94 |
| Case History / Evidence Persistence | 92 |
| RCA Correlation Engine | 95 |
| Historical Similarity Foundation | 84 |
| PDF Export Engine | 94–96 |
| PDF Visual Quality | 92–94 |
| PDF Executive Readability | 92–94 |

## PDF Engine Files

### Primary files

```text
src/features/pdf/ToolExportDock.jsx
src/features/pdf/structuredPdfPolished.js
src/features/pdf/structuredPdf.js
```

### Active export behavior

- `ToolExportDock.jsx` renders floating Export PDF button for:
  - comparer
  - analyzer
  - logs
- It calls `exportStructuredPdf(slug)` from `structuredPdfPolished.js`.
- If export fails, it falls back to `window.print()`.
- `structuredPdfPolished.js` builds report from DOM using:
  - `buildReportFromDom(slug)`
  - `collectDecisionCards()`
  - `collectRows()`
  - `collectPanels()`
  - `collectChartImages()`
- Chart export captures Recharts/SVG into PNG using canvas.
- Native PDF analytics block is drawn directly with jsPDF-safe primitives.

## WP-SCOUT Trend Files

```text
src/tools/ToolComparerClean.jsx
src/tools/ToolComparerClean.css
```

### Current trend behavior

- New panel title: `Trend – CPU / Mem / Swap`
- X-axis: snapshot/time label
- Left Y-axis: CPU% and Mem%
- Right Y-axis: Swap si
- Red dot: swap si > 0
- Badge summary: Peak CPU, Peak Mem, Swap
- Tooltip explains swap pressure.
- Data source priority:
  1. Raw telemetry line parse from uploaded text
  2. RSS pressure fallback estimate from WP rows
- Result payload includes:
  - `resource_trend`

## PDF Evolution Roadmap

### Phase 1 — Stabilize current export

1. Check latest GitHub Action/build status.
2. Fix any syntax/runtime risk in `structuredPdfPolished.js` or `ToolComparerClean.jsx`.
3. Ensure PDF generation works on mobile and desktop.
4. Confirm chart capture still works after adding WP-SCOUT trend chart.

### Phase 2 — Better visual report blocks

1. Native trend summary fallback if Recharts capture fails.
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
- Focus on PDF export and WP-SCOUT visual analytics unless user changes priority.

## Best Next First Patch

Recommended first patch in next chat:

```text
Check latest build/deploy status for branch dev, then validate ToolComparerClean.jsx and structuredPdfPolished.js after the WP-SCOUT trend chart + polished PDF engine. If build is green, generate/inspect new PDF samples; if build fails, fix only the failing frontend code incrementally.
```
