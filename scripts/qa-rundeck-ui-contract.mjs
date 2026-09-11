import fs from 'node:fs'

const files = {
  source: fs.readFileSync('src/tools/components/RundeckSource.jsx', 'utf8'),
  incident: fs.readFileSync('src/tools/components/RundeckPerformanceIncident.jsx', 'utf8'),
  workload: fs.readFileSync('src/tools/components/RundeckCurrentWorkload.jsx', 'utf8'),
  history: fs.readFileSync('src/tools/components/RundeckJobHistory.jsx', 'utf8'),
  monitoring: fs.readFileSync('src/tools/components/RundeckMonitoringHistory.jsx', 'utf8'),
  semantics: fs.readFileSync('src/tools/components/rundeckStatusSemantics.js', 'utf8'),
  version: fs.readFileSync('src/app/version.js', 'utf8'),
}

const checks = [
  ['version is v1.18.10', files.version.includes("APP_VERSION = '1.18.10'")],
  ['production-safe report URL uses current origin/base', files.source.includes('window.location.origin') && !files.source.includes("sphere.astraotoparts.co.id/dev/#/st03n")],
  ['host resource and SAP workload semantics are split', files.semantics.includes('hostResourceState') && files.semantics.includes('sapWorkloadState') && files.semantics.includes("return 'ATTENTION'")],
  ['overall operational state supports ATTENTION', files.semantics.includes('overallOperationalState') && files.source.includes('overallOperationalState')],
  ['application server table shows both status domains', files.source.includes('<th>Host Resource</th><th>SAP Workload</th>')],
  ['PDF table shows both status domains', files.source.includes("'HOST RESOURCE', 'SAP WORKLOAD'")],
  ['primary issue formats Critical WP count before label', files.incident.includes('issueSignalText') && files.source.includes('issueSignalText')],
  ['incident summary labels Host Resource and SAP Workload separately', files.incident.includes('<b>Host Resource</b>') && files.incident.includes('<b>SAP Workload</b>')],
  ['PDF trend title follows selected metric and range', files.source.includes('trendContext.metricLabel') && files.source.includes('trendContext.rangeLabel') && files.monitoring.includes('onTrendContext')],
  ['WP alert severity maps warning-level WP to ATTENTION', files.monitoring.includes("return String(row.severity || '').toUpperCase() === 'CRITICAL' ? 'CRITICAL' : 'ATTENTION'")],
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
