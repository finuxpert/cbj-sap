import { buildJobGroups, snapshotSeverity } from './logAnalysis2026.js'

const num = (value) => Number(value || 0)

function pressureScore(snapshot = {}) {
  const cpu = Math.min(1, num(snapshot.cpuPct) / 90)
  const ram = Math.min(1, num(snapshot.memoryPct) / 85)
  const load = Math.min(1, num(snapshot.loadRatio) / 1.5)
  const swap = Math.min(1, num(snapshot.swapIn) / 1000)
  const wp = Math.min(1, num(snapshot.wpCritical) / 3)
  return Math.round(((cpu + ram + load + swap + wp) / 5) * 100)
}

function peak(rows = [], key = '') {
  return rows.reduce((best, row) => num(row[key]) > num(best.value) ? { value: num(row[key]), time: row.timeLabel, row } : best, { value: 0, time: '', row: null })
}

function errorSummary(processes = [], times = new Set()) {
  const map = new Map()
  processes.filter((row) => (!times.size || times.has(row.timeLabel)) && row.errorCode && row.errorCode !== '?').forEach((row) => {
    const current = map.get(row.errorCode) || { errorCode: row.errorCode, snapshots: new Set(), processes: new Set(), jobs: new Set(), records: [] }
    current.snapshots.add(`${row.host}|${row.timeLabel}`)
    current.processes.add(`${row.host}|${row.instance}|${row.pid}|${row.wp}`)
    current.jobs.add(row.workloadName || row.jobName || row.program || `PID ${row.pid}`)
    current.records.push(row)
    map.set(row.errorCode, current)
  })
  return Array.from(map.values()).map((item) => {
    const records = [...item.records].sort((a, b) => a.sortKey - b.sortKey)
    return { errorCode: item.errorCode, snapshotRecords: item.snapshots.size, uniqueProcesses: item.processes.size, affectedJobs: item.jobs.size, firstSeen: records[0]?.timeLabel || '—', lastSeen: records.at(-1)?.timeLabel || '—' }
  }).sort((a, b) => b.uniqueProcesses - a.uniqueProcesses || b.snapshotRecords - a.snapshotRecords)
}

function timestampMs(value = '') {
  const parsed = Date.parse(String(value).replace(' ', 'T'))
  return Number.isFinite(parsed) ? parsed : NaN
}

function completeness(rows = []) {
  if (rows.length < 2) return { intervalMinutes: 0, expected: rows.length, received: rows.length, missing: [] }
  const stamps = rows.map((row) => timestampMs(row.snapshot)).filter(Number.isFinite).sort((a, b) => a - b)
  if (stamps.length < 2) return { intervalMinutes: 0, expected: rows.length, received: rows.length, missing: [] }
  const diffs = stamps.slice(1).map((stamp, index) => Math.round((stamp - stamps[index]) / 60000)).filter((value) => value > 0 && value < 240).sort((a, b) => a - b)
  const interval = diffs[Math.floor(diffs.length / 2)] || 0
  if (!interval) return { intervalMinutes: 0, expected: rows.length, received: rows.length, missing: [] }
  const set = new Set(stamps)
  const missing = []
  for (let stamp = stamps[0]; stamp <= stamps.at(-1); stamp += interval * 60000) {
    if (!set.has(stamp)) missing.push(new Date(stamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }))
  }
  return { intervalMinutes: interval, expected: Math.round((stamps.at(-1) - stamps[0]) / (interval * 60000)) + 1, received: stamps.length, missing }
}

export function buildLogView(analysis, options = {}) {
  if (!analysis) return null
  const hosts = Array.from(new Set((analysis.telemetry || []).map((row) => row.host))).filter(Boolean).sort()
  const host = options.host && hosts.includes(options.host) ? options.host : analysis.primaryHost || hosts[0]
  const allHostSnapshots = (analysis.telemetry || []).filter((row) => row.host === host).sort((a, b) => a.sortKey - b.sortKey).map((row) => ({ ...row, severity: snapshotSeverity(row), pressureScore: pressureScore(row) }))
  const labels = allHostSnapshots.map((row) => row.timeLabel)
  const startIndex = Math.max(0, options.start ? labels.indexOf(options.start) : 0)
  const requestedEnd = options.end ? labels.lastIndexOf(options.end) : labels.length - 1
  const endIndex = requestedEnd >= startIndex ? requestedEnd : labels.length - 1
  const snapshots = allHostSnapshots.slice(startIndex, endIndex + 1)
  const windowTimes = new Set(snapshots.map((row) => row.timeLabel))
  const processes = (analysis.processes || []).filter((row) => row.host === host && windowTimes.has(row.timeLabel))
  const critical = snapshots.filter((row) => row.severity === 'CRIT')
  const warning = snapshots.filter((row) => row.severity === 'WARN')
  const incidentSnapshots = critical.length ? critical : warning
  const incidentTimes = new Set(incidentSnapshots.map((row) => row.timeLabel))
  const severity = critical.length ? 'CRIT' : warning.length ? 'WARN' : 'NORMAL'
  const peakSnapshot = snapshots.reduce((best, row) => row.pressureScore > (best?.pressureScore ?? -1) ? row : best, null)
  const peaks = { cpu: peak(snapshots, 'cpuPct'), ram: peak(snapshots, 'memoryPct'), load: peak(snapshots, 'loadRatio'), swapIn: peak(snapshots, 'swapIn'), wpCritical: peak(snapshots, 'wpCritical') }
  const focusTime = options.focusTime && windowTimes.has(options.focusTime) ? options.focusTime : ''
  const focusTimes = focusTime ? new Set([focusTime]) : new Set()
  const jobsWindow = buildJobGroups(processes, windowTimes, snapshots.length)
  const jobsIncident = incidentTimes.size ? buildJobGroups(processes, incidentTimes, incidentSnapshots.length) : []
  const jobsFocus = focusTime ? buildJobGroups(processes, focusTimes, 1) : []
  const hostComparison = (analysis.telemetry || []).filter((row) => peakSnapshot?.fileName ? row.fileName === peakSnapshot.fileName : row.timeLabel === peakSnapshot?.timeLabel).map((row) => ({ ...row, severity: snapshotSeverity(row), pressureScore: pressureScore(row) })).sort((a, b) => b.pressureScore - a.pressureScore)
  return {
    hosts, host, allHostSnapshots, snapshots, processes, labels,
    analysisWindow: { start: snapshots[0]?.timeLabel || '—', end: snapshots.at(-1)?.timeLabel || '—', count: snapshots.length },
    incidentWindow: { start: incidentSnapshots[0]?.timeLabel || '—', end: incidentSnapshots.at(-1)?.timeLabel || '—', count: incidentSnapshots.length, severity },
    severity, peakSnapshot, peakTime: peakSnapshot?.timeLabel || '—', peaks, hostComparison,
    jobsWindow, jobsIncident, jobsFocus, errorsIncident: incidentTimes.size ? errorSummary(processes, incidentTimes) : [], errorsWindow: errorSummary(processes, windowTimes),
    completeness: completeness(snapshots), focusTime,
  }
}
