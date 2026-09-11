import fs from 'node:fs'
import {
  hostResourceState,
  overallOperationalState,
  sapWorkloadState,
} from '../src/tools/components/rundeckStatusSemantics.js'

const files = {
  source: fs.readFileSync('src/tools/components/RundeckSource.jsx', 'utf8'),
  incident: fs.readFileSync('src/tools/components/RundeckPerformanceIncident.jsx', 'utf8'),
  workload: fs.readFileSync('src/tools/components/RundeckCurrentWorkload.jsx', 'utf8'),
  history: fs.readFileSync('src/tools/components/RundeckJobHistory.jsx', 'utf8'),
  monitoring: fs.readFileSync('src/tools/components/RundeckMonitoringHistory.jsx', 'utf8'),
  semantics: fs.readFileSync('src/tools/components/rundeckStatusSemantics.js', 'utf8'),
  backendStatus: fs.readFileSync('backend/rundeck_status.py', 'utf8'),
  backendLatest: fs.readFileSync('backend/rundeck_latest.py', 'utf8'),
  backendIncidents: fs.readFileSync('backend/rundeck_alert_incidents.py', 'utf8'),
  version: fs.readFileSync('src/app/version.js', 'utf8'),
}

const wpAttention = { cpu_pct: 20, ram_pct: 55, io_wait_pct: 0, wp_critical: 2 }
const wpCritical = { ...wpAttention, wp_critical: 3 }
const resourceWarning = { cpu_pct: 80, ram_pct: 55, io_wait_pct: 0, wp_critical: 0 }
const resourceCritical = { cpu_pct: 95, ram_pct: 55, io_wait_pct: 0, wp_critical: 0 }

const checks = [
  ['version is v1.18.11', files.version.includes("APP_VERSION = '1.18.11'") && files.version.includes("APP_PREVIOUS_VERSION = '1.18.10'")],
  ['production-safe report URL uses current origin/base', files.source.includes('window.location.origin') && !files.source.includes("sphere.astraotoparts.co.id/dev/#/st03n")],
  ['backend exposes explicit resource/workload/operational states', files.backendStatus.includes('resource_health') && files.backendStatus.includes('sap_workload_state') && files.backendStatus.includes('operational_state') && files.backendLatest.includes('enrich_host_state')],
  ['host resource excludes WP-only attention', hostResourceState(wpAttention) === 'NORMAL'],
  ['WP 1-2 maps to ATTENTION', sapWorkloadState(wpAttention) === 'ATTENTION' && overallOperationalState([wpAttention]) === 'ATTENTION'],
  ['WP 3+ maps to CRITICAL', sapWorkloadState(wpCritical) === 'CRITICAL' && overallOperationalState([wpCritical]) === 'CRITICAL'],
  ['resource warning remains WARNING', hostResourceState(resourceWarning) === 'WARNING' && overallOperationalState([resourceWarning]) === 'WARNING'],
  ['resource critical remains CRITICAL', hostResourceState(resourceCritical) === 'CRITICAL' && overallOperationalState([resourceCritical]) === 'CRITICAL'],
  ['application server table shows both status domains', files.source.includes('<th>Host Resource</th><th>SAP Workload</th>')],
  ['PDF table shows both status domains', files.source.includes("'HOST RESOURCE', 'SAP WORKLOAD'")],
  ['primary issue formats Critical WP count before label', files.incident.includes('issueSignalText') && files.source.includes('issueSignalText')],
  ['incident summary labels Host Resource and SAP Workload separately', files.incident.includes('<b>Host Resource</b>') && files.incident.includes('<b>SAP Workload</b>')],
  ['PDF trend title follows selected metric and range', files.source.includes('trendContext.metricLabel') && files.source.includes('trendContext.rangeLabel') && files.monitoring.includes('onTrendContext')],
  ['platform health is distinguished from SAP performance', files.source.includes('SPHERE Platform Health')],
  ['SAP Issues exposes current and peak severity', files.monitoring.includes('<th>Current Severity</th><th>Peak Severity</th>') && files.backendIncidents.includes('current_severity') && files.backendIncidents.includes('peak_severity')],
  ['process CPU semantics are explained', files.workload.includes('PROCESS_CPU_HINT') && files.history.includes('PROCESS_CPU_HINT')],
  ['selected workload separates Observation and Performance', files.history.includes('rundeckJobHistoryOverview') && files.history.includes('>Observation<') && files.history.includes('>Performance<')],
  ['critical WP legend is explicitly a signal', files.history.includes('APP Critical WP signal')],
]

const failed = checks.filter(([, ok]) => !ok)
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)

if (failed.length) {
  console.error(`\n${failed.length} Rundeck UI contract check(s) failed.`)
  process.exit(1)
}

console.log('\nRundeck UI contract checks passed.')
