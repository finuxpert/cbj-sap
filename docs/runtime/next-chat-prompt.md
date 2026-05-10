# Next Chat Continuation Prompt - SAP Intelligent RCA Workspace

Use this prompt to continue work in a new ChatGPT conversation.

```text
Lanjut SAP Intelligent RCA Workspace dari state DEV deploy/API GREEN dan Log Triage modularization validated.

Project:
SAP Intelligent RCA Workspace

Repo:
- finuxpert/cbj-sap

Branch:
- dev

Local path:
- /home/sadmin/sap

DEV URL:
- https://sapdev.cbj-kontruksi.com

Frontend:
- React + Vite

Backend Evidence API:
- http://127.0.0.1:8090

Public API:
- https://sapdev.cbj-kontruksi.com/sap-api/health

Current Architecture:
- PostgreSQL Hybrid runtime active
- filesystem fallback wajib tetap ada
- PostgreSQL primary for evidence history reads
- DEV deploy via GitHub Actions self-hosted runner / manual server deploy

Evidence Paths:
- /var/www/svr01-dev/sap-data/evidence
- /var/www/svr01-dev/sap-data/metadata
- /var/www/svr01-dev/sap-data/reports

Backend service:
- sap-evidence-api.service

Backend source:
- backend/evidence_api.py

Frontend API client:
- src/evidence-api-client.js

Current Focus:
ONLY maintain 3 CORE RCA TOOLS:
1. RCA Comparator / WP-SCOUT Analyzer
2. ST03N Analyzer
3. Log Triage

DO NOT REINTRODUCE:
- MutationObserver runtime injectors
- recursive DOM patching
- delayed enhancer scripts
- FORCE_UI_CSS giant override
- duplicated dashboards/cards
- noisy executive widgets

Previously removed:
- comparer-rca-dashboard-enhancer.js
- st03n-rca-dashboard-enhancer.js

Reason:
Previously caused:
- blank screen
- loading freeze
- render lag
- mobile freeze
- excessive DOM mutation

Current verified GREEN baseline:
- npm run build GREEN on server /home/sadmin/sap
- DEV deploy completed to /var/www/svr01-dev/sap
- sudo systemctl daemon-reload completed
- sudo systemctl reload nginx completed
- nginx -t syntax ok / test successful
- local API health GREEN
- public API health GREEN
- database.mode hybrid status ok

Latest validation output:
- curl http://127.0.0.1:8090/health returned status ok
- curl https://sapdev.cbj-kontruksi.com/sap-api/health returned status ok
- service: SAP Intelligent RCA Evidence API
- storage_root: /var/www/svr01-dev/sap-data
- max_upload_mb: 500
- case_history: hybrid
- analytics: enabled
- database.enabled: true
- database.configured: true
- database.mode: hybrid
- database.status: ok

Current latest git/build state:
- Latest build validated after ErrorEvidenceRanking extraction/wiring
- HEAD reached f72fda3b4a083cf76ffa32007231c83690353080
- Commit message: Wire Log Triage error evidence ranking panel
- Vite v7.3.2 build GREEN
- modules transformed: 989
- build time around 6.84s

Recent important commits already pushed:
- Add PostgreSQL-first reads for SAP RCA hybrid mode
- Add DB-backed evidence history panel
- Document SAP PostgreSQL hybrid continuation
- Document validated sapdev deploy workflow
- Add modular Log Triage analysis module
- Convert legacy log evidence analysis file to compatibility re-export
- Convert legacy confidence label module to compatibility re-export
- Add Log Triage summary strip component
- Wire Log Triage summary strip component
- Extract Log Triage primary error panel
- Wire Log Triage primary error panel
- Extract Log Triage job program mapping panel
- Wire Log Triage job program mapping panel
- Extract Log Triage error evidence ranking panel
- Wire Log Triage error evidence ranking panel

Important recovery note:
- A bad placeholder overwrite previously happened on ToolLogEvidenceV2.jsx with content REPLACED_FOR_BREVITY.
- It was recovered by force-moving dev back to safe commit b34f3a61e6d49a2cffd39fbd507d2245409735f5.
- Then proper full-content wiring was applied safely.
- Never update ToolLogEvidenceV2.jsx with placeholder or abbreviated content.

Current modularization status:
Already extracted or modularized:
- parseGenericErrors()
- groupEvidenceRows()
- buildTimeline()
- buildSystemResources()
- buildAnalysis()
- confidenceLabel()
- SummaryStrip.jsx created and wired
- PrimaryErrorPanel.jsx created and wired
- JobProgramMappingPanel.jsx created and wired
- ErrorEvidenceRanking.jsx created and wired

Current component paths:
- src/tools/logtriage/components/SummaryStrip.jsx
- src/tools/logtriage/components/PrimaryErrorPanel.jsx
- src/tools/logtriage/components/JobProgramMappingPanel.jsx
- src/tools/logtriage/components/ErrorEvidenceRanking.jsx

Current ToolLogEvidenceV2 wiring:
- imports SummaryStrip from ./logtriage/components/SummaryStrip.jsx
- imports PrimaryErrorPanel from ./logtriage/components/PrimaryErrorPanel.jsx
- imports JobProgramMappingPanel from ./logtriage/components/JobProgramMappingPanel.jsx
- imports ErrorEvidenceRanking from ./logtriage/components/ErrorEvidenceRanking.jsx
- inline decisionBoard replaced with SummaryStrip
- inline Primary Error Explanation panel replaced with PrimaryErrorPanel
- inline Error Job / Program Mapping panel replaced with JobProgramMappingPanel
- inline Error Evidence Ranking panel replaced with ErrorEvidenceRanking

Current UX issue identified from DEV UI:
- User can create/select a case and save evidence, but later opening Case History/Cases does not yet restore the saved RCA result naturally.
- Current workflow still feels like uploader-first: user may need to upload/re-analyze again.
- Desired behavior: after Create Case / Save to Case History, the user can open the case from history and see saved RCA result/evidence without uploading again.

New highest-priority product target:
Case Evidence Replay / Load Saved RCA Result.

Expected proper flow:
1. Upload log or ZIP.
2. Analyze.
3. Create/select Case.
4. Save to Case History.
5. Later open Cases / History.
6. Click case.
7. Saved RCA summary/result/evidence appears again without upload ulang.

Potential implementation direction:
- Inspect existing frontend case/history components and evidence-api-client.js first.
- Search for functions such as:
  - listMobileCases
  - createCase
  - saveParsedResult
  - listEvidence
  - uploadEvidence
  - case detail / parsed result readers if already implemented
- Confirm backend endpoints in backend/evidence_api.py before adding new API calls.
- Prefer using existing endpoints if available.

Likely needed frontend behavior:
- Case detail view should load:
  - case metadata
  - parsed RCA results
  - linked evidence files
- Add UI action in Cases or tool panels:
  - Open Case Evidence
  - Load Saved Analysis
  - Re-analyze from saved evidence only if safe later
- In WP-SCOUT / Log Evidence / ST03N, when Existing Case is selected, provide a way to load saved parsed result from the selected case.

Candidate API shape to verify, not assume:
- GET /sap-api/cases
- GET /sap-api/cases/{id}
- GET /sap-api/cases/{id}/parsed-results
- GET /sap-api/cases/{id}/evidence

If backend lacks endpoints:
- Add minimal read-only endpoint first.
- Do not change DB schema unless absolutely necessary.
- Keep filesystem fallback active.
- Maintain hybrid mode behavior.

Current safest next target:
1. Inspect evidence-api-client.js.
2. Inspect backend/evidence_api.py case and parsed-result endpoints.
3. Inspect Cases UI component / route.
4. Add read-only Case Evidence Replay UI using existing saved parsed results if present.
5. Run npm run build.
6. Deploy DEV only after build GREEN.

Do NOT continue broad UI refactor before fixing replay workflow.
Do NOT add AI narrative/correlation engine yet.
Do NOT touch PROD.

Validated build command:
cd /home/sadmin/sap
sudo -u sadmin git fetch origin
sudo -u sadmin git reset --hard origin/dev
npm run build

Deploy flow:
cd /home/sadmin/sap
sudo rm -rf /var/www/svr01-dev/sap/*
sudo cp -rv dist/* /var/www/svr01-dev/sap/
sudo chown -R www-data:www-data /var/www/svr01-dev/sap
sudo find /var/www/svr01-dev/sap -type d -exec chmod 755 {} \;
sudo find /var/www/svr01-dev/sap -type f -exec chmod 644 {} \;
sudo nginx -t && sudo systemctl daemon-reload && sudo systemctl reload nginx

Validation commands after deploy:
curl http://127.0.0.1:8090/health
curl https://sapdev.cbj-kontruksi.com/sap-api/health

Important nginx rule:
Only ONE server block:
server_name sapdev.cbj-kontruksi.com sap-dev.cbj-kontruksi.com;

Required proxy:
location ^~ /sap-api/ {
    proxy_pass http://127.0.0.1:8090/;
}

NEVER leave:
- .bak
- duplicate enabled configs
inside /etc/nginx/sites-enabled

Recommended next architecture target after replay:
src/tools/logtriage/
├── components/
│   ├── SummaryStrip.jsx
│   ├── PrimaryErrorPanel.jsx
│   ├── JobProgramMappingPanel.jsx
│   ├── ErrorEvidenceRanking.jsx
│   ├── RecommendedActionPanel.jsx
│   ├── AnalyticsStrip.jsx
│   ├── EvidenceTable.jsx
│   ├── TimelinePanel.jsx
│   ├── CorrelationPanel.jsx
│   └── HeatmapPanel.jsx
│
├── analysis/
│   ├── buildAnalysis.js
│   ├── confidenceLabel.js
│   ├── scoring.js
│   └── correlations.js
│
├── hooks/
│   ├── useEvidenceFilters.js
│   └── useTimeline.js
│
└── ToolLogEvidenceV2.jsx

Rules:
- incremental only
- no massive rewrite
- no PROD change
- keep frontend behavior compatible
- keep fallback active
- no nginx/cloudflare changes unless explicitly requested
- do not modify DB schema unless explicitly requested
- do not reintroduce runtime injectors
- do not use placeholder content in GitHub updates
- do not commit secrets, token, .env asli, Cloudflare credential JSON, or DB dumps

GitHub / Runner status:
SAP repo:
- build workflow GREEN baseline
- DEV deploy workflow GREEN baseline
- self-hosted runner active

Runner service:
- actions.runner.finuxpert-cbj-sap.sapdev-pc-runner.service

Infra repo:
- finuxpert/infra

Infra runner active:
- actions.runner.finuxpert-infra.infra-svr-01-runner.service

Continuation objective:
Current code is build/deploy/API validated GREEN after Log Triage modularization through ErrorEvidenceRanking. Next priority is Case Evidence Replay: make saved case history open and show saved RCA results/evidence without requiring upload ulang.
```
