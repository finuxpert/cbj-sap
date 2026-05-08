# SAP RCA Tools Audit

## Scope

Audit ini mencatat status tools aktif dan legacy pada SAP Intelligent RCA Workspace.

Branch target: `dev`

## Active Core Tools

Route aktif dikontrol oleh `src/tools/index.js`.

Saat ini hanya 3 tool core yang aktif:

| Slug | Component | Purpose | Status |
|---|---|---|---|
| `comparer` | `src/tools/ToolComparerClean.jsx` | WP-SCOUT process/offender analysis | Active core |
| `analyzer` | `src/tools/ToolSt03nImpactV2.jsx` | ST03N workload impact validation | Active core |
| `logs` | `src/tools/ToolLogEvidenceV2.jsx` | SAP log/error evidence triage | Active core |

## Tool 1: WP-SCOUT Comparator

File:

```text
src/tools/ToolComparerClean.jsx
```

Current strengths:

- Lazy-loaded through tools registry.
- Local parsing, no backend dependency for basic analysis.
- `MAX_ROWS = 5000` guard exists.
- Groups duplicate rows into unique offenders.
- Supports host, job, severity, and search filters.
- Shows RCA finding, action notes, offender queue, RSS chart, host pressure chart, and evidence history.

Risks / cleanup targets:

- Imports multiple CSS layers:
  - `ToolComparerClean.css`
  - `ToolComparerCleanVisual.css`
  - `ToolComparerDynatrace.css`
- Chart rendering is always mounted when page is open.
- Parser is tuned for current WP-SCOUT format and should be regression-tested before changing.

Recommended action:

- Keep active.
- Do not rewrite parser until sample evidence tests exist.
- Later consolidate CSS into one comparer-specific layer.

## Tool 2: ST03N Impact V2

File:

```text
src/tools/ToolSt03nImpactV2.jsx
```

Current strengths:

- Lazy-loaded through tools registry.
- Supports ZIP/ST03N pack expansion through parser utilities.
- Uses decision-first layout: verdict, dominant component, confidence, completeness.
- Uses shared `EvidenceDecisionKit` components.
- Caches last result in localStorage.
- Supports report text export through `EvidenceToolbar`.

Risks / cleanup targets:

- Component is too dense and should be split into smaller sections.
- Recharts imports are static inside the component.
- Bar and pie charts render whenever analysis exists.
- UI, parsing orchestration, cache, and report generation live in one file.

Recommended action:

- Keep active.
- Split into small presentational components first.
- Later lazy-render chart sections only after analysis exists.

## Tool 3: Log Evidence V2

File:

```text
src/tools/ToolLogEvidenceV2.jsx
```

Current strengths:

- Lazy-loaded through tools registry.
- Supports ZIP-aware log expansion.
- Parses WP-SCOUT style rows and generic SAP error patterns.
- Groups evidence by ErrorCode, JobName, and Program.
- Gives owner direction and action hint.
- Uses shared `EvidenceDecisionKit` components.
- Caches last result in localStorage.

Risks / cleanup targets:

- WP-SCOUT row regex is strict.
- Generic error parser only detects currently listed `KNOWN_ERRORS`.
- Chart and timeline render together when analysis exists.
- Parser and UI are still mixed in the same file.

Recommended action:

- Keep active.
- Add parser samples/tests later.
- Split parser/buildAnalysis into separate module before deeper UI work.

## Legacy / Inactive Tool Files

These files are not active in `src/tools/index.js` and should not appear in the main RCA route unless intentionally reintroduced.

Candidate legacy files:

```text
src/tools/ToolBackup.jsx
src/tools/ToolRollback.jsx
src/tools/ToolMetrics.jsx
src/tools/ToolUploader.jsx
src/tools/ToolDeploy.jsx
src/tools/ToolAnalyzer.jsx
src/tools/ToolAnalyzerClean.jsx
src/tools/ToolComparer.jsx
src/tools/ToolLogs.jsx
src/tools/ToolSt03nImpact.jsx
src/tools/ToolLogEvidence.jsx
```

Recommended handling:

1. Do not delete immediately.
2. Move to `src/tools/legacy/` only after import checks pass.
3. Run build after each small batch.
4. Avoid reintroducing backup, rollback, metrics, uploader helpers, or noisy dashboard widgets into core RCA UI.

## Guardrails

Do not reintroduce:

```text
MutationObserver
runtime DOM injector
heavy delayed UI patching
large setTimeout UI enhancer
old comparer dashboard enhancer
old ST03N dashboard enhancer
```

Do not commit:

```text
.env
runtime SQLite database
backend venv
__pycache__
upload runtime files
tokens
private keys
Cloudflare credentials
```

## Recommended Next Steps

1. Archive inactive legacy tools into `src/tools/legacy/` after import check.
2. Split `ToolSt03nImpactV2.jsx` into smaller components.
3. Split `ToolLogEvidenceV2.jsx` parser/buildAnalysis into module.
4. Consolidate comparer CSS layers.
5. Lazy-render heavy chart sections.
