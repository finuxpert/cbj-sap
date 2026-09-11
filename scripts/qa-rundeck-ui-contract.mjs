import fs from 'node:fs'
import {
  hostResourceState,
  overallOperationalState,
  sapWorkloadState,
} from '../src/tools/components/rundeckStatusSemantics.js'

const files = {
  app: fs.readFileSync('src/App.jsx', 'utf8'),
  cohesion: fs.readFileSync('src/app/rundeck-cohesion-v1194.css', 'utf8'),
  source: fs.readFileSync('src/tools/components/RundeckSource.jsx', 'utf8'),
  sourceCss: fs.readFileSync('src/tools/components/RundeckSource.css', 'utf8'),
  incident: fs.readFileSync('src/tools/components/RundeckPerformanceIncident.jsx', 'utf8'),
  incidentCss: fs.readFileSync('src/tools/components/RundeckPerformanceIncident.css', 'utf8'),
  workload: fs.readFileSync('src/tools/components/RundeckCurrentWorkload.jsx', 'utf8'),
  history: fs.readFileSync('src/tools/components/RundeckJobHistory.jsx', 'utf8'),
  historyCss: fs.readFileSync('src/tools/components/RundeckJobHistory.css', 'utf8'),
  monitoring: fs.readFileSync('src/tools/components/RundeckMonitoringHistory.jsx', 'utf8'),
  monitoringCss: fs.readFileSync('src/tools/components/RundeckMonitoringHistory.css', 'utf8'),
  evaluation: fs.readFileSync('src/tools/components/RundeckPerformanceEvaluation.jsx', 'utf8'),
  evaluationCss: fs.readFileSync('src/tools/components/RundeckPerformanceEvaluation.css', 'utf8'),
  semantics: fs.readFileSync('src/tools/components/rundeckStatusSemantics.js', 'utf8'),
  backendStatus: fs.readFileSync('backend/rundeck_status.py', 'utf8'),
  backendLatest: fs.readFileSync('backend/rundeck_latest.py', 'utf8'),
  backendIncidents: fs.readFileSync('backend/rundeck_alert_incidents.py', 'utf8'),
  backendConsumers: fs.readFileSync('backend/rundeck_consumers.py', 'utf8'),
  backendEvaluation: fs.readFileSync('backend/rundeck_evaluation.py', 'utf8'),
  backendApi: fs.readFileSync('backend/rundeck_api.py', 'utf8'),
  backfill: fs.readFileSync('ops/rundeck/backfill-consumers.py', 'utf8'),
  deployDev: fs.readFileSync('ops/rundeck/deploy-dev.sh', 'utf8'),
  nginxUpdater: fs.readFileSync('ops/rundeck/update-nginx-block.py', 'utf8'),
  visualConfig: fs.readFileSync('playwright.config.mjs', 'utf8'),
  visualSpec: fs.readFileSync('tests/visual/rundeck.visual.spec.mjs', 'utf8'),
  version: fs.readFileSync('src/app/version.js', 'utf8'),
}

const wpAttention = { cpu_pct: 20, ram_pct: 55, io_wait_pct: 0, wp_critical: 2 }
const wpCritical = { ...wpAttention, wp_critical: 3 }
const resourceWarning = { cpu_pct: 80, ram_pct: 55, io_wait_pct: 0, wp_critical: 0 }
const resourceCritical = { cpu_pct: 95, ram_pct: 55, io_wait_pct: 0, wp_critical: 0 }

