import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { numberText, workloadTypeLabel } from './sapUiFormat.js'
import './RundeckPerformanceEvaluation.css'

const API = `${import.meta.env.BASE_URL}api`
const PERIODS = [['1d', '1 Day'], ['7d', '7 Days'], ['30d', '30 Days']]
const TYPES = [['ALL', 'All'], ['PROGRAM', 'Programs'], ['JOB', 'Jobs']]
const SORT_PRESETS = [
  ['risk', 'Top Risk'],
  ['avg_cpu_pct', 'Highest CPU'],
  ['occurrences', 'Most Observed'],
  ['avg_pss_gb', 'Highest Memory'],
  ['wp_excess_association_pct', 'Critical WP Overlap'],
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
const WP_HINT = 'Critical WP Overlap is measured on the same SAP App Server and collection check. It is supporting evidence, not direct workload-to-WP proof.'
const OBSERVED_HINT = 'Observed Checks counts persisted top-consumer collection checks. It is not a SAP execution counter.'

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

function Segmented({ options, value, onChange, label }) {
  return <div className="rundeckEvaluationSegmented" role="group" aria-label={label}>
    {options.map(([key, text]) => <button key={key} type="button" className={value === key ? 'is-active' : ''} aria-pressed={value === key} onClick={() => onChange(key)}>{text}</button>)}
  </div>
}

function Status({ row }) {
  const status = row.status || row.assessment || 'NORMAL'
  const baseline = row.historical_baseline || {}
  const title = [
    row.assessment_reason,
    `Data confidence: ${row.overall_confidence || 'LOW'}`,
    `Baseline status: ${row.baseline_status || 'NOT_READY'}`,
    baseline.cpu_p95_pct !== null && baseline.cpu_p95_pct !== undefined ? `30-day CPU P95: ${pct(baseline.cpu_p95_pct)}` : '',
    row.anomaly_status ? `Baseline result: ${row.anomaly_status}` : '',
    row.signals?.performance_shift ? `Recent CPU shift: ${pct(row.recent_cpu_shift_pct)}` : '',
  ].filter(Boolean).join('\n')
  return <span className="rundeckEvaluationAssessmentWrap" title={title}>
    <span className={`rundeckEvaluationAssessment ${statusClass(status)}`}>{status}</span>
  </span>
}

function QualityItem({ label, value, confidence = '' }) {
  return <span className="rundeckEvaluationQualityItem"><b>{label}</b><strong className={confidence ? confidenceClass(confidence) : ''}>{value}</strong></span>
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
    [CONFIDENCE_PRIORITY[left.overall_confidence] || 0, CONFIDENCE_PRIORITY[right.overall_confidence] || 0],
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
  const previousQuality = data?.previous_quality || {}
  const sampling = data?.sampling || {}
  const rawItems = data?.items || []
  const sortedItems = React.useMemo(() => {
    const items = [...rawItems]
    if (sortField === 'risk') return items.sort(riskCompare)
    const direction = sortDirection === 'asc' ? 1 : -1
    return items.sort((left, right) => {
      const a = numericValue(left?.[sortField])
      const b = numericValue(right?.[sortField])
      if (a !== b) return (a - b) * direction
      return riskCompare(left, right)
    })
  }, [rawItems, sortDirection, sortField])

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
  const sampleDepth = sampling.recorded_rank_limit || sampling.observed_rank_depth || sampling.configured_rank_limit || '—'
  const lowCoverage = String(quality.confidence || 'LOW').toUpperCase() === 'LOW'
  const baselineReady = Number(summary.baseline_anomaly || 0)

  return <section className="rundeckEvaluation" aria-label="Program and background job performance evaluation">
    <div className="rundeckEvaluationHead">
      <div>
        <span>Historical Review</span>
        <h3><SphereIcon name="trend" /> Performance Evaluation</h3>
        <p>Program and background job review using complete collection checks and workload historical baselines.</p>
      </div>
      <div className="rundeckEvaluationControls">
        <Segmented options={PERIODS} value={period} onChange={setPeriod} label="Evaluation period" />
        <Segmented options={TYPES} value={type} onChange={setType} label="Workload type" />
      </div>
    </div>

    {loading && <div className="rundeckEvaluationState">Evaluating workload history…</div>}
    {error && <div className="rundeckEvaluationState is-error">{error}</div>}

    {!loading && !error && data && <>
      <div className="rundeckEvaluationQuality" aria-label="Evaluation data quality">
        <QualityItem label="Data Coverage" value={`${pct(quality.coverage_pct)} · ${quality.confidence || 'LOW'}`} confidence={quality.confidence || 'LOW'} />
        <QualityItem label="Collection Checks" value={completeText} />
        <QualityItem label="SAP App Servers" value={`${pct(quality.app_coverage_pct)} · ${numberText(quality.expected_host_count, 0)} expected`} />
        <QualityItem label="Baseline Status" value={`${previousQuality.confidence === 'HIGH' || previousQuality.confidence === 'MEDIUM' ? 'READY' : 'BUILDING'} · ${pct(previousQuality.coverage_pct)}`} confidence={previousQuality.confidence || 'LOW'} />
        <QualityItem label="Historical Baseline" value={`${numberText(data.baseline?.days, 0)} days · min ${numberText(data.baseline?.min_observations, 0)} observations`} />
        <QualityItem label="Persisted Depth" value={`Top ${sampleDepth} per SAP App Server`} />
        {lowCoverage && <span className="rundeckEvaluationCoverageFlag">LOW COVERAGE · requested period is still partial</span>}
      </div>

      <div className="rundeckEvaluationSummary">
        <div><span>Workloads</span><strong>{numberText(summary.workloads, 0)}</strong><small>{numberText(summary.programs, 0)} programs · {numberText(summary.jobs, 0)} jobs</small></div>
        <div><span>Review Required</span><strong>{numberText(summary.review_required ?? summary.needs_review, 0)}</strong><small>{numberText(summary.sustained_high_cpu, 0)} high CPU · {numberText(summary.high_memory, 0)} high memory</small></div>
        <div><span>CPU Spike</span><strong>{numberText(summary.cpu_spike, 0)}</strong><small>peak only · lower Top Risk weight</small></div>
        <div><span>Baseline Signals</span><strong>{numberText(baselineReady, 0)}</strong><small>{numberText(summary.performance_shift, 0)} recent CPU shifts</small></div>
      </div>

      <div className="rundeckEvaluationSortBar" aria-label="Evaluation sort options">
        <span>Sort</span>
        {SORT_PRESETS.map(([field, label]) => <button key={field} type="button" className={sortField === field ? 'is-active' : ''} onClick={() => setPreset(field)}>{label}</button>)}
      </div>

      <div className="rundeckEvaluationTableWrap">
        <table className="rundeckEvaluationTable is-v120">
          <thead><tr>
            <th>Workload</th>
            <th>Status</th>
            <th>Data Confidence</th>
            <SortHeader field="occurrences" label="Observed Checks" title={OBSERVED_HINT} sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} />
            <SortHeader field="avg_cpu_pct" label="Avg CPU" title={CPU_HINT} sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} />
            <SortHeader field="peak_cpu_pct" label="Peak CPU" title={CPU_HINT} sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} />
            <SortHeader field="avg_pss_gb" label="PSS Memory" title="Average grouped PSS memory for the workload observations." sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} />
            <SortHeader field="wp_excess_association_pct" label="Critical WP Overlap" title={WP_HINT} sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} />
          </tr></thead>
          <tbody>
            {sortedItems.map((row) => {
              const selected = selectedJob?.key === row.consumer_key && selectedJob?.consumerType === row.consumer_type
              const baseline = row.historical_baseline || {}
              const wpTitle = `Workload overlap ${pct(row.wp_signal_overlap_pct)}. SAP App Server baseline ${pct(row.app_wp_baseline_pct)}. Excess overlap ${row.wp_excess_association_pct === null || row.wp_excess_association_pct === undefined ? '—' : `${numberText(row.wp_excess_association_pct, 1)} percentage points`}. ${WP_HINT}`
              const workloadTitle = [
                `${workloadTypeLabel(row.consumer_type)}`,
                `Processes: ${numberText(row.avg_process_count, 1)}`,
                `Host CPU while observed: ${pct(row.avg_host_cpu_pct)}`,
                row.baseline_status === 'READY' ? `Baseline CPU median ${pct(baseline.cpu_median_pct)}, P95 ${pct(baseline.cpu_p95_pct)}` : `Baseline ${row.baseline_status || 'NOT_READY'}`,
                row.anomaly_status ? `Baseline result: ${row.anomaly_status}` : '',
              ].filter(Boolean).join('\n')
              return <tr key={`${row.consumer_type}-${row.consumer_key}`} className={selected ? 'is-selected' : ''}>
                <td className="rundeckEvaluationWorkload" title={workloadTitle}>
                  <button type="button" onClick={() => select(row)}>{row.consumer_key}</button>
                  <small>{workloadTypeLabel(row.consumer_type)}{Number(row.avg_process_count || 0) > 1 ? ` · ${numberText(row.avg_process_count, 1)} processes` : ''}</small>
                </td>
                <td><Status row={row} /></td>
                <td><span className={`rundeckEvaluationConfidence ${confidenceClass(row.overall_confidence)}`}>{row.overall_confidence || 'LOW'}</span></td>
                <td title={OBSERVED_HINT}>{numberText(row.occurrences, 0)}</td>
                <td title={CPU_HINT}>{pct(row.avg_cpu_pct)}</td>
                <td title={CPU_HINT}>{pct(row.peak_cpu_pct)}</td>
                <td title={`Baseline P95: ${gb(baseline.pss_p95_gb)} · ${row.anomaly_status || 'NO BASELINE'}`}>{gb(row.avg_pss_gb)}</td>
                <td title={wpTitle} className={Number(row.wp_excess_association_pct || 0) >= Number(data.thresholds?.wp_excess_association_pp || 20) ? 'is-association' : ''}>{pct(row.wp_signal_overlap_pct)}</td>
              </tr>
            })}
            {!sortedItems.length && <tr><td colSpan="8" className="rundeckEvaluationEmpty">No program or background job observations are available from complete collections for this period.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="rundeckEvaluationFoot">
        Observed Checks are collection observations, not SAP execution count. Historical baseline uses workload median and P95. Critical WP Overlap is App Server timing evidence, not direct causation.
      </div>
    </>}
  </section>
}
