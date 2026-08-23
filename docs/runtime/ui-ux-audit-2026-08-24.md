# SAPDEV UI/UX Audit — ST03N and Log Evidence

Date: 2026-08-24
Branch baseline: `dev`
Application baseline: `v0.1.0`
Scope: ST03N Impact V2, Log Evidence V2, global navigation/versioning, and safe frontend cleanup.

## Audit limitation

The SAPDEV hostname could not be fetched from the review environment, so this pass is based on the exact `dev` source that the official SAPDEV workflow deploys. A post-merge visual QA run on SAPDEV is still required before considering layout work complete.

## What is already strong

### ST03N Impact V2

- Decision-first analysis is explicit: verdict, dominant component, confidence, completeness, parse status, ranking, and component mix are all represented.
- Workload ranking uses a vertical chart and exposes response/DB/wait context in the tooltip.
- Case History persistence is explicit rather than automatic, which is safer for RCA evidence quality.
- Parser and evidence logic are separated from the main UI component.

### Log Evidence V2

- The incident cockpit strip gives severity, confidence, owner, bottleneck, and case context early in the page.
- Charts are lazy loaded, reducing initial tool cost.
- Error evidence, owner direction, job/program mapping, infra saturation, scoring, and persistence are separated into reusable components.
- Explicit Case History save prevents accidental persistence during exploratory uploads.

## UX findings

### P1 — information hierarchy

ST03N currently places Case History Link and Persistence Flow before its primary decision board. For first-response Basis work, verdict/confidence/completeness should remain the fastest information to scan. Do not reorder this during a blind source-only cleanup; validate the preferred order visually on SAPDEV first.

Log is better because the Incident Cockpit Strip appears before persistence controls, but the page remains long and dense. Future work should use progressive disclosure for persistence/supporting evidence without hiding the primary RCA conclusion.

### P1 — mobile regression risk

The latest `dev` history includes a revert of the ST03N mobile responsive change. Treat ST03N breakpoints as regression-sensitive. Do not add another broad mobile override file. Fix the owning selectors and verify desktop/tablet/mobile screenshots in one change.

### P1 — destructive action clarity

Both evidence tools exposed `Clear Cache` as an immediate destructive action. This cleanup adds a confirmation and explicitly states that server evidence and Case History are not deleted.

### P2 — route consistency

Existing bookmarks supplied for `#/st03n` and `#/log` do not match the canonical `dev` routes (`#/tool/analyzer` and `#/tool/logs`). This cleanup keeps the old routes as aliases so users do not land on Not Found while the application retains one canonical tool registry.

### P2 — title/version visibility

The application used a stale hard-coded build stamp and generic browser title. This cleanup centralizes app version `v0.1.0`, shows it in the header/mobile navigation, and updates the browser title per page/tool.

### P2 — code readability

Both primary tools still contain very large inline JSX return blocks. They work, but they raise review cost and make visual changes harder to isolate. Future cleanup should extract layout sections into local components without changing parser/state behavior. Do this incrementally and keep each extraction build-green.

### P2 — chart/readability follow-up

ST03N Y-axis labels have a fixed width and may truncate long objects. Log evidence is intentionally dense. During visual QA, verify long program/job names, chart labels at 100% browser zoom, and narrow desktop widths before changing chart dimensions.

## Repository cleanup findings

### Oversized duplicate public assets

`public/favicon.ico` and five `public/img/sapbasis-*.png` paths all referenced the same 20,069,841-byte blob. Although Git stores identical blobs efficiently, Vite copies public paths into build output, so retaining six copies can create roughly 120 MB of unnecessary public build payload. The cleanup replaces those references with one small SVG favicon and removes the unused Vite starter icon.

`public/sql-wasm.wasm` is retained because it is a runtime dependency.

### Duplicate toolbar implementation

ST03N and Log had two near-identical Evidence Toolbar implementations. The Log toolbar now re-exports the shared implementation from `EvidenceDecisionKit.jsx`, reducing duplicate maintenance and keeping Clear Cache behavior consistent.

### Existing cleanup guardrail remains valid

Do not mass-delete files with names such as `Clean` or `Dynatrace`. The active WP-SCOUT route still loads historical-looking comparer modules through `ToolComparerDirectHydrated.jsx`. Use the active import chain, not filenames, as deletion evidence.

## Validation required before merge/deploy

1. Run `npm run qa` on the `dev` code after the PR is merged or checked out by the SAPDEV runner.
2. Verify `#/st03n` opens ST03N Impact and highlights the ST03N nav item.
3. Verify `#/log` opens Log Evidence and highlights the Log nav item.
4. Verify canonical routes still work.
5. Verify browser title contains `v0.1.0` and changes by page/tool.
6. Verify desktop and mobile navigation display `v0.1.0` without clipping.
7. Verify Clear Cache confirmation cancels safely and, when confirmed, clears only local analysis cache.
8. Verify favicon loads under the `/sap/` base path.
9. Verify ST03N and Log upload/parse behavior is unchanged.
10. Verify Case History explicit-save flow is unchanged.

## Next UI iteration

After this cleanup is green on SAPDEV, the next UI-focused PR should be limited to one tool at a time. For ST03N, prioritize validated mobile/table/chart behavior. For Log, prioritize information density and progressive disclosure. Avoid combining those changes with parser, backend, or deployment work.
