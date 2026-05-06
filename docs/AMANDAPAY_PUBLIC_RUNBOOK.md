# Amandapay Public Runbook

Tanggal go-live: `2026-04-29`

## URL

```text
App: https://cbj-kontruksi.com/amandapay/
API: https://cbj-kontruksi.com/amandapay/api/health
```

## Production

```text
Source:      /home/sadmin/amandapay
Webroot:     /var/www/html/amandapay
Service:     amandapay-api
API listen:  127.0.0.1:8789
Env:         /etc/amandapay-api.env
DB:          /var/lib/amandapay/amandapay.sqlite
DB driver:   node:sqlite
```

Nginx route di `/etc/nginx/conf.d/443-cbj.conf`:

```text
/amandapay/      -> /var/www/html/amandapay
/amandapay/api/  -> http://127.0.0.1:8789/api/
```

## Credential

Credential production tidak ditulis di dokumen publik ini.

Lihat dokumen private:

```text
/home/sadmin/sap/docs/AMANDAPAY_PUBLIC_PRIVATE.md
```

## Deploy Ulang

Build dari local:

```bash
cd /home/sadmin/amandapay
npm --workspace @amandapay/web run build
```

Upload source dan dist ke VPS, lalu restart service. Pastikan env production tetap memakai:

```text
PORT=8789
HOST=127.0.0.1
DB_CLIENT=node-sqlite
DB_FILENAME=/var/lib/amandapay/amandapay.sqlite
```

## Health Check

```bash
curl -s https://cbj-kontruksi.com/amandapay/api/health
curl -I https://cbj-kontruksi.com/amandapay/
sudo systemctl status amandapay-api
```

## Backup

Script production:

```text
/home/sadmin/ops/amandapay-backup.sh
/home/sadmin/ops/amandapay-restore.sh
```

Manual backup:

```bash
bash /home/sadmin/ops/amandapay-backup.sh
```

Output:

```text
/home/sadmin/backups/amandapay-public/amandapay_YYYYmmdd-HHMMSS.tar.gz
```

Isi backup:

- `amandapay.sqlite`
- `db-summary.json`
- `manifest.txt`
- `systemd-amandapay-api.txt` jika service bisa dibaca

Catatan: `/etc/amandapay-api.env` permission-nya `600 root`, jadi backup harian user `sadmin` tidak menyalin env private. Credential production tetap dicatat di dokumen private lokal.

Restore:

```bash
BACKUP_TAR=/home/sadmin/backups/amandapay-public/amandapay_YYYYmmdd-HHMMSS.tar.gz \
RESTORE_CONFIRM=YES \
bash /home/sadmin/ops/amandapay-restore.sh
```

Restore script membuat snapshot DB saat ini dulu di:

```text
/home/sadmin/backups/amandapay-public/pre-restore/
```

## Cron Backup

Jadwal yang disarankan:

```cron
35 2 * * * /bin/bash /home/sadmin/ops/amandapay-backup.sh >> /home/sadmin/backups/amandapay-public/backup.log 2>&1
```

## Catatan Teknis

- Amandapay tidak memakai MySQL di public saat go-live ini.
- Driver `sqlite3` native tidak dipakai karena binary npm tidak kompatibel dengan GLIBC AlmaLinux public.
- Backend memakai `node:sqlite` bawaan Node 22.
- Data tersimpan server-side, bukan di browser.
