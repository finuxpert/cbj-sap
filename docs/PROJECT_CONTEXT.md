# CBJ SAP Tools — Project Context

Dokumen ini adalah konteks utama project `sphere` agar percakapan baru tetap nyambung tanpa perlu menjelaskan ulang dari awal.

## Ringkasan project

CBJ SAP Tools adalah aplikasi React/Vite untuk kebutuhan operasional SAP Basis, log triage, ST03N analysis, comparison evidence, backup/deploy helper, dan workflow internal Basis.

Project ini berbeda dari `cbj-trading-ai`:

- `sphere` adalah frontend/static app React/Vite.
- Deploy utamanya lewat build static dan Nginx route.
- Tidak memakai Docker API sebagai runtime utama.

## Repository

- GitHub repo: `finuxpert/sphere`
- Visibility: Private
- Default branch: `main`
- Source path utama server: `/home/sadmin/sap`
- Production route: `https://cbj-kontruksi.com/sap`
- New dev route: `https://sapdev.cbj-kontruksi.com/`

## Development Direction

Mulai sekarang development normal diarahkan ke:

```text
https://sapdev.cbj-kontruksi.com/
```

Alasannya:

- `192.168.10.1` adalah environment lama di web-dev/VirtualBox dan mulai ditinggalkan.
- `sapdev.cbj-kontruksi.com` menjadi dev utama untuk perubahan kecil/medium dan persiapan naik production.
- Legacy `192.168.10.1/sap-staging` tetap disimpan hanya untuk eksperimen brutal/refactor besar bila benar-benar diperlukan.

Prinsip baru:

```text
Normal development  → sapdev.cbj-kontruksi.com
Brutal experiment   → 192.168.10.1/sap-staging
Stable release      → cbj-kontruksi.com/sap
```

## Environment / Route Mapping

Ada 3 area penting yang harus dibedakan:

### 1. Production

```text
https://cbj-kontruksi.com/sap
```

Fungsi:

- Route production/live untuk SAP Tools.
- Hanya publish setelah fitur sudah stabil.
- Jangan dipakai untuk eksperimen besar.

Deploy production menggunakan script existing:

```bash
cd /home/sadmin/sap
sudo DO_BACKUP=1 ./sap-deploy.sh
```

### 2. Dev baru / main development

```text
https://sapdev.cbj-kontruksi.com/
```

Fungsi:

- Environment dev utama mulai sekarang.
- Dipakai untuk development kecil/medium.
- Dipakai untuk prepare perubahan sebelum naik ke production.
- Cocok untuk polish UI kecil, bugfix minor, dokumentasi, dan validasi sebelum publish.

Aturan:

- Jadikan ini target utama untuk development normal.
- Jangan pakai dev baru untuk eksperimen brutal yang berisiko merusak flow besar.
- Setelah dev stabil, baru siapkan publish ke production.

### 3. Legacy web-dev / brutal staging

```text
http://192.168.10.1/sap/
http://192.168.10.1/sap-staging/
```

Fungsi:

- Ini environment lama di `server web-dev` / VirtualBox.
- Mulai ditinggalkan untuk development normal.
- Dipakai hanya untuk testing kode brutal atau upgrade besar-besaran.
- Cocok untuk refactor besar, layout overhaul, perubahan fitur besar, dan eksperimen yang belum aman.

Aturan:

- Jangan anggap `192.168.10.1` sebagai production.
- Jangan jadikan `192.168.10.1` default development lagi.
- Gunakan ini hanya untuk eksperimen besar sebelum dirapikan ke dev baru.

## Stack

Dari `package.json`, project memakai:

- React
- Vite
- Recharts
- Dexie
- idb-keyval
- sql.js
- xlsx
- jsPDF
- html2canvas
- Framer Motion

Command umum:

```bash
npm install
npm run dev
npm run build
npm run lint
```

## Deploy Flow Yang Disarankan

### Perubahan kecil / aman

```text
source / branch kerja
↓
build
↓
sapdev.cbj-kontruksi.com
↓
review
↓
production /sap
```

### Perubahan besar / brutal

```text
source / branch eksperimen
↓
192.168.10.1/sap-staging
↓
bereskan bug besar
↓
sapdev.cbj-kontruksi.com
↓
review final
↓
production /sap
```

## Safety Rules

1. Jangan deploy langsung ke production untuk fitur besar.
2. Production `/sap` hanya untuk versi stabil.
3. Dev baru `sapdev.cbj-kontruksi.com` adalah target utama development normal.
4. Legacy `192.168.10.1/sap-staging` hanya untuk eksperimen brutal/refactor besar.
5. Jangan jadikan Vite dev server port sebagai production URL.
6. Setelah deploy, selalu smoke test route terkait.
7. Jika ada file private/credential, jangan commit ke GitHub.

## Smoke Test

Production:

```bash
curl -I https://cbj-kontruksi.com/sap/
```

Dev baru:

```bash
curl -I https://sapdev.cbj-kontruksi.com/
```

Legacy staging:

```bash
curl -I http://192.168.10.1/sap-staging/
```

## Existing Docs

Dokumen lama/handoff besar tetap ada dan masih berguna:

```text
docs/CBJ_ECOSYSTEM_HANDOFF.md
docs/CBJ_DEPLOY_BACKUP_ROLLBACK_RUNBOOK.md
documentation.txt
```

Namun untuk konteks cepat project SAP, file ini (`docs/PROJECT_CONTEXT.md`) harus jadi rujukan awal.

## Prompt pendek untuk chat baru

```text
Saya mau lanjut project CBJ SAP Tools. Repo GitHub: finuxpert/sphere. Tolong baca README.md dan docs/PROJECT_CONTEXT.md dulu. Production ada di https://cbj-kontruksi.com/sap, dev utama sekarang di https://sapdev.cbj-kontruksi.com/, dan legacy brutal staging di http://192.168.10.1/sap-staging/ hanya untuk eksperimen besar. Jangan deploy ke production sebelum saya setujui.
```
