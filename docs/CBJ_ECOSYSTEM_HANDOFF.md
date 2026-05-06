# CBJ Ecosystem Handoff

Dokumen ini dipakai sebagai lemparan kerja untuk Codex berikutnya agar tidak perlu menggali ulang status aplikasi CBJ satu per satu.

Tanggal referensi: `2026-05-01`

## Ringkasan

Ekosistem CBJ yang aktif saat ini:

- website publik/company profile: `https://cbj-kontruksi.com/`
- portal internal CBJ: `https://cbj-kontruksi.com/login` dan `https://cbj-kontruksi.com/portal`
- portal API: `https://cbj-kontruksi.com/api/*`
- webmail live: `https://cbj-kontruksi.com/webmail/`
- notes app: `https://cbj-kontruksi.com/note/`
- notes API: `https://cbj-kontruksi.com/api/note/*`
- SAP tools: `https://cbj-kontruksi.com/sap/`
- Amandapay live: `https://cbj-kontruksi.com/amandapay/`
- Amandapay API: `https://cbj-kontruksi.com/amandapay/api/*`

Semua area di atas sudah live di production.

## Naming Node

Istilah yang dipakai di dokumentasi ini:

- `server-public`: VPS public production
- `server-pc`: PC fisik di rumah yang dijadikan server
- `server-vm`: VirtualBox VM di jaringan lokal, termasuk route `192.168.10.1`

Nama ini dipakai supaya penyebutan konsisten di runbook, SSH alias, dan diskusi operasional.

Catatan browser admin:

- `webminpc.cbj-kontruksi.com` diarahkan ke reverse proxy nginx di `server-pc`
- origin Webmin tetap `https://127.0.0.1:10000`
- Cloudflare Tunnel boleh mengarah ke `http://localhost:80` selama vhost `webminpc` dipakai

## Status Singkat

| App | Status | Route Utama | Health / Catatan |
|---|---|---|---|
| Website publik CBJ | Live | `https://cbj-kontruksi.com/` | Frontend production di `/var/www/prod/current` |
| Portal internal CBJ | Live | `https://cbj-kontruksi.com/login` dan `/portal` | API: `https://cbj-kontruksi.com/api/health` |
| Webmail CBJ | Live | `https://cbj-kontruksi.com/webmail/` | SnappyMail theme `CBJ` aktif |
| CBJ Notes | Live | `https://cbj-kontruksi.com/note/` | API: `https://cbj-kontruksi.com/api/note/health` |
| SAP Tools | Live | `https://cbj-kontruksi.com/sap/` | Static app di `/var/www/html/sap` |
| Amandapay | Live | `https://cbj-kontruksi.com/amandapay/` | API: `https://cbj-kontruksi.com/amandapay/api/health` |

## Next Step Checklist

Checklist prioritas setelah reset limit:

1. Cek live route utama:
   - `https://cbj-kontruksi.com/`
   - `https://cbj-kontruksi.com/login`
   - `https://cbj-kontruksi.com/portal`
   - `https://cbj-kontruksi.com/webmail/`
   - `https://cbj-kontruksi.com/note/`
   - `https://cbj-kontruksi.com/sap/`
   - `https://cbj-kontruksi.com/amandapay/`
2. Cek health API:
   - `https://cbj-kontruksi.com/api/health`
   - `https://cbj-kontruksi.com/api/note/health`
   - `https://cbj-kontruksi.com/amandapay/api/health`
3. Review visual kecil-kecil homepage:
   - hero
   - trust cards
   - contact panel
   - spacing mobile
4. Lanjut integrasi `Portal Mail CBJ` bila mau diarahkan ke mailbox real
5. Siapkan hardening production:
   - backup rutin
   - audit log
   - password/reset flow admin
   - monitoring service

## Handoff Cepat

Kalau Codex berikut butuh start paling cepat:

1. baca file ini
2. baca:
   - `/home/sadmin/sap/docs/MAIL_SERVER_WEBMAIL_RUNBOOK.md`
   - `/home/sadmin/sap/docs/CBJ_DATA_DISASTER_RECOVERY.md`
   - `/home/sadmin/sap/docs/CBJ_DEPLOY_BACKUP_ROLLBACK_RUNBOOK.md`
   - `/home/sadmin/sap/docs/AMANDAPAY_PUBLIC_RUNBOOK.md`
   - `/home/sadmin/cbj/README.md`
   - `/home/sadmin/note/README.md`
