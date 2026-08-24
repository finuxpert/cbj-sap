import { buildJobGroups, snapshotSeverity } from './logAnalysis2026.js'
import { buildIncidentAnalytics } from './incidentAnalytics2026.js'

const num = (value) => Number(value || 0)
const fmt = (value, digits = 0) => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: digits })

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

function triggerReason(severity, peaks = {}) {
  const rules = severity === 'CRIT'
    ? [
        [peaks.ram?.value >= 85, `RAM ${fmt(peaks.ram?.value, 1)}%`],
        [peaks.cpu?.value >= 90, `CPU ${fmt(peaks.cpu?.value, 1)}%`],
        [peaks.load?.value >= 1.5, `Load ${fmt(peaks.load?.value, 2)}`],
        [peaks.swap?.value >= 1000, `Swap ${fmt(peaks.swap?.value)} p/s`],
        [peaks.wp?.value >= 3, `WP Critical ${fmt(peaks.wp?.value)}`],
      ]
    : severity === 'WARN'
      ? [
          [peaks.ram?.value >= 75, `RAM ${fmt(peaks.ram?.value, 1)}%`],
          [peaks.cpu?.value >= 75, `CPU ${fmt(peaks.cpu?.value, 1)}%`],
          [peaks.load?.value >= 1, `Load ${fmt(peaks.load?.value, 2)}`],
          [peaks.swap?.value >= 100, `Swap ${fmt(peaks.swap?.value)} p/s`],
          [peaks.wp?.value >= 1, `WP Critical ${fmt(peaks.wp?.value)}`],
        ]
      : []
  const reasons = rules.filter(([match]) => match).map(([, label]) => label)
  return reasons.join(' · ') || 'Within thresholds'
}

function errorSummary(processes = [], times = new Set()) {
  if (!times.size) return []
  const map = new Map()
  processes.filter((row) => times.has(row.timeLabel) && row.errorCode && row.errorCode !== '?').forEach((row) => {
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
  if (rows.length < 2) return { received: rows.length, intervalMinutes: 0, isRegular: true, observedIntervals: [] }
  const stamps = rows.map((row) => timestampMs(row.snapshot)).filter(Number.isFinite).sort((a, b) => a - b)
  if (stamps.length < 2) return { received: rows.length, intervalMinutes: 0, isRegular: false, observedIntervals: [] }
  const diffs = stamps.slice(1).map((stamp, index) => Math.round((stamp - stamps[index]) / 60000)).filter((value) => value > 0 && value < 1440)
  const observedIntervals = Array.from(new Set(diffs)).sort((a, b) => a - b)
  const isRegular = observedIntervals.length === 1
  return { received: stamps.length, intervalMinutes: isRegular ? observedIntervals[0] : 0, isRegular, observedIntervals }
}

export function hostRole(host = '') {
  const normalized = String(host || '').toUpperCase()
  const primary = /H1PAPP|APP0?1\b/.test(normalized)
  return { role: primary ? 'PRIMARY' : 'SECONDARY', impact: primary ? 'LANDSCAPE' : 'HOST', priority: primary ? 2 : 1 }
}

function severityRank(value = '') {
  return ({ NORMAL: 0, WARN: 1, CRIT: 2 })[String(value || '').toUpperCase()] ?? 0
}

function hostOverview(analysis, start = '', end = '') {
  const grouped = new Map()
  ;(analysis?.telemetry || []).forEach((row) => {
    if (start && row.timeLabel < start) return
    if (end && row.timeLabel > end) return
    if (!grouped.has(row.host)) grouped.set(row.host, [])
    grouped.get(row.host).push({ ...row, severity: snapshotSeverity(row), pressureScore: pressureScore(row) })
  })
  return Array.from(grouped.entries()).map(([host, rows]) => {
    const ordered = rows.sort((a, b) => a.sortKey - b.sortKey)
    const severity = ordered.reduce((best, row) => severityRank(row.severity) > severityRank(best) ? row.severity : best, 'NORMAL')
    const role = hostRole(host)
    const cpu = peak(ordered, 'cpuPct'), ram = peak(ordered, 'memoryPct'), load = peak(ordered, 'loadRatio'), swap = peak(ordered, 'swapIn'), wp = peak(ordered, 'wpCritical')
    return {
      host,
      ...role,
      severity,
      trigger: triggerReason(severity, { cpu, ram, load, swap, wp }),
      snapshots: ordered.length,
      peakCpu: cpu.value,
      peakRam: ram.value,
      peakLoad: load.value,
      peakSwap: swap.value,
      peakWpCritical: wp.value,
      peakTime: [cpu, ram, load, swap].sort((a, b) => b.value - a.value)[0]?.time || ordered.at(-1)?.timeLabel || '—',
    }
  }).sort((a, b) => b.priority - a.priority || severityRank(b.severity) - severityRank(a.severity) || b.peakLoad - a.peakLoad)
}

function enrichJobs(jobs = [], analytics = null) {
  const map = new Map((analytics?.workloads || []).map((item) => [item.key, item]))
  return jobs.map((job) => {
    const signal = map.get(job.key)
    return signal ? {
      ...job,
      cpuDelta: signal.cpuDelta,
      rssDelta: signal.rssDelta,
      anomalyScore: signal.score,
      analyticsSignals: signal.signals,
      newErrors: signal.newErrors,
      dStateDuring: signal.dStateDuring,
      beforeCpu: signal.beforeCpu,
      duringCpu: signal.duringCpu,
      beforeRss: signal.beforeRss,
      duringRss: signal.duringRss,
    } : job
  })
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
  const analytics = buildIncidentAnalytics({ snapshots, processes, incidentTimes })
  const jobsWindow = enrichJobs(buildJobGroups(processes, windowTimes, snapshots.length), analytics)
  const jobsIncident = enrichJobs(incidentTimes.size ? buildJobGroups(processes, incidentTimes, incidentSnapshots.length) : [], analytics)
  const jobsFocus = enrichJobs(focusTime ? buildJobGroups(processes, focusTimes, 1) : [], analytics)
  const role = hostRole(host)
  return {
    hosts, host, role, allHostSnapshots, snapshots, processes, labels,
    analysisWindow: { start: snapshots[0]?.timeLabel || '—', end: snapshots.at(-1)?.timeLabel || '—', count: snapshots.length },
    incidentWindow: { start: incidentSnapshots[0]?.timeLabel || '—', end: incidentSnapshots.at(-1)?.timeLabel || '—', count: incidentSnapshots.length, severity, times: Array.from(incidentTimes) },
    severity, peakSnapshot, peakTime: peakSnapshot?.timeLabel || '—', peaks,
    hostOverview: hostOverview(analysis, snapshots[0]?.timeLabel || '', snapshots.at(-1)?.timeLabel || ''),
    jobsWindow, jobsIncident, jobsFocus,
    errorsIncident: incidentTimes.size ? errorSummary(processes, incidentTimes) : [],
    errorsWindow: windowTimes.size ? errorSummary(processes, windowTimes) : [],
    completeness: completeness(snapshots), focusTime, analytics,
  }
}
