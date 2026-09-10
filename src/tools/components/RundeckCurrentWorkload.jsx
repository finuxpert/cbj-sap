import React from 'react'
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
  const value = Number(row.details?.pss_gb)
  return Number.isFinite(value) ? value : null
}

function finding(row = {}) {
  const cpu = Number(row.cpu_pct || 0)
  const pss = pssGb(row) || 0
  if (cpu >= 80 && pss >= 2) return 'HIGH CPU · HIGH MEMORY'
  if (cpu >= 80) return 'HIGH CPU'
  if (pss >= 2) return 'HIGH MEMORY'
  return 'NORMAL'
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
      <div>
        <h3>Current SAP Workload</h3>
        <span>Latest Rundeck run</span>
      </div>
      {rows.length > 10 && <button type="button" onClick={() => setShowAll((value) => !value)}>
        {showAll ? 'Show Top 10' : `View all ${rows.length}`}
      </button>}
    </div>

    {loading && <div className="rundeckCurrentWorkloadState">Loading current workload…</div>}
    {error && <div className="rundeckCurrentWorkloadState is-error">{error}</div>}

    {!loading && !error && <div className="rundeckCurrentWorkloadTableWrap">
      <table>
        <thead><tr><th>APP</th><th>Type</th><th>Workload</th><th>ABAP Program</th><th>WP</th><th>CPU</th><th>PSS</th><th>Finding</th></tr></thead>
        <tbody>
          {visible.map((row) => {
            const details = row.details || {}
            const context = jobContext(row)
            const active = context && selectedJob?.key === context.key && selectedJob?.host === context.host
            const pss = pssGb(row)
            return <tr key={`${row.collection_id}-${row.host}-${row.consumer_type}-${row.consumer_key}`} className={active ? 'is-selected' : ''}>
              <td title={row.host}>{shortHost(row.host)}</td>
              <td>{workloadTypeLabel(row.consumer_type)}</td>
              <td><button type="button" onClick={() => context && onSelectJob?.(context)}>{row.consumer_key}</button></td>
              <td title={details.program || ''}>{details.program || '—'}</td>
              <td>{wpText(details)}</td>
              <td>{numberText(row.cpu_pct)}%</td>
              <td>{pss === null ? '—' : `${numberText(pss, 2)} GB`}</td>
              <td><b className={`is-${finding(row).toLowerCase().replaceAll(' ', '-').replaceAll('·', '')}`}>{finding(row)}</b></td>
            </tr>
          })}
          {!rows.length && <tr><td colSpan="8">No current SAP workload stored for this run.</td></tr>}
        </tbody>
      </table>
    </div>}
  </section>
}
