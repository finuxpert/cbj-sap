# LOG Analysis Phase 1 performance

Baseline: `dev` commit `aa3cbf9e28a05343a874d920f121189566cda27c` (SPHERE v1.15.1).
Scope: DEV only, through `.github/workflows/dev-deploy.yml` and the existing
`sapdev-pc-runner`, deploying `/var/www/svr01-dev/sap/`.

## Changes

- V3 still calculates JS fallback snapshots before attempting DuckDB. It passes
  that same array to V4 parity through `jsSnapshots`. V4 no longer maps and
  aggregates the processes a second time. V4 consumes and removes this internal
  reference before returning the result, so V5 does not retain a second snapshot
  array. The success path is now one JS aggregation plus one DuckDB aggregation.
- Both existing ECharts components use one modular registration: core, line,
  tooltip, legend (including scroll), grid, inside/slider data zoom, mark line,
  mark point, and canvas. Existing options, handlers, resize, and disposal remain.
- The LOG UI imports chart components and the virtual resource table with
  `React.lazy`. Local Suspense placeholders keep the result panels visible while
  their modules load. Charts mount only after RCA exists; the table mounts after
  ranking completes. Metric labels live in a lightweight module so reading the
  tabs cannot trigger ECharts loading.
- `expandZipAwareFiles` imports JSZip only inside its ZIP branch. Ordinary files
  preserve their identity and order. ZIP extraction/filtering and the existing
  Blob/File/text/worker pipeline are unchanged.

DuckDB selection, SQL, timeouts, cleanup, and JS fallback are unchanged. Parser,
scoring, verdict, taxonomy, telemetry, backend, Case History, and ST03N source
remain unchanged. No dependency or lockfile changes.

## Bundle comparison

Decimal kB, with gzip in parentheses. Same lockfile and Vite configuration.

| Item | Before | After |
| --- | ---: | ---: |
| ToolLogAutoRcaV5 | 1,603.70 (506.75) | 384.59 (102.05) |
| ECharts-related chunks | Embedded in LOG above; no standalone chunk | 576.46 + 3.60 (195.02 + 1.87), after RCA |
| VirtualResourceTableV14 | Embedded in LOG above | 82.24 (23.35), after ranking |
| JSZip | 96.72 (29.87), before upload | 96.72 + 0.50 wrapper (29.87 + 0.36), ZIP only |
| All JS for initial LOG | 2,367.74 (735.07) | 1,052.12 (300.60) |
| Build chunks above 800 kB | 1 | 0 |

Initial LOG JS decreases **55.56% minified / 59.11% gzip**; the main LOG chunk
decreases **76.02% minified / 79.86% gzip**. These are payload sizes, not measured
wall-clock speedups. Initial totals recursively include static imports of the
application entry, LOG workspace, and active LOG tool exactly once. They exclude
CSS, images, WASM, workers started after upload, and deferred actions. Recharts
(422.44 kB) is still included because the shared application shell loads it.

All four DuckDB assets have identical SHA-256 hashes before and after:

| Asset | Bytes | SHA-256 |
| --- | ---: | --- |
| EH WASM | 35,913,747 | `3abdec74989dcc54d2f2ea5621f611f3c45db1e7dff2f408476014d82beb2029` |
| MVP WASM | 41,325,187 | `ee5560145a3d3e0ffa6dce697be802c08842f139a594698eecc7c754f7ad5f05` |
| EH worker | 773,223 | `fa889e6068c40426dea67c08cf16ce0cad7404eae94f6a2522adcabb5898eb93` |
| MVP worker | 839,642 | `964f678d3bfa5a23deb154e0a7950634a4d1415e571040ab2d47815dc3f13582` |

The large worker files remain emitted assets; the removed 800 kB warning concerns
Rollup application chunks. Existing Zod comment-annotation warnings remain.

## Validation and reproduction

```bash
npm ci
npx vitest run src/tools/__tests__/logParserV15Parity.test.js src/tools/__tests__/logV22Parser.test.js
npx vitest run src/tools/__tests__ --maxWorkers=2 --minWorkers=1
npm run build
npm run build -- --manifest
node scripts/qa-log-startup.mjs
bash scripts/qa-backend-syntax.sh
bash scripts/qa-case-flow-contracts.sh
```

The parser gate passes (5 tests); the complete LOG suite passes (68 tests).
Ten added tests cover reuse on DuckDB success, parity mismatch reporting,
selection/query errors, timeout cleanup, empty process data, ordinary-file module
loading, ZIP filtering/contents/timestamps, mixed files, and corrupt ZIP errors.
DuckDB success/error injection uses a mocked runtime while running the actual
V3/V4 orchestration. The startup script verifies that chart, table, and ZIP
chunks are absent from the initial static import closure and prints exact sizes
and DuckDB asset hashes. For a previous build, use
`node scripts/qa-log-startup.mjs --report-only /path/to/baseline-dist`.

The browser baseline with synthetic V2.2 logs exercised the existing 5-second
DuckDB instantiate timeout and successful JS fallback. This optimization does
not change that timeout or attempt to solve large WASM transfer latency.
After pushing, verify the official workflow's build, public API, backend QA,
and case-flow QA steps, then compare the same synthetic log results in DEV and
exercise the timeline, metric tabs, workload selection, and ZIP upload.

## Changed files

- `src/tools/workloadAnalyticsV3.js`
- `src/tools/workloadAnalyticsV4.js`
- `src/tools/ToolLogAutoRcaV5.jsx`
- `src/tools/components/LogLandscapeEChart.jsx`
- `src/tools/components/LogLandscapeEChartV14.jsx`
- `src/tools/components/logEcharts.js`
- `src/tools/components/logChartMetrics.js`
- `src/tools/evidence-utils.js`
- `src/tools/__tests__/logAggregationReuse.test.js`
- `src/tools/__tests__/evidenceZipLazy.test.js`
- `scripts/qa-log-startup.mjs`
- `docs/log-phase1-performance.md`

Rollback is a normal revert of the performance commit on `dev`, followed by the
same official DEV workflow. Keep future ZIP memory changes as a separate phase.
