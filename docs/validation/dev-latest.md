# SAP DEV Validation Latest

Generated: 2026-05-10T00:02:17+07:00

## Git

- Branch: dev
- Commit: 4fecd9c
- Commit subject: Add PostgreSQL-first reads for SAP RCA hybrid mode
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
✓ built in 8.49s
```

## Deploy

- Target: /var/www/svr01-dev/sap
- Asset count: 19

## Live Check

- URL: https://sapdev.cbj-kontruksi.com/sap/
- HTTP status: 200
- Last modified: Sat, 09 May 2026 17:02:16 GMT

```text
  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                       Dload  Upload   Total   Spent    Left  Speed
  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0
HTTP/2 200 
date: Sat, 09 May 2026 17:02:16 GMT
content-type: text/html
report-to: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=U3RZaXtXObsh%2BazulOLNl8auLD%2BbdKvOSdqfJMiywXPrLmbYZcxNJ5hf6FeaQH5YrbGcxPIy5HHgFGAs9NGixkgEWWcVRrVUlQCNMLIBvVhLOOQo8tX%2Bc3z%2FxTH8el1K%2BOkCb%2BmuWiZiIu4%3D"}]}
speculation-rules: "/cdn-cgi/speculation"
last-modified: Sat, 09 May 2026 17:02:16 GMT
server: cloudflare
cf-cache-status: DYNAMIC
nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
cf-ray: 9f9245599f68c826-SIN
alt-svc: h3=":443"; ma=86400

```

## API Health

```json
{"status":"ok","service":"SAP Intelligent RCA Evidence API","storage_root":"/var/www/svr01-dev/sap-data","max_upload_mb":500,"case_history":"hybrid","analytics":"enabled","database":{"enabled":true,"configured":true,"mode":"hybrid","status":"ok"}}
```
