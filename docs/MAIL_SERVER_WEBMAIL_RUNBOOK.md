# CBJ Mail Server and Webmail Runbook

Tanggal setup: 2026-04-23

## Ringkasan

Mail server untuk `cbj-kontruksi.com` sudah dipasang di VPS publik:

- Host: `103.49.238.87`
- SSH user: `sadmin`
- Hostname VPS: `mail.cbj-kontruksi.com`
- OS: AlmaLinux 8.10
- Webmail:
  - `https://cbj-kontruksi.com/webmail/`
  - `https://mail.cbj-kontruksi.com/webmail/`
- Mailbox awal: `info@cbj-kontruksi.com`

Stack yang dipasang:

- SMTP/MTA: Postfix
- IMAP: Dovecot
- DKIM signer: OpenDKIM
- Spam filter: Rspamd + Redis
- Webmail: SnappyMail 2.38.2
- Web runtime: Nginx + PHP 8.2 PHP-FPM
- TLS: Let's Encrypt

## DNS

Record DNS yang diperlukan dan sudah dikonfirmasi resolve publik:

```text
A     mail                 103.49.238.87
MX    @                    mail.cbj-kontruksi.com    priority 10
TXT   @                    v=spf1 mx a:mail.cbj-kontruksi.com ip4:103.49.238.87 ~all
TXT   _dmarc               v=DMARC1; p=none; rua=mailto:info@cbj-kontruksi.com
TXT   default._domainkey   DKIM RSA 2048-bit dari /home/sadmin/dkim-default-cbj.txt di VPS
```

Catatan Cloudflare:

- `mail` harus **DNS only**, jangan proxied.
- MX/TXT memang tidak diproxy.

## Service

Service utama di VPS:

```bash
sudo systemctl status postfix
sudo systemctl status dovecot
sudo systemctl status opendkim
sudo systemctl status rspamd
sudo systemctl status redis
sudo systemctl status fail2ban
sudo systemctl status nginx
sudo systemctl status php-fpm
```

Restart service:

```bash
sudo systemctl restart postfix dovecot opendkim rspamd redis fail2ban
sudo systemctl reload nginx
sudo systemctl restart php-fpm
```

Port yang listen di OS:

```text
25/tcp   SMTP inbound
465/tcp  SMTPS
587/tcp  SMTP submission
993/tcp  IMAPS
8891     OpenDKIM local milter, localhost only
11332    Rspamd milter, localhost only
11333    Rspamd normal worker, localhost only
11334    Rspamd controller UI, localhost only
80/tcp   HTTP
443/tcp  HTTPS
```

## Hardening Applied

SSH:

```text
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
```

Current access depends on the `sadmin` SSH key in `/home/sadmin/.ssh/authorized_keys`.

Fail2ban is enabled with these jails:

```text
sshd
postfix
postfix-sasl
dovecot
nginx-http-auth
```

Fail2ban config:

```text
/etc/fail2ban/jail.d/cbj-mail-web.conf
```

Postfix hardening:

```text
disable_vrfy_command = yes
smtpd_helo_required = yes
smtpd_tls_loglevel = 1
milter_protocol = 6
milter_default_action = accept
smtpd_milters = inet:127.0.0.1:11332, inet:127.0.0.1:8891
non_smtpd_milters = inet:127.0.0.1:11332, inet:127.0.0.1:8891
```

The milter chain is:

```text
Rspamd -> OpenDKIM
```

Nginx hardening:

```text
server_tokens off;
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: SAMEORIGIN
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

Config backups created during hardening:

```text
/etc/ssh/sshd_config.bak-hardening-*
/etc/postfix/main.cf.bak-rspamd-*
/etc/nginx/nginx.conf.bak-hardening-*
/etc/nginx/conf.d/443-cbj.conf.bak-hardening-*
```

Firewalld OS sudah dibuka:

```bash
sudo firewall-cmd --list-ports
```

Expected:

```text
25/tcp 465/tcp 587/tcp 993/tcp
```

## Blocker Provider

Status terakhir perlu dibedakan per tanggal verifikasi:

```text
2026-04-23:
- Port 25, 465, 587, 993 dari luar masih timeout.

