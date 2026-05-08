# SAP DEV Validation Latest

Generated: 2026-05-08T16:02:18+07:00

## Git

- Branch: dev
- Commit: 3b92aca
- Commit subject: Avoid duplicate sapdev deploy triggers
- Runner host: sadmin-HP-280-G2-MT-Legacy

## Build

- Status: green

```text
dist/assets/LogEvidenceCharts-CHlOo42B.js          0.92 kB │ gzip:   0.45 kB
dist/assets/jszip-Cyqpih6J.js                     96.72 kB │ gzip:  29.87 kB
dist/assets/index-D_uNKf9O.js                    232.03 kB │ gzip:  74.39 kB
dist/assets/xlsx-DFH0qU2H.js                     332.70 kB │ gzip: 113.73 kB
dist/assets/jspdf.es.min-B7rVaWpD.js             385.13 kB │ gzip: 125.77 kB
dist/assets/recharts-DfFWPDbw.js                 415.91 kB │ gzip: 121.63 kB
✓ built in 6.52s
```

## Deploy

- Target: /var/www/svr01-dev/sap
- Asset count: 17

## Live Check

- URL: https://sapdev.cbj-kontruksi.com/sap/
- HTTP status: 200
- Last modified: Fri, 08 May 2026 09:02:18 GMT

```text
  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                       Dload  Upload   Total   Spent    Left  Speed
  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0
HTTP/2 200 
date: Fri, 08 May 2026 09:02:18 GMT
content-type: text/html
report-to: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=P5dRD65SZTrdcW23RZOx8J%2B6CtrZckzypXwGBqlRTnCPntAxNMicvLIzV6r9k2ULerE9ht5k3dFsTuznXRT5%2FfUDOplhxT5NGQXlbzzlDmwm6kNPIgtgs2vxi9rGUAwz3k7hVz2iANiagGU%3D"}]}
speculation-rules: "/cdn-cgi/speculation"
last-modified: Fri, 08 May 2026 09:02:18 GMT
server: cloudflare
cf-cache-status: DYNAMIC
nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
cf-ray: 9f8748e45feccdda-SIN
alt-svc: h3=":443"; ma=86400

```

## API Health

```json
{"status":"ok","service":"SAP Intelligent RCA Evidence API","storage_root":"/var/www/svr01-dev/sap-data","max_upload_mb":500}
```
