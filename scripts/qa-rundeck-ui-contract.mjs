import fs from 'node:fs'
import {
  hostResourceState,
  overallOperationalState,
  sapWorkloadState,
} from '../src/tools/components/rundeckStatusSemantics.js'
import { evaluationReasonText } from '../src/tools/components/rundeckEvaluationExplain.js'

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
  evaluation: read('src/tools/components/RundeckPerformanceEvaluation.jsx'),
  explain: read('src/tools/components/rundeckEvaluationExplain.js'),
  backendStatus: read('backend/rundeck_status.py'),
  backendLatest: read('backend/rundeck_latest.py'),
  backendIncidents: read('backend/rundeck_alert_incidents.py'),
  backendConsumers: read('backend/rundeck_consumers.py'),
  backendEvaluation: read('backend/rundeck_evaluation.py'),
  backendTrends: read('backend/rundeck_trends.py'),
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
const reviewAboveBaseline = {
  status: 'REVIEW REQUIRED',
  signals: { sustained_high_cpu: true, baseline_anomaly: true },
  anomaly_status: 'ABOVE BASELINE',
}
const reviewCriticalWp = {
  status: 'REVIEW REQUIRED',
  signals: { sustained_high_cpu: true, critical_wp_correlated: true },
}
const spikeOnly = { status: 'CPU SPIKE', signals: { cpu_spike: true } }

const monitoringSapIssuesIndex = files.monitoring.indexOf('<SapIssues')
const monitoringEvaluationIndex = files.monitoring.indexOf('<RundeckPerformanceEvaluation')

