# SAP DEV Validation Latest

Generated: 2026-05-10T02:20:27+07:00

## Git

- Branch: dev
- Commit: 4954f92
- Commit subject: Document validated sapdev deploy workflow
- Runner host: sadmin-HP-280-G2-MT-Legacy

## Build

- Status: green

```text
dist/assets/LogEvidenceCharts-DKQQpYpU.js          3.35 kB │ gzip:   1.40 kB
dist/assets/jszip-D1je86y6.js                     96.72 kB │ gzip:  29.87 kB
dist/assets/index-BUTL2x2K.js                    281.21 kB │ gzip:  86.78 kB
dist/assets/xlsx-DFH0qU2H.js                     332.70 kB │ gzip: 113.73 kB
dist/assets/jspdf.es.min-B25EUxtC.js             385.13 kB │ gzip: 125.77 kB
dist/assets/recharts-DMZ26Gdo.js                 415.94 kB │ gzip: 121.65 kB
✓ built in 6.87s
```

## Deploy

- Target: /var/www/svr01-dev/sap
- Asset count: 19

## Live Check

- URL: https://sapdev.cbj-kontruksi.com/sap/
- HTTP status: 200
- Last modified: Sat, 09 May 2026 19:20:27 GMT

```text
  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                       Dload  Upload   Total   Spent    Left  Speed
  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0
HTTP/2 200 
date: Sat, 09 May 2026 19:20:27 GMT
content-type: text/html
report-to: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=henFPQiMu5us1yyH7PVWuDLiMt1ubO9SJg6sstSvv3bjO5YGd3geex147uWATRwcLpkKhUVZuImwkTZGCyJAbCbRN27AAU7YtjK6tediZ2Iyweqa%2BSR70ckU7IzK4aQcHiqL4mMJQyYRO6c%3D"}]}
speculation-rules: "/cdn-cgi/speculation"
last-modified: Sat, 09 May 2026 19:20:27 GMT
server: cloudflare
cf-cache-status: DYNAMIC
nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
cf-ray: 9f930fc34bd6f8dc-SIN
alt-svc: h3=":443"; ma=86400

```

## API Health

```json
{"status":"ok","service":"SAP Intelligent RCA Evidence API","storage_root":"/var/www/svr01-dev/sap-data","max_upload_mb":500,"case_history":"hybrid","analytics":"enabled","database":{"enabled":true,"configured":true,"mode":"hybrid","status":"ok"}}
```
