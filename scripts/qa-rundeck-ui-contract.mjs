import fs from 'node:fs'

const files = {
  source: fs.readFileSync('src/tools/components/RundeckSource.jsx', 'utf8'),
  incident: fs.readFileSync('src/tools/components/RundeckPerformanceIncident.jsx', 'utf8'),
  workload: fs.readFileSync('src/tools/components/RundeckCurrentWorkload.jsx', 'utf8'),
  history: fs.readFileSync('src/tools/components/RundeckJobHistory.jsx', 'utf8'),
  version: fs.readFileSync('src/app/version.js', 'utf8'),
}

const checks = [
  ['version is v1.18.9', files.version.includes("APP_VERSION = '1.18.9'")],
  ['production-safe report URL uses current origin/base', files.source.includes('window.location.origin') && !files.source.includes("sphere.astraotoparts.co.id/dev/#/st03n")],
  ['application server table identifies SAP state', files.source.includes('<th>SAP State</th>')],
  ['PDF application server table identifies SAP state', files.source.includes("'SAP STATE'")],
  ['primary issue formats Critical WP count before label', files.incident.includes('issueSignalText') && files.source.includes('issueSignalText')],
  ['host status is labelled Host Resource', files.incident.includes('<b>Host Resource</b>')],
  ['process CPU semantics are explained', files.workload.includes('PROCESS_CPU_HINT') && files.history.includes('PROCESS_CPU_HINT')],
  ['selected workload separates Observation and Performance', files.history.includes('rundeckJobHistoryOverview') && files.history.includes('>Observation<') && files.history.includes('>Performance<')],
  ['critical WP legend is concise', files.history.includes('APP Critical WP</span>')],
]

const failed = checks.filter(([, ok]) => !ok)
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)

if (failed.length) {
  console.error(`\n${failed.length} Rundeck UI contract check(s) failed.`)
  process.exit(1)
}

console.log('\nRundeck UI contract checks passed.')
