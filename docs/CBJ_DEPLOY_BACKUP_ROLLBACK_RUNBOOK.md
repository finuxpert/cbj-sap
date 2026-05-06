# CBJ Deploy, Backup, Rollback Runbook

Tanggal update: `2026-05-01`

Dokumen ini adalah rujukan cepat untuk deploy production, backup, dan rollback aplikasi CBJ ecosystem.

Runbook khusus deploy/test di `lab-rumah` / `svr-01`:

```text
/home/sadmin/sap/docs/CBJ_LAB_RUMAH_DEPLOY_RUNBOOK.md
```

## Ringkasan Script

| Area | Source | Script production | Live route |
|---|---|---|---|
| Website publik + Portal CBJ | `/home/sadmin/cbj` | `/home/sadmin/cbj/deploy.portal.sh` | `https://cbj-kontruksi.com/`, `/portal` |
| SAP Tools | `/home/sadmin/sap` | `/home/sadmin/sap/sap-deploy.sh` | `https://cbj-kontruksi.com/sap/` |
| SAP Tools Staging | `/home/sadmin/sap` | `/home/sadmin/sap/sap-deploy-staging.sh` | `server-vm` route `http://192.168.10.1/sap-staging/` |
| CBJ Notes | `/home/sadmin/note` | `/home/sadmin/note/deploy.note.sh` | `https://cbj-kontruksi.com/note/` |

## Website Publik + Portal CBJ

Gunakan script portal sebagai default production deploy untuk CBJ utama, karena script ini membawa frontend, backend portal, restart service API, reload nginx, dan health-check.

```bash
cd /home/sadmin/cbj
bash /home/sadmin/cbj/deploy.portal.sh
```

Script ini memakai release directory:

```text
/var/www/prod/releases
/var/www/prod/current
```

Verifikasi:

```bash
curl -I https://cbj-kontruksi.com/
curl -I https://cbj-kontruksi.com/portal
curl -s https://cbj-kontruksi.com/api/health
```

Catatan rollback:

- `deploy.portal.sh` punya rollback otomatis ke release sebelumnya jika health-check gagal.
- Untuk data portal SQLite, pakai runbook disaster recovery: `/home/sadmin/sap/docs/CBJ_DATA_DISASTER_RECOVERY.md`.

## SAP Tools

Deploy staging untuk testing internal sebelum publish:

```bash
cd /home/sadmin/sap
sudo ./sap-deploy-staging.sh
```

Staging deploy memakai:

```text
BASE_PATH=/sap-staging/
DEPLOY_DIR=/var/www/html/sap-staging
```

URL staging:

```text
http://192.168.10.1/sap-staging/
```

This staging route lives on `server-vm`.

Deploy aman dengan backup source sebelum build:

```bash
cd /home/sadmin/sap
sudo DO_BACKUP=1 ./sap-deploy.sh
```

Deploy tanpa backup tambahan:

```bash
cd /home/sadmin/sap
sudo DO_BACKUP=0 ./sap-deploy.sh
```

Backup source manual:

```bash
cd /home/sadmin/sap
sudo ./sap-backup.sh
```

Rollback SAP dari backup source terbaru/terpilih:

```bash
cd /home/sadmin/sap
sudo ./sap-rollback.sh
```

Rollback ke file tertentu:

```bash
sudo /home/sadmin/sap/sap-rollback.sh /home/sadmin/Backup/sap-src/sap-src_YYYYmmdd_HHMMSS.tar.gz
```

Target deploy:

```text
/var/www/html/sap
```

Target staging:

```text
/var/www/html/sap-staging
```

Verifikasi:

```bash
curl -I http://192.168.10.1/sap-staging/
curl -I https://cbj-kontruksi.com/sap/
curl -I http://127.0.0.1/sap/
```

## CBJ Notes

Deploy production:

```bash
cd /home/sadmin/note
bash /home/sadmin/note/deploy.note.sh
```

Script ini membuat release baru, switch symlink, restart `cbj-note-api`, reload nginx, dan health-check `/note/` serta `/api/note/health`.

Target release:

```text
/var/www/note/releases
/var/www/note/current
```

Verifikasi:

```bash
curl -I https://cbj-kontruksi.com/note/
curl -s https://cbj-kontruksi.com/api/note/health
sudo systemctl status cbj-note-api
```

Catatan rollback:

- Belum ada script rollback khusus untuk note.
- Jika deploy note gagal, cek release sebelumnya di `/var/www/note/releases` dan switch manual symlink `/var/www/note/current` hanya setelah tahu release yang benar.
- Backup SQLite note harus diperlakukan sebagai data production terpisah dari frontend release.

## Bersihkan Port Dev

Jangan biarkan Vite dev/preview port terbuka setelah testing. Cek:

```bash
sudo ss -ltnp | rg '5173|5174|5175|5176|5180|5181'
```

Matikan hanya PID Node dev/preview yang jelas milik Vite:

```bash
kill <pid>
```

Production normal harus lewat nginx tanpa port dev:

```text
https://cbj-kontruksi.com/
https://cbj-kontruksi.com/sap/
https://cbj-kontruksi.com/note/
```
