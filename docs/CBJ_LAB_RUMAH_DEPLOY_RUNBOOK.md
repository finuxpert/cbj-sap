# CBJ Lab Rumah Deploy Runbook

Tanggal update: `2026-05-06`

Dokumen ini untuk alur deploy/test aplikasi CBJ di `lab-rumah` / `svr-01` sebelum dipromosikan ke public production.

## Akses Server

Dari `web-dev`, naik root lalu SSH ke `lab-rumah`:

```bash
sudo -i
ssh lab-rumah
```

Host tujuan:

```text
hostname: sadmin-HP-280-G2-MT-Legacy
ip LAN:   192.168.30.59
user:     sadmin
```

Jika dari user biasa tidak resolve, gunakan jalur root `web-dev` seperti di atas.

## Sharefile / Nextcloud

URL folder:

```text
https://sharefile.cbj-kontruksi.com/apps/files/files/116?dir=/CBJ%20Server%20Data
```

Catatan:

- URL ini butuh login Nextcloud; tanpa sesi login responsnya `401`.
- Untuk otomasi download/upload folder nanti, siapkan salah satu:
  - public share link khusus folder yang memang boleh diakses script, atau
  - Nextcloud WebDAV credential/app password.
- Untuk workflow manual sekarang: download ZIP folder codingan dari browser, upload ke ChatGPT untuk review/improvement, lalu upload ZIP hasilnya ke `lab-rumah`.

## App Dev Yang Aktif

Source project di `lab-rumah`:

```text
/home/sadmin/cbj
/home/sadmin/sap
/home/sadmin/note
/home/sadmin/postman
/home/sadmin/amandapay
/home/sadmin/st03n-api
```

Target static dev nginx:

```text
/var/www/svr01-dev/cbj
/var/www/svr01-dev/sap
/var/www/svr01-dev/note
/var/www/svr01-dev/postman
/var/www/svr01-dev/amandapay
```

Route dev:

```text
https://dev.cbj-kontruksi.com/
https://sapdev.cbj-kontruksi.com/
https://note-dev.cbj-kontruksi.com/note/
https://postman-dev.cbj-kontruksi.com/
https://amandapay-dev.cbj-kontruksi.com/
```

Service/container yang perlu diperhatikan:

```bash
systemctl status cbj-note-api
docker ps
```

Saat dokumen ini dibuat:

- `cbj-note-api` aktif di `127.0.0.1:8788`.
- `note-dev` nginx sudah proxy `/api/note/` ke `127.0.0.1:8788`.
- Docker aktif: `nextcloud-app`, `nextcloud-db`, `n8n`, `trading-api`.

## Pola Deploy Dev Dari ZIP

Gunakan pola ini untuk testing hasil codingan sebelum public deploy.

1. Upload ZIP hasil codingan ke `lab-rumah`, contoh:

```text
/home/sadmin/incoming/cbj.zip
/home/sadmin/incoming/note.zip
```

2. Backup source lama sebelum overwrite:

```bash
APP=note
TS=$(date +%Y%m%d-%H%M%S)
mkdir -p /home/sadmin/backups/source
tar -czf /home/sadmin/backups/source/${APP}-source_${TS}.tar.gz -C /home/sadmin ${APP}
```

3. Extract ZIP ke staging sementara:

```bash
APP=note
ZIP=/home/sadmin/incoming/note.zip
TMP=/tmp/${APP}-deploy
rm -rf "$TMP"
mkdir -p "$TMP"
unzip -q "$ZIP" -d "$TMP"
```

4. Pastikan root project yang benar. Jika ZIP berisi folder tunggal, masuk ke folder itu:

```bash
find "$TMP" -maxdepth 2 -name package.json -print
```

5. Sync source baru ke `/home/sadmin/<app>`:

```bash
APP=note
SRC=/tmp/note-deploy/note
rsync -av --delete \
  --exclude node_modules \
  --exclude dist \
  --exclude .git \
  "$SRC"/ "/home/sadmin/${APP}"/
```

6. Install dependency dan build:

```bash
cd /home/sadmin/note
npm install
npm run build
```

7. Deploy static `dist/` ke target dev:

```bash
APP=note
TARGET=/var/www/svr01-dev/note
sudo rsync -av --delete /home/sadmin/${APP}/dist/ "$TARGET"/
sudo chown -R www-data:www-data "$TARGET"
sudo find "$TARGET" -type d -exec chmod 755 {} \;
sudo find "$TARGET" -type f -exec chmod 644 {} \;
sudo nginx -t
sudo systemctl reload nginx
```

8. Jika app punya API, restart service terkait:

```bash
sudo systemctl restart cbj-note-api
sudo systemctl is-active cbj-note-api
```

## App-Specific Notes

### CBJ Website / Portal Dev

Source:

