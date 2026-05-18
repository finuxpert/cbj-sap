# SAP Intelligent RCA Workspace — Code Cleanup Audit

Date: 2026-05-18
Branch: `dev`
Scope: technical debt / kode sampah audit only.

## Guardrails

- GitHub connector only.
- Incremental audit + patch only.
- No local CLI usage.
- No PROD, nginx, workflow, or deploy changes.
- No API contract changes.
- No backend behavior changes.
- Do not delete files until imports/usages prove they are orphaned.
- Do not reintroduce MutationObserver, runtime enhancer, recursive DOM patching, or delayed UI injection.

## Summary

This audit found that the current WP-SCOUT comparator path is intentionally routed through a hydrated wrapper before loading `ToolComparerClean.jsx`. Therefore, `ToolComparerClean.jsx` and its CSS imports must not be deleted during early cleanup.

The main technical debt is CSS layering around WP-SCOUT chart/cockpit visual polish. Some UI text is still injected through CSS pseudo-content instead of React components, which makes layout behavior harder to control and can overlap charts or critical controls.

Recent cleanup progress:

- `RCA INSIGHT PANEL` was converted from CSS pseudo-content into `src/tools/RcaInsightPanel.jsx`.
- WP-SCOUT-specific CSS imports were moved out of `src/main.jsx` and into `src/tools/ToolComparerDirectHydrated.jsx`.
- `src/main.jsx` now loads only app-global CSS: `index.css` and `enterprise-theme.css`.
- `ToolComparerDirectHydrated.jsx` owns WP-SCOUT route CSS and includes a short ownership comment to prevent future global leakage.

## Audit Evidence

### Active route chain

Current tool registry:

```js
comparer: () => import('./ToolComparerDirectHydrated.jsx')
```

`ToolComparerDirectHydrated.jsx` dynamically imports `ToolComparerClean.jsx`, so the clean comparer remains active through the hydrated wrapper.

```js
import('./ToolComparerClean.jsx').then((module) => {
  if (active) setToolComparerClean(() => module.default)
})
```

### Main CSS import status

`src/main.jsx` now imports only global app CSS:

```js
import './index.css'
import './app/enterprise-theme.css'
```

WP-SCOUT-specific CSS now belongs to the comparer wrapper:

```js
import '../app/wp-scout-rca-cockpit-polish.css'
import '../app/wp-scout-chart-readability.css'
```

This is structurally cleaner because homepage, case pages, and non-comparer tools no longer load WP-SCOUT cockpit/chart overrides from the app entrypoint.

### Tool-level CSS import stack

`ToolComparerClean.jsx` imports the following local CSS layers:

```js
import './ToolComparerClean.css'
import './ToolComparerCleanVisual.css'
import './ToolComparerDynatrace.css'
import './ToolComparerCleanCompact.css'
```

Important duplication note: `ToolComparerClean.css` also contains:

```css
@import './ToolComparerCleanCompact.css';
```

Because `ToolComparerCleanCompact.css` is also imported directly from JSX, the compact layer can be bundled/applied twice depending on bundler handling. Do not remove it yet without build verification, but this is the safest future CSS cleanup candidate.

## WP-SCOUT CSS Layer Map

### 1. `src/tools/ToolComparerClean.css`

Role: base WP-SCOUT component-local stylesheet.

Owns foundational selectors and layout:

- `.cmpCleanShell`
- `.cmpCleanHeader`
- `.cmpCleanEvidenceIntake`
- `.cmpCleanTopRow`
- `.cmpCleanStats`
- `.cmpCleanGrid`
- `.cmpCleanPanel`
- `.cmpCleanTableWrap`
- `.cmpCleanTable`
- `.cmpCleanChart`
- `.cmpResourceTrendPanel`
- `.cmpResourceTrendChart`

Risk: HIGH if changed broadly because it defines base dimensions, grid layout, table behavior, and chart container height.

Cleanup note: remove duplicated compact import only after confirming direct JSX import remains and build/deploy stays green.

### 2. `src/tools/ToolComparerCleanVisual.css`

Role: visual polish layer for clean WP-SCOUT comparator.

Overlaps heavily with base styling for:

- `.cmpCleanShell`
- `.cmpCleanHeader`
- `.cmpCleanStat`
- `.cmpCleanFinding`
- `.cmpCleanActionsPanel`
- `.cmpCleanPanel`
- `.cmpCleanChart`
- `.cmpCleanTableWrap`
- `.cmpCleanTable`

Risk: MEDIUM. Mostly visual polish, but hover transforms, animations, pseudo-elements, and backdrop filters can affect perceived layout/performance.

Cleanup note: if consolidating, move non-structural animation/glow rules here or into a clearly named optional polish file.