3. bila kerja website/portal:
   - masuk ke `/home/sadmin/cbj`
4. bila kerja notes:
   - masuk ke `/home/sadmin/note`
5. bila kerja SAP tools:
   - masuk ke `/home/sadmin/sap`
   - testing dulu pakai `sudo ./sap-deploy-staging.sh`
   - publish production pakai `sudo DO_BACKUP=1 ./sap-deploy.sh`
6. bila kerja mail/webmail:
   - pakai runbook mail sebagai sumber utama
7. bila kerja Amandapay:
   - masuk ke `/home/sadmin/amandapay`
   - pakai `/home/sadmin/sap/docs/AMANDAPAY_PUBLIC_RUNBOOK.md`

## Link Login User

Daftar link login yang perlu dicatat untuk user:

- website publik: `https://cbj-kontruksi.com/`
- login portal internal CBJ: `https://cbj-kontruksi.com/login`
- portal internal setelah login: `https://cbj-kontruksi.com/portal`
- webmail / mail login: `https://cbj-kontruksi.com/webmail/`
- notes app login: `https://cbj-kontruksi.com/note/`
- SAP tools: `https://cbj-kontruksi.com/sap/`
- Amandapay login: `https://cbj-kontruksi.com/amandapay/`

| Area | URL | Jenis Akun | Keterangan |
|---|---|---|---|
| Website publik | `https://cbj-kontruksi.com/` | Tidak perlu login | Landing page / company profile utama |
| Portal login | `https://cbj-kontruksi.com/login` | Akun portal internal | Titik masuk user `admin` dan `finance` |
| Portal internal | `https://cbj-kontruksi.com/portal` | Session portal aktif | Akan redirect / minta login jika belum ada session |
| Webmail | `https://cbj-kontruksi.com/webmail/` | Akun mailbox/email | Login memakai mailbox seperti `info@cbj-kontruksi.com`, bukan akun portal |
| Notes app | `https://cbj-kontruksi.com/note/` | Akun note / internal | Area catatan internal, punya login sendiri |
| SAP tools | `https://cbj-kontruksi.com/sap/` | Sesuai proteksi nginx jika aktif | Tools Basis/internal |
| Amandapay | `https://cbj-kontruksi.com/amandapay/` | Owner Amandapay | Login owner, credential di dokumen private |

Catatan:

- route `/portal/*` akan meminta login jika session belum ada
- route `/note/` memakai login internal note app
- webmail memakai login mailbox/email, bukan login portal
- route `/amandapay/` memakai login owner Amandapay

## Server Production

- host: `103.49.238.87`
- domain utama: `cbj-kontruksi.com`
- user operasional: `sadmin`
- role/nama: `server-public`

Path penting production:

- website/portal frontend release: `/var/www/prod/releases`
- symlink live website/portal: `/var/www/prod/current`
- portal env: `/etc/cbj-portal.env`
- portal DB SQLite: `/var/lib/cbj-portal/cbj.sqlite`
- note env: `/etc/cbj-note.env` jika dipakai
- note DB SQLite: path ditentukan env/service note
- SAP tools webroot: `/var/www/html/sap`
- SAP staging webroot: `/var/www/html/sap-staging`
- SAP source backup root: `/home/sadmin/Backup/sap-src`
- staging route jalan di `server-vm`
- Amandapay env: `/etc/amandapay-api.env`
- Amandapay DB SQLite: `/var/lib/amandapay/amandapay.sqlite`
- theme SnappyMail live: `/var/www/snappymail/themes/CBJ/styles.css`

## App 1: Website Publik + Portal Internal

Source local:

- root project: `/home/sadmin/cbj`

Route publik:

- `/`

Route portal:

- `/login`
- `/portal`
- `/portal/mail`
- `/portal/projects`
- `/portal/projects/:id`
- `/portal/security`
- `/portal/users`

Status saat ini:

- sudah live
- auth portal sudah terintegrasi ke backend production
- data project sudah terpusat di SQLite production
- fallback `localStorage` untuk production sudah dimatikan agar data tidak bercabang per browser
- role separation yang berlaku:
  - `admin`: full CRUD project + users + akses portal penuh
  - `finance`: akses dashboard, mail, lihat project, update pembayaran/status/catatan finance

