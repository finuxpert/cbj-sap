import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { numberText, shortHost, workloadTypeLabel } from './sapUiFormat.js'
import './RundeckPerformanceEvaluation.css'

const API = `${import.meta.env.BASE_URL}api`
const PERIODS = [['1d', '1 Day'], ['7d', '7 Days'], ['30d', '30 Days']]
const TYPES = [['ALL', 'All'], ['PROGRAM', 'Programs'], ['JOB', 'Jobs']]

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
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 'New / no baseline'
  if (Math.abs(numeric) < .1) return '0% vs previous'
  return `${numeric > 0 ? '+' : ''}${numberText(numeric, 1)}% vs previous`
}

const assessmentLabel = (value) => String(value || 'STABLE').replaceAll('_', ' ')

function Segmented({ options, value, onChange, label }) {
  return <div className="rundeckEvaluationSegmented" role="group" aria-label={label}>
    {options.map(([key, text]) => <button key={key} type="button" className={value === key ? 'is-active' : ''} aria-pressed={value === key} onClick={() => onChange(key)}>{text}</button>)}
  </div>
}

function Assessment({ value }) {
  const normalized = String(value || 'STABLE').toLowerCase().replaceAll(' ', '-').replaceAll('_', '-')
  return <span className={`rundeckEvaluationAssessment is-${normalized}`}>{assessmentLabel(value)}</span>
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
  const select = (row) => onSelectJob?.({
    key: row.consumer_key,
    host: '',
    consumerType: row.consumer_type,
    source: 'performance-evaluation',
    days: data?.days || 7,
  })

  return <section className="rundeckEvaluation" aria-label="Program and background job performance evaluation">
    <div className="rundeckEvaluationHead">
      <div>
        <span>Historical Review</span>
        <h3><SphereIcon name="trend" /> Performance Evaluation</h3>
        <p>Program ABAP and background job review based on normalized historical observations. Signals support investigation; they do not declare root cause.</p>
      </div>
      <div className="rundeckEvaluationControls">
        <Segmented options={PERIODS} value={period} onChange={setPeriod} label="Evaluation period" />
        <Segmented options={TYPES} value={type} onChange={setType} label="Workload type" />
      </div>
    </div>

    {loading && <div className="rundeckEvaluationState">Evaluating historical workload…</div>}
    {error && <div className="rundeckEvaluationState is-error">{error}</div>}

    {!loading && !error && data && <>
      <div className="rundeckEvaluationSummary">
        <div><span>Collection Checks</span><strong>{numberText(data.collection_checks, 0)}</strong><small>{PERIODS.find(([key]) => key === period)?.[1] || period}</small></div>
        <div><span>Workloads Observed</span><strong>{numberText(summary.workloads, 0)}</strong><small>{numberText(summary.programs, 0)} program · {numberText(summary.jobs, 0)} job</small></div>
        <div><span>Needs Review</span><strong>{numberText(summary.needs_review, 0)}</strong><small>{numberText(summary.high_resource, 0)} high resource</small></div>
        <div><span>Trend Signals</span><strong>{numberText((summary.increasing || 0) + (summary.recurring || 0), 0)}</strong><small>{numberText(summary.increasing, 0)} increasing · {numberText(summary.recurring, 0)} recurring</small></div>
      </div>

      <div className="rundeckEvaluationTableWrap">
        <table className="rundeckEvaluationTable">
          <thead><tr>
            <th>Workload</th><th>Type</th><th>Assessment</th><th>Seen</th><th>Recurring</th><th>Avg CPU</th><th>Peak CPU</th><th>Change</th><th>Avg PSS</th><th>APP</th><th>WP Corr.</th>
          </tr></thead>
          <tbody>
            {items.map((row) => {
              const selected = selectedJob?.key === row.consumer_key && selectedJob?.consumerType === row.consumer_type
              return <tr key={`${row.consumer_type}-${row.consumer_key}`} className={selected ? 'is-selected' : ''}>
                <td className="rundeckEvaluationWorkload"><button type="button" onClick={() => select(row)} title={`Inspect ${row.consumer_key}`}>{row.consumer_key}</button></td>
                <td>{workloadTypeLabel(row.consumer_type)}</td>
                <td title={row.assessment_reason || undefined}><Assessment value={row.assessment} /></td>
                <td>{numberText(row.occurrences, 0)} / {numberText(data.collection_checks, 0)}</td>
                <td>{pct(row.recurring_rate_pct)}</td>
                <td>{pct(row.avg_cpu_pct)}</td>
                <td>{pct(row.peak_cpu_pct)}</td>
                <td className={Number(row.avg_cpu_change_pct) > 0 ? 'is-rise' : Number(row.avg_cpu_change_pct) < 0 ? 'is-fall' : ''}>{changeText(row.avg_cpu_change_pct)}</td>
                <td>{gb(row.avg_pss_gb)}</td>
                <td title={(row.hosts || []).join(', ')}>{(row.hosts || []).map(shortHost).join(', ') || '—'}</td>
                <td>{pct(row.critical_wp_correlation_pct)}</td>
              </tr>
            })}
            {!items.length && <tr><td colSpan="11" className="rundeckEvaluationEmpty">No program or background job observations are available for this period.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="rundeckEvaluationFoot">Current period is compared with the immediately preceding {data.days}-day period · Thresholds are deterministic and environment-configurable.</div>
    </>}
  </section>
}