const checks = [
  ['version is v1.19.4', files.version.includes("APP_VERSION = '1.19.4'") && files.version.includes("APP_PREVIOUS_VERSION = '1.19.2'") && files.version.includes('calibrated-risk-ui-cohesion-v1.19.4')],
  ['production-safe report URL uses current origin/base', files.source.includes('window.location.origin') && !files.source.includes("sphere.astraotoparts.co.id/dev/#/st03n")],
  ['backend exposes explicit resource/workload/operational states', files.backendStatus.includes('resource_health') && files.backendStatus.includes('sap_workload_state') && files.backendStatus.includes('operational_state') && files.backendLatest.includes('enrich_host_state')],
  ['host resource excludes WP-only attention', hostResourceState(wpAttention) === 'NORMAL'],
  ['WP 1-2 maps to ATTENTION', sapWorkloadState(wpAttention) === 'ATTENTION' && overallOperationalState([wpAttention]) === 'ATTENTION'],
  ['WP 3+ maps to CRITICAL', sapWorkloadState(wpCritical) === 'CRITICAL' && overallOperationalState([wpCritical]) === 'CRITICAL'],
  ['resource warning remains WARNING', hostResourceState(resourceWarning) === 'WARNING' && overallOperationalState([resourceWarning]) === 'WARNING'],
  ['resource critical remains CRITICAL', hostResourceState(resourceCritical) === 'CRITICAL' && overallOperationalState([resourceCritical]) === 'CRITICAL'],
  ['resolved issue current severity closes cleanly', files.backendIncidents.includes('"CLEARED" if incident.get("state") == "RESOLVED"') && files.sourceCss.includes('.rundeckStatus.is-cleared') && files.monitoringCss.includes('.rundeckInlineStatus.is-cleared')],
  ['SAP Issues exposes SAP signal plus current and peak severity', files.monitoring.includes('<th>SAP Signal</th>') && files.monitoring.includes('<th>Current Severity</th><th>Peak Severity</th>') && files.backendIncidents.includes('current_severity') && files.backendIncidents.includes('peak_severity')],
  ['critical WP terminology is a count', files.monitoring.includes('Critical WP Count') && files.backendIncidents.includes('Critical WP Count')],
  ['application server table shows both status domains', files.source.includes('<th>Host Resource</th><th>SAP Workload</th>')],
  ['PDF table shows both status domains', files.source.includes("'HOST RESOURCE', 'SAP WORKLOAD'")],
  ['primary issue formats Critical WP count before label', files.incident.includes('issueSignalText') && files.source.includes('issueSignalText')],
  ['incident summary labels Host Resource and SAP Workload separately', files.incident.includes('<b>Host Resource</b>') && files.incident.includes('<b>SAP Workload</b>')],
  ['summary workload buttons navigate to selected workload detail', files.incident.includes('scrollToSelectedWorkload') && files.incident.includes("document.querySelector('.rundeckJobHistory')") && files.incident.includes('selectAndInspect(currentContext)') && files.incident.includes('selectAndInspect(persistentContext)') && files.incidentCss.includes("content: '↓'")],
  ['PDF trend title follows selected metric and range', files.source.includes('trendContext.metricLabel') && files.source.includes('trendContext.rangeLabel') && files.monitoring.includes('onTrendContext')],
  ['platform health is distinguished from SAP performance', files.source.includes('SPHERE Platform Health')],

  ['performance evaluation defaults to mature 1-day period', files.evaluation.includes("useState('1d')") && files.backendEvaluation.includes('evaluation_report(period: str = "1d"')],
  ['performance evaluation supports daily weekly monthly periods', files.evaluation.includes("['1d', '1 Day']") && files.evaluation.includes("['7d', '7 Days']") && files.evaluation.includes("['30d', '30 Days']") && files.backendEvaluation.includes('PERIOD_DAYS = {"1d": 1, "7d": 7, "30d": 30}')],
  ['performance evaluation supports programs and jobs', files.evaluation.includes("['PROGRAM', 'Programs']") && files.evaluation.includes("['JOB', 'Jobs']") && files.backendEvaluation.includes("tc.consumer_type IN ('JOB', 'PROGRAM')")],
  ['evaluation uses current vs previous equivalent period', files.backendEvaluation.includes('previous_start = start - timedelta(days=days)') && files.backendEvaluation.includes('baseline_eligible')],
  ['evaluation classifications avoid root-cause overclaim', ['NEEDS REVIEW', 'HIGH RESOURCE', 'INCREASING', 'RECURRING', 'LIMITED DATA', 'STABLE'].every((value) => files.backendEvaluation.includes(value)) && files.backendEvaluation.includes('not root-cause proof')],
  ['evaluation excludes partial collections', files.backendEvaluation.includes('received_host_count >=') && files.backendEvaluation.includes("status = 'READY'") && files.backendEvaluation.includes('_complete_collection_clause')],
  ['evaluation separates observation period and trend confidence', ['observation_confidence', 'period_confidence', 'overall_confidence', 'trend_confidence', 'trend_baseline_status'].every((value) => files.backendEvaluation.includes(value)) && files.evaluation.includes('Period Coverage') && files.evaluation.includes('LOW COVERAGE') && files.evaluation.includes('Previous Window')],
  ['no-baseline does not render as zero change', files.evaluation.includes("return 'NO BASELINE'") && files.backendEvaluation.includes('trend_baseline_status')],
  ['WP association is normalized against APP baseline', files.backendEvaluation.includes('app_wp_baseline_pct') && files.backendEvaluation.includes('wp_excess_association_pct') && files.backendEvaluation.includes('WP_EXCESS_ASSOCIATION_PCT') && files.evaluation.includes('WP Excess') && files.evaluation.includes('Strongest WP Association')],
  ['process CPU context includes core equivalent and process count', files.backendEvaluation.includes('avg_cpu_core_equivalent') && files.backendEvaluation.includes('avg_process_count') && files.evaluation.includes('Core Eq') && files.evaluation.includes('>Proc<')],
  ['smart sorting exposes risk and operational presets', ['Top Risk', 'Highest CPU', 'Most Observed', 'Most Recurring', 'Highest PSS', 'Strongest WP Association'].every((value) => files.evaluation.includes(value)) && files.evaluation.includes('riskCompare') && files.evaluation.includes('SortHeader')],
  ['seen count is explicitly observation based', files.evaluation.includes('persisted top-consumer observation cycles') && files.backendEvaluation.includes('seen_definition')],
  ['consumer retention depth is increased and configurable', files.backendConsumers.includes('SPHERE_TOP_CONSUMERS_PER_HOST') && files.backendConsumers.includes('"30"') && files.backendConsumers.includes('persisted_rank_limit')],
  ['multi-process memory and IO use aggregate resource fields', files.backendConsumers.includes('total_pss_gb') && files.backendConsumers.includes('total_rss_gb') && files.backendConsumers.includes('total_read_mib_s') && files.backendConsumers.includes('total_write_mib_s') && files.backendConsumers.includes('SUM_BY_CONSUMER')],
  ['historical consumer backfill is dry-run first and dev guarded', files.backfill.includes('action="store_true"') && files.backfill.includes('_dev_database_allowed') && files.backfill.includes('NO DATABASE CHANGES MADE')],
  ['evaluation API is read only GET', files.backendApi.includes('@app.get("/evaluation/workloads")') && files.evaluation.includes('/evaluation/workloads?period=')],

  ['Rundeck cohesion overrides are loaded', files.app.includes("./app/rundeck-cohesion-v1194.css")],
  ['topbar and panel use one dark palette', files.cohesion.includes('.appShell:has(.rundeckPanel) .navbar') && files.cohesion.includes("background: #0f151a") && files.cohesion.includes('--sphere-surface-1: #111a20')],
  ['status and assessment pills are flattened', files.cohesion.includes('.rundeckEvaluationAssessment') && files.cohesion.includes('border-radius: 2px !important')],
  ['table status indicators are rectangular ticks', files.cohesion.includes('.rundeckInlineStatus::before') && files.cohesion.includes('width: 4px !important') && files.cohesion.includes('height: 8px !important') && files.cohesion.includes('border-radius: 1px !important')],
  ['primary issue receives structured breathing room', files.cohesion.includes('.rundeckIncidentComparison') && files.cohesion.includes('.rundeckIncidentFacts') && files.cohesion.includes('.rundeckIncidentHostContext')],
  ['selected workload separates and spaces observation/performance', files.history.includes('rundeckJobHistoryOverview') && files.history.includes('>Observation<') && files.history.includes('>Performance<') && files.cohesion.includes('.rundeckJobHistoryGroup') && files.cohesion.includes('.rundeckJobPerformanceTitle')],

  ['DEV nginx updater uses isolated BEGIN/END managed blocks', files.nginxUpdater.includes('BEGIN SPHERE') && files.nginxUpdater.includes('END SPHERE') && files.nginxUpdater.includes('protected_markers')],
  ['DEV deploy cannot sweep production routing during legacy migration', files.deployDev.includes('update-nginx-block.py') && files.deployDev.includes('--name DEV') && files.deployDev.includes('# SPHERE production Rundeck API routing') && files.deployDev.includes('# BEGIN SPHERE PROD ROUTING')],
  ['DEV deploy verifies public production JSON routes', files.deployDev.includes('https://sphere.astraotoparts.co.id/api/collections/latest') && files.deployDev.includes('https://sphere.astraotoparts.co.id/api/history/hosts/latest') && files.deployDev.includes('https://sphere.astraotoparts.co.id/api/platform/health') && files.deployDev.includes('HTML returned where JSON was required')],
  ['DEV deploy verifies public DEV JSON route', files.deployDev.includes('https://sphere.astraotoparts.co.id/dev/api/collections/latest')],

  ['adaptive UI uses centralized spacing tokens', files.sourceCss.includes('--sphere-space-1') && files.sourceCss.includes('--sphere-space-5') && files.sourceCss.includes('--sphere-font-body')],
  ['adaptive UI uses container queries', files.sourceCss.includes('container-type: inline-size') && files.incidentCss.includes('@container') && files.monitoringCss.includes('@container') && files.historyCss.includes('@container') && files.evaluationCss.includes('@container')],
  ['adaptive UI uses fluid type and spacing', files.sourceCss.includes('clamp(') && files.incidentCss.includes('clamp(') && files.evaluationCss.includes('clamp(')],
  ['Playwright covers desktop and laptop visual layouts', files.visualConfig.includes('desktop-1920') && files.visualConfig.includes('laptop-1366') && files.visualSpec.includes('SPHERE_VISUAL_COMPARE') && files.visualSpec.includes('toHaveScreenshot')],
  ['visual QA checks evaluation and cleared issue semantics', files.visualSpec.includes('Performance Evaluation') && files.visualSpec.includes('Current Severity') && files.visualSpec.includes('CLEARED')],
  ['process CPU semantics are explained', files.workload.includes('PROCESS_CPU_HINT') && files.history.includes('PROCESS_CPU_HINT') && files.evaluation.includes('PROCESS_CPU_HINT')],
  ['critical WP legend is explicitly a signal', files.history.includes('APP Critical WP signal')],
]

const failed = checks.filter(([, ok]) => !ok)
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)

if (failed.length) {
  console.error(`\n${failed.length} Rundeck UI contract check(s) failed.`)
  process.exit(1)
}

console.log('\nRundeck UI contract checks passed.')