Catatan penting:

- modul `Mail CBJ` di portal belum full terintegrasi ke mail backend real; masih bridge/UI portal
- login portal live bukan dummy
- admin project CRUD sudah pernah diuji live dan jalan
- role akun `finance@cbj-kontruksi.com` sudah dikoreksi ke `finance`

Backend portal:

- service name: `cbj-portal-api`
- endpoint health: `https://cbj-kontruksi.com/api/health`
- storage: SQLite
- runbook backend/session/rate limit: `/home/sadmin/sap/docs/CBJ_PORTAL_BACKEND_RUNBOOK.md`

Operational auth:

- login gagal dibatasi `8` percobaan per kombinasi `IP + email` dalam `15 menit`
- jika user ke-lock karena salah password, opsi normal adalah tunggu `15 menit`
- jika urgent, reset counter rate limit dengan restart service:

```bash
sudo systemctl restart cbj-portal-api
```

- restart service tidak menghapus data user/project/session SQLite
- untuk paksa semua user login ulang, hapus isi table `sessions`, bukan table `users`

Deploy portal:

- script local: `/home/sadmin/cbj/deploy.portal.sh`
- build command:

```bash
cd /home/sadmin/cbj
npm run build
```

- deploy command:

```bash
bash /home/sadmin/cbj/deploy.portal.sh
```

Verifikasi minimal setelah deploy:

```bash
curl -I https://cbj-kontruksi.com/
curl -I https://cbj-kontruksi.com/portal
curl -s https://cbj-kontruksi.com/api/health
```

Catatan deploy:

- Untuk production website/portal, gunakan `/home/sadmin/cbj/deploy.portal.sh`.
- `deploy.sh` adalah deploy static website lama; jangan jadikan default jika perubahan menyentuh portal/API.

## App 2: Webmail / Mail Server

Dokumen utama:

- `/home/sadmin/sap/docs/MAIL_SERVER_WEBMAIL_RUNBOOK.md`
- `/home/sadmin/sap/docs/MAIL_SERVER_WEBMAIL_PRIVATE.md`

Status saat ini:

- webmail live di `https://cbj-kontruksi.com/webmail/`
- SnappyMail theme `CBJ` sudah dipoles agar selaras dengan portal
- display name `info@cbj-kontruksi.com` sudah diarahkan ke `PT Cakrabuana Bangun Jaya`
- compose default disetel ke `Plain` karena terbukti membantu inbox placement awal
- PTR/rDNS `103.49.238.87 -> mail.cbj-kontruksi.com` sudah benar
- SPF/DKIM/DMARC pernah diverifikasi `PASS` pada header Gmail

Catatan penting deliverability:

- penyebab spam yang dominan terakhir bukan autentikasi, tetapi reputasi sender + pola isi email
- compose `Plain` lebih aman daripada HTML compose untuk warming awal
- email test yang natural sudah berhasil masuk inbox

Komponen mail stack yang terdokumentasi:

- Postfix
- Dovecot
- OpenDKIM
- Rspamd
- Redis
- SnappyMail
- Nginx
- PHP-FPM

Hal yang belum selesai:

- integrasi penuh `Portal Mail CBJ` dengan mailbox real masih belum final
- jika Codex berikut ingin menyambungkan portal mail ke mail server, cek dulu flow session/auth webmail existing

## App 3: CBJ Notes

Source local:

- root project: `/home/sadmin/note`

Route live:

- `https://cbj-kontruksi.com/note/`
- `https://cbj-kontruksi.com/api/note/health`

Status saat ini:

- sudah live
- frontend React + API note sudah berjalan
- import `.txt` dan `.md` sudah ada
- export `.md` sudah ada
- PDF masih via print-friendly browser, bukan server-side generator

Deploy note:

- script local: `/home/sadmin/note/deploy.note.sh`

Build/deploy:

```bash
cd /home/sadmin/note
npm run build
bash /home/sadmin/note/deploy.note.sh
```

Catatan penting:

- route `/note/` sempat error karena nginx exact route salah, lalu sudah diperbaiki
- frontend note sempat white screen karena `React.StrictMode` tanpa import React di `main.jsx`, lalu sudah diperbaiki

