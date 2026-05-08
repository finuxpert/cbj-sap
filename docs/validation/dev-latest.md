# SAP DEV Validation Latest

Generated: 2026-05-08T15:40:21+07:00

## Git

- Branch: dev
- Commit: 197f568
- Commit subject: Trigger sapdev auto deploy validation
- Runner host: sadmin-HP-280-G2-MT-Legacy

## Build

- Status: green

```text
dist/assets/LogEvidenceCharts-3bIPrdSa.js          0.92 kB │ gzip:   0.45 kB
dist/assets/jszip-Cyqpih6J.js                     96.72 kB │ gzip:  29.87 kB
dist/assets/index-zZn-3o09.js                    228.28 kB │ gzip:  72.92 kB
dist/assets/xlsx-DFH0qU2H.js                     332.70 kB │ gzip: 113.73 kB
dist/assets/jspdf.es.min-Cdn4zSAg.js             385.13 kB │ gzip: 125.77 kB
dist/assets/recharts-DfFWPDbw.js                 415.91 kB │ gzip: 121.63 kB
✓ built in 6.58s
```

## Deploy

- Target: /var/www/svr01-dev/sap
- Asset count: 17

## Live Check

- URL: https://sapdev.cbj-kontruksi.com/sap/
- HTTP status: 200
- Last modified: Fri, 08 May 2026 08:40:21 GMT

```text
  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                       Dload  Upload   Total   Spent    Left  Speed
  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0
HTTP/2 200 
date: Fri, 08 May 2026 08:40:21 GMT
content-type: text/html
report-to: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=bTOwqL9vJSUIUuQs9PR2WH2rlBTZm1H3NxmRe%2Fk8nwKLZOrSyFXcNYbEfY8F6IaTSNd%2F2%2FcGzbzLa8eHJaBceRuCfggMavY%2FruZw1D8yYApizJ8cXXdJNA%2FOF2MQAavk%2Fw5KwVAmc0yJyXQ%3D"}]}
speculation-rules: "/cdn-cgi/speculation"
last-modified: Fri, 08 May 2026 08:40:21 GMT
server: cloudflare
cf-cache-status: DYNAMIC
nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
cf-ray: 9f8728bd0b72fda8-SIN
alt-svc: h3=":443"; ma=86400

```

## API Health

```json
{"status":"ok","service":"SAP Intelligent RCA Evidence API","storage_root":"/var/www/svr01-dev/sap-data","max_upload_mb":500}
```
