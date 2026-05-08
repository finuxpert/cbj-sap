# SAP RCA CSS Cleanup Audit

Date: 2026-05-08  
Target: sapdev  
Branch: dev  

## Scope

This audit starts the incremental cleanup of older global CSS layers that are now duplicated or overridden by:

```text
src/app/enterprise-theme.css
```

## Current direction

New UI/UX polish should stay centralized through:

```text
src/app/enterprise-theme.css
```

Do not add new visual CSS imports directly to:

```text
src/main.jsx
```

## First cleanup patch

Disabled this legacy import in `src/main.jsx`:

```js
import './sapdev-final-force.css'
```

The file was not deleted.

## Why this is the safest first candidate

`sapdev-final-force.css` is a high-specificity emergency override layer with broad `!important` rules for:

- navbar/mobile button behavior
- homepage hero sizing
- comparer section nav suppression
- comparer chart grid sizing
- generic panel/table/badge polish
- PDF dock compact styling
- mobile spacing and dock positioning

Most of these areas are now owned by centralized enterprise theme layers:

```text
src/app/enterprise-ui-system.css
src/app/enterprise-navigation.css
src/app/comparer-process-ux.css
src/app/pdf-export-ux.css
```

## Rollback

If QA finds regression on sapdev, restore the import in `src/main.jsx`:

```js
import './sapdev-final-force.css'
```

Then run:

```bash
npm run build
git add src/main.jsx
git commit -m "Restore legacy sapdev force CSS import"
git push origin dev
```

## QA focus after deploy

Check these URLs after auto deploy:

```text
https://sapdev.cbj-kontruksi.com
https://sapdev.cbj-kontruksi.com/#/tool/comparer
https://sapdev.cbj-kontruksi.com/#/tool/analyzer
https://sapdev.cbj-kontruksi.com/#/tool/logs
```

Verify:

- no blank screen
- navbar desktop/mobile still works
- SAP RCA logo still visible
- comparer layout is not broken
- PDF dock still visible
- Export PDF works on all 3 core tools
- evidence/table readability still OK
