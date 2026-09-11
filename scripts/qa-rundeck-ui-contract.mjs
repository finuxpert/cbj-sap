import fs from 'node:fs'
import {
  hostResourceState,
  overallOperationalState,
  sapWorkloadState,
} from '../src/tools/components/rundeckStatusSemantics.js'

const read = (path) => fs.readFileSync(path, 'utf8')
const files = {
  app: read('src/App.jsx'),
  v120Css: read('src/app/rundeck-v120.css'),
  source: read('src/tools/components/RundeckSource.jsx'),
  sourceCss: read('src/tools/components/RundeckSource.css'),
  incident: read('src/tools/components/RundeckPerformanceIncident.jsx'),
  workload: read('src/tools/components/RundeckCurrentWorkload.jsx'),
  history: read('src/tools/components/RundeckJobHistory.jsx'),
  monitoring: read('src/tools/components/RundeckMonitoringHistory.jsx'),
  monitoringCss: read('src/tools/components/RundeckMonitoringHistory.css'),
  evaluation: read('src/tools/components/RundeckPerformanceEvaluation.jsx'),
  backendStatus: read('backend/rundeck_status.py'),
  backendLatest: read('backend/rundeck_latest.py'),
  backendIncidents: read('backend/rundeck_alert_incidents.py'),
  backendConsumers: read('backend/rundeck_consumers.py'),
  backendEvaluation: read('backend/rundeck_evaluation.py'),
  backendApi: read('backend/rundeck_api.py'),
  backfill: read('ops/rundeck/backfill-consumers.py'),
  deployDev: read('ops/rundeck/deploy-dev.sh'),
  nginxUpdater: read('ops/rundeck/update-nginx-block.py'),
  visualConfig: read('playwright.config.mjs'),
  visualSpec: read('tests/visual/rundeck.visual.spec.mjs'),
  version: read('src/app/version.js'),
}

const wpAttention = { cpu_pct: 20, ram_pct: 55, io_wait_pct: 0, wp_critical: 2 }
const wpCritical = { ...wpAttention, wp_critical: 3 }
const resourceWarning = { cpu_pct: 80, ram_pct: 55, io_wait_pct: 0, wp_critical: 0 }
const resourceCritical = { cpu_pct: 95, ram_pct: 55, io_wait_pct: 0, wp_critical: 0 }

const monitoringSapIssuesIndex = files.monitoring.indexOf('<SapIssues')
const monitoringEvaluationIndex = files.monitoring.indexOf('<RundeckPerformanceEvaluation')

