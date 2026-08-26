const METRICS = [
  { key: 'cpuPct', label: 'CPU', unit: '%', changeUnit: ' pp', digits: 1, warn: 75, crit: 90 },
  { key: 'memoryPct', label: 'RAM', unit: '%', changeUnit: ' pp', digits: 1, warn: 75, crit: 85 },
  { key: 'loadRatio', label: 'Load per vCPU', unit: '', changeUnit: '', digits: 2, warn: 1, crit: 1.5 },
  { key: 'swapIn', label: 'Swap In', unit: ' p/s', changeUnit: ' p/s', digits: 0, warn: 100, crit: 1000 },
  { key: 'wpCritical', label: 'WP Critical', unit: '', changeUnit: '', digits: 0, warn: 1, crit: 3 },
]

const finite = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
const valueOf = (value) => finite(value) ? Number(value) : null
const round = (value, digits = 2) => finite(value) ? Number(Number(value).toFixed(digits)) : null

function timestampMs(value = '') {
  const parsed = Date.parse(String(value || '').replace(' ', 'T'))
  return Number.isFinite(parsed) ? parsed : NaN
}

function rowTimestampMs(row = {}) {
  const parsed = timestampMs(row.snapshot || row.timeLabel)
  if (Number.isFinite(parsed)) return parsed
  const key = Number(row.sortKey)
  if (!Number.isFinite(key)) return NaN
  const raw = String(Math.trunc(key)).padStart(14, '0')
  return timestampMs(`${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}`)
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
  const ordered = [...rows].sort((a, b) => Number(a.sortKey || 0) - Number(b.sortKey || 0))
  const diffs = ordered.slice(1).map((row, index) => minutesBetween(ordered[index], row)).filter((value) => value > 0 && value <= 180)
  const nominal = median(diffs)
  return {
    nominalMinutes: nominal || 0,
    gapThresholdMinutes: Math.min(180, Math.max(30, nominal ? Math.round(nominal * 2.5) : 30)),
  }
}

function sortedValues(rows = [], key = '') {
  return rows.map((row) => valueOf(row?.[key])).filter((value) => value !== null).sort((a, b) => a - b)
}

