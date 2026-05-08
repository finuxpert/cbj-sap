# SAP DEV Validation Latest

Generated: 2026-05-08T20:38:59+07:00

## Git

- Branch: dev
- Commit: 0c25ba9
- Commit subject: Trigger sapdev deploy validation
- Runner host: sadmin-HP-280-G2-MT-Legacy

## Build

- Status: green

```text
dist/assets/LogEvidenceCharts-0n_3XanT.js          3.35 kB │ gzip:   1.39 kB
dist/assets/jszip-BPQg7Uz0.js                     96.72 kB │ gzip:  29.87 kB
dist/assets/index-WzY5a-ia.js                    251.83 kB │ gzip:  79.41 kB
dist/assets/xlsx-DFH0qU2H.js                     332.70 kB │ gzip: 113.73 kB
dist/assets/jspdf.es.min-DAQLAzvF.js             385.13 kB │ gzip: 125.77 kB
dist/assets/recharts-DPpNiXWN.js                 415.93 kB │ gzip: 121.64 kB
✓ built in 6.65s
```

## Deploy

- Target: /var/www/svr01-dev/sap
- Asset count: 17

## Live Check

- URL: https://sapdev.cbj-kontruksi.com/sap/
- HTTP status: 200
- Last modified: Fri, 08 May 2026 13:38:59 GMT

```text
  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                       Dload  Upload   Total   Spent    Left  Speed
  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0
HTTP/2 200 
date: Fri, 08 May 2026 13:38:59 GMT
content-type: text/html
report-to: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=ZJP%2BIqvF9SkxNYL6g5A%2FNrtXuV5cVL3JB5jtBUoLQyqajNa6wB%2FxwgsrgruxiZ%2B3i0EdRQ5g8UP2GsZZX2A4qJrr9NuiIfvnWhp4qpD7DvocgR3oZpvJi%2Fc3zTQoyhHKTgYqPjIAgD67Bp0%3D"}]}
speculation-rules: "/cdn-cgi/speculation"
last-modified: Fri, 08 May 2026 13:38:59 GMT
server: cloudflare
cf-cache-status: DYNAMIC
nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
cf-ray: 9f88de325e279c86-SIN
alt-svc: h3=":443"; ma=86400

```

## API Health

```json
{"status":"ok","service":"SAP Intelligent RCA Evidence API","storage_root":"/var/www/svr01-dev/sap-data","max_upload_mb":500}
```
