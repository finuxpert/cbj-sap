# SAP DEV Validation Latest

Generated: 2026-05-08T15:51:19+07:00

## Git

- Branch: dev
- Commit: 3d3cd27
- Commit subject: Update DEV deploy runbook for dev auto deploy
- Runner host: sadmin-HP-280-G2-MT-Legacy

## Build

- Status: green

```text
dist/assets/LogEvidenceCharts-BAbPNtQS.js          0.92 kB │ gzip:   0.45 kB
dist/assets/jszip-Cyqpih6J.js                     96.72 kB │ gzip:  29.87 kB
dist/assets/index-BULWfe_3.js                    230.59 kB │ gzip:  73.81 kB
dist/assets/xlsx-DFH0qU2H.js                     332.70 kB │ gzip: 113.73 kB
dist/assets/jspdf.es.min-BHAqklIT.js             385.13 kB │ gzip: 125.77 kB
dist/assets/recharts-DfFWPDbw.js                 415.91 kB │ gzip: 121.63 kB
✓ built in 6.41s
```

## Deploy

- Target: /var/www/svr01-dev/sap
- Asset count: 17

## Live Check

- URL: https://sapdev.cbj-kontruksi.com/sap/
- HTTP status: 200
- Last modified: Fri, 08 May 2026 08:51:18 GMT

```text
  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                       Dload  Upload   Total   Spent    Left  Speed
  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0
HTTP/2 200 
date: Fri, 08 May 2026 08:51:18 GMT
content-type: text/html
report-to: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=cfhKgVuOf2yeyWDzMXdf2FuGSrWZLYzQKxgxw1R6K6aB57zYJ%2FTOGDZWFK2RjACKv2JFFV49gzUU9m7Fhj1h8VmO9T3tboCAAHmc%2B7z%2BEh9fFutUFY06Uoe8f9%2Bh8qgpNjt2yyCjRz9q3vY%3D"}]}
speculation-rules: "/cdn-cgi/speculation"
last-modified: Fri, 08 May 2026 08:51:18 GMT
server: cloudflare
cf-cache-status: DYNAMIC
nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
cf-ray: 9f8738c9f8495cec-SIN
alt-svc: h3=":443"; ma=86400

```

## API Health

```json
{"status":"ok","service":"SAP Intelligent RCA Evidence API","storage_root":"/var/www/svr01-dev/sap-data","max_upload_mb":500}
```
