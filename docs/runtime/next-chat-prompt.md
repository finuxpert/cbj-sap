# SAP Intelligent RCA Workspace - Next Chat Prompt

Project:
SAP Intelligent RCA Workspace

Repo:
finuxpert/cbj-sap

Branch aktif:
dev

Local path:
`/home/sadmin/sap`

DEV URL:
https://sapdev.cbj-kontruksi.com/sap/

Public API:
https://sapdev.cbj-kontruksi.com/sap-api/health

Current Status:
- OFFICIAL SAPDEV deploy workflow is GREEN.
- Only one active workflow should be used:
  `.github/workflows/dev-deploy.yml`
- Workflow name:
  `OFFICIAL - SAPDEV Deploy Manual`
- Workflow ID:
  `274021726`
- Latest successful run:
  `25621865480`
- Runner:
  `sapdev-pc-runner`
- Active runner label used by workflow:
  `sapdev`
- DEV deploy, frontend build, backend QA, and public API validation passed.

Important Workflow Notes:
- Old/temporary workflows were removed or disabled.
- Do not recreate duplicate deploy/validate workflows.
- Official deploy command:
  `gh workflow run 274021726 -r dev -f confirm=DEPLOY_DEV`
- Check latest runs:
  `gh run list --workflow 274021726 --limit 5`
- Watch run:
  `gh run watch RUN_ID`

Recent Fixes:
- Workflow now installs backend Python dependencies inside:
  `.venv-github-actions`
- Reason:
  Ubuntu 24 blocks direct pip install with PEP 668 / externally-managed-environment.
- Do not use:
  `pip install --break-system-packages`
- `scripts/qa-sapdev.sh` was fixed to read large JSON through stdin instead of environment variables.
- Reason:
  PostgreSQL case data is now large and caused:
  `Argument list too long`

Current Architecture:
- Frontend: React + Vite
- Backend: FastAPI Evidence API
- DB mode: PostgreSQL hybrid
- API health shows:
  `case_history=hybrid`
  `database.enabled=true`
  `database.configured=true`
  `database.mode=hybrid`
  `database.status=ok`

Core RCA Tools Only:
1. RCA Comparator / WP-SCOUT Analyzer
2. ST03N Analyzer
3. Log Triage / Log Evidence V2

Rules:
- Fokus rapihin backend dulu.
- Incremental only.
- Jangan rewrite besar.
- Jangan sentuh PROD.
- Jangan reintroduce MutationObserver/runtime injector.
- Jangan bikin workflow baru kalau tidak perlu.
- Official workflow harus tetap single source of truth.
- Hindari kode sampah: helper kecil, contract jelas, QA tetap jalan.

Next Recommended Target:
1. Rapihin backend modularization.
2. Kurangi duplikasi endpoint/helper.
3. Pisahkan service layer untuk:
   - cases
   - evidence
   - parsed results
   - mobile views
4. Tambahkan backend QA ringan untuk mencegah regression.
5. Baru setelah backend rapi, lanjut UI/UX cleanup.
