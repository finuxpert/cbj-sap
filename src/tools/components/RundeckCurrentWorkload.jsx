import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { numberText, shortHost, workloadTypeLabel } from './sapUiFormat.js'
import './RundeckCurrentWorkload.css'

const API = `${import.meta.env.BASE_URL}api`

function jobContext(row) {
  if (!row?.consumer_key) return null
  return {
    key: row.consumer_key,
    host: row.host || '',
    consumerType: row.consumer_type || '',
    source: 'current-workload',
  }
}

function pssGb(row = {}) {
  const raw = row.details?.pss_gb
  if (raw === null || raw === undefined || raw === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

function wpText(details = {}) {
  const wp = [details.wp_type, details.wp].filter(Boolean).join(' ') || '—'
  const count = Number(details.process_count || 0)
  return count > 1 ? `${wp} · ${count} proc` : wp
}

export default function RundeckCurrentWorkload({ collectionId = '', selectedJob = null, onSelectJob }) {
  const [rows, setRows] = React.useState([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  const [showAll, setShowAll] = React.useState(false)

  React.useEffect(() => {
    if (!collectionId) {
      setRows([])
      return undefined
    }
    const controller = new AbortController()
    setLoading(true)
    setError('')
    fetch(`${API}/history/jobs/current?collection_id=${encodeURIComponent(collectionId)}&limit=50`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          throw new Error(body.detail || `Current SAP Workload unavailable (${response.status})`)
        }
        return response.json()
      })
      .then((result) => setRows(result.items || []))
      .catch((failure) => {
        if (failure.name !== 'AbortError') setError(failure.message || 'Current SAP Workload unavailable')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [collectionId])

  React.useEffect(() => setShowAll(false), [collectionId])

  const visible = showAll ? rows : rows.slice(0, 10)

  return <section className="rundeckCurrentWorkload" aria-label="Current SAP Workload">
    <div className="rundeckCurrentWorkloadHead">
      <h3><SphereIcon name="workload" /> Current Workload</h3>
      {rows.length > 10 && <button type="button" onClick={() => setShowAll((value) => !value)}>
        {showAll ? 'Top 10' : `View all ${rows.length}`}
      </button>}
    </div>

    {loading && <div className="rundeckCurrentWorkloadState">Loading workload…</div>}
    {error && <div className="rundeckCurrentWorkloadState is-error">{error}</div>}

    {!loading && !error && <div className="rundeckCurrentWorkloadTableWrap">
      <table>
        <thead><tr><th>APP</th><th>Type</th><th>Workload</th><th>ABAP Program</th><th>WP</th><th>CPU</th><th>PSS</th></tr></thead>
        <tbody>
          {visible.map((row) => {
            const details = row.details || {}
            const context = jobContext(row)
            const active = context && selectedJob?.key === context.key && selectedJob?.host === context.host
            const pss = pssGb(row)
            const cpu = Number(row.cpu_pct)
            return <tr key={`${row.collection_id}-${row.host}-${row.consumer_type}-${row.consumer_key}`} className={active ? 'is-selected' : ''}>
              <td title={row.host}>{shortHost(row.host)}</td>
              <td>{workloadTypeLabel(row.consumer_type)}</td>
              <td><button type="button" onClick={() => context && onSelectJob?.(context)}>{row.consumer_key}</button></td>
              <td title={details.program || ''}>{details.program || '—'}</td>
              <td>{wpText(details)}</td>
              <td className={Number.isFinite(cpu) && cpu >= 80 ? 'is-attention' : ''}>{numberText(row.cpu_pct)}%</td>
              <td className={pss !== null && pss >= 2 ? 'is-attention' : ''}>{pss === null ? '—' : `${numberText(pss, 2)} GB`}</td>
            </tr>
          })}
          {!rows.length && <tr><td colSpan="7">No current workload stored for this run.</td></tr>}
        </tbody>
      </table>
    </div>}
  </section>
}
