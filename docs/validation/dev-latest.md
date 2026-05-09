# SAP DEV Validation Latest

Generated: 2026-05-09T19:33:38+07:00

## Git

- Branch: dev
- Commit: fa0528a
- Commit subject: Update DEV validation after case maintenance deploy
- Runner host: sadmin-HP-280-G2-MT-Legacy

## Build

- Status: green

```text
dist/assets/LogEvidenceCharts-z93ExNBZ.js          3.35 kB │ gzip:   1.40 kB
dist/assets/jszip-B1xCwPQl.js                     96.72 kB │ gzip:  29.87 kB
dist/assets/index-DqFFfhCt.js                    275.31 kB │ gzip:  85.70 kB
dist/assets/xlsx-DFH0qU2H.js                     332.70 kB │ gzip: 113.73 kB
dist/assets/jspdf.es.min-BLMNNGmb.js             385.13 kB │ gzip: 125.77 kB
dist/assets/recharts-DQhBIJL9.js                 415.93 kB │ gzip: 121.64 kB
✓ built in 6.59s
```

## Deploy

- Target: /var/www/svr01-dev/sap
- Asset count: 19

## Live Check

- URL: https://sapdev.cbj-kontruksi.com/sap/
- HTTP status: 200
- Last modified: Sat, 09 May 2026 12:33:37 GMT

```text
  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                       Dload  Upload   Total   Spent    Left  Speed
  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0
HTTP/2 200 
date: Sat, 09 May 2026 12:33:37 GMT
content-type: text/html
report-to: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=wmTxIB3PHcXgR1hHxOxFRTOQWo1%2B7irhXgEDC70Tqsqu16s1CCKUU%2BwtWNB9i%2BqWmNOnq7gx%2FCZwWl42FD%2BzD5T1wUgDEzIbAOTvtmI38eIy4ujHzpa6FI8X5dIo0%2BGT%2BKbUHPnRoFOyu7E%3D"}]}
speculation-rules: "/cdn-cgi/speculation"
last-modified: Sat, 09 May 2026 12:33:37 GMT
server: cloudflare
cf-cache-status: DYNAMIC
nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
cf-ray: 9f90bbd3296d9fd1-SIN
alt-svc: h3=":443"; ma=86400

```

## API Health

```json
{"status":"ok","service":"SAP Intelligent RCA Evidence API","storage_root":"/var/www/svr01-dev/sap-data","max_upload_mb":500,"case_history":"file-backed","analytics":"enabled"}
```
