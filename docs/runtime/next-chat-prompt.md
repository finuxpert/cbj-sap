# Next Chat Continuation Prompt - SAP Intelligent RCA Workspace

Use this prompt to continue work in a new ChatGPT conversation.

```text
Lanjut SAP Intelligent RCA Workspace dari state hybrid PostgreSQL GREEN.

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

Current verified GREEN status:
- build success
- DEV deploy success
- backend API success
- PostgreSQL hybrid mode success
- Evidence History panel active
- filesystem fallback active
- public /sap-api reachable
- nginx proxy healthy

Health validation:
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
Already extracted:
- parseGenericErrors()
- groupEvidenceRows()
- buildTimeline()

Current target:
- extract buildAnalysis()
- extract confidenceLabel()
- reduce ToolLogEvidenceV2 monolith
- reduce bundle size (~1 MB warning still exists)

Recommended next architecture target:
src/tools/logtriage/
├── components/
│   ├── SummaryStrip.jsx
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

Priority order:
1. extract buildAnalysis()
2. extract confidenceLabel()
3. modularize ToolLogEvidenceV2
4. bundle optimization
5. virtualized rendering with react-window

Immediate next execution plan:
1. locate all buildAnalysis() dependencies
2. move pure analysis logic into src/tools/logtriage/analysis/buildAnalysis.js
3. export/import without changing runtime behavior
4. run npm build
5. validate no blank screen
6. deploy DEV
7. validate /sap-api/health
8. validate Evidence History UI
9. commit incremental diff only

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

Next high impact targets:
1. split App.jsx further
2. unify CSS layers
3. unified ZIP uploader
4. persistent evidence sessions
5. RCA timeline replay
6. Comparer ↔ Logs correlation
7. virtualized log rendering
8. AI-assisted RCA narrative
9. bundle optimization

Long-term direction:
Transform app from React parser utility into internal SAP observability + RCA workspace platform.

GitHub / Runner status:
SAP repo:
- build workflow GREEN
- DEV deploy workflow GREEN
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
Continue incremental cleanup and modularization while keeping hybrid PostgreSQL runtime stable and DEV deployment GREEN.
```
