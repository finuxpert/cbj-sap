# SAP RCA Workspace Enterprise Theme Notes

This document keeps the UI/UX polish work maintainable while the SAP RCA Workspace evolves incrementally.

## Current approach

The newer UI polish layers are grouped behind a single entrypoint:

```text
src/app/enterprise-theme.css
```

`main.jsx` should import only this enterprise entrypoint for the newer theme layers:

```js
import './app/enterprise-theme.css'
```

Do not add each new polish file directly to `main.jsx` unless there is a specific build reason.

## Import order

The order inside `enterprise-theme.css` matters:

1. `enterprise-ui-system.css` — base tokens, surfaces, cards, buttons, tables.
2. `enterprise-navigation.css` — navbar, core tool tabs, mobile menu.
3. `evidence-history-ux.css` — shared server-side evidence panels.
4. Tool-specific UX layers:
   - `log-evidence-ux.css`
   - `st03n-impact-ux.css`
   - `comparer-process-ux.css`

## Rules

- Keep changes incremental.
- Prefer CSS-only polish before changing parser or analysis logic.
- Do not reintroduce MutationObserver, DOM injectors, runtime enhancers, or delayed UI patchers.
- Do not add visual layers directly to `main.jsx`; add them to `enterprise-theme.css`.
- If a tool-specific layer becomes large, split by tool but keep the import centralized.
- Validate with `npm run build` before deploying to sapdev.

## Current DEV validation flow

Deploy target: `sapdev`

Branch: `dev`

Expected deploy workflow:

```text
GitHub Actions -> Deploy SAP RCA Workspace to DEV -> Run workflow -> branch dev
```

Post-deploy smoke checks:

```text
https://sapdev.cbj-kontruksi.com
https://sapdev.cbj-kontruksi.com/#/tool/comparer
https://sapdev.cbj-kontruksi.com/#/tool/analyzer
https://sapdev.cbj-kontruksi.com/#/tool/logs
https://sapdev.cbj-kontruksi.com/sap-api/health
```