### 3. `src/tools/ToolComparerDynatrace.css`

Role: Dynatrace-inspired monitoring/chart density layer.

Overlaps strongly with base and visual CSS:

- `.cmpCleanShell`
- `.cmpCleanGrid`
- `.cmpCleanHeader`
- `.cmpCleanPanel`
- `.cmpCleanStat`
- `.cmpCleanChart`
- `.cmpCleanTableWrap`
- `.cmpCleanTable`
- Recharts internals under `.cmpCleanChart`

Risk: HIGH. It uses `!important` in many places and still defines `.cmpCleanChart::before` with `LIVE RCA SIGNAL`, which can create chart overlay noise. Current chart readability layer suppresses some badge variants, but this source should be treated as a future cleanup target.

Cleanup note: first safe code cleanup candidate after documentation is removing/suppressing `LIVE RCA SIGNAL` at source from this file, not by late override.

### 4. `src/tools/ToolComparerCleanCompact.css`

Role: compact layout/density override.

Overlaps with most base layout selectors:

- `.cmpCleanShell`
- `.cmpCleanHeader`
- `.cmpCleanEvidenceIntake`
- `.cmpCleanTopRow`
- `.cmpCleanStats`
- `.cmpCleanGrid`
- `.cmpCleanPanel`
- `.cmpCleanTableWrap`
- `.cmpCleanTable`
- `.cmpCleanChart`
- `.cmpResourceTrendChart`

Risk: MEDIUM-HIGH. It changes grid columns, chart heights, table max-height, and responsive behavior.

Cleanup note: this file is active and should remain, but duplicate import path should be resolved later.

### 5. `src/app/wp-scout-rca-cockpit-polish.css`

Role: route-wrapper visual cockpit layer, now loaded only by `ToolComparerDirectHydrated.jsx`.

Owns route-scoped selectors under `.appShell.isTool`, including:

- `.appShell.isTool .cmpCleanShell`
- `.appShell.isTool .cmpCleanStats`
- `.appShell.isTool .cmpCleanPanel`
- `.appShell.isTool .rcaReadableChartPanel`
- `.appShell.isTool .cmpCleanTable`
- `.appShell.isTool .cmpRcaInsightPanel`
- `.appShell.isTool .cmpCleanExecutiveRibbon`

Risk: MEDIUM. Scope is now better because it is no longer imported globally from `main.jsx`, but it still includes pseudo-content for compact state labels and `:has()` selectors.

Cleanup note: keep this file for route-level cockpit UI, but avoid adding more component-local styles here.

### 6. `src/app/wp-scout-chart-readability.css`

Role: final chart readability override layer, now loaded only by `ToolComparerDirectHydrated.jsx` after cockpit polish.

Owns focused chart selectors:

- `.chartTitleBlock`
- `.cmpTrendTitleBlock`
- `.rcaReadableChartPanel`
- `.cmpCleanChart`
- `.cmpCleanChartBars`
- `.cmpCleanChartLine`
- `.cmpResourceTrendChart`
- Recharts labels, axes, grids, legend, and SVG overflow

Risk: MEDIUM. It is intentionally late in the cascade and uses `!important` to prevent chart label clipping. Keep it focused and do not expand it into general layout styling.

Cleanup note: if source badge rules are removed from local CSS, remove the redundant suppressor block here afterward.

## Selector Overlap Matrix

| Selector | Active in | Risk | Notes |
|---|---|---:|---|
| `.cmpCleanShell` | base, visual, Dynatrace, compact, cockpit | HIGH | Background, variables, padding, isolation, and app-scoped variables are split across many layers. |
| `.cmpCleanGrid` | base, Dynatrace, compact | HIGH | Grid column logic differs by file. Must be consolidated carefully because it controls table + chart layout. |
| `.cmpCleanPanel` | base, visual, Dynatrace, compact, cockpit | HIGH | Card sizing, glow, hover, background, and title decoration overlap. |
| `.cmpCleanChart` | base, visual, Dynatrace, compact, cockpit, readability | HIGH | Most fragile area. Chart height, background, overflow, Recharts internals, and pseudo badges overlap. |
| `.rcaReadableChartPanel` | cockpit, readability, compact selectors | MEDIUM | Should remain the boundary for chart-specific override behavior. |
| `.chartTitleBlock` / `.cmpTrendTitleBlock` | base trend styles, cockpit, readability, compact | MEDIUM | Title layout and pseudo badges have caused overlap before. Prefer JSX badges over CSS pseudo-content. |
| `.cmpCleanStats` | base, visual, compact, cockpit | MEDIUM | Sticky stats and pseudo title live here. Future React title would reduce pseudo-content usage. |
| `.cmpCleanTable` | base, visual, Dynatrace, compact, cockpit | MEDIUM-HIGH | Table density, sticky header, hover, and row indicators overlap. Avoid broad changes without visual verification. |

