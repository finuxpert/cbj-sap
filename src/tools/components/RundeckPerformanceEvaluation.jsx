import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { numberText, shortHost, workloadTypeLabel } from './sapUiFormat.js'
import './RundeckPerformanceEvaluation.css'

const API = `${import.meta.env.BASE_URL}api`
const PERIODS = [['1d', '1 Day'], ['7d', '7 Days'], ['30d', '30 Days']]
const TYPES = [['ALL', 'All'], ['PROGRAM', 'Programs'], ['JOB', 'Jobs']]
const SORT_PRESETS = [
  ['risk', 'Top Risk'],
  ['avg_cpu_pct', 'Highest CPU'],
  ['occurrences', 'Most Observed'],
  ['recurring_rate_pct', 'Most Recurring'],
  ['avg_pss_gb', 'Highest PSS'],
  ['wp_excess_association_pct', 'Strongest WP Association'],
]
const ASSESSMENT_PRIORITY = { 'NEEDS REVIEW': 6, 'HIGH RESOURCE': 5, INCREASING: 4, RECURRING: 3, 'LIMITED DATA': 2, STABLE: 1 }
const CONFIDENCE_PRIORITY = { HIGH: 3, MEDIUM: 2, LOW: 1, NOT_READY: 0 }
const PROCESS_CPU_HINT = 'Aggregate Process CPU can exceed 100% when the workload consumes more than one CPU core. Core Equivalent = Process CPU / 100.'
const WP_ASSOC_HINT = 'WP Excess Association = workload WP-signal overlap minus the APP baseline WP-active rate for the same requested window. It is correlation evidence, not proof of causation.'
const SEEN_HINT = 'Observed in persisted top-consumer collection cycles. This is not a SAP execution counter.'

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
const coreText = (value) => value === null || value === undefined ? '—' : `${numberText(value, 2)} core`
const pp = (value) => value === null || value === undefined ? '—' : `${Number(value) > 0 ? '+' : ''}${numberText(value, 1)} pp`

const changeText = (value) => {
  if (value === null || value === undefined || value === '') return 'NO BASELINE'
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 'NO BASELINE'
  if (Math.abs(numeric) < .1) return '0.0%'
  return `${numeric > 0 ? '+' : ''}${numberText(numeric, 1)}%`
}

const assessmentLabel = (value) => String(value || 'STABLE').replaceAll('_', ' ')
const confidenceClass = (value) => `is-${String(value || 'LOW').toLowerCase().replaceAll('_', '-')}`
const numericValue = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY
}

function Segmented({ options, value, onChange, label }) {
  return <div className="rundeckEvaluationSegmented" role="group" aria-label={label}>
    {options.map(([key, text]) => <button key={key} type="button" className={value === key ? 'is-active' : ''} aria-pressed={value === key} onClick={() => onChange(key)}>{text}</button>)}
  </div>
}

