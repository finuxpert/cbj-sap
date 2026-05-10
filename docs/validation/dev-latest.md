# SAP DEV Validation Latest

Generated: 2026-05-10T07:31:35+07:00

## Git

- Branch: dev
- Commit: d0ebf41
- Commit subject: Validate backend storage config module
- Runner host: sadmin-HP-280-G2-MT-Legacy

## Build

- Status: green

```text
dist/assets/LogEvidenceCharts-Dt65_tai.js          3.35 kB │ gzip:   1.40 kB
dist/assets/jszip-D1je86y6.js                     96.72 kB │ gzip:  29.87 kB
dist/assets/index-C87QD7tR.js                    283.42 kB │ gzip:  87.50 kB
dist/assets/xlsx-DFH0qU2H.js                     332.70 kB │ gzip: 113.73 kB
dist/assets/jspdf.es.min-CBe7SpBA.js             385.13 kB │ gzip: 125.77 kB
dist/assets/recharts-DMZ26Gdo.js                 415.94 kB │ gzip: 121.65 kB
✓ built in 6.91s
```

## Deploy

- Target: /var/www/svr01-dev/sap
- Asset count: 19

## Live Check

- URL: https://sapdev.cbj-kontruksi.com/sap/
- HTTP status: 200
- Last modified: Sun, 10 May 2026 00:31:35 GMT

```text
  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                       Dload  Upload   Total   Spent    Left  Speed
  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0
HTTP/2 200 
date: Sun, 10 May 2026 00:31:35 GMT
content-type: text/html
report-to: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=IyB2%2BjtjxqO0o3yDOB3A87fTDbSHFHOi4xwYnPH8iiGZ2cfvS%2FAeL5xu5ReLZkHjdgLXn%2Fk9ING0RhVVgOOdpnW7KmhF9DEJ3SZlZyqTT4nhY%2F3RlHs50f7TmUSC1PxFXbV%2BOHxCCg3B5RY%3D"}]}
speculation-rules: "/cdn-cgi/speculation"
last-modified: Sun, 10 May 2026 00:31:35 GMT
server: cloudflare
cf-cache-status: DYNAMIC
nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
cf-ray: 9f94d7864c1dfd70-SIN
alt-svc: h3=":443"; ma=86400

```

## API Health

```json
{"status":"ok","service":"SAP Intelligent RCA Evidence API","storage_root":"/var/www/svr01-dev/sap-data","max_upload_mb":500,"case_history":"hybrid","analytics":"enabled","database":{"enabled":true,"configured":true,"mode":"hybrid","status":"ok"}}
```