const checks = [
  ['version is v1.20.0', files.version.includes("APP_VERSION = '1.20.0'") && files.version.includes("APP_PREVIOUS_VERSION = '1.19.4'") && files.version.includes('analysis-first-baseline-intelligence-v1.20.0')],
  ['v1.20 operational CSS is loaded', files.app.includes("./app/rundeck-v120.css")],
  ['production-safe report URL uses current origin and base', files.source.includes('window.location.origin') && files.source.includes('import.meta.env.BASE_URL')],

  ['host resource excludes WP-only attention', hostResourceState(wpAttention) === 'NORMAL'],
  ['WP 1-2 maps to ATTENTION', sapWorkloadState(wpAttention) === 'ATTENTION' && overallOperationalState([wpAttention]) === 'ATTENTION'],
  ['WP 3+ maps to CRITICAL', sapWorkloadState(wpCritical) === 'CRITICAL' && overallOperationalState([wpCritical]) === 'CRITICAL'],
  ['resource warning remains WARNING', hostResourceState(resourceWarning) === 'WARNING' && overallOperationalState([resourceWarning]) === 'WARNING'],
  ['resource critical remains CRITICAL', hostResourceState(resourceCritical) === 'CRITICAL' && overallOperationalState([resourceCritical]) === 'CRITICAL'],
  ['resolved SAP issue closes as CLEARED', files.backendIncidents.includes('"CLEARED" if incident.get("state") == "RESOLVED"')],

  ['analysis flow uses SAP App Server terminology', files.source.includes('SAP App Servers') && files.source.includes('<th>OS Resource</th>') && files.source.includes('<th>Memory</th>') && !files.source.includes('<th>Load</th>')],
  ['primary issue uses operator wording', files.incident.includes('Primary Issue') && files.incident.includes('Critical WP Active') && files.incident.includes('<b>OS Resource</b>') && files.incident.includes('Observed in')],
  ['current workloads prioritize Basis and Infra fields', files.workload.includes('Current Workloads') && files.workload.includes('>CPU Usage</th>') && files.workload.includes('<th>PSS Memory</th>') && files.workload.includes('<th>Processes</th>')],
  ['selected workload separates observation performance and issue timeline', files.history.includes('>Observation<') && files.history.includes('>Performance<') && files.history.includes('Issue Timeline') && files.history.includes('Observed Checks')],
  ['selected workload uses aggregate-friendly CPU and memory terminology', files.history.includes('CPU Usage') && files.history.includes('PSS Memory') && files.history.includes('Processes')],
  ['SAP Issues appears before Performance Evaluation', monitoringSapIssuesIndex >= 0 && monitoringEvaluationIndex >= 0 && monitoringSapIssuesIndex < monitoringEvaluationIndex],
  ['SAP Issues table is simplified', files.monitoring.includes('<th>Current</th><th>Peak</th>') && !files.monitoring.includes('Peak / Latest') && !files.monitoring.includes('<th>Checks</th>')],

  ['evaluation defaults to one day in UI and API', files.evaluation.includes("useState('1d')") && files.backendApi.includes('period: str = Query("1d"') && files.backendEvaluation.includes('evaluation_report(period: str = "1d"')],
  ['evaluation table is analysis-first', ['Status', 'Data Confidence', 'Observed Checks', 'Avg CPU', 'Peak CPU', 'PSS Memory', 'Critical WP Overlap'].every((value) => files.evaluation.includes(value))],
  ['evaluation no longer exposes noisy default columns', !files.evaluation.includes('label="Core Eq"') && !files.evaluation.includes('label="WP Excess"') && !files.evaluation.includes('label="Recurring"')],
  ['evaluation uses familiar operational statuses', ['REVIEW REQUIRED', 'HIGH CPU', 'HIGH MEMORY', 'CPU SPIKE', 'INCREASING CPU', 'RECURRING', 'INSUFFICIENT DATA', 'NORMAL'].every((value) => files.backendEvaluation.includes(value))],
  ['evaluation keeps backward-compatible assessment values', ['NEEDS REVIEW', 'HIGH RESOURCE', 'INCREASING', 'RECURRING', 'LIMITED DATA', 'STABLE'].every((value) => files.backendEvaluation.includes(value))],
  ['historical baseline uses median and P95', files.backendEvaluation.includes('_historical_baseline') && files.backendEvaluation.includes('percentile_cont(0.5)') && files.backendEvaluation.includes('percentile_cont(0.95)') && files.backendEvaluation.includes('historical_baseline')],
  ['baseline anomaly is workload specific', files.backendEvaluation.includes('cpu_baseline_deviation_pct') && files.backendEvaluation.includes('pss_baseline_deviation_pct') && files.backendEvaluation.includes('baseline_anomaly') && files.backendEvaluation.includes('ABOVE BASELINE')],
  ['recent CPU shift detection is deterministic', files.backendEvaluation.includes('_recent_shift_window') && files.backendEvaluation.includes('performance_shift') && files.backendEvaluation.includes('SHIFT_RECENT_HOURS')],
  ['single peak is distinguished from sustained high CPU', files.backendEvaluation.includes('cpu_spike') && files.backendEvaluation.includes('sustained_high_cpu') && files.backendEvaluation.includes('peak_cpu - avg_cpu >= 40')],
  ['WP overlap remains normalized against APP baseline', files.backendEvaluation.includes('app_wp_baseline_pct') && files.backendEvaluation.includes('wp_excess_association_pct') && files.backendEvaluation.includes('WP_EXCESS_ASSOCIATION_PCT')],
  ['evaluation excludes incomplete collections', files.backendEvaluation.includes("status = 'READY'") && files.backendEvaluation.includes('received_host_count >=') && files.backendEvaluation.includes('_complete_collection_clause')],
  ['top consumer persistence remains Top 30 and aggregate aware', files.backendConsumers.includes('SPHERE_TOP_CONSUMERS_PER_HOST') && files.backendConsumers.includes('"30"') && files.backendConsumers.includes('total_pss_gb') && files.backendConsumers.includes('SUM_BY_CONSUMER')],
  ['historical backfill remains dry-run first and DEV guarded', files.backfill.includes('action="store_true"') && files.backfill.includes('_dev_database_allowed') && files.backfill.includes('NO DATABASE CHANGES MADE')],
  ['evaluation API remains read-only GET', files.backendApi.includes('@app.get("/evaluation/workloads")')],

  ['semantic color cleanup reserves review and high states away from danger red', files.v120Css.includes('.is-review-required') && files.v120Css.includes('--sphere-review') && files.v120Css.includes('.is-high-cpu') && files.v120Css.includes('--sphere-high') && files.v120Css.includes('.is-insufficient-data') && files.v120Css.includes('--sphere-neutral')],
  ['SAP Issues current severity is visually stronger than peak', files.v120Css.includes('.rundeckIncidentCurrent') && files.v120Css.includes('.rundeckIncidentPeak')],
  ['PDF preview replaces immediate save', files.source.includes("pdf.output('blob')") && !files.source.includes('pdf.save(') && files.source.includes('Report Preview') && files.source.includes('Download PDF') && files.source.includes('Open in New Tab')],
  ['PDF preview uses the same generated blob artifact', files.source.includes('URL.createObjectURL(blob)') && files.source.includes('src={pdfPreview.url}') && files.source.includes('download={pdfPreview.filename}')],
  ['PDF server table separates OS resource and SAP workload', files.source.includes("'OS RESOURCE', 'SAP WORKLOAD'") && files.source.includes('SAP APP SERVER STATUS')],
  ['PDF status marker is rectangular', files.source.includes("pdf.rect(W - margin - 25, 11, 21, 7, 'F')")],

  ['deployment uses isolated managed nginx block updater', files.nginxUpdater.includes('BEGIN SPHERE') && files.nginxUpdater.includes('END SPHERE') && files.deployDev.includes('update-nginx-block.py') && files.deployDev.includes('--name DEV')],
  ['DEV deploy protects production routing', files.deployDev.includes('# SPHERE production Rundeck API routing') && files.deployDev.includes('# BEGIN SPHERE PROD ROUTING')],
  ['DEV deploy validates production JSON endpoints', files.deployDev.includes('https://sphere.astraotoparts.co.id/api/collections/latest') && files.deployDev.includes('https://sphere.astraotoparts.co.id/api/history/hosts/latest') && files.deployDev.includes('https://sphere.astraotoparts.co.id/api/platform/health') && files.deployDev.includes('HTML returned where JSON was required')],
  ['DEV deploy validates DEV JSON endpoint', files.deployDev.includes('https://sphere.astraotoparts.co.id/dev/api/collections/latest')],

  ['adaptive layout remains enabled', files.sourceCss.includes('container-type: inline-size') && files.sourceCss.includes('clamp(')],
  ['visual config still covers desktop and laptop', files.visualConfig.includes('desktop-1920') && files.visualConfig.includes('laptop-1366')],
  ['backend still exposes explicit OS and SAP status domains', files.backendStatus.includes('resource_health') && files.backendStatus.includes('sap_workload_state') && files.backendLatest.includes('enrich_host_state')],
]

const failed = checks.filter(([, ok]) => !ok)
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)

if (failed.length) {
  console.error(`\n${failed.length} Rundeck v1.20 contract check(s) failed.`)
  process.exit(1)
}

console.log('\nRundeck v1.20 contract checks passed.')