## Findings

### 1. Runtime injector leftovers

Search terms checked earlier:

- `MutationObserver`
- `runtime enhancer`
- `dashboard enhancer`
- `setTimeout`
- direct DOM patch patterns such as `document.querySelector`, `appendChild`, `createElement`, and `innerHTML`

No indexed matches were found for the high-risk runtime injector terms in the current GitHub search result set. This is a positive sign, but it should be treated as search evidence, not a full build-time proof.

Risk level: LOW based on current search.

Recommended action:

- Keep a no-regression rule in docs and PR review.
- Do not add runtime DOM patching for UI fixes.

### 2. WP-SCOUT CSS layer duplication

Confirmed overlap exists around layout, chart readability, table density, and chart panel styling.

Risk level: MEDIUM-HIGH.

Recommended action:

- Do not remove CSS files yet.
- First safe cleanup target: resolve duplicated compact import path.
- Second safe cleanup target: remove `LIVE RCA SIGNAL` pseudo badge source from `ToolComparerDynatrace.css` if visual testing confirms no need for it.
- Keep `wp-scout-chart-readability.css` focused only on Recharts spacing, labels, overflow, and legend readability.

### 3. CSS pseudo-content used as real UI

Already improved:

- `RCA INSIGHT PANEL` is now a real React component: `src/tools/RcaInsightPanel.jsx`.

Remaining pseudo-content UI:

- `EXECUTIVE RCA COCKPIT` label on `.cmpCleanStats::before`.
- `Compact after parse · focus on RCA below` label on intake/sidebar blocks.
- `LIVE RCA SIGNAL` badge source still exists in `ToolComparerDynatrace.css` as `.cmpCleanChart::before`.

Risk level: MEDIUM for layout/readability, LOW for data/API.

Recommended action:

- Prefer real React components or JSX text for durable UI labels.
- Avoid adding more `::before` / `::after` UI text except purely decorative dots/lines.

### 4. Comparer component cleanup status

`ToolComparerDirectHydrated.jsx` is active because `src/tools/index.js` lazy-loads it for slug `comparer`.

`ToolComparerClean.jsx` is active because the hydrated wrapper dynamically imports it.

Risk level: HIGH if deleted incorrectly.

Recommended action:

- Do not delete `ToolComparerDirectHydrated.jsx` or `ToolComparerClean.jsx`.
- Do not delete local comparer CSS files yet.
- If cleanup is needed, split `ToolComparerClean.jsx` into smaller internal components later, not now.

### 5. DB-first / Case History safety

No backend files were changed in this audit patch.

Critical contracts to preserve during cleanup:

- Upload & Analyze must not save parsed results automatically.
- Create Case must stay identity-only.
- Save to Case History must require explicit UI intent.
- `CaseLinkPanel` and `useCaseHistoryLink` must remain visible and functional.

Risk level: LOW for this audit patch because no runtime code changed.

## Recommended Next Patch

Smallest safe patch after this document:

1. Edit only `src/tools/ToolComparerClean.css`.
2. Remove the bottom `@import './ToolComparerCleanCompact.css';` because `ToolComparerCleanCompact.css` is already imported directly in `ToolComparerClean.jsx`.
3. Do not change any selector content.
4. Do not touch parser, backend, DB, Case History, PDF export, or workflows.
5. Validate with build/deploy workflow only when requested.

If the build remains green and visual state is unchanged, the next CSS cleanup candidate is:

1. Edit only `src/tools/ToolComparerDynatrace.css` and `src/app/wp-scout-chart-readability.css`.
2. Remove the source `.cmpCleanChart::before { content: 'LIVE RCA SIGNAL'; ... }` block.
3. Remove the redundant suppressor block in `wp-scout-chart-readability.css` only after source badge rules are gone.

## Deferred Cleanup

- Convert remaining pseudo labels to React/JSX where they represent real UI text.
- Review `:has()` usage and replace layout-sensitive pseudo UI with explicit JSX state where practical.
- Consolidate `.cmpCleanGrid`, `.cmpCleanPanel`, `.cmpCleanChart`, and `.cmpCleanTable` rules only after visual screenshots are verified.
- Consider splitting `ToolComparerClean.jsx` into smaller components only after visual and case-flow stability are verified.
- Move PDF export away from DOM scraping in a later phase; do not mix that with CSS cleanup.

## Current Decision

No CSS deletion is approved from this audit alone. The only immediate approved follow-up is removing the duplicate compact import path from `ToolComparerClean.css` if the user asks to continue patching.