## App 4: SAP Tools

Source local:

- root project: `/home/sadmin/sap`

Route live:

- `https://cbj-kontruksi.com/sap/`
- `server-vm` route: `http://192.168.10.1/sap/`
- `server-vm` route: `http://192.168.10.1/sap-staging/`

Status saat ini:

- sudah live
- frontend React/Vite static app disajikan dari `/var/www/html/sap`
- build base path `/sap/`
- dashboard home terakhir dipoles pada `2026-05-01`

Deploy SAP:

Staging/testing:

```bash
cd /home/sadmin/sap
sudo ./sap-deploy-staging.sh
```

Production/public:

```bash
cd /home/sadmin/sap
sudo DO_BACKUP=1 ./sap-deploy.sh
```

Backup SAP source:

```bash
cd /home/sadmin/sap
sudo ./sap-backup.sh
```

Rollback SAP:

```bash
cd /home/sadmin/sap
sudo ./sap-rollback.sh
```

Dokumen utama:

- `/home/sadmin/sap/README.md`
- `/home/sadmin/sap/documentation.txt`
- `/home/sadmin/sap/docs/CBJ_DEPLOY_BACKUP_ROLLBACK_RUNBOOK.md`

Verifikasi minimal:

```bash
curl -I http://192.168.10.1/sap-staging/
curl -I https://cbj-kontruksi.com/sap/
curl -I http://127.0.0.1/sap/
```

Catatan penting:

- Jangan tinggalkan Vite dev/preview port terbuka setelah testing.
- Production harus diakses lewat nginx `/sap/`, bukan port `5173` dan sejenisnya.
- Untuk uji coding ChatGPT/Codex, gunakan `/sap-staging/` sampai user menyetujui publish.

## App 5: Amandapay

Source local:

- root project: `/home/sadmin/amandapay`

Route live:

- `https://cbj-kontruksi.com/amandapay/`
- `https://cbj-kontruksi.com/amandapay/api/health`

Status saat ini:

- sudah live di production
- frontend React SPA disajikan dari `/var/www/html/amandapay`
- API service: `amandapay-api`
- API listen: `127.0.0.1:8789`
- Nginx route:
  - `/amandapay/` ke SPA
  - `/amandapay/api/` ke API Amandapay
- DB production: `/var/lib/amandapay/amandapay.sqlite`
- DB driver: `node:sqlite`
- auth owner aktif
- credential owner disimpan di dokumen private:
  `/home/sadmin/sap/docs/AMANDAPAY_PUBLIC_PRIVATE.md`

Catatan penting:

- Amandapay public tidak memakai MySQL pada go-live ini.
- Driver npm `sqlite3` native dihindari karena gagal di AlmaLinux public akibat mismatch GLIBC.
- Backend sudah disesuaikan agar memakai `node:sqlite` bawaan Node 22.
- Data tersimpan server-side di SQLite, bukan browser/localStorage.

Dokumen utama:

- `/home/sadmin/sap/docs/AMANDAPAY_PUBLIC_RUNBOOK.md`
- `/home/sadmin/sap/docs/AMANDAPAY_PUBLIC_PRIVATE.md`

Backup Amandapay:

- script backup VPS: `/home/sadmin/ops/amandapay-backup.sh`
- script restore VPS: `/home/sadmin/ops/amandapay-restore.sh`
- backup root: `/home/sadmin/backups/amandapay-public`
- cron harian:

```cron
35 2 * * * /bin/bash /home/sadmin/ops/amandapay-backup.sh >> /home/sadmin/backups/amandapay-public/backup.log 2>&1
```

Verifikasi minimal:

```bash
curl -I https://cbj-kontruksi.com/amandapay/
curl -s https://cbj-kontruksi.com/amandapay/api/health
sudo systemctl status amandapay-api
```

## Data Protection / Backup

CBJ Portal:

- DB: `/var/lib/cbj-portal/cbj.sqlite`
- backup script: `/home/sadmin/ops/cbj-portal-backup.sh`
- restore script: `/home/sadmin/ops/cbj-portal-restore.sh`
- backup root: `/home/sadmin/backups/cbj-portal`
- runbook: `/home/sadmin/sap/docs/CBJ_DATA_DISASTER_RECOVERY.md`
- cron harian:

