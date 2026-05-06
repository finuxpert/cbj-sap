# CBJ Monitoring Runbook

Tanggal dibuat: `2026-04-29`

## URL

```text
https://cbj-kontruksi.com/monitoring/
```

Monitoring ini memakai Basic Auth. Credential ada di:

```text
/home/sadmin/sap/docs/CBJ_MONITORING_PRIVATE.md
```

## Production

```text
Static webroot: /var/www/html/monitoring
Service:        cbj-monitoring
API listen:     127.0.0.1:8790
Nginx route:    /monitoring/ dan /monitoring/api/
Basic auth:     /etc/nginx/.htpasswd-cbj-monitoring
```

## Yang Dipantau

- route website:
  - `/`
  - `/portal`
  - `/note/`
  - `/sap/`
  - `/amandapay/`
  - `/webmail/`
- API:
  - `/api/health`
  - `/api/note/health`
  - `/amandapay/api/health`
- service:
  - `nginx`
  - `cbj-portal-api`
  - `cbj-note-api`
  - `amandapay-api`
  - `crond`
  - `postfix`
  - `dovecot`
- resource:
  - RAM
  - load average
  - disk `/` dan `/boot`
  - ukuran DB
  - backup terbaru CBJ Portal dan Amandapay
  - umur backup terbaru
  - masa berlaku TLS certificate domain utama
- summary:
  - jumlah issue aktif
  - warning disk, backup stale/missing, TLS mendekati expiry
  - status route/service down

## Health Check

```bash
curl -s http://127.0.0.1:8790/api/health
curl -s http://127.0.0.1:8790/api/status
sudo systemctl status cbj-monitoring
```

## Deploy / Update

Source lokal:

```text
/home/sadmin/sap/ops/cbj-monitoring-server.mjs
/home/sadmin/sap/ops/cbj-monitoring-index.html
```

Target VPS:

```text
/home/sadmin/ops/cbj-monitoring-server.mjs
/var/www/html/monitoring/index.html
```

Setelah update:

```bash
sudo systemctl restart cbj-monitoring
sudo nginx -t && sudo systemctl reload nginx
```

## Catatan

- Endpoint monitoring dilindungi Basic Auth karena berisi status internal server.
- API monitoring hanya bind ke `127.0.0.1`, tidak expose langsung ke internet.
- Data monitoring bersifat read-only.
- Per `2026-04-29`, warning live yang masih aktif adalah `/boot` usage `91%`. Route, service, backup, dan TLS sehat.