function Assessment({ row }) {
  const normalized = String(row.assessment || 'STABLE').toLowerCase().replaceAll(' ', '-').replaceAll('_', '-')
  const title = [
    row.assessment_reason,
    `Observation confidence: ${row.observation_confidence || 'LOW'}`,
    `Period confidence: ${row.period_confidence || 'LOW'}`,
    `Trend baseline: ${row.trend_baseline_status || 'NOT_READY'}`,
  ].filter(Boolean).join('\n')
  return <span className="rundeckEvaluationAssessmentWrap" title={title}>
    <span className={`rundeckEvaluationAssessment is-${normalized}`}>{assessmentLabel(row.assessment)}</span>
    <small className={confidenceClass(row.observation_confidence)}>Obs {row.observation_confidence || 'LOW'}</small>
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
    [ASSESSMENT_PRIORITY[left.assessment] || 0, ASSESSMENT_PRIORITY[right.assessment] || 0],
    [CONFIDENCE_PRIORITY[left.overall_confidence] || 0, CONFIDENCE_PRIORITY[right.overall_confidence] || 0],
    [CONFIDENCE_PRIORITY[left.observation_confidence] || 0, CONFIDENCE_PRIORITY[right.observation_confidence] || 0],
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

  const coverage = `${numberText(quality.observed_span_hours, 1)}h / ${numberText(quality.window_hours, 0)}h`
  const completeText = quality.partial_or_incomplete_checks
    ? `${numberText(quality.complete_checks, 0)} complete · ${numberText(quality.partial_or_incomplete_checks, 0)} excluded`
    : `${numberText(quality.complete_checks, 0)} complete`
  const sampleDepth = sampling.recorded_rank_limit || sampling.observed_rank_depth || sampling.configured_rank_limit || '—'
  const lowCoverage = String(quality.confidence || 'LOW').toUpperCase() === 'LOW'

  return <section className="rundeckEvaluation" aria-label="Program and background job performance evaluation">
    <div className="rundeckEvaluationHead">
      <div>
        <span>Historical Review</span>
        <h3><SphereIcon name="trend" /> Performance Evaluation</h3>
        <p>Program ABAP and background job review based on complete normalized collection cycles. Signals support investigation; they do not declare root cause.</p>
      </div>
      <div className="rundeckEvaluationControls">
        <Segmented options={PERIODS} value={period} onChange={setPeriod} label="Evaluation period" />
        <Segmented options={TYPES} value={type} onChange={setType} label="Workload type" />
      </div>
    </div>

    {loading && <div className="rundeckEvaluationState">Evaluating historical workload…</div>}
    {error && <div className="rundeckEvaluationState is-error">{error}</div>}

    {!loading && !error && data && <>
      <div className="rundeckEvaluationQuality" aria-label="Evaluation data quality">
        <QualityItem label="Period Coverage" value={`${quality.confidence || 'LOW'} · ${pct(quality.coverage_pct)}`} confidence={quality.confidence || 'LOW'} />
        <QualityItem label="Observed Window" value={coverage} />
        <QualityItem label="Collections" value={completeText} />
        <QualityItem label="APP Coverage" value={`${pct(quality.app_coverage_pct)} · ${numberText(quality.expected_host_count, 0)} expected`} />
        <QualityItem label="Previous Window" value={`${previousQuality.confidence || 'LOW'} · ${pct(previousQuality.coverage_pct)}`} confidence={previousQuality.confidence || 'LOW'} />
        <QualityItem label="Persisted Depth" value={`Top ${sampleDepth} / APP`} />
        {lowCoverage && <span className="rundeckEvaluationCoverageFlag">LOW COVERAGE · interpret this requested period as partial history</span>}
      </div>

      <div className="rundeckEvaluationSummary">
        <div><span>Complete Checks</span><strong>{numberText(data.collection_checks, 0)}</strong><small>{PERIODS.find(([key]) => key === period)?.[1] || period} requested window</small></div>
        <div><span>Workloads Observed</span><strong>{numberText(summary.workloads, 0)}</strong><small>{numberText(summary.programs, 0)} program · {numberText(summary.jobs, 0)} job</small></div>
        <div><span>Needs Review</span><strong>{numberText(summary.needs_review, 0)}</strong><small>{numberText(summary.high_resource, 0)} high resource · {numberText(summary.limited_data, 0)} limited data</small></div>
        <div><span>WP Association</span><strong>{numberText(summary.wp_excess_association, 0)}</strong><small>{numberText(summary.wp_signal_overlap, 0)} raw overlap · baseline normalized</small></div>
      </div>

      <div className="rundeckEvaluationSortBar" aria-label="Evaluation sort options">
        <span>Sort</span>
        {SORT_PRESETS.map(([field, label]) => <button key={field} type="button" className={sortField === field ? 'is-active' : ''} onClick={() => setPreset(field)}>{label}</button>)}
      </div>

      <div className="rundeckEvaluationTableWrap">
        <table className="rundeckEvaluationTable">
          <thead><tr>
            <th>Workload</th>
            <th>Type</th>
            <th>Assessment</th>
            <SortHeader field="occurrences" label="Seen" title={SEEN_HINT} sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} />
            <SortHeader field="recurring_rate_pct" label="Recurring" sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} />
            <SortHeader field="avg_cpu_pct" label="Avg CPU" title={PROCESS_CPU_HINT} sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} />
            <SortHeader field="peak_cpu_pct" label="Peak CPU" title={PROCESS_CPU_HINT} sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} />
            <th title={PROCESS_CPU_HINT}>Core Eq</th>
            <th>Proc</th>
            <th title="Compared only when the previous equivalent period has sufficient coverage and workload observations.">Change</th>
            <SortHeader field="avg_pss_gb" label="Avg PSS" title="Average aggregate PSS footprint across persisted workload observations." sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} />
            <th>APP</th>
            <SortHeader field="wp_excess_association_pct" label="WP Excess" title={WP_ASSOC_HINT} sortField={sortField} sortDirection={sortDirection} onSort={toggleSort} />
          </tr></thead>
          <tbody>
            {sortedItems.map((row) => {
              const selected = selectedJob?.key === row.consumer_key && selectedJob?.consumerType === row.consumer_type
              const change = row.avg_cpu_change_pct
              const wpTitle = `Workload overlap ${pct(row.wp_signal_overlap_pct)} · APP baseline ${pct(row.app_wp_baseline_pct)} · excess ${pp(row.wp_excess_association_pct)}. ${WP_ASSOC_HINT}`
              const cpuTitle = `${PROCESS_CPU_HINT} Average host CPU while observed: ${pct(row.avg_host_cpu_pct)}.`
              return <tr key={`${row.consumer_type}-${row.consumer_key}`} className={selected ? 'is-selected' : ''}>
                <td className="rundeckEvaluationWorkload"><button type="button" onClick={() => select(row)} title={`Load detailed history for ${row.consumer_key} in Selected Workload`}>{row.consumer_key}</button></td>
                <td>{workloadTypeLabel(row.consumer_type)}</td>
                <td><Assessment row={row} /></td>
                <td title={SEEN_HINT}>{numberText(row.occurrences, 0)} / {numberText(data.collection_checks, 0)}</td>
                <td>{pct(row.recurring_rate_pct)}</td>
                <td title={cpuTitle}>{pct(row.avg_cpu_pct)}</td>
                <td title={PROCESS_CPU_HINT}>{pct(row.peak_cpu_pct)}</td>
                <td title={PROCESS_CPU_HINT}>{coreText(row.avg_cpu_core_equivalent)}</td>
                <td title="Average number of grouped process IDs represented by this workload observation.">{numberText(row.avg_process_count, 1)}</td>
                <td title={`Trend baseline: ${row.trend_baseline_status || 'NOT_READY'} · confidence ${row.trend_confidence || 'NOT_READY'}`} className={change !== null && change !== undefined && Number(change) > 0 ? 'is-rise' : change !== null && change !== undefined && Number(change) < 0 ? 'is-fall' : change === null || change === undefined ? 'is-no-baseline' : ''}>{changeText(change)}</td>
                <td title={`Aggregate-resource telemetry coverage for this workload: ${pct(row.resource_aggregation_coverage_pct)}`}>{gb(row.avg_pss_gb)}</td>
                <td title={(row.hosts || []).join(', ')}>{(row.hosts || []).map(shortHost).join(', ') || '—'}</td>
                <td title={wpTitle} className={Number(row.wp_excess_association_pct || 0) >= Number(data.thresholds?.wp_excess_association_pp || 20) ? 'is-association' : ''}>{pp(row.wp_excess_association_pct)}</td>
              </tr>
            })}
            {!sortedItems.length && <tr><td colSpan="13" className="rundeckEvaluationEmpty">No program or background job observations are available from complete collections for this period.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="rundeckEvaluationFoot">
        Seen = persisted top-consumer observation cycles, not execution count · Observation confidence uses workload sample count · Period Coverage describes how much of the requested window is actually observed · Change requires a ready previous-period baseline · WP Excess = workload overlap minus APP WP-active baseline · Aggregate resource telemetry coverage {pct(sampling.resource_aggregation_coverage_pct)}.
      </div>
    </>}
  </section>
}
