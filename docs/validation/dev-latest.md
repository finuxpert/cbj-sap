# SAP DEV Validation Latest

Generated: 2026-05-09T15:30:00+07:00

## Git

- Branch: dev
- Commit: 1099daf
- Commit subject: Style case bulk maintenance controls
- Runner host: sadmin-HP-280-G2-MT-Legacy

## Build

- Status: green

```text
vite v7.3.2 building client environment for production...
✓ 982 modules transformed.
dist/index.html                                    0.86 kB │ gzip:   0.40 kB
dist/assets/index-D_a_czI0.css                    93.55 kB │ gzip:  17.41 kB
dist/assets/index-DqFFfhCt.js                    275.31 kB │ gzip:  85.70 kB
dist/assets/xlsx-DFH0qU2H.js                     332.70 kB │ gzip: 113.73 kB
dist/assets/jspdf.es.min-BLMNNGmb.js             385.13 kB │ gzip: 125.77 kB
dist/assets/recharts-DQhBIJL9.js                 415.93 kB │ gzip: 121.64 kB
✓ built in 8.35s
```

## Deploy

- Target: /var/www/svr01-dev/sap
- Frontend deploy: completed manually from local DEV build
- Permissions fixed:
  - directories: 755
  - files: 644
- Nginx validation: successful
- Nginx reload: completed

```text
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

## Live Check

- URL: https://sapdev.cbj-kontruksi.com/sap/
- Case History route: https://sapdev.cbj-kontruksi.com/sap/#/cases
- Browser check: Case Maintenance bar visible

Expected visible UI on `/#/cases`:

```text
Case Maintenance
Select visible
Clear
Archive selected
Delete selected
```

## API Health

```json
{"status":"ok","service":"SAP Intelligent RCA Evidence API","storage_root":"/var/www/svr01-dev/sap-data","max_upload_mb":500,"case_history":"file-backed","analytics":"enabled"}
```

## Case Maintenance Validation

Implemented backend endpoint:

```text
DELETE /sap-api/cases/{case_id}
```

Frontend maintenance behavior:

```text
- Each case card has a Select checkbox.
- Select visible selects every case currently visible after filter/search.
- Clear removes selection.
- Archive selected updates selected cases to ARCHIVED.
- Delete selected asks user to type DELETE before sending DELETE requests.
```

Delete safety boundary:

```text
Delete selected removes only the case JSON under /var/www/svr01-dev/sap-data/cases.
It does not delete physical evidence files.
```

Suggested smoke test:

```text
1. Open https://sapdev.cbj-kontruksi.com/sap/#/cases.
2. Select one QA/test case only.
3. Click Archive selected.
4. Confirm counts update.
5. Select one QA/test case only.
6. Click Delete selected.
7. Type DELETE.
8. Confirm the case disappears.
```

Optional backend endpoint check:

```bash
curl -X DELETE -s https://sapdev.cbj-kontruksi.com/sap-api/cases/CASE-TEST-ID | jq
```

Expected success shape:

```json
{"ok":true,"deleted":"CASE-TEST-ID"}
```

## Analytics Validation

Case detail analytics are backend-driven.

Validation command:

```bash
curl -s https://sapdev.cbj-kontruksi.com/sap-api/mobile/cases/CASE-20260508-022/analytics \
  | jq '.ok, .analytics.has_data, .analytics.summary'
```

Expected summary shape:

```json
{
  "top_signal": "DBSQL_DUPLICATE_KEY_ER",
  "dominant_source": "WP-SCOUT / RCA Comparator",
  "avg_confidence": 95.78,
  "parsed_count": 14,
  "evidence_count": 94,
  "report_count": 0,
  "resource_points": 30
}
```
