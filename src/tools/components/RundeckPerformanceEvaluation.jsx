import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { numberText, workloadTypeLabel } from './sapUiFormat.js'
import { baselineCpuContext, evaluationReasonText } from './rundeckEvaluationExplain.js'
import './RundeckPerformanceEvaluation.css'

const API = `${import.meta.env.BASE_URL}api`
const PERIODS = [['1d', '1 Day'], ['7d', '7 Days'], ['30d', '30 Days']]
const TYPES = [['ALL', 'All'], ['PROGRAM', 'Programs'], ['JOB', 'Jobs']]
const SORT_PRESETS = [
  ['risk', 'Top Risk'],
  ['avg_cpu_pct', 'Highest CPU'],
  ['occurrences', 'Most Observed'],
  ['avg_pss_gb', 'Highest Memory'],
]
const STATUS_PRIORITY = {
  'REVIEW REQUIRED': 8,
  'HIGH CPU': 7,
  'HIGH MEMORY': 7,
  'INCREASING CPU': 6,
  RECURRING: 5,
  'CPU SPIKE': 4,
  'INSUFFICIENT DATA': 2,
  NORMAL: 1,
}
const CONFIDENCE_PRIORITY = { HIGH: 3, MEDIUM: 2, LOW: 1, NOT_READY: 0 }
const CPU_HINT = 'CPU Usage represents the grouped workload observation. Values can exceed 100 percent when more than one CPU core is used.'
const WP_HINT = 'Critical WP evidence is measured on the same SAP App Server and collection check. It is supporting evidence, not direct workload-to-WP proof.'
const OBSERVED_HINT = 'Observed Checks counts complete collection checks where this workload was retained. It is not a SAP execution counter.'
const LOW_COVERAGE_HINT = 'Historical window is not fully covered yet. Assessment strength is reduced.'

async function json(url, signal) {
  const response = await fetch(url, { cache: 'no-store', signal })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.detail || `Request failed (${response.status})`)
  }
  return response.json()
}

const pct = (value, digits = 1) => value === null || value === undefined ? '—' : `${numberText(value, digits)}%`
const gb = (value) => value === null || value === undefined ? '—' : `${numberText(value, 2)} GB`
const confidenceClass = (value) => `is-${String(value || 'LOW').toLowerCase().replaceAll('_', '-')}`
const statusClass = (value) => `is-${String(value || 'NORMAL').toLowerCase().replaceAll(' ', '-').replaceAll('_', '-')}`
const numericValue = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY
}

const observedChecks = (row, quality) => {
  const observed = Math.max(0, Number(row?.occurrences || 0))
  const complete = Math.max(0, Number(quality?.complete_checks || 0))
  return complete > 0 ? Math.min(observed, complete) : observed
}

const effectiveConfidence = (row, quality) => {
  const checks = observedChecks(row, quality)
  const observation = checks >= 20 ? 'HIGH' : checks >= 4 ? 'MEDIUM' : 'LOW'
  const period = String(quality?.confidence || 'LOW').toUpperCase()
  const rank = Math.min(CONFIDENCE_PRIORITY[observation] || 1, CONFIDENCE_PRIORITY[period] || 1)
  return Object.entries(CONFIDENCE_PRIORITY).find(([, value]) => value === rank)?.[0] || 'LOW'
}

function Segmented({ options, value, onChange, label }) {
  return <div className="rundeckEvaluationSegmented" role="group" aria-label={label}>
    {options.map(([key, text]) => <button key={key} type="button" className={value === key ? 'is-active' : ''} aria-pressed={value === key} onClick={() => onChange(key)}>{text}</button>)}
  </div>
}

function Status({ row, quality }) {
  const status = row.status || row.assessment || 'NORMAL'
  const baseline = row.historical_baseline || {}
  const confidence = effectiveConfidence(row, quality)
  const reason = evaluationReasonText(row)
  const wpExcess = Number(row.wp_excess_association_pct)
  const wpContext = Number.isFinite(wpExcess) && wpExcess > 0
    ? `Critical WP overlap is ${numberText(wpExcess, 1)} percentage points above the App Server baseline.`
    : ''
  const title = [
    row.assessment_reason,
    `Data confidence: ${confidence}`,
    `Historical baseline: ${row.baseline_status || 'NOT_READY'}`,
    ...baselineCpuContext(row),
    baseline.pss_p95_gb !== null && baseline.pss_p95_gb !== undefined ? `Historical PSS P95: ${gb(baseline.pss_p95_gb)}` : '',
    row.anomaly_status ? `Baseline result: ${row.anomaly_status}` : '',
    row.signals?.performance_shift ? `Recent CPU increase: ${pct(row.recent_cpu_shift_pct)}` : '',
    wpContext,
    wpContext ? WP_HINT : '',
  ].filter(Boolean).join('\n')
  return <span className="rundeckEvaluationAssessmentWrap" title={title} aria-label={`${status}. ${reason || 'No additional reason'}. Data confidence ${confidence}.`}>
    <span className={`rundeckEvaluationAssessment ${statusClass(status)}`}>{status}</span>
    {reason && <small className="rundeckEvaluationReason">{reason}</small>}
  </span>
}