```cron
15 2 * * * /bin/bash /home/sadmin/ops/cbj-portal-backup.sh >> /home/sadmin/backups/cbj-portal/backup.log 2>&1
```

Amandapay:

- DB: `/var/lib/amandapay/amandapay.sqlite`
- backup script: `/home/sadmin/ops/amandapay-backup.sh`
- restore script: `/home/sadmin/ops/amandapay-restore.sh`
- backup root: `/home/sadmin/backups/amandapay-public`
- runbook: `/home/sadmin/sap/docs/AMANDAPAY_PUBLIC_RUNBOOK.md`

Restore penting:

- restore script selalu membuat snapshot DB saat ini terlebih dahulu sebelum overwrite.
- jangan restore sebelum cek isi `db-summary.json` pada backup yang dipilih.

## UI/UX State Saat Ini

Website publik:

- homepage sudah dipoles ke arah lebih premium, responsive, dan conversion-oriented
- hero, trust cards, CTA, panel kanan, contact section, dan navbar sudah beberapa kali di-refine
- pass terakhir fokus ke:
  - hierarchy hero
  - proof cards
  - panel kontak
  - trust cards hero
  - wording proses/testimonial

Portal/login:

- login portal sudah diselaraskan dengan branding utama CBJ
- portal shell, dashboard, dan beberapa area mail/projects sudah dirapikan

Webmail:

- theme `CBJ` sudah dipoles agar terasa lebih modern dan lebih dekat ke workspace internal

Catatan:

- jika Codex berikut lanjut polish visual, jangan ubah struktur besar tanpa cek live dulu
- lebih aman lakukan pass kecil, lalu build + deploy + cek browser

## Data Perusahaan Yang Harus Konsisten

- nama: `PT Cakrabuana Bangun Jaya`
- website: `https://cbj-kontruksi.com`
- email resmi: `info@cbj-kontruksi.com`
- WhatsApp / Telepon: `0895-3222-61456`
- NIB: `1104250000603`
- area layanan utama: `Jakarta dan Jabodetabek`
- alamat:
  `Jalan Pondok Kopi Raya, Ruko Malaka Country Estate Blok A/15, Pondok Kopi, Duren Sawit, Jakarta Timur 13460`

## Akun Yang Pernah Dipakai

Portal:

- admin: `admin@cbj-kontruksi.com`
- finance: `finance@cbj-kontruksi.com`

Catatan:

- password default yang pernah dipakai di development/production handoff:
  - `CBJAdmin2026!`
  - `CBJFinance2026!`
- tetapi jangan anggap password live production masih sama tanpa verifikasi ulang

## Backup / Artefak

Backup production portal yang pernah disimpan local:

- `/home/sadmin/sap/backups/cbj-portal/cbj-portal-prod-20260424-162034.tar.gz`

Isi backup mencakup:

- `/var/lib/cbj-portal`
- `/etc/cbj-portal.env`
- nginx config terkait
- systemd service portal

## Kebiasaan Verifikasi Yang Disarankan

Setelah perubahan website/portal:

```bash
cd /home/sadmin/cbj
npm run lint
npm run build
bash /home/sadmin/cbj/deploy.portal.sh
```

Setelah perubahan SAP tools:

```bash
cd /home/sadmin/sap
npm run build
sudo ./sap-deploy-staging.sh
```

Jika staging sudah disetujui, publish production:

```bash
cd /home/sadmin/sap
sudo DO_BACKUP=1 ./sap-deploy.sh
```

Setelah perubahan note:

```bash
cd /home/sadmin/note
npm run build
bash /home/sadmin/note/deploy.note.sh
```

Smoke check:

```bash
curl -I https://cbj-kontruksi.com/
curl -I https://cbj-kontruksi.com/portal
curl -s https://cbj-kontruksi.com/api/health
curl -I https://cbj-kontruksi.com/note/
curl -s https://cbj-kontruksi.com/api/note/health
curl -I http://192.168.10.1/sap-staging/
curl -I https://cbj-kontruksi.com/sap/
curl -I https://cbj-kontruksi.com/webmail/
```

## Fokus Yang Masih Layak Dilanjutkan

Urutan paling masuk akal untuk Codex berikut:

