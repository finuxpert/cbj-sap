# CBJ Portal Backend Runbook

Tanggal update: `2026-04-30`

## Production

```text
Portal URL:     https://cbj-kontruksi.com/portal
Login URL:      https://cbj-kontruksi.com/login
API health:     https://cbj-kontruksi.com/api/health
Service:        cbj-portal-api
Runtime path:   /var/www/prod/current/server/index.mjs
Database:       /var/lib/cbj-portal/cbj.sqlite
Env file:       /etc/cbj-portal.env
```

## Auth Dan Session

- Login portal memakai token Bearer, bukan cookie.
- Session disimpan di table SQLite `sessions`.
- Session default berlaku `12 jam`.
- Frontend memvalidasi session aktif lewat `GET /api/auth/me`.
- Logout menghapus token aktif dari table `sessions`.
- Change password menghapus semua session user tersebut.
- User dengan status selain `active` ditolak login dan session aktifnya tidak diterima.

## Rate Limit Login

Backend portal punya rate limit login sederhana:

- batas: `8` percobaan gagal
- window: `15 menit`
- scope: kombinasi `IP + email`
- percobaan gagal ke-9 akan mendapat HTTP `429`
- lock ini sementara di memory service, bukan disable akun permanen

Pesan yang biasanya muncul:

```text
Terlalu banyak percobaan login. Coba lagi beberapa menit.
```

## Jika User Ke-Lock Karena 8x Salah Login

Opsi normal:

1. tunggu `15 menit`
2. minta user login ulang dengan password yang benar

Opsi urgent dari server:

```bash
ssh sadmin@103.49.238.87
sudo systemctl restart cbj-portal-api
```

Restart service akan menghapus counter rate limit yang tersimpan di memory.

Restart ini tidak menghapus:

- user
- project
- payment
- session SQLite
- database portal

## Reset Session Manual

Paksa semua user login ulang:

```bash
ssh sadmin@103.49.238.87
node --input-type=module
```

Lalu jalankan:

```js
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync("/var/lib/cbj-portal/cbj.sqlite");
db.prepare("DELETE FROM sessions").run();
db.close();
```

Reset session user tertentu:

```js
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync("/var/lib/cbj-portal/cbj.sqlite");
const email = "user@cbj-kontruksi.com";
const user = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
if (user) db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
db.close();
```

## Hardening Yang Sudah Aktif

- Body request dibatasi `256 KB`.
- JSON invalid dibalas HTTP `400`.
- Login gagal dibatasi per `IP + email`.
- Response API memakai `Cache-Control: no-store`.
- Response API menyertakan `X-Request-Id`.
- Request API dicatat ke log service dengan method, URL, status, dan durasi.
- Password hash parser dibuat lebih aman agar hash rusak tidak menyebabkan error 500.

## Log Dan Debug

Status service:

```bash
sudo systemctl status cbj-portal-api --no-pager -l
```

Log terbaru:

```bash
sudo journalctl -u cbj-portal-api -n 80 --no-pager
```

Health check:

```bash
curl -s https://cbj-kontruksi.com/api/health
```

Test auth dari server:

```bash
curl -s http://127.0.0.1:8787/api/health
```

## Catatan Operasional

- Jangan reset database untuk masalah lock login biasa.
- Untuk lock login sementara, restart `cbj-portal-api` cukup.
- Untuk session bermasalah, hapus table `sessions`, bukan table `users`.
- Kalau banyak user melaporkan login ulang terus, cek service restart loop dan log `401/429`.
