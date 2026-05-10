# Next Chat Continuation Prompt - SAP Intelligent RCA Workspace

Use this prompt to continue work in a new ChatGPT conversation.

```text
Lanjut SAP Intelligent RCA Workspace dari state Log Triage modularization in progress.

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
- DEV deploy via GitHub Actions self-hosted runner

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

Current verified GREEN baseline before latest modularization:
- build success
- DEV deploy success
- backend API success
- PostgreSQL hybrid mode success
- Evidence History panel active
- filesystem fallback active
- public /sap-api reachable
- nginx proxy healthy

Health validation baseline:
- /sap-api/health
  - status ok
  - database.enabled true
  - database.configured true
  - database.mode hybrid

Recent important commits already pushed:
- Add PostgreSQL-first reads for SAP RCA hybrid mode
- Add DB-backed evidence history panel
- Document SAP PostgreSQL hybrid continuation
- Document validated sapdev deploy workflow
- Refresh next chat runtime continuation prompt
- Document next Log Triage modularization target
- Add immediate execution plan for next refactor phase
- Add modular Log Triage analysis module
- Convert legacy log evidence analysis file to compatibility re-export
- Convert legacy confidence label module to compatibility re-export
- Add Log Triage summary strip component
- Wire Log Triage summary strip component
- Refresh Log Triage continuation after SummaryStrip wiring

Important latest status:
- buildAnalysis() was already outside ToolLogEvidenceV2 in src/tools/log-evidence-analysis.js.
- New modular analysis path created:
  - src/tools/logtriage/analysis/buildAnalysis.js
  - src/tools/logtriage/analysis/confidenceLabel.js
- Legacy compatibility re-export kept:
  - src/tools/log-evidence-analysis.js
  - src/tools/log-evidence-confidence.js
- SummaryStrip component created:
  - src/tools/logtriage/components/SummaryStrip.jsx
- SummaryStrip is now WIRED into ToolLogEvidenceV2.jsx.
- ToolLogEvidenceV2.jsx now imports SummaryStrip from:
  - ./logtriage/components/SummaryStrip.jsx
- Inline decisionBoard JSX has been replaced with:
  - <SummaryStrip analysis={analysis} primary={primary} status={status} />
- Unused DecisionCard import was removed from ToolLogEvidenceV2.jsx.
- Latest GitHub commit for wiring:
  - 5c19fe4723c3c46877bda6b94338f19e3da805ed

Branch state:
- dev -> origin/dev

Validated deploy flow:
cd /home/sadmin/sap

sudo -u sadmin git fetch origin
sudo -u sadmin git reset --hard origin/dev

npm run build

sudo rm -rf /var/www/svr01-dev/sap/*
sudo cp -rv dist/* /var/www/svr01-dev/sap/

sudo chown -R www-data:www-data /var/www/svr01-dev/sap

sudo find /var/www/svr01-dev/sap -type d -exec chmod 755 {} \;
sudo find /var/www/svr01-dev/sap -type f -exec chmod 644 {} \;

sudo nginx -t && sudo systemctl reload nginx

Validation commands:
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

Current incremental refactor status:
Already extracted or modularized:
- parseGenericErrors()
- groupEvidenceRows()
- buildTimeline()
- buildSystemResources()
- buildAnalysis()
- confidenceLabel()
- SummaryStrip.jsx created and wired

Current safest target:
1. fetch latest dev
2. run npm build
3. if build GREEN, deploy DEV
4. validate /sap-api/health and Log Evidence UI
5. verify SummaryStrip renders the same four cards:
   - Primary Error
   - Error Family
   - Owner Direction
   - Confidence
6. if validation GREEN, continue next incremental extraction

Next incremental extraction target:
1. extract Primary Error Explanation panel
2. extract Error Job / Program Mapping panel
3. extract Error Evidence Ranking panel
4. extract Uploaded / Persistence panels if safe
5. bundle optimization
6. virtualized rendering with react-window

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

Collect Server Info:
- GREEN

Next infra target:
- add runner on public server
- add runner on web-dev
- labels:
  - svr-public,infra,public
  - web-dev,infra,dev

DO NOT:
- commit secrets
- commit .env
- commit token
- commit Cloudflare credential JSON
- commit DB dumps
- touch PROD unnecessarily

Preferred workflow:
- local validate
- build
- deploy DEV
- verify API
- verify UI
- commit/push

Continuation objective:
Continue incremental Log Triage modularization. First validate the already-wired SummaryStrip build/deploy, then extract the next small panel from ToolLogEvidenceV2 without changing behavior.
```
