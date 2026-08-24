const METRICS = [
  { key: 'cpuPct', label: 'CPU', unit: '%', digits: 1, warn: 75, crit: 90 },
  { key: 'memoryPct', label: 'RAM', unit: '%', digits: 1, warn: 75, crit: 85 },
  { key: 'loadRatio', label: 'Load per vCPU', unit: '', digits: 2, warn: 1, crit: 1.5 },
  { key: 'swapIn', label: 'Swap In', unit: ' p/s', digits: 0, warn: 100, crit: 1000 },
  { key: 'wpCritical', label: 'WP Critical', unit: '', digits: 0, warn: 1, crit: 3 },
]

const finite = (value) => Number.isFinite(Number(value))
const valueOf = (value) => finite(value) ? Number(value) : null
const round = (value, digits = 2) => finite(value) ? Number(Number(value).toFixed(digits)) : null

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
  const median = quantile(values, 0.5)
  const deviations = values.map((value) => Math.abs(value - median)).sort((a, b) => a - b)
  return {
    count: values.length,
    median: round(median, 4),
    p95: round(quantile(values, 0.95), 4),
    max: round(values.at(-1), 4),
    mean: round(values.reduce((sum, value) => sum + value, 0) / values.length, 4),
    mad: round(quantile(deviations, 0.5), 4),
  }
}

function robustScore(value, baseline = {}) {
  const current = valueOf(value)
  const median = valueOf(baseline.median)
  const mad = valueOf(baseline.mad)
  if (current === null || median === null) return null
  if (mad && mad > 0) return round((current - median) / (1.4826 * mad), 2)
  const denominator = Math.max(Math.abs(median), 1)
  return round((current - median) / denominator, 2)
}

function windowSlices(snapshots = [], incidentTimes = new Set()) {
  if (!snapshots.length || !incidentTimes.size) return { before: [], during: [], after: [], beforeTimes: new Set(), duringTimes: new Set(), afterTimes: new Set() }
  const incidentIndexes = snapshots.map((row, index) => incidentTimes.has(row.timeLabel) ? index : -1).filter((index) => index >= 0)
  if (!incidentIndexes.length) return { before: [], during: [], after: [], beforeTimes: new Set(), duringTimes: new Set(), afterTimes: new Set() }
  const first = Math.min(...incidentIndexes)
  const last = Math.max(...incidentIndexes)
  const width = Math.max(incidentIndexes.length, 1)
  const before = snapshots.slice(Math.max(0, first - width), first)
  const during = snapshots.filter((row) => incidentTimes.has(row.timeLabel))
  const after = snapshots.slice(last + 1, Math.min(snapshots.length, last + 1 + width))
  return {
    before,
    during,
    after,
    beforeTimes: new Set(before.map((row) => row.timeLabel)),
    duringTimes: new Set(during.map((row) => row.timeLabel)),
    afterTimes: new Set(after.map((row) => row.timeLabel)),
  }
}

function metricComparison(slices) {
  return METRICS.map((metric) => {
    const before = stats(slices.before, metric.key)
    const during = stats(slices.during, metric.key)
    const after = stats(slices.after, metric.key)
    const baseline = before.count ? before : stats([...slices.before, ...slices.after], metric.key)
    const deltaMedian = during.median !== null && baseline.median !== null ? round(during.median - baseline.median, metric.digits + 1) : null
    const deltaPeak = during.max !== null && baseline.p95 !== null ? round(during.max - baseline.p95, metric.digits + 1) : null
    const score = robustScore(during.max, baseline)
    const threshold = during.max >= metric.crit ? 'CRIT' : during.max >= metric.warn ? 'WARN' : 'NORMAL'
    const anomaly = score !== null && score >= 3 ? 'HIGH' : score !== null && score >= 2 ? 'ELEVATED' : 'STABLE'
    return {
      ...metric,
      before,
      during,
      after,
      baseline,
      deltaMedian,
      deltaPeak,
      robustScore: score,
      threshold,
      anomaly,
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
      signals.push({
        key: metric.key,
        label: metric.label,
        value,
        unit: metric.unit,
        severity: value >= metric.crit ? 'CRIT' : thresholdHit ? 'WARN' : 'ELEVATED',
        robustScore: score,
        baselineP95: p95,
      })
    })
    return { timeLabel: row.timeLabel, snapshot: row.snapshot, signals, count: signals.length }
  }).filter((item) => item.count).sort((a, b) => b.count - a.count || a.timeLabel.localeCompare(b.timeLabel))
}

function processMetric(rows = [], key = '') {
  const values = rows.map((row) => valueOf(row[key])).filter((value) => value !== null)
  if (!values.length) return { mean: null, max: null, count: 0 }
  return {
    mean: round(values.reduce((sum, value) => sum + value, 0) / values.length, 3),
    max: round(Math.max(...values), 3),
    count: values.length,
  }
}

function workloadKey(row = {}) {
  return `${row.host || 'UNKNOWN'}|${row.workloadName || row.jobName || row.program || (row.pid ? `PID ${row.pid}` : 'Unknown process')}`
}