2026-04-24:
- Provider mengonfirmasi PTR/rDNS `103.49.238.87 -> mail.cbj-kontruksi.com` sudah diset.
- Verifikasi langsung dari environment kerja ini menunjukkan PTR/rDNS resolve ke `mail.cbj-kontruksi.com`.
- Verifikasi langsung dari environment kerja ini menunjukkan port `465`, `587`, dan `993` dapat diakses dari luar.
- Port `25` masih timeout dari environment kerja ini, jadi status inbound `25` masih conflicting antara klaim provider dan hasil uji jaringan ini.
```

Di dalam VPS servicenya sudah listen dan firewalld OS sudah terbuka. Untuk status terbaru, blocker provider yang masih perlu diverifikasi adalah akses eksternal ke port `25` dari beberapa network publik yang berbeda, serta apakah outbound TCP `25` dibuka oleh provider.

Port yang perlu dipastikan terbuka di panel provider:

```text
Inbound TCP 25
Inbound TCP 465
Inbound TCP 587
Inbound TCP 993
```

Untuk kirim email langsung ke Gmail/Yahoo/server lain, outbound TCP `25` juga harus dibuka oleh provider. Jika outbound `25` diblok, gunakan SMTP relay.

PTR/reverse DNS target yang digunakan:

```text
103.49.238.87 -> mail.cbj-kontruksi.com
```

## TLS

Sertifikat Let's Encrypt sudah diperbarui dan mencakup:

```text
cbj-kontruksi.com
www.cbj-kontruksi.com
mail.cbj-kontruksi.com
```

Path sertifikat:

```text
/etc/letsencrypt/live/cbj-kontruksi.com/fullchain.pem
/etc/letsencrypt/live/cbj-kontruksi.com/privkey.pem
```

Postfix dan Dovecot memakai sertifikat tersebut.

Nginx juga sudah diarahkan ke sertifikat Let's Encrypt di:

```text
/etc/nginx/conf.d/443-cbj.conf
```

Verifikasi sertifikat:

```bash
sudo openssl x509 -in /etc/letsencrypt/live/cbj-kontruksi.com/fullchain.pem -noout -subject -issuer -dates -ext subjectAltName
```

Verifikasi TLS IMAP/SMTP lokal:

```bash
echo | timeout 5 openssl s_client -connect 127.0.0.1:993 -servername mail.cbj-kontruksi.com 2>/dev/null | openssl x509 -noout -subject -ext subjectAltName