const checks = [
  ['version is v1.20.3', files.version.includes("APP_VERSION = '1.20.3'") && files.version.includes("APP_PREVIOUS_VERSION = '1.20.2'") && files.version.includes('final-semantic-polish-v1.20.3')],
  ['v1.20 operational CSS remains loaded', files.app.includes("./app/rundeck-v120.css")],
  ['production-safe report URL uses current origin and base', files.source.includes('window.location.origin') && files.source.includes('import.meta.env.BASE_URL')],

  ['host resource excludes WP-only attention', hostResourceState(wpAttention) === 'NORMAL'],
  ['WP 1-2 maps to ATTENTION', sapWorkloadState(wpAttention) === 'ATTENTION' && overallOperationalState([wpAttention]) === 'ATTENTION'],
  ['WP 3+ maps to CRITICAL', sapWorkloadState(wpCritical) === 'CRITICAL' && overallOperationalState([wpCritical]) === 'CRITICAL'],
  ['resource warning remains WARNING', hostResourceState(resourceWarning) === 'WARNING' && overallOperationalState([resourceWarning]) === 'WARNING'],
  ['resource critical remains CRITICAL', hostResourceState(resourceCritical) === 'CRITICAL' && overallOperationalState([resourceCritical]) === 'CRITICAL'],
  ['resolved SAP issue closes as CLEARED', files.backendIncidents.includes('"CLEARED" if incident.get("state") == "RESOLVED"')],

  ['short trend ranges are exposed in UI', ['30M', '1H', '3H', '6H', '24H', '7D', '30D'].every((value) => files.monitoring.includes(`'${value}'`))],
  ['short trend ranges are accepted by API', files.backendApi.includes('30m|1h|3h|6h|24h|7d|30d|90d')],
  ['short trend auto mode uses raw collection resolution', files.backendTrends.includes('"30m": {"hours": 0.5, "auto_bucket": "raw"}') && files.backendTrends.includes('"1h": {"hours": 1, "auto_bucket": "raw"}') && files.backendTrends.includes('"3h": {"hours": 3, "auto_bucket": "raw"}') && files.backendTrends.includes('if resolved_bucket == "raw"')],
  ['load is moved out of primary metric controls', !files.monitoring.includes("['load', 'Load'],") && files.monitoring.includes("setMetric('load')")],

  ['primary issue uses operator wording', files.incident.includes('Primary Issue') && files.incident.includes('Critical WP Active') && files.incident.includes('<b>OS Resource</b>')],
  ['primary issue removes recurring workload block', !files.incident.includes('Recurring Workload') && files.incident.includes('Current Workload')],
  ['current workloads use lean columns', files.workload.includes('Current Workloads') && files.workload.includes('CPU Usage') && files.workload.includes('PSS Memory') && files.workload.includes('Processes') && !files.workload.includes('<th>Type</th>')],
  ['current workload type remains available as sublabel', files.workload.includes('workloadTypeLabel(row.consumer_type)')],
  ['selected workload keeps observation performance and issue timeline', files.history.includes('>Observation<') && files.history.includes('>Performance<') && files.history.includes('Issue Timeline') && files.history.includes('Observed Checks')],
  ['observation history remains collapsed by default', files.history.includes('<details className="rundeckJobExecutionHistory">')],
  ['SAP Issues appears before Performance Evaluation', monitoringSapIssuesIndex >= 0 && monitoringEvaluationIndex >= 0 && monitoringSapIssuesIndex < monitoringEvaluationIndex],
  ['active SAP Issues open automatically', files.monitoring.includes('open={activeCount > 0}')],
  ['SAP Issues table uses lean six-column view', files.monitoring.includes('<th>APP</th><th>SAP Signal</th><th>State</th><th>Current</th><th>Peak</th><th>Duration</th>') && !files.monitoring.includes('<th>First Seen</th><th>Last Seen</th><th>Duration</th><th>Evidence</th>')],

  ['evaluation defaults to one day in UI and API', files.evaluation.includes("useState('1d')") && files.backendApi.includes('period: str = Query("1d"') && files.backendEvaluation.includes('evaluation_report(period: str = "1d"')],
  ['evaluation quality header is lean', ['Data Coverage', 'Collection Checks', 'Historical Baseline'].every((value) => files.evaluation.includes(value)) && !files.evaluation.includes('Persisted Depth')],
  ['low coverage limits conclusions explicitly', files.evaluation.includes('Historical window is not fully covered. Conclusions are limited.')],
  ['evaluation summary focuses on review spike and increase', files.evaluation.includes('Review Required') && files.evaluation.includes('CPU Spike') && files.evaluation.includes('CPU Increase') && !files.evaluation.includes('<span>CPU Shift</span>') && !files.evaluation.includes('<span>Workloads</span>')],
  ['review card does not imply high CPU and memory are a breakdown', files.evaluation.includes('workloads requiring review') && !files.evaluation.includes('summary.sustained_high_cpu') && !files.evaluation.includes('summary.high_memory')],
  ['evaluation table is lean', ['Status', 'Observed Checks', 'Avg CPU', 'Peak CPU', 'PSS Memory'].every((value) => files.evaluation.includes(value)) && !files.evaluation.includes('<th>Data Confidence</th>') && !files.evaluation.includes('label="Critical WP Overlap"')],
  ['status shows concise deterministic reason instead of confidence sublabel', files.evaluation.includes('rundeckEvaluationReason') && files.evaluation.includes('evaluationReasonText(row)') && !files.evaluation.includes('rundeckEvaluationConfidence ${confidenceClass(confidence)}')],
  ['review reason explains high CPU and baseline evidence', evaluationReasonText(reviewAboveBaseline) === 'High CPU · Above Baseline'],
  ['review reason qualifies Critical WP as supporting evidence', evaluationReasonText(reviewCriticalWp) === 'High CPU · Critical WP Evidence'],
  ['CPU spike explanation remains distinct from sustained high CPU', evaluationReasonText(spikeOnly) === 'Peak only'],
  ['historical CPU context exposes average P95 and difference', files.evaluation.includes('baselineCpuContext(row)') && files.explain.includes('Difference:') && files.explain.includes('Historical P95:')],
  ['observed checks are capped to complete collection checks', files.evaluation.includes('Math.min(observed, complete)')],
  ['display confidence is recomputed from visible checks and period quality', files.evaluation.includes('effectiveConfidence') && files.evaluation.includes("checks >= 20 ? 'HIGH' : checks >= 4 ? 'MEDIUM' : 'LOW'")],
  ['Critical WP wording states timing evidence without causation', files.evaluation.includes('same SAP App Server during the workload observation window') && files.evaluation.includes('not direct causation or direct workload-to-WP mapping')],
  ['evaluation keeps familiar operational statuses', ['REVIEW REQUIRED', 'HIGH CPU', 'HIGH MEMORY', 'CPU SPIKE', 'INCREASING CPU', 'RECURRING', 'INSUFFICIENT DATA', 'NORMAL'].every((value) => files.backendEvaluation.includes(value))],
  ['historical baseline uses median and P95', files.backendEvaluation.includes('_historical_baseline') && files.backendEvaluation.includes('percentile_cont(0.5)') && files.backendEvaluation.includes('percentile_cont(0.95)')],
  ['WP overlap remains normalized against APP baseline', files.backendEvaluation.includes('app_wp_baseline_pct') && files.backendEvaluation.includes('wp_excess_association_pct')],
  ['evaluation excludes incomplete collections', files.backendEvaluation.includes("status = 'READY'") && files.backendEvaluation.includes('received_host_count >=')],

  ['lean CSS removes duplicate header and server status columns visually', files.v120Css.includes('.rundeckLandscapeMeta span:nth-child(n+2)') && files.v120Css.includes('.rundeckServerTable th:nth-child(3)')],
  ['semantic colors reserve review and high states away from danger red', files.v120Css.includes('.is-review-required') && files.v120Css.includes('--sphere-review') && files.v120Css.includes('.is-high-cpu') && files.v120Css.includes('--sphere-high')],
  ['PDF preview still replaces immediate save', files.source.includes("pdf.output('blob')") && !files.source.includes('pdf.save(') && files.source.includes('Report Preview') && files.source.includes('Download PDF')],
  ['PDF summary contains only current workload', files.source.includes("pdf.text('CURRENT WORKLOAD'") && !files.source.includes("pdf.text('RECURRING WORKLOAD'")],
  ['PDF SAP App Server status uses lean columns', files.source.includes("['APP', 'OS RESOURCE', 'CPU', 'MEMORY', 'I/O WAIT', 'CRIT WP']") && !files.source.includes("['APP', 'OS RESOURCE', 'SAP WORKLOAD', 'CPU', 'MEMORY', 'I/O WAIT', 'CRIT WP']")],
  ['PDF keeps one-page triage sections', ['PRIMARY ISSUE', 'SAP APP SERVER STATUS', 'SERVER ${trendMetric} TREND', 'SELECTED WORKLOAD', 'TOP ACTIVE WORKLOADS'].every((value) => files.source.includes(value))],
  ['PDF carries the same qualified evaluation reason when available', files.source.includes('/evaluation/workloads?period=1d&type=ALL&limit=100') && files.source.includes('evaluationReasonText(evaluation)') && files.explain.includes('Critical WP Evidence')],

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
  console.error(`\n${failed.length} Rundeck v1.20.3 contract check(s) failed.`)
  process.exit(1)
}

console.log('\nRundeck v1.20.3 contract checks passed.')
