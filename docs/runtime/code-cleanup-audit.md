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

This audit found that the current WP-SCOUT comparator path is still intentionally routed through a hydrated wrapper before loading `ToolComparerClean.jsx`. Therefore, `ToolComparerClean.jsx` and its CSS imports must not be deleted during the first cleanup pass.

The main technical debt is currently CSS layering around WP-SCOUT chart/cockpit visual polish. Some UI text is still injected through CSS pseudo-content instead of React components, which makes layout behavior harder to control and can overlap charts or critical controls.

## Audit Evidence

### Active route chain

Current tool registry:

```js
comparer: () => import('./ToolComparerDirectHydrated.jsx')
```

`ToolComparerDirectHydrated.jsx` dynamically imports `ToolComparerClean.jsx`, so the clean comparer is active through the hydrated wrapper.

```js
import('./ToolComparerClean.jsx').then((module) => {
  if (active) setToolComparerClean(() => module.default)
})
```

### Main CSS import order

`src/main.jsx` imports global visual polish in this order:

```js
import './index.css'
import './app/enterprise-theme.css'
import './app/wp-scout-rca-cockpit-polish.css'
import './app/wp-scout-chart-readability.css'
```

This means `wp-scout-chart-readability.css` is intentionally loaded after the cockpit polish layer, so it can override chart badge/spacing rules.

### Tool-level CSS import stack

`ToolComparerClean.jsx` imports the following local CSS layers:

```js
import './ToolComparerClean.css'
import './ToolComparerCleanVisual.css'
import './ToolComparerDynatrace.css'
import './ToolComparerCleanCompact.css'
```

These should be treated as active until selector overlap and UI impact are verified.

## Findings

### 1. Runtime injector leftovers

Search terms checked:

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

Active layers reviewed:

- `src/app/wp-scout-rca-cockpit-polish.css`
- `src/app/wp-scout-chart-readability.css`
- `src/tools/ToolComparerClean.css`
- `src/tools/ToolComparerCleanVisual.css`
- `src/tools/ToolComparerDynatrace.css`
- `src/tools/ToolComparerCleanCompact.css`

Confirmed overlap exists around Recharts label readability and chart panel styling. The global chart readability layer is intentionally imported after cockpit polish and currently suppresses the older pseudo badge source using strong selectors and `!important`.

Risk level: MEDIUM.

Recommended action:

- Do not remove CSS files yet.
- Next safe patch should remove or replace the source pseudo badge rule in `wp-scout-rca-cockpit-polish.css` instead of relying on later override suppression.
- Keep chart readability rules focused only on Recharts spacing, labels, and overflow.

### 3. CSS pseudo-content used as real UI

Confirmed pseudo-content UI in `wp-scout-rca-cockpit-polish.css`:

- `EXECUTIVE RCA COCKPIT` label on `.cmpCleanStats::before`
- `Compact after parse · focus on RCA below` label on intake/sidebar blocks
- `RCA INSIGHT PANEL` long text block on `.cmpCleanGrid:has(.span2)::after`
- `LIVE RCA SIGNAL` badge on chart title blocks

The Executive Incident Ribbon already exists as a real React component, so the remaining pseudo-content should be reduced gradually.

Risk level: HIGH for layout/readability, LOW for data/API.

Recommended action:

- First safe UI cleanup: remove the `LIVE RCA SIGNAL` pseudo badge source because it already has a documented overlap issue and is currently being suppressed by `wp-scout-chart-readability.css`.
- Next React cleanup: convert `RCA INSIGHT PANEL` from CSS pseudo-content into a real component inside the WP-SCOUT cockpit layout.
- Avoid aggressive `:has()` layout controls around Case History save controls.

### 4. Comparer component cleanup status

`ToolComparerDirectHydrated.jsx` is active because `src/tools/index.js` lazy-loads it for slug `comparer`.

`ToolComparerClean.jsx` is active because the hydrated wrapper dynamically imports it.

Risk level: HIGH if deleted incorrectly.

Recommended action:

- Do not delete `ToolComparerDirectHydrated.jsx` or `ToolComparerClean.jsx`.
- Do not delete the four local comparer CSS files until usage is mapped selector-by-selector.
- If cleanup is needed, split `ToolComparerClean.jsx` into small internal components later, not now.

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

1. Edit only `src/app/wp-scout-rca-cockpit-polish.css` and `src/app/wp-scout-chart-readability.css`.
2. Remove the source `LIVE RCA SIGNAL` pseudo badge rule from cockpit polish.
3. Remove the now-unnecessary override block that suppresses the same badge in chart readability CSS.
4. Do not touch parser, backend, DB, Case History, PDF export, or workflows.
5. Validate with build/deploy workflow only when requested.

## Deferred Cleanup

- Convert `RCA INSIGHT PANEL` pseudo-content to a real React component.
- Review `:has()` usage and replace layout-sensitive pseudo UI with explicit JSX state where practical.
- Map duplicate selectors across all comparer CSS layers before consolidation.
- Consider splitting `ToolComparerClean.jsx` into smaller components only after visual and case-flow stability are verified.

## Current Decision

No code deletion is approved from this audit alone. The only immediate approved follow-up is a tiny CSS cleanup around the redundant `LIVE RCA SIGNAL` pseudo badge if the user asks to continue patching.