function QualityItem({ label, value, confidence = '', title = '' }) {
  return <span className="rundeckEvaluationQualityItem" title={title || undefined}><b>{label}</b><strong className={confidence ? confidenceClass(confidence) : ''}>{value}</strong></span>
}

function SortHeader({ field, label, title, sortField, sortDirection, onSort }) {
  const active = sortField === field
  return <th title={title || undefined} aria-sort={active ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
    <button type="button" className={`rundeckEvaluationSortHeader ${active ? 'is-active' : ''}`} onClick={() => onSort(field)}>
      {label}<span aria-hidden="true">{active ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}</span>
    </button>
  </th>
}

function riskCompare(left, right) {
  const pairs = [
    [STATUS_PRIORITY[left.status] || 0, STATUS_PRIORITY[right.status] || 0],
    [left.signals?.baseline_anomaly ? 1 : 0, right.signals?.baseline_anomaly ? 1 : 0],
    [left.signals?.performance_shift ? 1 : 0, right.signals?.performance_shift ? 1 : 0],
    [numericValue(left.wp_excess_association_pct), numericValue(right.wp_excess_association_pct)],
    [numericValue(left.occurrences), numericValue(right.occurrences)],
    [numericValue(left.avg_cpu_pct), numericValue(right.avg_cpu_pct)],
  ]
  for (const [a, b] of pairs) if (a !== b) return b - a
  return String(left.consumer_key || '').localeCompare(String(right.consumer_key || ''))
}

export default function RundeckPerformanceEvaluation({ refreshToken = '', selectedJob = null, onSelectJob }) {
  const [period, setPeriod] = React.useState('1d')
  const [type, setType] = React.useState('ALL')
  const [sortField, setSortField] = React.useState('risk')
  const [sortDirection, setSortDirection] = React.useState('desc')
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    json(`${API}/evaluation/workloads?period=${encodeURIComponent(period)}&type=${encodeURIComponent(type)}&limit=100`, controller.signal)
      .then(setData)
      .catch((failure) => {
        if (failure.name !== 'AbortError') setError(failure.message || 'Performance evaluation unavailable.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [period, type, refreshToken])

  const summary = data?.summary || {}
  const quality = data?.quality || {}
  const sortedItems = React.useMemo(() => {
    const items = [...(data?.items || [])]
    if (sortField === 'risk') return items.sort(riskCompare)
    const direction = sortDirection === 'asc' ? 1 : -1
    return items.sort((left, right) => {
      const a = numericValue(left?.[sortField])
      const b = numericValue(right?.[sortField])
      if (a !== b) return (a - b) * direction
      return riskCompare(left, right)
    })
  }, [data?.items, sortDirection, sortField])

  const select = (row) => onSelectJob?.({
    key: row.consumer_key,
    host: '',
    consumerType: row.consumer_type,
    source: 'performance-evaluation',
    days: data?.days || 1,
  })

  const setPreset = (field) => {
    setSortField(field)
    setSortDirection('desc')
  }
  const toggleSort = (field) => {
    if (sortField === field) setSortDirection((current) => current === 'desc' ? 'asc' : 'desc')
    else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  const completeText = quality.partial_or_incomplete_checks
    ? `${numberText(quality.complete_checks, 0)} complete · ${numberText(quality.partial_or_incomplete_checks, 0)} excluded`
    : `${numberText(quality.complete_checks, 0)} complete`
  const lowCoverage = String(quality.confidence || 'LOW').toUpperCase() === 'LOW'

  return <section className="rundeckEvaluation" aria-label="Program and background job performance evaluation">
    <div className="rundeckEvaluationHead">
      <div>
        <span>Historical Review</span>
        <h3><SphereIcon name="trend" /> Performance Evaluation</h3>
        <p>Workloads that need review based on complete checks and historical behavior.</p>
      </div>
      <div className="rundeckEvaluationControls">
        <Segmented options={PERIODS} value={period} onChange={setPeriod} label="Evaluation period" />
        <Segmented options={TYPES} value={type} onChange={setType} label="Workload type" />
      </div>
    </div>

    {loading && <div className="rundeckEvaluationState">Evaluating workload history…</div>}
    {error && <div className="rundeckEvaluationState is-error">{error}</div>}

    {!loading && !error && data && <>
      <div className="rundeckEvaluationQuality is-lean" aria-label="Evaluation data quality">
        <QualityItem label="Data Coverage" value={`${pct(quality.coverage_pct)} · ${quality.confidence || 'LOW'}`} confidence={quality.confidence || 'LOW'} title={lowCoverage ? LOW_COVERAGE_HINT : 'Coverage of complete collection checks in the selected period.'} />
        <QualityItem label="Collection Checks" value={completeText} />
        <QualityItem label="Historical Baseline" value={`${numberText(data.baseline?.days, 0)} days · min ${numberText(data.baseline?.min_observations, 0)} observations`} />
        {lowCoverage && <span className="rundeckEvaluationCoverageFlag" title={LOW_COVERAGE_HINT}>LOW COVERAGE</span>}
      </div>

      <div className="rundeckEvaluationSummary is-lean">
        <div><span>Review Required</span><strong>{numberText(summary.review_required ?? summary.needs_review, 0)}</strong><small>workloads requiring review</small></div>
        <div><span>CPU Spike</span><strong>{numberText(summary.cpu_spike, 0)}</strong><small>peak without sustained high average</small></div>
        <div><span>CPU Increase</span><strong>{numberText(summary.performance_shift, 0)}</strong><small>recent CPU increase versus preceding window</small></div>
      </div>

      <div className="rundeckEvaluationSortBar" aria-label="Evaluation sort options">
        <span>Sort</span>
        {SORT_PRESETS.map(([field, label]) => <button key={field} type="button" className={sortField === field ? 'is-active' : ''} onClick={() => setPreset(field)}>{label}</button>)}
      </div>

      <div className="rundeckEvaluationTableWrap">
        <table className="rundeckEvaluationTable is-v120 is-lean">
          <thead><tr>
            <th>Workload</th>
            <th>Status</th>
            <SortHeader field="occurrences" label="Observed Checks" title={OBSERVED_HINT} sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} />
            <SortHeader field="avg_cpu_pct" label="Avg CPU" title={CPU_HINT} sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} />
            <SortHeader field="peak_cpu_pct" label="Peak CPU" title={CPU_HINT} sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} />
            <SortHeader field="avg_pss_gb" label="PSS Memory" title="Average grouped PSS memory for the workload observations." sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} />
          </tr></thead>
          <tbody>
            {sortedItems.map((row) => {
              const selected = selectedJob?.key === row.consumer_key && selectedJob?.consumerType === row.consumer_type
              const baseline = row.historical_baseline || {}
              const wpExcess = Number(row.wp_excess_association_pct)
              const wpEvidence = Number.isFinite(wpExcess) && wpExcess >= Number(data.thresholds?.wp_excess_association_pp || 20)
                ? ` · Critical WP +${numberText(wpExcess, 1)} pp vs App Server baseline`
                : ''
              const workloadTitle = [
                `${workloadTypeLabel(row.consumer_type)}`,
                `Processes: ${numberText(row.avg_process_count, 1)}`,
                `Host CPU while observed: ${pct(row.avg_host_cpu_pct)}`,
                row.baseline_status === 'READY' ? `Baseline CPU median ${pct(baseline.cpu_median_pct)}, P95 ${pct(baseline.cpu_p95_pct)}` : `Historical baseline ${row.baseline_status || 'NOT_READY'}`,
                row.anomaly_status ? `Baseline result: ${row.anomaly_status}` : '',
                wpEvidence ? `Critical WP overlap ${pct(row.wp_signal_overlap_pct)}${wpEvidence}` : '',
              ].filter(Boolean).join('\n')
              return <tr key={`${row.consumer_type}-${row.consumer_key}`} className={selected ? 'is-selected' : ''}>
                <td className="rundeckEvaluationWorkload" title={workloadTitle}>
                  <button type="button" onClick={() => select(row)}>{row.consumer_key}</button>
                  <small>{workloadTypeLabel(row.consumer_type)}{Number(row.avg_process_count || 0) > 1 ? ` · ${numberText(row.avg_process_count, 1)} processes` : ''}</small>
                </td>
                <td><Status row={row} quality={quality} /></td>
                <td title={OBSERVED_HINT}>{numberText(observedChecks(row, quality), 0)}</td>
                <td title={CPU_HINT}>{pct(row.avg_cpu_pct)}</td>
                <td title={CPU_HINT}>{pct(row.peak_cpu_pct)}</td>
                <td title={`Historical P95: ${gb(baseline.pss_p95_gb)} · ${row.anomaly_status || 'NO BASELINE'}`}>{gb(row.avg_pss_gb)}</td>
              </tr>
            })}
            {!sortedItems.length && <tr><td colSpan="6" className="rundeckEvaluationEmpty">No program or background job observations are available from complete collections for this period.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="rundeckEvaluationFoot">
        Observed Checks are collection observations, not SAP execution count. Critical WP evidence remains App Server timing evidence, not direct causation.
      </div>
    </>}
  </section>
}