timeout 5 openssl s_client -starttls smtp -connect 127.0.0.1:587 -servername mail.cbj-kontruksi.com </dev/null 2>/dev/null | openssl x509 -noout -subject -ext subjectAltName
```

## Credential Files

Password tidak ditulis di dokumen ini. File credential ada di VPS:

```text
/home/sadmin/mail-info-credentials.txt
/home/sadmin/snappymail-admin-credentials.txt
```

Baca credential:

```bash
cat /home/sadmin/mail-info-credentials.txt
cat /home/sadmin/snappymail-admin-credentials.txt
```

Permission file credential:

```text
600, owner sadmin:sadmin
```

## Mailbox

Mailbox awal:

```text
Email: info@cbj-kontruksi.com
IMAP/SMTP username: info@cbj-kontruksi.com
Fallback username: info
```

Maildir:

```text
/home/info/Maildir
```

Test auth:

```bash
PASS=$(awk -F": " '/^Password:/ {print $2}' /home/sadmin/mail-info-credentials.txt)
sudo doveadm auth test "info@cbj-kontruksi.com" "$PASS"
```

Expected:

```text
passdb: info@cbj-kontruksi.com auth succeeded
```

Test local delivery:

```bash
before=$(sudo find /home/info/Maildir/new /home/info/Maildir/cur -type f | wc -l)
echo "local delivery test $(date -Is)" | mail -s "CBJ local mail test" info@cbj-kontruksi.com
sleep 2
after=$(sudo find /home/info/Maildir/new /home/info/Maildir/cur -type f | wc -l)
echo "before=$before after=$after"
```

Expected: `after` lebih besar dari `before`.

## Webmail

Webmail URL:

```text
https://cbj-kontruksi.com/webmail/
https://mail.cbj-kontruksi.com/webmail/
```

Admin panel:

```text
https://cbj-kontruksi.com/webmail/?admin
```

SnappyMail install path:

```text
/var/www/snappymail
```

SnappyMail config:

```text
/var/www/snappymail/data/_data_/_default_/configs/application.ini
/var/www/snappymail/data/_data_/_default_/domains/cbj-kontruksi.com.json
/var/www/snappymail/data/_data_/_default_/domains/mail.cbj-kontruksi.com.json
```

Webmail settings applied:

```text
Title: CBJ Mail | PT Cakrabuana Bangun Jaya
Default language: id
Theme: CBJ@custom
Attachment limit: 25 MB
Default domain: cbj-kontruksi.com
Minimum refresh interval: 1 minute
Default compose editor: Plain
Messages per page: 35
Remember me on login: DefaultOn
Contacts/autocomplete: enabled
Recipient suggestions limit: 50
Mail threads: enabled
Spellcheck in compose: enabled
```

Catatan compose:

- Default compose editor diset ke `Plain` agar email baru tidak memakai rich HTML editor secara default.
- Ini membantu mengurangi body email yang berisi karakter spacing HTML seperti `=C2=A0` atau plain-text yang ikut menampilkan `mailto:...`.
- Jika user masih melihat mode HTML, logout lalu login ulang ke webmail atau cek preferensi compose per user.

Catatan usability:

- Modul `contacts` diaktifkan agar SnappyMail dapat menyimpan kontak/saran penerima secara otomatis.
- `contacts_autosave = On` tetap dipakai, sehingga alamat yang sering dikirimi email bisa muncul sebagai autocomplete pada compose berikutnya.
- Login dibuat lebih nyaman dengan `sign_me_auto = DefaultOn`.
- Thread view dan spellcheck default juga diaktifkan untuk pengalaman email harian yang lebih mendekati webmail modern.

Inbox auto-refresh:

- Global minimum is set in `/var/www/snappymail/data/_data_/_default_/configs/application.ini`:
  `min_refresh_interval = 1`
- The `info@cbj-kontruksi.com` SnappyMail user setting is set to:
  `CheckMailInterval = 1`
- This makes SnappyMail poll for new mail about every 1 minute. It is not true instant push; browser background tabs may also delay timers.

Security:

- `/webmail/data/` returns `403`.
- SnappyMail data directory has SELinux writable context.
- Admin password is set and stored in `/home/sadmin/snappymail-admin-credentials.txt`.

Verify webmail:

```bash
curl -I https://cbj-kontruksi.com/webmail/
curl -I https://mail.cbj-kontruksi.com/webmail/
curl -I https://cbj-kontruksi.com/webmail/data/VERSION
```

Expected:

- `/webmail/` returns `200`
- `/webmail/data/VERSION` returns `403`

## Main Config Files

Postfix:

```text
/etc/postfix/main.cf
/etc/postfix/master.cf
/etc/aliases
```

Dovecot:

```text
/etc/dovecot/conf.d/99-cbj-mail.conf
```

OpenDKIM:

```text
/etc/opendkim.conf
/etc/opendkim/TrustedHosts
/etc/opendkim/KeyTable
/etc/opendkim/SigningTable
/etc/opendkim/keys/cbj-kontruksi.com/default.private
/etc/opendkim/keys/cbj-kontruksi.com/default.txt
```

Rspamd:

```text
/etc/yum.repos.d/rspamd.repo
/etc/rspamd/local.d/redis.conf
/etc/rspamd/local.d/milter_headers.conf
/etc/rspamd/local.d/worker-controller.inc
/etc/rspamd/local.d/dkim_signing.conf
/etc/rspamd/local.d/arc.conf
/var/lib/rspamd/
/var/log/rspamd/
```

Rspamd DKIM/ARC signing is disabled because OpenDKIM is already the DKIM signer:

```text
/etc/rspamd/local.d/dkim_signing.conf: enabled = false;
/etc/rspamd/local.d/arc.conf: enabled = false;
```

Rspamd controller:

```text
URL: http://127.0.0.1:11334/
Access: SSH tunnel only
Username: admin
Password: stored in /home/sadmin/docs/MAIL_SERVER_WEBMAIL_PRIVATE.md
```

Open SSH tunnel from local machine:

```bash
ssh -L 11334:127.0.0.1:11334 sadmin@103.49.238.87
```

Then open:

```text
http://127.0.0.1:11334/
```

Nginx:

```text
/etc/nginx/conf.d/80-cbj.conf
/etc/nginx/conf.d/443-cbj.conf
```

PHP-FPM:

```text
/etc/php-fpm.d/www.conf
```

Backups created during setup:

```text
/root/mail-setup-backups/
/etc/nginx/conf.d/*.bak-webmail-*
/etc/nginx/conf.d/*.bak-le-*
/etc/php-fpm.d/www.conf.bak-webmail-*
/etc/aliases.mailsetup.bak.*
```

## Verification Commands

DNS verification:

```bash
dig +short mail.cbj-kontruksi.com A
dig +short cbj-kontruksi.com MX
dig +short cbj-kontruksi.com TXT
dig +short _dmarc.cbj-kontruksi.com TXT
dig +short default._domainkey.cbj-kontruksi.com TXT
```

DKIM verification on VPS:

```bash
sudo opendkim-testkey -d cbj-kontruksi.com -s default -vvv
```

Expected:

```text
key OK
```

`key not secure` means DNSSEC is not enabled. It is not a DKIM failure.

Port verification from outside:

```bash
nc -vz -w 5 103.49.238.87 25
nc -vz -w 5 103.49.238.87 465
nc -vz -w 5 103.49.238.87 587
nc -vz -w 5 103.49.238.87 993
```

Currently these still timed out from the test environment, so check provider firewall/security group.

Service listen verification on VPS:

```bash
ss -tulpn | egrep ':(25|465|587|993|8891)\b'
```

Log checks:

```bash
sudo tail -n 100 /var/log/maillog
sudo tail -n 100 /var/log/rspamd/rspamd.log
sudo tail -n 100 /var/log/nginx/error.log
sudo journalctl -u postfix -n 100 --no-pager
sudo journalctl -u dovecot -n 100 --no-pager
sudo journalctl -u opendkim -n 100 --no-pager
sudo journalctl -u rspamd -n 100 --no-pager
sudo journalctl -u fail2ban -n 100 --no-pager
sudo journalctl -u php-fpm -n 100 --no-pager
```

## Adding Another Mailbox

Example for `admin@cbj-kontruksi.com`:

```bash
ssh sadmin@103.49.238.87
sudo useradd -m -s /sbin/nologin admin
sudo passwd admin
sudo mkdir -p /home/admin/Maildir/{cur,new,tmp}
sudo chown -R admin:admin /home/admin/Maildir
sudo chmod -R 700 /home/admin/Maildir
sudo doveadm mailbox create -u admin Sent Drafts Junk Trash Archive 2>/dev/null || true
sudo doveadm mailbox subscribe -u admin Sent Drafts Junk Trash Archive 2>/dev/null || true
```

Login in webmail:

```text
admin@cbj-kontruksi.com
```

Webmail URL:

```text
https://cbj-kontruksi.com/webmail/
https://mail.cbj-kontruksi.com/webmail/
```

Password is the password entered during:

```bash
sudo passwd admin
```

Test authentication:

```bash
sudo doveadm auth test admin@cbj-kontruksi.com
```

It will prompt for the password. Expected result:

```text
passdb: admin@cbj-kontruksi.com auth succeeded
```

Example for another mailbox, `sales@cbj-kontruksi.com`:

```bash
sudo useradd -m -s /sbin/nologin sales
sudo passwd sales
sudo mkdir -p /home/sales/Maildir/{cur,new,tmp}
sudo chown -R sales:sales /home/sales/Maildir
sudo chmod -R 700 /home/sales/Maildir
sudo doveadm mailbox create -u sales Sent Drafts Junk Trash Archive 2>/dev/null || true
sudo doveadm mailbox subscribe -u sales Sent Drafts Junk Trash Archive 2>/dev/null || true
sudo doveadm auth test sales@cbj-kontruksi.com
```

Notes:

- The mailbox local part maps to a Linux user. `admin@cbj-kontruksi.com` uses Linux user `admin`.
- Avoid spaces, uppercase letters, and special characters in mailbox names.
- Do not use `root` as a mailbox.
- If `useradd` says the user already exists, skip `useradd` and only reset password or create/check Maildir.

Reset mailbox password:

```bash
sudo passwd admin
```

Mapping mailbox ke user Linux:

```text
admin@cbj-kontruksi.com -> admin
info@cbj-kontruksi.com -> info
finance@cbj-kontruksi.com -> finance
operation@cbj-kontruksi.com -> operation
consultant@cbj-kontruksi.com -> consultant
```

Contoh reset password mailbox:

```bash
ssh sadmin@103.49.238.87

# Reset password admin@cbj-kontruksi.com
sudo passwd admin

# Reset password info@cbj-kontruksi.com
sudo passwd info
```

Verifikasi setelah reset:

```bash
sudo doveadm auth test admin@cbj-kontruksi.com
sudo doveadm auth test info@cbj-kontruksi.com
```

`doveadm auth test` akan meminta password yang baru. Expected result:

```text
passdb: admin@cbj-kontruksi.com auth succeeded
```

Check mailbox files:

```bash
sudo find /home/admin/Maildir -maxdepth 2 -type d -print
```

Send local test mail:

```bash
echo "test $(date -Is)" | mail -s "Local mail test" admin@cbj-kontruksi.com
sudo find /home/admin/Maildir/new /home/admin/Maildir/cur -type f | wc -l
```

List mailbox folders:

```bash
sudo doveadm mailbox list -u admin
```

Expected folders include:

```text
INBOX
Sent
Drafts
Junk
Trash
Archive
```

SnappyMail may cache folder settings per user. If a user's Sent/Drafts/Trash were previously disabled, reset the user's local SnappyMail folder settings:

```bash
sudo python3 - <<'PY'
import json
from pathlib import Path

user = "admin"
p = Path(f"/var/www/snappymail/data/_data_/_default_/storage/cbj-kontruksi.com/{user}/settings_local")
p.parent.mkdir(parents=True, exist_ok=True)
settings = {}
if p.exists():
    settings = json.loads(p.read_text() or "{}")
settings.update({
    "SentFolder": "Sent",
    "DraftsFolder": "Drafts",
    "JunkFolder": "Junk",
    "TrashFolder": "Trash",
    "ArchiveFolder": "Archive",
})
p.write_text(json.dumps(settings, separators=(",", ":")))
PY
sudo chown -R nginx:nginx /var/www/snappymail/data/_data_/_default_/storage/cbj-kontruksi.com/admin
```

Update sender display name for a mailbox in SnappyMail:

```bash
sudo python3 - <<'PY'
import json
from pathlib import Path

user = "info"
display_name = "PT Cakrabuana Bangun Jaya"
p = Path(f"/var/www/snappymail/data/_data_/_default_/storage/cbj-kontruksi.com/{user}/identities")
data = json.loads(p.read_text() or "{}")
entry = data.get("---", {})
entry["Name"] = display_name
entry["Label"] = display_name
data["---"] = entry
p.write_text(json.dumps(data, separators=(",", ":")))
PY
sudo chown nginx:nginx /var/www/snappymail/data/_data_/_default_/storage/cbj-kontruksi.com/info/identities
```

Example current value for `info@cbj-kontruksi.com`:

```text
Name: PT Cakrabuana Bangun Jaya
Label: PT Cakrabuana Bangun Jaya
```

## Known Limitations

1. Per 2026-04-24, PTR/rDNS resolves correctly to `mail.cbj-kontruksi.com`, and inbound ports `465`, `587`, and `993` were reachable from the verification environment.
2. Inbound port `25` is still inconsistent across checks: the provider says it is open, but a direct `nc` test from the verification environment timed out.
3. Outbound port `25` may still be blocked by provider. If so, direct delivery to Gmail/Yahoo/etc. will fail.
4. DMARC policy is currently `p=none` for monitoring. After successful sending reputation tests, it can be tightened to `quarantine` or `reject`.
5. Rspamd is installed, but antivirus scanning is not enabled. ClamAV can be added later if RAM headroom is enough.
6. Rspamd Bayes needs real mail traffic and training before it becomes highly effective.
7. Rspamd RBL lookups can show DNS `server fail` with upstream resolvers. If this persists, add a local recursive resolver such as Unbound and point Rspamd DNS to `127.0.0.1`.

## Recommended Next Steps

1. Re-test inbound TCP `25` from at least one other public network or external checker to resolve the mismatch with the provider claim.
2. Verify reverse DNS now resolves as:

```text
103.49.238.87 -> mail.cbj-kontruksi.com
```

3. Ask provider whether outbound TCP `25` is open.
4. Send a test email to Gmail after inbound/outbound connectivity is confirmed.
5. Check headers in Gmail for SPF, DKIM, and DMARC pass.
6. Consider SMTP relay if provider blocks outbound `25`.
7. Train Rspamd spam/ham after real traffic starts.
8. Add backup automation for Maildir, SnappyMail data, and mail configs.
9. Consider local recursive DNS resolver for Rspamd RBL checks.
