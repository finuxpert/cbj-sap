import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { numberText, shortHost, workloadTypeLabel } from './sapUiFormat.js'
import './RundeckPerformanceEvaluation.css'

const API = `${import.meta.env.BASE_URL}api`
const PERIODS = [['1d', '1 Day'], ['7d', '7 Days'], ['30d', '30 Days']]
const TYPES = [['ALL', 'All'], ['PROGRAM', 'Programs'], ['JOB', 'Jobs']]
const PROCESS_CPU_HINT = 'Process CPU can exceed 100% when a workload uses more than one CPU core or thread.'
const WP_OVERLAP_HINT = 'Percentage of persisted workload collection cycles that occurred while the same APP reported one or more Critical WP signals. Correlation evidence only; not proof that this workload caused the WP signal.'
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

const changeText = (value) => {
  if (value === null || value === undefined || value === '') return 'NO BASELINE'
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 'NO BASELINE'
  if (Math.abs(numeric) < .1) return '0.0%'
  return `${numeric > 0 ? '+' : ''}${numberText(numeric, 1)}%`
}

const assessmentLabel = (value) => String(value || 'STABLE').replaceAll('_', ' ')
const confidenceClass = (value) => `is-${String(value || 'LOW').toLowerCase()}`

function Segmented({ options, value, onChange, label }) {
  return <div className="rundeckEvaluationSegmented" role="group" aria-label={label}>
    {options.map(([key, text]) => <button key={key} type="button" className={value === key ? 'is-active' : ''} aria-pressed={value === key} onClick={() => onChange(key)}>{text}</button>)}
  </div>
}

function Assessment({ value, confidence, reason }) {
  const normalized = String(value || 'STABLE').toLowerCase().replaceAll(' ', '-').replaceAll('_', '-')
  return <span className="rundeckEvaluationAssessmentWrap" title={[reason, confidence ? `Evidence confidence: ${confidence}` : ''].filter(Boolean).join('\n')}>
    <span className={`rundeckEvaluationAssessment is-${normalized}`}>{assessmentLabel(value)}</span>
    <small className={confidenceClass(confidence)}>{confidence || 'LOW'} evidence</small>
  </span>
}

function QualityPill({ label, value, confidence = '' }) {
  return <span className="rundeckEvaluationQualityItem"><b>{label}</b><strong className={confidence ? confidenceClass(confidence) : ''}>{value}</strong></span>
}