function quantile(values = [], q = 0.5) {
  if (!values.length) return null
  if (values.length === 1) return values[0]
  const pos = (values.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  return values[base + 1] === undefined ? values[base] : values[base] + rest * (values[base + 1] - values[base])
}

function stats(rows = [], key = '') {
  const values = sortedValues(rows, key)
  if (!values.length) return { count: 0, median: null, p95: null, max: null, mean: null, mad: null }
  const medianValue = quantile(values, 0.5)
  const deviations = values.map((value) => Math.abs(value - medianValue)).sort((a, b) => a - b)
  return {
    count: values.length,
    median: round(medianValue, 4),
    p95: round(quantile(values, 0.95), 4),
    max: round(values.at(-1), 4),
    mean: round(values.reduce((sum, value) => sum + value, 0) / values.length, 4),
    mad: round(quantile(deviations, 0.5), 4),
  }
}

function robustScore(value, baseline = {}) {
  const current = valueOf(value)
  const baselineMedian = valueOf(baseline.median)
  const mad = valueOf(baseline.mad)
  if (current === null || baselineMedian === null) return null
  if (mad && mad > 0) return round((current - baselineMedian) / (1.4826 * mad), 2)
  const denominator = Math.max(Math.abs(baselineMedian), 1)
  return round((current - baselineMedian) / denominator, 2)
}

function normalizedIncidentScore(rawScore = 0) {
  const raw = Math.max(0, Number(rawScore) || 0)
  return round(100 * (1 - Math.exp(-raw / 80)), 1)
}

function windowSlices(snapshots = [], incidentTimes = new Set()) {
  const ordered = [...snapshots].sort((a, b) => Number(a.sortKey || 0) - Number(b.sortKey || 0))
  const empty = { before: [], during: [], after: [], beforeTimes: new Set(), duringTimes: new Set(), afterTimes: new Set(), cadence: cadenceOf(ordered), evidenceGap: {} }
  if (!ordered.length || !incidentTimes.size) return empty
  const incidentIndexes = ordered.map((row, index) => incidentTimes.has(row.timeLabel) ? index : -1).filter((index) => index >= 0)
  if (!incidentIndexes.length) return empty

  const first = Math.min(...incidentIndexes)
  const last = Math.max(...incidentIndexes)
  const during = ordered.filter((row) => incidentTimes.has(row.timeLabel))
  const cadence = cadenceOf(ordered)
  const limit = Math.min(12, Math.max(3, during.length))
  const before = []
  const after = []

  let nextRow = ordered[first]
  for (let index = first - 1; index >= 0 && before.length < limit; index -= 1) {
    const row = ordered[index]
    if (minutesBetween(row, nextRow) > cadence.gapThresholdMinutes) break
    if (String(row.severity || 'NORMAL').toUpperCase() !== 'NORMAL') break
    before.unshift(row)
    nextRow = row
  }

  let previousRow = ordered[last]
  for (let index = last + 1; index < ordered.length && after.length < limit; index += 1) {
    const row = ordered[index]
    if (minutesBetween(previousRow, row) > cadence.gapThresholdMinutes) break
    if (String(row.severity || 'NORMAL').toUpperCase() !== 'NORMAL') break
    after.push(row)
    previousRow = row
  }

  const previousEvidence = ordered[first - 1] || null
  const nextEvidence = ordered[last + 1] || null
  const beforeGapMinutes = previousEvidence ? minutesBetween(previousEvidence, ordered[first]) : null
  const afterGapMinutes = nextEvidence ? minutesBetween(ordered[last], nextEvidence) : null
  return {
    before,
    during,
    after,
    beforeTimes: new Set(before.map((row) => row.timeLabel)),
    duringTimes: new Set(during.map((row) => row.timeLabel)),
    afterTimes: new Set(after.map((row) => row.timeLabel)),
    cadence,
    evidenceGap: {
      beforeGapMinutes,
      afterGapMinutes,
      beforeBlockedByGap: before.length === 0 && previousEvidence && beforeGapMinutes > cadence.gapThresholdMinutes,
      afterBlockedByGap: after.length === 0 && nextEvidence && afterGapMinutes > cadence.gapThresholdMinutes,
      previousEvidenceTime: previousEvidence?.timeLabel || '',
      nextEvidenceTime: nextEvidence?.timeLabel || '',
    },
  }
}

function metricComparison(slices) {
  return METRICS.map((metric) => {
    const before = stats(slices.before, metric.key)
    const during = stats(slices.during, metric.key)
    const after = stats(slices.after, metric.key)
    const baseline = before
    const deltaMedian = during.median !== null && baseline.median !== null ? round(during.median - baseline.median, metric.digits + 1) : null
    const deltaPeak = during.max !== null && baseline.p95 !== null ? round(during.max - baseline.p95, metric.digits + 1) : null
    const recoveryDeltaMedian = after.median !== null && during.median !== null ? round(after.median - during.median, metric.digits + 1) : null
    const score = robustScore(during.max, baseline)
    const threshold = during.max !== null && during.max >= metric.crit ? 'CRIT' : during.max !== null && during.max >= metric.warn ? 'WARN' : 'NORMAL'
    const anomaly = score !== null && score >= 3 ? 'HIGH' : score !== null && score >= 2 ? 'ELEVATED' : score !== null ? 'STABLE' : 'NO_BASELINE'
    return {
      ...metric,
      before,
      during,
      after,
      baseline,
      deltaMedian,
      deltaPeak,
      recoveryDeltaMedian,
      robustScore: score,
      threshold,
      anomaly,
      anomalyPeak: during.max,
      anomalyBaselineP95: baseline.p95,
      recoveredBelowWarn: after.median !== null ? after.median < metric.warn : null,
    }
  })
}

function concurrentSignals(slices, comparisons) {
  if (!slices.during.length) return []
  const comparisonByKey = new Map(comparisons.map((item) => [item.key, item]))
  return slices.during.map((row) => {
    const signals = []
    METRICS.forEach((metric) => {
      const value = valueOf(row[metric.key])
      if (value === null) return
      const comparison = comparisonByKey.get(metric.key)
      const p95 = valueOf(comparison?.baseline?.p95)
      const score = robustScore(value, comparison?.baseline || {})
      const thresholdHit = value >= metric.warn
      const baselineHit = p95 !== null && value > p95 && (score === null || score >= 2)
      if (!thresholdHit && !baselineHit) return
      signals.push({ key: metric.key, label: metric.label, value, unit: metric.unit, severity: value >= metric.crit ? 'CRIT' : thresholdHit ? 'WARN' : 'ELEVATED', robustScore: score, baselineP95: p95 })
    })
    return { timeLabel: row.timeLabel, snapshot: row.snapshot, signals, count: signals.length }
  }).filter((item) => item.count).sort((a, b) => b.count - a.count || a.timeLabel.localeCompare(b.timeLabel))
}

function processMetric(rows = [], key = '') {
  const values = rows.map((row) => valueOf(row[key])).filter((value) => value !== null)
  if (!values.length) return { mean: null, max: null, count: 0 }
  return { mean: round(values.reduce((sum, value) => sum + value, 0) / values.length, 3), max: round(Math.max(...values), 3), count: values.length }
}

function workloadKey(row = {}) {
  return `${row.host || 'UNKNOWN'}|${row.workloadName || row.jobName || row.program || (row.pid ? `PID ${row.pid}` : 'Unknown process')}`
}

function aggregateWorkloads(processes = [], slices) {
  const windowTimes = new Set([...slices.beforeTimes, ...slices.duringTimes, ...slices.afterTimes])
  const map = new Map()
  processes.filter((row) => windowTimes.has(row.timeLabel)).forEach((row) => {
    const key = workloadKey(row)
    const current = map.get(key) || { key, name: key.split('|').slice(1).join('|'), host: row.host, program: row.program, before: [], during: [], after: [], errorsBefore: new Set(), errorsDuring: new Set(), errorsAfter: new Set(), dStateBefore: 0, dStateDuring: 0, dStateAfter: 0, pids: new Set(), processKeys: new Set() }
    const bucket = slices.duringTimes.has(row.timeLabel) ? 'during' : slices.beforeTimes.has(row.timeLabel) ? 'before' : 'after'
    current[bucket].push(row)
    if (row.pid) current.pids.add(row.pid)
    current.processKeys.add(`${row.host}|${row.instance || ''}|${row.pid || ''}|${row.wp || ''}`)
    if (row.errorCode && row.errorCode !== '?') current[`errors${bucket[0].toUpperCase()}${bucket.slice(1)}`].add(row.errorCode)
    if (String(row.state || '').toUpperCase() === 'D') current[`dState${bucket[0].toUpperCase()}${bucket.slice(1)}`] += 1
    map.set(key, current)
  })

  return Array.from(map.values()).map((item) => {
    const beforeCpu = processMetric(item.before, 'cpu'), duringCpu = processMetric(item.during, 'cpu'), afterCpu = processMetric(item.after, 'cpu')
    const beforeRss = processMetric(item.before, 'rssGb'), duringRss = processMetric(item.during, 'rssGb'), afterRss = processMetric(item.after, 'rssGb')
    const hasBefore = item.before.length > 0
    const cpuDelta = duringCpu.mean !== null && beforeCpu.mean !== null ? round(duringCpu.mean - beforeCpu.mean, 2) : null
    const rssDelta = duringRss.max !== null && beforeRss.max !== null ? round(duringRss.max - beforeRss.max, 2) : null
    const newErrors = hasBefore ? Array.from(item.errorsDuring).filter((error) => !item.errorsBefore.has(error)) : []
    const dStateIncrease = hasBefore ? Math.max(0, item.dStateDuring - item.dStateBefore) : null
    const rawScore = round(Math.max(0, cpuDelta || 0) * 1.5 + Math.max(0, rssDelta || 0) * 8 + Math.max(0, dStateIncrease || 0) * 8 + newErrors.length * 10 + item.dStateDuring * 2 + item.during.length, 2)
    const score = normalizedIncidentScore(rawScore)
    const signals = []
    if (cpuDelta !== null && cpuDelta >= 5) signals.push(`CPU +${cpuDelta} pp`)
    if (rssDelta !== null && rssDelta >= 1) signals.push(`RSS +${rssDelta} GB`)
    if (dStateIncrease !== null && dStateIncrease > 0) signals.push(`D-state +${dStateIncrease}`)
    else if (!hasBefore && item.dStateDuring > 0) signals.push(`D-state ${item.dStateDuring}`)
    if (newErrors.length) signals.push(`New error ${newErrors.slice(0, 2).join(', ')}`)
    return {
      key: item.key, name: item.name, host: item.host, program: item.program,
      beforeCpu, duringCpu, afterCpu, beforeRss, duringRss, afterRss, cpuDelta, rssDelta,
      dStateBefore: item.dStateBefore, dStateDuring: item.dStateDuring, dStateAfter: item.dStateAfter, dStateIncrease,
      errorsBefore: Array.from(item.errorsBefore), errorsDuring: Array.from(item.errorsDuring), errorsAfter: Array.from(item.errorsAfter), newErrors,
      signals, rawScore, score, incidentSamples: item.during.length, pidCount: item.pids.size, processCount: item.processKeys.size, baselineAvailable: hasBefore,
    }
  }).filter((item) => item.incidentSamples).sort((a, b) => b.score - a.score || (b.duringRss.max || 0) - (a.duringRss.max || 0) || (b.duringCpu.max || 0) - (a.duringCpu.max || 0))
}

function recoveryAnalysis(slices, comparisons) {
  const after = slices.after || []
  if (!after.length) {
    if (slices.evidenceGap?.afterBlockedByGap) {
      return { status: 'UNCONFIRMED_GAP', label: 'Unconfirmed', tone: 'warn', time: '', samples: 0, detail: `Next evidence is ${slices.evidenceGap.afterGapMinutes} min later, beyond the ${slices.cadence.gapThresholdMinutes}-min continuity threshold.`, normalizedMetrics: 0, totalMetrics: METRICS.length }
    }
    return { status: 'NO_POST_DATA', label: 'No post data', tone: 'neutral', time: '', samples: 0, detail: 'No contiguous post-incident snapshot is available.', normalizedMetrics: 0, totalMetrics: METRICS.length }
  }
  const normalizedMetrics = comparisons.filter((item) => item.recoveredBelowWarn === true).length
  const first = after[0]
  if (after.length >= 2) return { status: 'CONFIRMED', label: 'Confirmed', tone: 'good', time: first.timeLabel, samples: after.length, detail: `${after.length} contiguous NORMAL samples begin at ${first.timeLabel}.`, normalizedMetrics, totalMetrics: METRICS.length }
  return { status: 'INDICATED', label: 'Indicated', tone: 'warn', time: first.timeLabel, samples: 1, detail: `One contiguous NORMAL sample at ${first.timeLabel}; more post-incident evidence is recommended.`, normalizedMetrics, totalMetrics: METRICS.length }
}

function incidentPressure(row = {}) {
  const cpu = Math.min(1, Number(row.cpuPct || 0) / 90)
  const ram = Math.min(1, Number(row.memoryPct || 0) / 85)
  const load = Math.min(1, Number(row.loadRatio || 0) / 1.5)
  const swap = Math.min(1, Number(row.swapIn || 0) / 1000)
  const wp = Math.min(1, Number(row.wpCritical || 0) / 3)
  return Number.isFinite(Number(row.pressureScore)) ? Number(row.pressureScore) : Math.round(((cpu + ram + load + swap + wp) / 5) * 100)
}

function processTimeDistance(row, peakRow) {
  const a = rowTimestampMs(row), b = rowTimestampMs(peakRow)
  return Number.isFinite(a) && Number.isFinite(b) ? Math.abs(a - b) / 60000 : Number.POSITIVE_INFINITY
}

function peakWorkloads(processes = [], peakRow = {}, alignmentMinutes = 10) {
  if (!peakRow?.timeLabel) return { sampleTime: '', rows: [] }
  const exact = processes.filter((row) => row.timeLabel === peakRow.timeLabel)
  let candidates = exact
  let sampleTime = peakRow.timeLabel
  if (!candidates.length) {
    const distances = processes.map((row) => ({ row, distance: processTimeDistance(row, peakRow) })).filter((item) => item.distance <= alignmentMinutes).sort((a, b) => a.distance - b.distance)
    if (distances.length) {
      sampleTime = distances[0].row.timeLabel
      candidates = processes.filter((row) => row.timeLabel === sampleTime)
    }
  }
  const map = new Map()
  candidates.forEach((row) => {
    const key = workloadKey(row)
    const current = map.get(key) || { key, name: key.split('|').slice(1).join('|'), host: row.host, cpu: 0, rssGb: 0, dState: 0, errors: new Set(), pids: new Set(), processCount: 0 }
    if (finite(row.cpu)) current.cpu += Number(row.cpu)
    if (finite(row.rssGb)) current.rssGb += Number(row.rssGb)
    if (String(row.state || '').toUpperCase() === 'D') current.dState += 1
    if (row.errorCode && row.errorCode !== '?') current.errors.add(row.errorCode)
    if (row.pid) current.pids.add(row.pid)
    current.processCount += 1
    map.set(key, current)
  })
  const rows = Array.from(map.values()).map((item) => ({ ...item, errors: Array.from(item.errors), pidCount: item.pids.size, score: round(item.cpu + item.rssGb * 5 + item.dState * 10 + item.errors.size * 8 + item.processCount, 1) })).sort((a, b) => b.score - a.score || b.rssGb - a.rssGb || b.cpu - a.cpu).slice(0, 5)
  return { sampleTime: candidates.length ? sampleTime : '', rows }
}

function peakCorrelation(slices, comparisons, processes = []) {
  if (!slices.during.length) return null
  const peakRow = slices.during.reduce((best, row) => incidentPressure(row) > incidentPressure(best || {}) ? row : best, null)
  if (!peakRow) return null
  const alignmentMinutes = Math.max(5, slices.cadence.nominalMinutes || 10)
  const metricPeaks = METRICS.map((metric) => {
    const rows = slices.during.filter((row) => valueOf(row[metric.key]) !== null)
    const peakMetricRow = rows.reduce((best, row) => valueOf(row[metric.key]) > valueOf(best?.[metric.key]) ? row : best, null)
    const comparison = comparisons.find((item) => item.key === metric.key)
    const distanceMinutes = peakMetricRow ? processTimeDistance(peakMetricRow, peakRow) : null
    return { key: metric.key, label: metric.label, value: peakMetricRow ? valueOf(peakMetricRow[metric.key]) : null, unit: metric.unit, time: peakMetricRow?.timeLabel || '', distanceMinutes, aligned: distanceMinutes !== null && distanceMinutes <= alignmentMinutes, threshold: comparison?.threshold || 'NORMAL' }
  })
  const alignedMetrics = metricPeaks.filter((item) => item.aligned)
  const workload = peakWorkloads(processes.filter((row) => slices.duringTimes.has(row.timeLabel)), peakRow, alignmentMinutes)
  const hostSignals = METRICS.map((metric) => {
    const value = valueOf(peakRow[metric.key])
    if (value === null) return null
    const severity = value >= metric.crit ? 'CRIT' : value >= metric.warn ? 'WARN' : 'NORMAL'
    return { key: metric.key, label: metric.label, value, unit: metric.unit, severity }
  }).filter(Boolean)
  return {
    time: peakRow.timeLabel,
    pressureScore: incidentPressure(peakRow),
    alignmentMinutes,
    alignedCount: alignedMetrics.length,
    totalMetrics: metricPeaks.filter((item) => item.value !== null).length,
    metricPeaks,
    alignedMetrics,
    hostSignals,
    workloadSampleTime: workload.sampleTime,
    workloadCandidates: workload.rows,
  }
}

export function buildIncidentAnalytics({ snapshots = [], processes = [], incidentTimes = [] } = {}) {
  const times = incidentTimes instanceof Set ? incidentTimes : new Set(incidentTimes || [])
  const slices = windowSlices(snapshots, times)
  const comparisons = metricComparison(slices)
  const signals = concurrentSignals(slices, comparisons)
  const workloads = aggregateWorkloads(processes, slices)
  const baselineAvailable = slices.before.length > 0
  const recovery = recoveryAnalysis(slices, comparisons)
  const correlation = peakCorrelation(slices, comparisons, processes)
  return {
    engine: 'deterministic-v1.2',
    baselineAvailable,
    baselineNote: baselineAvailable ? `${slices.before.length} contiguous pre-incident sample${slices.before.length === 1 ? '' : 's'}` : slices.evidenceGap?.beforeBlockedByGap ? `Previous evidence is ${slices.evidenceGap.beforeGapMinutes} min earlier, outside continuity threshold.` : 'No contiguous pre-incident NORMAL sample.',
    windows: {
      before: { start: slices.before[0]?.timeLabel || '—', end: slices.before.at(-1)?.timeLabel || '—', count: slices.before.length },
      incident: { start: slices.during[0]?.timeLabel || '—', end: slices.during.at(-1)?.timeLabel || '—', count: slices.during.length },
      after: { start: slices.after[0]?.timeLabel || '—', end: slices.after.at(-1)?.timeLabel || '—', count: slices.after.length },
    },
    cadence: slices.cadence,
    evidenceGap: slices.evidenceGap,
    metrics: comparisons,
    concurrentSignals: signals,
    workloads,
    topWorkload: workloads[0] || null,
    recovery,
    peakCorrelation: correlation,
  }
}

export function formatAnalyticsValue(value, metric = {}) {
  if (!finite(value)) return '—'
  return `${Number(value).toLocaleString('en-US', { maximumFractionDigits: metric.digits ?? 2 })}${metric.unit || ''}`
}
