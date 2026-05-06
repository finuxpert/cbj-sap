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
sudo systemctl status nginx
sudo systemctl status php-fpm
```

Restart service:

```bash
sudo systemctl restart postfix dovecot opendkim
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
80/tcp   HTTP
443/tcp  HTTPS
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

Pada verifikasi terakhir, port mail dari luar masih timeout:

```text
25
465
587
993
```

Di dalam VPS servicenya sudah listen dan firewalld OS sudah terbuka. Jadi penyebab paling mungkin adalah firewall/security group di panel provider VPS.

Yang perlu dibuka di panel provider:

```text
Inbound TCP 25
Inbound TCP 465
Inbound TCP 587
Inbound TCP 993
```

Untuk kirim email langsung ke Gmail/Yahoo/server lain, outbound TCP `25` juga harus dibuka oleh provider. Jika outbound `25` diblok, gunakan SMTP relay.

PTR/reverse DNS juga perlu diset oleh provider:

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
Title: CBJ Webmail
Default language: id
Theme: Snow
Attachment limit: 25 MB
Default domain: cbj-kontruksi.com
```

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
sudo tail -n 100 /var/log/nginx/error.log
sudo journalctl -u postfix -n 100 --no-pager
sudo journalctl -u dovecot -n 100 --no-pager
sudo journalctl -u opendkim -n 100 --no-pager
sudo journalctl -u php-fpm -n 100 --no-pager
```

## Adding Another Mailbox

Example for `admin@cbj-kontruksi.com`:

```bash
sudo useradd -m -s /sbin/nologin admin
sudo passwd admin
sudo mkdir -p /home/admin/Maildir/{cur,new,tmp}
sudo chown -R admin:admin /home/admin/Maildir
sudo chmod -R 700 /home/admin/Maildir
```

Login in webmail:

```text
admin@cbj-kontruksi.com
```

## Known Limitations

1. Provider firewall/security group still appears to block external mail ports.
2. Outbound port 25 may be blocked by provider. If so, direct delivery to Gmail/Yahoo/etc. will fail.
3. DMARC policy is currently `p=none` for monitoring. After successful sending reputation tests, it can be tightened to `quarantine` or `reject`.
4. No antivirus/advanced spam filtering has been installed yet. Consider Rspamd later.

## Recommended Next Steps

1. Open inbound TCP `25`, `465`, `587`, `993` in provider panel.
2. Ask provider to set PTR/rDNS:

```text
103.49.238.87 -> mail.cbj-kontruksi.com
```

3. Ask provider whether outbound TCP `25` is open.
4. Send a test email to Gmail after ports are open.
5. Check headers in Gmail for SPF, DKIM, and DMARC pass.
6. Consider SMTP relay if provider blocks outbound 25.
7. Consider Rspamd once basic mail flow is confirmed.
