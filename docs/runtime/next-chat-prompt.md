# Next Chat Continuation Prompt - SAP Intelligent RCA Workspace

Use this prompt to continue work in a new ChatGPT conversation.

```text
Lanjut SAP Intelligent RCA Workspace dari state Log Triage modularization validated GREEN.

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
- build validated after latest Log Triage modularization
- Vite version shown: v7.3.2
- modules transformed: 988
- build time around 7.53s
- latest HEAD after fetch/reset: a560ccbb0ec97f9f9d6b33dfea1fa23a12522259
- screenshot validation from mobile terminal showed build completed successfully

Current latest git state:
- origin/dev -> a560ccbb0ec97f9f9d6b33dfea1fa23a12522259
- HEAD is now at a560ccbb Wire Log Triage job program mapping panel

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

Important recovery note:
- A bad placeholder overwrite previously happened on ToolLogEvidenceV2.jsx with content REPLACED_FOR_BREVITY.
- It was recovered by force-moving dev back to safe commit b34f3a61e6d49a2cffd39fbd507d2245409735f5.
- Then proper full-content wiring was applied safely.
- Current latest commit a560ccbb is good and build GREEN.
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

Current component paths:
- src/tools/logtriage/components/SummaryStrip.jsx
- src/tools/logtriage/components/PrimaryErrorPanel.jsx
- src/tools/logtriage/components/JobProgramMappingPanel.jsx

Current ToolLogEvidenceV2 wiring:
- imports SummaryStrip from ./logtriage/components/SummaryStrip.jsx
- imports PrimaryErrorPanel from ./logtriage/components/PrimaryErrorPanel.jsx
- imports JobProgramMappingPanel from ./logtriage/components/JobProgramMappingPanel.jsx
- inline decisionBoard replaced with SummaryStrip
- inline Primary Error Explanation panel replaced with PrimaryErrorPanel
- inline Error Job / Program Mapping panel replaced with JobProgramMappingPanel

Health validation baseline:
- /sap-api/health
  - status ok
  - database.enabled true
  - database.configured true
  - database.mode hybrid

Validated build command already run successfully:
cd /home/sadmin/sap
sudo -u sadmin git fetch origin
sudo -u sadmin git reset --hard origin/dev
npm run build

Deploy flow when ready:
cd /home/sadmin/sap
sudo rm -rf /var/www/svr01-dev/sap/*
sudo cp -rv dist/* /var/www/svr01-dev/sap/
sudo chown -R www-data:www-data /var/www/svr01-dev/sap
sudo find /var/www/svr01-dev/sap -type d -exec chmod 755 {} \;
sudo find /var/www/svr01-dev/sap -type f -exec chmod 644 {} \;
sudo nginx -t && sudo systemctl reload nginx

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

Current safest next target:
1. Deploy current GREEN build to DEV if not deployed yet.
2. Validate public /sap-api/health.
3. Open Log Evidence UI and verify:
   - SummaryStrip renders four cards: Primary Error, Error Family, Owner Direction, Confidence
   - PrimaryErrorPanel renders same content as before
   - JobProgramMappingPanel renders same jobs/program/times mapping as before
4. If UI is GREEN, continue next extraction.

Next incremental extraction target:
1. Extract Error Evidence Ranking panel into:
   - src/tools/logtriage/components/ErrorEvidenceRanking.jsx
2. Keep behavior identical.
3. Do not touch backend, nginx, DB schema, Cloudflare, PROD.
4. After extraction, run npm run build before any deploy.

Recommended next architecture target:
src/tools/logtriage/
├── components/
│   ├── SummaryStrip.jsx
│   ├── PrimaryErrorPanel.jsx
│   ├── JobProgramMappingPanel.jsx
│   ├── ErrorEvidenceRanking.jsx
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

Reason:
- reduce render weight
- avoid browser freeze
- improve scalability
- easier rollback
- easier future AI narrative integration

Next high-impact feature AFTER cleanup:
- AI-assisted RCA narrative
- RCA correlation engine
- virtualized evidence rendering
- persistent evidence sessions
- RCA replay timeline

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
Current code is build-validated GREEN after SummaryStrip, PrimaryErrorPanel, and JobProgramMappingPanel wiring. Continue by deploying/validating DEV UI, then extract ErrorEvidenceRanking.jsx as the next small incremental refactor.
```
