# CBJ Data Disaster Recovery Runbook

Tanggal dibuat: `2026-04-29`

Dokumen ini dibuat agar saat data hilang/korup, operator atau AI berikutnya bisa langsung paham langkah restore tanpa menggali ulang.

## Sumber Data Utama

CBJ Portal production memakai SQLite server-side:

```text
DB production: /var/lib/cbj-portal/cbj.sqlite
Service API:   cbj-portal-api
Frontend:      /var/www/prod/current
Health API:    https://cbj-kontruksi.com/api/health
Portal:        https://cbj-kontruksi.com/portal
```

Jangan menganggap data penting ada di browser/localStorage. Data operasional harus dianggap valid jika tersimpan di DB server.

## Lokasi Script

Script backup/restore disiapkan di:

```text
/home/sadmin/sap/ops/cbj-portal-backup.sh
/home/sadmin/sap/ops/cbj-portal-restore.sh
```

Jika sudah disalin ke server production, lokasi yang disarankan:

```text
/home/sadmin/ops/cbj-portal-backup.sh
/home/sadmin/ops/cbj-portal-restore.sh
```

## Backup Manual

Jalankan di server yang memegang database:

```bash
bash /home/sadmin/ops/cbj-portal-backup.sh
```

Output default:

```text
/home/sadmin/backups/cbj-portal/cbj-portal_YYYYmmdd-HHMMSS.tar.gz
/home/sadmin/backups/cbj-portal/cbj-portal_YYYYmmdd-HHMMSS.tar.gz.sha256
```

Isi backup:

- `cbj.sqlite` hasil backup konsisten via SQLite `VACUUM INTO`
- `db-summary.json` berisi ringkasan user/project untuk validasi cepat
- `manifest.txt`
- salinan `/etc/cbj-portal.env` jika ada
- output `systemctl cat cbj-portal-api` jika service tersedia
- pointer release aktif `/var/www/prod/current` jika tersedia

Retention default: 30 backup terakhir.

## Restore

Restore selalu membuat snapshot DB saat ini terlebih dahulu ke:

```text
/home/sadmin/backups/cbj-portal/pre-restore/
```

Perintah restore:

```bash
BACKUP_TAR=/home/sadmin/backups/cbj-portal/cbj-portal_YYYYmmdd-HHMMSS.tar.gz \
RESTORE_CONFIRM=YES \
bash /home/sadmin/ops/cbj-portal-restore.sh
```

Script restore akan:

1. extract backup ke temp folder
2. snapshot DB current sebelum restore
3. stop service `cbj-portal-api`
4. replace `/var/lib/cbj-portal/cbj.sqlite`
5. hapus WAL/SHM lama
6. start service lagi
7. validasi jumlah user/project

## Checklist Saat Data Hilang

1. Jangan deploy dulu.
2. Jangan hapus file DB/WAL/SHM.
3. Cek health:

```bash
curl -s https://cbj-kontruksi.com/api/health
```

4. Cek backup yang tersedia:

```bash
ls -lh /home/sadmin/backups/cbj-portal/*.tar.gz
```

5. Lihat ringkasan backup:

```bash
tar -xOf /home/sadmin/backups/cbj-portal/cbj-portal_YYYYmmdd-HHMMSS.tar.gz ./db-summary.json
```

6. Pilih backup dengan data paling benar.
7. Restore menggunakan perintah di bagian Restore.
8. Setelah restore, cek:

```bash
curl -s https://cbj-kontruksi.com/api/health
curl -I https://cbj-kontruksi.com/portal
```

9. Login portal dan cek menu Projects.

## Perintah Diagnostik DB

Jalankan di server:

```bash
node -e 'const { DatabaseSync } = require("node:sqlite"); const db = new DatabaseSync("/var/lib/cbj-portal/cbj.sqlite"); console.log({ users: db.prepare("select count(*) count from users").get().count, projects: db.prepare("select count(*) count from projects").get().count });'
```

Ringkasan lebih lengkap:

```bash
node -e 'const { DatabaseSync } = require("node:sqlite"); const db = new DatabaseSync("/var/lib/cbj-portal/cbj.sqlite"); const users=db.prepare("select id,email,role,status,last_login_at from users order by email").all(); const projects=db.prepare("select payload from projects").all().map(r=>JSON.parse(r.payload)); console.log(JSON.stringify({users, projectCount:projects.length, totalValue:projects.reduce((s,p)=>s+Number(p.projectValue||0),0), totalPaid:projects.reduce((s,p)=>s+Number(p.paidAmount||0),0)}, null, 2));'
```

## Jadwal Backup Otomatis Yang Disarankan

Cron user `sadmin`:

```cron
15 2 * * * /bin/bash /home/sadmin/ops/cbj-portal-backup.sh >> /home/sadmin/backups/cbj-portal/backup.log 2>&1
```

Artinya backup dibuat setiap hari jam 02:15 waktu server.

## Catatan Amandapay

Amandapay sudah punya script terpisah:

```text
/home/sadmin/amandapay/scripts/backup/backup.sh
/home/sadmin/amandapay/scripts/backup/restore.sh
```

Env saat dokumen dibuat menunjukkan Amandapay memakai MySQL:

```text
DB_CLIENT=mysql2
DB_HOST=127.0.0.1
DB_NAME=amandapay
DB_USER=amandapay
```

Jadi backup Amandapay harus memakai script Amandapay atau `mysqldump`, bukan script SQLite CBJ.

## Prinsip Keamanan Data

- Jangan hard delete data penting. Gunakan archive/inactive.
- Backup sebelum deploy besar.
- Backup sebelum restore.
- Simpan minimal 30 snapshot harian.
- Jangan upload file backup ke tempat publik karena bisa mengandung data project dan credential env.
- Setelah restore, verifikasi lewat DB count dan login portal.

## Instruksi Untuk AI Berikutnya

Jika user meminta restore data CBJ:

1. Baca dokumen ini.
2. Jangan langsung restore sebelum melihat backup mana yang benar.
3. Cek `db-summary.json` dari beberapa backup terbaru.
4. Buat snapshot current DB dulu. Script restore sudah melakukan ini.
5. Jalankan restore hanya jika user sudah memilih backup atau kondisi jelas.
6. Setelah restore, cek API health dan login portal.
