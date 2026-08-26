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

function rowTimestampMs(row = {}) {
  const parsed = timestampMs(row.snapshot || row.timeLabel)
  if (Number.isFinite(parsed)) return parsed
  const key = Number(row.sortKey)
  if (!Number.isFinite(key)) return NaN
  const raw = String(Math.trunc(key)).padStart(14, '0')
  const iso = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}`
  return timestampMs(iso)
}

function minutesBetween(left, right) {
  const a = rowTimestampMs(left), b = rowTimestampMs(right)
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, Math.round((b - a) / 60000)) : Number.POSITIVE_INFINITY
}

function median(values = []) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b)
  if (!sorted.length) return 0
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function cadenceOf(rows = []) {
  const diffs = rows.slice(1).map((row, index) => minutesBetween(rows[index], row)).filter((value) => value > 0 && value <= 180)
  const nominal = median(diffs)
  const gapThresholdMinutes = Math.max(30, nominal ? Math.round(nominal * 2.5) : 30)
  return { nominalMinutes: nominal || 0, gapThresholdMinutes: Math.min(gapThresholdMinutes, 180) }
}

function completeness(rows = []) {
  if (rows.length < 2) return { received: rows.length, intervalMinutes: 0, isRegular: true, observedIntervals: [] }
  const stamps = rows.map((row) => rowTimestampMs(row)).filter(Number.isFinite).sort((a, b) => a - b)
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

function maxSeverity(rows = []) {
  return rows.reduce((best, row) => severityRank(row.severity) > severityRank(best) ? row.severity : best, 'NORMAL')
}

function episodeSummary(rows = [], index = 0) {
  const ordered = [...rows].sort((a, b) => a.sortKey - b.sortKey)
  const severity = maxSeverity(ordered)
  const peakRow = ordered.reduce((best, row) => row.pressureScore > (best?.pressureScore ?? -1) ? row : best, null)
  const start = ordered[0]?.timeLabel || '—'
  const end = ordered.at(-1)?.timeLabel || '—'
  const startMs = rowTimestampMs(ordered[0])
  const endMs = rowTimestampMs(ordered.at(-1))
  const durationMinutes = Number.isFinite(startMs) && Number.isFinite(endMs) ? Math.max(0, Math.round((endMs - startMs) / 60000)) : 0
  return {
    key: `episode-${ordered[0]?.sortKey || index}-${ordered.at(-1)?.sortKey || index}`,
    index,
    label: `Episode ${index + 1}`,
    severity,
    start,
    end,
    count: ordered.length,
    times: ordered.map((row) => row.timeLabel),
    rows: ordered,
    peakPressure: peakRow?.pressureScore || 0,
    peakTime: peakRow?.timeLabel || end,
    durationMinutes,
  }
}

export function buildIncidentEpisodes(rows = []) {
  const ordered = [...rows].sort((a, b) => a.sortKey - b.sortKey)
  const cadence = cadenceOf(ordered)
  const episodes = []
  let current = []
  const flush = () => {
    if (!current.length) return
    episodes.push(episodeSummary(current, episodes.length))
    current = []
  }
  ordered.forEach((row) => {
    const isIncident = row.severity === 'CRIT' || row.severity === 'WARN'
    if (!isIncident) { flush(); return }
    const previous = current.at(-1)
    if (previous && minutesBetween(previous, row) > cadence.gapThresholdMinutes) flush()
    current.push(row)
  })
  flush()
  return { episodes, cadence }
}

function selectIncident(episodes = [], focus = 'latest') {
  if (!episodes.length) return null
  if (focus === 'all') {
    const rows = episodes.flatMap((episode) => episode.rows).sort((a, b) => a.sortKey - b.sortKey)
    return {
      key: 'all', mode: 'all', label: 'All Evidence', isAggregate: true, episodeCount: episodes.length,
      severity: maxSeverity(rows), start: rows[0]?.timeLabel || '—', end: rows.at(-1)?.timeLabel || '—', count: rows.length,
      times: rows.map((row) => row.timeLabel), rows, peakPressure: Math.max(0, ...episodes.map((episode) => episode.peakPressure || 0)),
    }
  }
  if (focus === 'peak') return [...episodes].sort((a, b) => b.peakPressure - a.peakPressure || severityRank(b.severity) - severityRank(a.severity) || b.index - a.index)[0]
  if (focus === 'latest') return episodes.at(-1)
  return episodes.find((episode) => episode.key === focus) || episodes.at(-1)
}

function chartRows(rows = [], gapThresholdMinutes = 30) {
  const output = []
  rows.forEach((row, index) => {
    if (index > 0 && minutesBetween(rows[index - 1], row) > gapThresholdMinutes) {
      output.push({ chartGap: true, chartKey: `__gap-${index}`, timeLabel: '', cpuPct: null, memoryPct: null, loadRatio: null, swapIn: null, wpCritical: null })
    }
    output.push({ ...row, chartGap: false, chartKey: row.timeLabel })
  })
  return output
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
    const severity = maxSeverity(ordered)
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
      rawIncidentScore: signal.rawScore,
      analyticsSignals: signal.signals,
      newErrors: signal.newErrors,
      dStateDuring: signal.dStateDuring,
      dStateIncrease: signal.dStateIncrease,
      beforeCpu: signal.beforeCpu,
      duringCpu: signal.duringCpu,
      beforeRss: signal.beforeRss,
      duringRss: signal.duringRss,
      pidCount: signal.pidCount || job.pids?.length || 0,
      processCount: signal.processCount || 0,
    } : {
      ...job,
      pidCount: job.pids?.length || 0,
      processCount: new Set((job.records || []).map((row) => `${row.host}|${row.instance || ''}|${row.pid || ''}|${row.wp || ''}`)).size,
    }
  })
}

function landscapeTelemetry(analysis, windowTimes = new Set()) {
  return (analysis?.telemetry || [])
    .filter((row) => windowTimes.has(row.timeLabel))
    .map((row) => ({ ...row, severity: snapshotSeverity(row), pressureScore: pressureScore(row) }))
    .sort((a, b) => a.sortKey - b.sortKey || a.host.localeCompare(b.host))
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
  const evidenceSnapshots = allHostSnapshots.slice(startIndex, endIndex + 1)
  const evidenceTimes = new Set(evidenceSnapshots.map((row) => row.timeLabel))
  const evidenceProcesses = (analysis.processes || []).filter((row) => row.host === host && evidenceTimes.has(row.timeLabel))
  const allEvidenceProcesses = (analysis.processes || []).filter((row) => evidenceTimes.has(row.timeLabel))

  const { episodes: incidentEpisodes, cadence } = buildIncidentEpisodes(evidenceSnapshots)
  const incidentFocus = options.incidentFocus || 'latest'
  const selectedIncident = selectIncident(incidentEpisodes, incidentFocus)
  const activeIncidentTimes = new Set(selectedIncident?.times || [])
  const displaySnapshots = selectedIncident && !selectedIncident.isAggregate ? selectedIncident.rows : evidenceSnapshots
  const displayTimes = new Set(displaySnapshots.map((row) => row.timeLabel))
  const displayProcesses = (analysis.processes || []).filter((row) => row.host === host && displayTimes.has(row.timeLabel))
  const allDisplayProcesses = (analysis.processes || []).filter((row) => displayTimes.has(row.timeLabel))
  const landscape = landscapeTelemetry(analysis, displayTimes)

  const evidenceSeverity = maxSeverity(evidenceSnapshots)
  const severity = selectedIncident?.severity || 'NORMAL'
  const peakScope = selectedIncident && !selectedIncident.isAggregate ? selectedIncident.rows : evidenceSnapshots
  const peakSnapshot = peakScope.reduce((best, row) => row.pressureScore > (best?.pressureScore ?? -1) ? row : best, null)
  const peaks = { cpu: peak(peakScope, 'cpuPct'), ram: peak(peakScope, 'memoryPct'), load: peak(peakScope, 'loadRatio'), swapIn: peak(peakScope, 'swapIn'), wpCritical: peak(peakScope, 'wpCritical') }
  const focusTime = options.focusTime && displayTimes.has(options.focusTime) ? options.focusTime : ''
  const focusTimes = focusTime ? new Set([focusTime]) : new Set()

  const analytics = selectedIncident && !selectedIncident.isAggregate ? buildIncidentAnalytics({ snapshots: evidenceSnapshots, processes: evidenceProcesses, incidentTimes: activeIncidentTimes }) : null
  const landscapeAnalytics = selectedIncident && !selectedIncident.isAggregate ? buildIncidentAnalytics({ snapshots: evidenceSnapshots, processes: allEvidenceProcesses, incidentTimes: activeIncidentTimes }) : null

  const jobsWindow = enrichJobs(buildJobGroups(evidenceProcesses, evidenceTimes, evidenceSnapshots.length), analytics)
  const jobsIncident = enrichJobs(activeIncidentTimes.size ? buildJobGroups(evidenceProcesses, activeIncidentTimes, selectedIncident?.count || 0) : [], analytics)
  const jobsFocus = enrichJobs(focusTime ? buildJobGroups(displayProcesses, focusTimes, 1) : [], analytics)

  const landscapeJobsWindow = enrichJobs(buildJobGroups(allEvidenceProcesses, evidenceTimes, evidenceSnapshots.length), landscapeAnalytics)
  const landscapeJobsIncident = enrichJobs(activeIncidentTimes.size ? buildJobGroups(allEvidenceProcesses, activeIncidentTimes, selectedIncident?.count || 0) : [], landscapeAnalytics)
  const landscapeJobsFocus = enrichJobs(focusTime ? buildJobGroups(allDisplayProcesses, focusTimes, 1) : [], landscapeAnalytics)

  const role = hostRole(host)
  const overviewStart = selectedIncident && !selectedIncident.isAggregate ? selectedIncident.start : evidenceSnapshots[0]?.timeLabel || ''
  const overviewEnd = selectedIncident && !selectedIncident.isAggregate ? selectedIncident.end : evidenceSnapshots.at(-1)?.timeLabel || ''
  const episodeCounts = incidentEpisodes.reduce((acc, episode) => { acc[episode.severity] = (acc[episode.severity] || 0) + 1; return acc }, { CRIT: 0, WARN: 0 })

  return {
    hosts, host, role, allHostSnapshots,
    evidenceSnapshots, snapshots: displaySnapshots, chartSnapshots: chartRows(displaySnapshots, cadence.gapThresholdMinutes),
    processes: displayProcesses, allProcesses: allDisplayProcesses, landscapeTelemetry: landscape, labels: displaySnapshots.map((row) => row.timeLabel),
    analysisWindow: { start: evidenceSnapshots[0]?.timeLabel || '—', end: evidenceSnapshots.at(-1)?.timeLabel || '—', count: evidenceSnapshots.length },
    evidenceWindow: { start: evidenceSnapshots[0]?.timeLabel || '—', end: evidenceSnapshots.at(-1)?.timeLabel || '—', count: evidenceSnapshots.length, severity: evidenceSeverity },
    incidentWindow: selectedIncident ? { ...selectedIncident } : { key: '', label: 'No Incident', start: '—', end: '—', count: 0, severity: 'NORMAL', times: [], episodeCount: incidentEpisodes.length },
    incidentEpisodes, incidentFocus, incidentCadence: cadence, incidentEpisodeCounts: episodeCounts,
    severity, evidenceSeverity, peakSnapshot, peakTime: peakSnapshot?.timeLabel || '—', peaks,
    hostOverview: hostOverview(analysis, overviewStart, overviewEnd),
    jobsWindow, jobsIncident, jobsFocus,
    landscapeJobsWindow, landscapeJobsIncident, landscapeJobsFocus,
    errorsIncident: activeIncidentTimes.size ? errorSummary(evidenceProcesses, activeIncidentTimes) : [],
    errorsWindow: evidenceTimes.size ? errorSummary(evidenceProcesses, evidenceTimes) : [],
    landscapeErrorsIncident: activeIncidentTimes.size ? errorSummary(allEvidenceProcesses, activeIncidentTimes) : [],
    landscapeErrorsWindow: evidenceTimes.size ? errorSummary(allEvidenceProcesses, evidenceTimes) : [],
    completeness: completeness(evidenceSnapshots), focusTime, analytics, landscapeAnalytics,
  }
}