```text
/home/sadmin/cbj
```

Target:

```text
/var/www/svr01-dev/cbj
```

Build:

```bash
cd /home/sadmin/cbj
npm install
VITE_BASE=/ npm run build
sudo rsync -av --delete dist/ /var/www/svr01-dev/cbj/
```

Verifikasi:

```bash
curl -I https://dev.cbj-kontruksi.com/
```

### SAP Dev

Source:

```text
/home/sadmin/sap
```

Target:

```text
/var/www/svr01-dev/sap
```

Catatan: `vite.config.js` saat ini memakai `base: '/sap/'`. Untuk subdomain `sapdev.cbj-kontruksi.com`, base yang lebih tepat adalah `/` atau nginx harus melayani `/sap/`.

Verifikasi:

```bash
curl -I https://sapdev.cbj-kontruksi.com/
```

### Notes Dev

Source:

```text
/home/sadmin/note
```

Target:

```text
/var/www/svr01-dev/note
```

Service:

```text
cbj-note-api -> 127.0.0.1:8788
```

Nginx:

```text
/api/note/ -> http://127.0.0.1:8788/api/note/
/        -> redirect https://$host/note/
```

Verifikasi:

```bash
curl -I https://note-dev.cbj-kontruksi.com/
curl -I https://note-dev.cbj-kontruksi.com/note/
curl -s https://note-dev.cbj-kontruksi.com/api/note/health
```

Login seed:

```text
admin@cbj-kontruksi.com / CBJAdmin2026!
```

### Postman Dev

Source:

```text
/home/sadmin/postman
```

Target:

```text
/var/www/svr01-dev/postman
```

Catatan: `vite.config.js` saat ini memakai `base: '/postman/'`. Untuk subdomain `postman-dev.cbj-kontruksi.com`, base yang lebih tepat adalah `/` atau nginx harus melayani `/postman/`.

### Amandapay Dev

Source:

```text
/home/sadmin/amandapay
```

Target static:

```text
/var/www/svr01-dev/amandapay
```

Build web:

```bash
cd /home/sadmin/amandapay
npm install
npm run build
```

Perlu cek API/backend terpisah sebelum overwrite karena repo ini monorepo dan punya script deploy sendiri.

## Rollback Dev

Rollback source:

```bash
APP=note
BACKUP=/home/sadmin/backups/source/note-source_YYYYmmdd-HHMMSS.tar.gz
rm -rf /home/sadmin/${APP}.rollback-tmp
mkdir -p /home/sadmin/${APP}.rollback-tmp
tar -xzf "$BACKUP" -C /home/sadmin/${APP}.rollback-tmp
rsync -av --delete /home/sadmin/${APP}.rollback-tmp/${APP}/ /home/sadmin/${APP}/
```

Build ulang dan deploy lagi ke target dev:

```bash
cd /home/sadmin/note
npm install
npm run build
sudo rsync -av --delete dist/ /var/www/svr01-dev/note/
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl restart cbj-note-api || true
```

Untuk static target saja, simpan snapshot sebelum rsync:

```bash
APP=note
TS=$(date +%Y%m%d-%H%M%S)
sudo mkdir -p /home/sadmin/backups/static
sudo tar -czf /home/sadmin/backups/static/${APP}-static_${TS}.tar.gz -C /var/www/svr01-dev ${APP}
```

## Health Check Umum

Jalankan dari `web-dev`:

```bash
curl -I https://dev.cbj-kontruksi.com/
curl -I https://sapdev.cbj-kontruksi.com/
curl -I https://note-dev.cbj-kontruksi.com/note/
curl -s https://note-dev.cbj-kontruksi.com/api/note/health
curl -I https://postman-dev.cbj-kontruksi.com/
curl -I https://amandapay-dev.cbj-kontruksi.com/
```

Jalankan di `lab-rumah`:

```bash
sudo nginx -t
systemctl status cbj-note-api --no-pager -l
docker ps
ss -ltnp
```

## Rencana Script Berikutnya

Script yang disarankan dibuat berikutnya:

```text
/home/sadmin/ops/lab-dev-deploy.sh
/home/sadmin/ops/lab-dev-backup.sh
/home/sadmin/ops/lab-dev-rollback.sh
```

Target fitur:

- pilih app: `cbj`, `sap`, `note`, `postman`, `amandapay`
- input ZIP atau folder source
- backup source dan static target otomatis
- install dependency dan build
- deploy `dist/` ke `/var/www/svr01-dev/<app>`
- restart service API jika app membutuhkannya
- health-check route dev
- rollback source/static dari backup terakhir

Untuk public production, tetap pisahkan dari dev. Public deploy mengacu ke:

```text
/home/sadmin/sap/docs/CBJ_DEPLOY_BACKUP_ROLLBACK_RUNBOOK.md
```