function aggregateWorkloads(processes = [], slices) {
  const windowTimes = new Set([...slices.beforeTimes, ...slices.duringTimes, ...slices.afterTimes])
  const map = new Map()
  processes.filter((row) => windowTimes.has(row.timeLabel)).forEach((row) => {
    const key = workloadKey(row)
    const current = map.get(key) || { key, name: key.split('|').slice(1).join('|'), host: row.host, program: row.program, before: [], during: [], after: [], errorsBefore: new Set(), errorsDuring: new Set(), errorsAfter: new Set(), dStateBefore: 0, dStateDuring: 0, dStateAfter: 0 }
    const bucket = slices.duringTimes.has(row.timeLabel) ? 'during' : slices.beforeTimes.has(row.timeLabel) ? 'before' : 'after'
    current[bucket].push(row)
    if (row.errorCode && row.errorCode !== '?') current[`errors${bucket[0].toUpperCase()}${bucket.slice(1)}`].add(row.errorCode)
    if (String(row.state || '').toUpperCase() === 'D') current[`dState${bucket[0].toUpperCase()}${bucket.slice(1)}`] += 1
    map.set(key, current)
  })

  return Array.from(map.values()).map((item) => {
    const beforeCpu = processMetric(item.before, 'cpu')
    const duringCpu = processMetric(item.during, 'cpu')
    const afterCpu = processMetric(item.after, 'cpu')
    const beforeRss = processMetric(item.before, 'rssGb')
    const duringRss = processMetric(item.during, 'rssGb')
    const afterRss = processMetric(item.after, 'rssGb')
    const cpuDelta = duringCpu.mean !== null && beforeCpu.mean !== null ? round(duringCpu.mean - beforeCpu.mean, 2) : null
    const rssDelta = duringRss.max !== null && beforeRss.max !== null ? round(duringRss.max - beforeRss.max, 2) : null
    const newErrors = Array.from(item.errorsDuring).filter((error) => !item.errorsBefore.has(error))
    const signals = []
    if (cpuDelta !== null && cpuDelta >= 5) signals.push(`CPU +${cpuDelta}%`)
    if (rssDelta !== null && rssDelta >= 1) signals.push(`RSS +${rssDelta} GB`)
    if (item.dStateDuring > item.dStateBefore) signals.push(`D-state ${item.dStateDuring}`)
    if (newErrors.length) signals.push(`New error ${newErrors.slice(0, 2).join(', ')}`)
    const score = round(
      Math.max(0, cpuDelta || 0) * 1.5 +
      Math.max(0, rssDelta || 0) * 8 +
      item.dStateDuring * 8 +
      newErrors.length * 10 +
      item.during.length,
      2,
    )
    return {
      key: item.key,
      name: item.name,
      host: item.host,
      program: item.program,
      beforeCpu,
      duringCpu,
      afterCpu,
      beforeRss,
      duringRss,
      afterRss,
      cpuDelta,
      rssDelta,
      dStateBefore: item.dStateBefore,
      dStateDuring: item.dStateDuring,
      dStateAfter: item.dStateAfter,
      errorsBefore: Array.from(item.errorsBefore),
      errorsDuring: Array.from(item.errorsDuring),
      errorsAfter: Array.from(item.errorsAfter),
      newErrors,
      signals,
      score,
      incidentSamples: item.during.length,
    }
  }).filter((item) => item.incidentSamples).sort((a, b) => b.score - a.score || (b.duringRss.max || 0) - (a.duringRss.max || 0) || (b.duringCpu.max || 0) - (a.duringCpu.max || 0))
}

export function buildIncidentAnalytics({ snapshots = [], processes = [], incidentTimes = [] } = {}) {
  const times = incidentTimes instanceof Set ? incidentTimes : new Set(incidentTimes || [])
  const slices = windowSlices(snapshots, times)
  const comparisons = metricComparison(slices)
  const signals = concurrentSignals(slices, comparisons)
  const workloads = aggregateWorkloads(processes, slices)
  const baselineAvailable = slices.before.length > 0
  return {
    engine: 'deterministic-v1',
    baselineAvailable,
    windows: {
      before: { start: slices.before[0]?.timeLabel || '—', end: slices.before.at(-1)?.timeLabel || '—', count: slices.before.length },
      incident: { start: slices.during[0]?.timeLabel || '—', end: slices.during.at(-1)?.timeLabel || '—', count: slices.during.length },
      after: { start: slices.after[0]?.timeLabel || '—', end: slices.after.at(-1)?.timeLabel || '—', count: slices.after.length },
    },
    metrics: comparisons,
    concurrentSignals: signals,
    workloads,
    topWorkload: workloads[0] || null,
  }
}

export function formatAnalyticsValue(value, metric = {}) {
  if (!finite(value)) return '—'
  return `${Number(value).toLocaleString('en-US', { maximumFractionDigits: metric.digits ?? 2 })}${metric.unit || ''}`
}
