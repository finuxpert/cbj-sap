const unique = (values) => [...new Set(values.filter(Boolean))]

export function evaluationReasonParts(row = {}, maxParts = 2) {
  const status = String(row.status || row.assessment || 'NORMAL').toUpperCase()
  const signals = row.signals || {}
  const parts = []

  if (status === 'REVIEW REQUIRED') {
    if (signals.sustained_high_cpu) parts.push('High CPU')
    else if (signals.high_memory) parts.push('High Memory')

    if (signals.baseline_anomaly || row.anomaly_status === 'ABOVE BASELINE') parts.push('Above Baseline')
    else if (signals.performance_shift || signals.increasing) parts.push('CPU Increase')
    else if (signals.wp_excess_association || signals.critical_wp_correlated) parts.push('Critical WP')
    else if (signals.recurring) parts.push('Recurring')
  } else if (status === 'HIGH CPU') {
    parts.push('Sustained CPU')
  } else if (status === 'HIGH MEMORY') {
    parts.push('High PSS Memory')
  } else if (status === 'CPU SPIKE') {
    parts.push('Peak only')
  } else if (status === 'INCREASING CPU') {
    parts.push('Recent CPU increase')
  } else if (status === 'RECURRING') {
    parts.push('Repeated observations')
  } else if (status === 'INSUFFICIENT DATA') {
    parts.push('More history needed')
  } else if (status === 'NORMAL') {
    parts.push('No review signal')
  }

  if (!parts.length) {
    if (signals.sustained_high_cpu) parts.push('High CPU')
    if (signals.high_memory) parts.push('High Memory')
    if (signals.cpu_spike) parts.push('CPU Spike')
    if (signals.performance_shift || signals.increasing) parts.push('CPU Increase')
    if (signals.baseline_anomaly || row.anomaly_status === 'ABOVE BASELINE') parts.push('Above Baseline')
    if (signals.wp_excess_association || signals.critical_wp_correlated) parts.push('Critical WP')
  }

  return unique(parts).slice(0, Math.max(1, Number(maxParts) || 2))
}

export function evaluationReasonText(row = {}, maxParts = 2) {
  return evaluationReasonParts(row, maxParts).join(' · ')
}

export function baselineCpuContext(row = {}) {
  const baseline = row.historical_baseline || {}
  if (row.avg_cpu_pct === null || row.avg_cpu_pct === undefined || baseline.cpu_p95_pct === null || baseline.cpu_p95_pct === undefined) return []
  const avg = Number(row.avg_cpu_pct)
  const p95 = Number(baseline.cpu_p95_pct)
  if (!Number.isFinite(avg) || !Number.isFinite(p95)) return []
  const difference = avg - p95
  const sign = difference > 0 ? '+' : ''
  return [
    `Avg CPU: ${avg.toFixed(1)}%`,
    `Historical P95: ${p95.toFixed(1)}%`,
    `Difference: ${sign}${difference.toFixed(1)} percentage points`,
  ]
}
