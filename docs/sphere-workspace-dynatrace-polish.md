# SPHERE — Dynatrace-Style Observability Polish

## Scope

This update aligns the RCA Workspace toward a Dynatrace-inspired observability console while keeping the application focused on the three core SAP Basis RCA tools only:

1. WP-SCOUT Monitor
2. ST03N Workload RCA
3. SM21 / ST22 Log RCA

The implementation deliberately avoids runtime UI hacks. No MutationObserver, recursive DOM injector, runtime dashboard enhancer, delayed UI patching, or floating shortcut overlay is used.

## UI / UX Direction

The workspace uses a dark observability theme with:

- Dynatrace-like dark monitoring panels
- green/mint/blue signal colors
- red/orange severity accents
- softer grid lines in charts
- cleaner tool naming for SAP Basis RCA workflow
- smoother, lightweight fade animation
- reduced excessive glow and movement
- print/PDF-friendly styling

## Tool Naming

Navbar naming was aligned to SPHERE / observability terminology:

- `WP-SCOUT Comparator` → `WP-SCOUT Monitor`
- `ST03N Workload` → `ST03N Workload RCA`
- `System Log Triage` → `SM21 / ST22 Log RCA`

## Severity Logic

WP-SCOUT severity thresholds were tuned so the queue does not mark every long-running process as critical.

Current WP-SCOUT logic:

### CRIT

- RSS >= 256 GB
- CPU >= 95
- RSS >= 96 GB and age >= 24 hours
- RSS >= 64 GB and age >= 24 hours and hits >= 10

### WARN

- RSS >= 32 GB
- age >= 168 hours / 7 days
- CPU >= 70
- hits >= 5

### OK

- Below the WARN threshold

This keeps very large memory offenders critical, while long-running 70 GB jobs with low recurrence become warning instead of critical.

## Chart Improvements

Charts now use a unified monitoring style:

- dark chart canvas
- subtle grid lines
- green/mint bar signals
- blue line signals
- readable tooltip styling
- print-safe chart containers
- animation duration kept short and smooth

## PDF / Print Readiness

The global RCA theme includes print rules for cleaner PDF output:

- removes upload controls from print
- avoids scroll-box clipping in tables
- keeps panels readable on white background
- preserves chart containers without dark visual clutter

## Evidence Storage

Evidence storage remains server-side through the existing Evidence API:

- API base: `/sap-api`
- upload client: `src/evidence-api-client.js`
- existing upload/list/download functions are preserved

The current UI theme does not bypass the server-side evidence flow.

## Files Added / Updated

### Added

- `src/sap-dynatrace-rca.css`
- `src/tools/ToolComparerDynatrace.css`
- `docs/sphere-workspace-dynatrace-polish.md`

### Updated

- `src/main.jsx`
- `src/tools/index.js`
- `src/tools/ToolComparerClean.jsx`

## Safety Notes

The change is CSS-first and React-clean. It does not reintroduce:

- MutationObserver
- DOM injection
- runtime dashboard enhancer
- delayed UI patching
- old shortcut overlays
- noisy executive widgets

## Deployment

```bash
cd /home/sadmin/sap

sudo -u sadmin git pull origin main
npm run build

sudo rm -rf /var/www/svr01-dev/sap/*
sudo cp -rv dist/* /var/www/svr01-dev/sap/

sudo chown -R www-data:www-data /var/www/svr01-dev/sap
sudo find /var/www/svr01-dev/sap -type d -exec chmod 755 {} \;
sudo find /var/www/svr01-dev/sap -type f -exec chmod 644 {} \;

sudo nginx -t && sudo systemctl reload nginx
```

## Validation

```bash
curl http://127.0.0.1:8090/health
curl https://sapdev.cbj-kontruksi.com/sap-api/health
```

Browser validation:

1. Hard refresh with `Ctrl + Shift + R`.
2. Open WP-SCOUT Monitor.
3. Upload WP-SCOUT log.
4. Confirm severity distribution is not all critical.
5. Confirm charts are readable and not visually cluttered.
6. Open ST03N Workload RCA and SM21 / ST22 Log RCA to confirm the unified observability theme applies.
7. Test Export PDF / browser print output.