export default function RundeckPerformanceEvaluation({ refreshToken = '', selectedJob = null, onSelectJob }) {
  const [period, setPeriod] = React.useState('7d')
  const [type, setType] = React.useState('ALL')
  const [data, setData] = React.useState(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    json(`${API}/evaluation/workloads?period=${encodeURIComponent(period)}&type=${encodeURIComponent(type)}&limit=40`, controller.signal)
      .then(setData)
      .catch((failure) => {
        if (failure.name !== 'AbortError') setError(failure.message || 'Performance evaluation unavailable.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [period, type, refreshToken])

  const items = data?.items || []
  const summary = data?.summary || {}
  const quality = data?.quality || {}
  const previousQuality = data?.previous_quality || {}
  const sampling = data?.sampling || {}
  const select = (row) => onSelectJob?.({
    key: row.consumer_key,
    host: '',
    consumerType: row.consumer_type,
    source: 'performance-evaluation',
    days: data?.days || 7,
  })

  const coverage = `${numberText(quality.observed_span_hours, 1)}h / ${numberText(quality.window_hours, 0)}h`
  const completeText = quality.partial_or_incomplete_checks
    ? `${numberText(quality.complete_checks, 0)} complete · ${numberText(quality.partial_or_incomplete_checks, 0)} excluded`
    : `${numberText(quality.complete_checks, 0)} complete`
  const sampleDepth = sampling.recorded_rank_limit || sampling.observed_rank_depth || sampling.configured_rank_limit || '—'

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
        <QualityPill label="Data Confidence" value={quality.confidence || 'LOW'} confidence={quality.confidence || 'LOW'} />
        <QualityPill label="Coverage" value={`${coverage} · ${pct(quality.coverage_pct)}`} />
        <QualityPill label="Collections" value={completeText} />
        <QualityPill label="APP Coverage" value={`${pct(quality.app_coverage_pct)} · ${numberText(quality.expected_host_count, 0)} expected`} />
        <QualityPill label="Previous Baseline" value={`${previousQuality.confidence || 'LOW'} · ${pct(previousQuality.coverage_pct)}`} confidence={previousQuality.confidence || 'LOW'} />
        <QualityPill label="Persisted Depth" value={`Top ${sampleDepth} / APP`} />
      </div>

      <div className="rundeckEvaluationSummary">
        <div><span>Complete Checks</span><strong>{numberText(data.collection_checks, 0)}</strong><small>{PERIODS.find(([key]) => key === period)?.[1] || period} evaluation window</small></div>
        <div><span>Workloads Observed</span><strong>{numberText(summary.workloads, 0)}</strong><small>{numberText(summary.programs, 0)} program · {numberText(summary.jobs, 0)} job</small></div>
        <div><span>Needs Review</span><strong>{numberText(summary.needs_review, 0)}</strong><small>{numberText(summary.high_resource, 0)} high resource · {numberText(summary.limited_data, 0)} limited data</small></div>
        <div><span>Supported Trends</span><strong>{numberText((summary.increasing || 0) + (summary.recurring || 0), 0)}</strong><small>{numberText(summary.increasing, 0)} increasing · {numberText(summary.recurring, 0)} recurring</small></div>
      </div>

      <div className="rundeckEvaluationTableWrap">
        <table className="rundeckEvaluationTable">
          <thead><tr>
            <th>Workload</th><th>Type</th><th>Assessment</th><th title={SEEN_HINT}>Seen</th><th>Recurring</th><th title={PROCESS_CPU_HINT}>Avg CPU</th><th title={PROCESS_CPU_HINT}>Peak CPU</th><th title="Compared only when the previous equivalent period has sufficient coverage and observations.">Change</th><th title="Average aggregate PSS footprint when aggregate telemetry is available; legacy observations may contain representative-process PSS.">Avg PSS</th><th>APP</th><th title={WP_OVERLAP_HINT}>WP Signal Overlap</th>
          </tr></thead>
          <tbody>
            {items.map((row) => {
              const selected = selectedJob?.key === row.consumer_key && selectedJob?.consumerType === row.consumer_type
              const change = row.avg_cpu_change_pct
              return <tr key={`${row.consumer_type}-${row.consumer_key}`} className={selected ? 'is-selected' : ''}>
                <td className="rundeckEvaluationWorkload"><button type="button" onClick={() => select(row)} title={`Load detailed history for ${row.consumer_key} in Selected Workload`}>{row.consumer_key}</button></td>
                <td>{workloadTypeLabel(row.consumer_type)}</td>
                <td><Assessment value={row.assessment} confidence={row.evidence_confidence} reason={row.assessment_reason} /></td>
                <td title={SEEN_HINT}>{numberText(row.occurrences, 0)} / {numberText(data.collection_checks, 0)}</td>
                <td>{pct(row.recurring_rate_pct)}</td>
                <td title={PROCESS_CPU_HINT}>{pct(row.avg_cpu_pct)}</td>
                <td title={PROCESS_CPU_HINT}>{pct(row.peak_cpu_pct)}</td>
                <td className={change !== null && change !== undefined && Number(change) > 0 ? 'is-rise' : change !== null && change !== undefined && Number(change) < 0 ? 'is-fall' : change === null || change === undefined ? 'is-no-baseline' : ''}>{changeText(change)}</td>
                <td title={`Aggregate-resource telemetry coverage for this workload: ${pct(row.resource_aggregation_coverage_pct)}`}>{gb(row.avg_pss_gb)}</td>
                <td title={(row.hosts || []).join(', ')}>{(row.hosts || []).map(shortHost).join(', ') || '—'}</td>
                <td title={WP_OVERLAP_HINT}>{pct(row.wp_signal_overlap_pct ?? row.critical_wp_correlation_pct)}</td>
              </tr>
            })}
            {!items.length && <tr><td colSpan="11" className="rundeckEvaluationEmpty">No program or background job observations are available from complete collections for this period.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="rundeckEvaluationFoot">
        Seen = persisted top-consumer observation cycles, not execution count · WP Signal Overlap = same APP + collection-cycle evidence, not direct causation · Current period compares with the previous {data.days}-day period only when baseline confidence is sufficient · Aggregate resource telemetry coverage {pct(sampling.resource_aggregation_coverage_pct)}.
      </div>
    </>}
  </section>
}
