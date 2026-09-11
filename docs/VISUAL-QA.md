# SPHERE Visual QA

SPHERE v1.19.0 includes an optional Playwright visual-regression harness for the Rundeck dashboard. It is intentionally separate from the default `npm run qa` release gate so ordinary server deploys do not require browser binaries or external package installation.

## Coverage

The visual suite checks both 1920×1080 desktop and 1366×768 laptop viewports. It validates:

- SAP Performance Summary hierarchy and horizontal overflow;
- Host Resource / SAP Workload readability;
- minimum table text readability and major section spacing;
- Performance Evaluation controls for 1 Day / 7 Days / 30 Days;
- evaluation table rendering and responsive containment;
- SAP Issues columns for SAP Signal, Current Severity and Peak Severity;
- resolved issue semantics (`CLEARED`);
- screenshots for overview, evaluation, and SAP Issues.

## One-time local setup

After the normal locked install (`npm ci`), install Playwright without changing `package.json` or `package-lock.json`:

```bash
npm install --no-save @playwright/test
npx playwright install chromium
```

## Run against deployed DEV

```bash
SPHERE_VISUAL_BASE_URL='https://sphere.astraotoparts.co.id/dev/#/tool/logs' npm run qa:visual
```

The suite saves screenshots/traces under `test-results/visual` and an HTML report under `playwright-report`.

## Establish / update screenshot baselines

Use this only after the DEV UI has been reviewed and accepted:

```bash
SPHERE_VISUAL_BASE_URL='https://sphere.astraotoparts.co.id/dev/#/tool/logs' \
SPHERE_VISUAL_COMPARE=1 \
npx playwright test -c playwright.config.mjs --update-snapshots
```

After approved baseline PNGs are committed, future runs can compare the dashboard with:

```bash
SPHERE_VISUAL_BASE_URL='https://sphere.astraotoparts.co.id/dev/#/tool/logs' \
SPHERE_VISUAL_COMPARE=1 \
npm run qa:visual
```

Do not update snapshots merely to make a failing test pass. Review layout, status semantics, clipping, overflow, and density changes first.