1. polish visual kecil-kecil lintas homepage agar semakin konsisten
2. integrasi `Portal Mail CBJ` ke mail backend real atau bridge session yang lebih rapi
3. hardening portal production:
   - backup rutin
   - audit log
   - reset password/admin flow
   - monitoring service
4. notes app:
   - folder/kategori lebih matang
   - export/import lebih lengkap
   - PDF export yang lebih rapi bila benar-benar dibutuhkan

## Roadmap Development Berikutnya

Supaya sisa pekerjaan lebih terarah, ini pembagian practical next step:

### 1. Backend / Security Hardening

Prioritas tinggi jika targetnya production yang lebih aman:

1. tambah rate limiting untuk login portal dan login notes
2. review semua endpoint untuk validasi input yang lebih ketat
3. audit query SQLite dan pastikan semua tetap lewat prepared statement
4. tambah audit log untuk:
   - login gagal
   - perubahan user
   - create/edit/delete project
   - payment update
5. tambah reset password / admin-managed password flow
6. siapkan backup rutin untuk SQLite portal dan notes
7. tambah monitoring service + restart alert

### 2. Portal Internal CBJ

Prioritas tinggi jika targetnya aplikasi kerja harian:

1. rapikan UX project finance:
   - notifikasi sukses/gagal yang lebih jelas
   - edit histori pembayaran
   - filter overdue yang lebih tajam
   - print/export recap yang lebih rapi
2. lanjut users management:
   - change password by admin
   - disable user / status nonaktif
   - proteksi admin utama lebih ketat
3. lanjut dashboard:
   - summary overdue yang lebih kuat
   - queue follow-up finance
   - reminder jatuh tempo

### 3. Mail / Webmail Integration

Prioritas tinggi jika ingin ekosistem benar-benar nyambung:

1. tentukan arah final:
   - embed/bridge SnappyMail
   - atau integrasi backend mail sendiri
2. rapikan session flow antara portal dan webmail
3. buat quick actions mail dari portal yang benar-benar berguna
4. kalau perlu, sinkronkan akun portal dan mailbox secara lebih rapi

### 4. Frontend / UX Polish

Prioritas menengah, tapi impact besar ke kualitas:

1. pass visual kecil-kecil lintas homepage:
   - hero
   - proof cards
   - trust cards
   - contact panel
   - footer
2. pass visual portal:
   - dashboard hierarchy
   - project table density
   - mail panel consistency
3. pass visual notes:
   - category/tag UX
   - editor comfort
   - print/PDF layout

### 5. Notes App

Prioritas menengah jika notes akan dipakai serius:

1. tambah kategori/folder handoff, runbook, ops, finance
2. tambah master index note
3. tambah export/import batch yang lebih nyaman
4. tambah quick templates:
   - deploy
   - incident
   - finance follow-up
   - mail troubleshooting

### 6. Urutan Rekomendasi

Kalau harus memilih urutan paling efisien:

1. backend/security hardening dasar
2. portal finance workflow
3. mail integration
4. frontend polish lanjutan
5. notes improvement

### 7. Rekomendasi Praktis Setelah Reset Limit

Kalau ingin cepat dan aman:

1. mulai dari audit security ringan portal + notes
2. setelah itu kerjakan `reset/change password` flow
3. lalu lanjut ke `Portal Mail CBJ`
4. terakhir baru polish visual lagi

## Jangan Lupa

- jangan aktifkan lagi fallback mock/localStorage di production portal
- jangan ubah role `finance` kembali ke `admin`
- jangan overwrite dokumentasi private mail ke publik
- jangan jadikan port Vite dev/preview sebagai URL production
- setelah deploy, selalu cek live route utama dan API health
## Admin routes

- `webmin.cbj-kontruksi.com` points to the VPS `server-public` and is reverse proxied by nginx to `https://127.0.0.1:10000` on that server.
- `webminpc.cbj-kontruksi.com` points to `server-pc` and is reverse proxied by nginx to `https://127.0.0.1:10000` on that machine.
- `coockpit.cbj-kontruksi.com` points to `server-pc` and is reverse proxied by nginx to `https://127.0.0.1:9090`.
- Cloudflare Tunnel routes for these admin hosts should target `http://localhost:80` on the correct origin, not the backend admin port directly.
