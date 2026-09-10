import React from 'react'
import './RundeckCurrentWorkload.css'

const API = `${import.meta.env.BASE_URL}api`

const number = (value, digits = 1) => {
  if (value === null || value === undefined || value === '') return '—'
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed.toLocaleString('en-US', { maximumFractionDigits: digits }) : '—'
}

const shortHost = (host = '') => {
  const match = String(host).match(/APP(\d+)/i)
  return match ? `APP${match[1]}` : String(host)
}

function jobContext(row) {
  if (!row?.consumer_key) return null
  return {
    key: row.consumer_key,
    host: row.host || '',
    consumerType: row.consumer_type || '',
    source: 'current-workload',
  }
}

function finding(row = {}) {
  const cpu = Number(row.cpu_pct || 0)
  const ram = Number(row.ram_pct || 0)
  if (cpu >= 80 && ram >= 2) return 'HIGH CPU · HIGH RAM'
  if (cpu >= 80) return 'HIGH CPU'
  if (ram >= 2) return 'HIGH RAM'
  return 'NORMAL'
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
        <span>Current SAP Workload</span>
        <h3>Top SAP Jobs</h3>
      </div>
      {rows.length > 10 && <button type="button" onClick={() => setShowAll((value) => !value)}>
        {showAll ? 'Show Top 10' : `View Top ${rows.length}`}
      </button>}
    </div>

    {loading && <div className="rundeckCurrentWorkloadState">Loading current SAP jobs…</div>}
    {error && <div className="rundeckCurrentWorkloadState is-error">{error}</div>}

    {!loading && !error && <div className="rundeckCurrentWorkloadTableWrap">
      <table>
        <thead><tr><th>Server</th><th>SAP Job</th><th>ABAP Program</th><th>WP</th><th>CPU</th><th>RAM</th><th>Finding</th></tr></thead>
        <tbody>
          {visible.map((row) => {
            const details = row.details || {}
            const context = jobContext(row)
            const active = context && selectedJob?.key === context.key && selectedJob?.host === context.host
            return <tr key={`${row.collection_id}-${row.host}-${row.consumer_type}-${row.consumer_key}`} className={active ? 'is-selected' : ''}>
              <td title={row.host}>{shortHost(row.host)}</td>
              <td><button type="button" onClick={() => context && onSelectJob?.(context)}>{row.consumer_key}</button></td>
              <td title={details.program || ''}>{details.program || '—'}</td>
              <td>{[details.wp_type, details.wp].filter(Boolean).join(' ') || '—'}</td>
              <td>{number(row.cpu_pct)}%</td>
              <td>{number(row.ram_pct)}%</td>
              <td><b className={`is-${finding(row).toLowerCase().replaceAll(' ', '-').replaceAll('·', '')}`}>{finding(row)}</b></td>
            </tr>
          })}
          {!rows.length && <tr><td colSpan="7">No current SAP job data stored for this run.</td></tr>}
        </tbody>
      </table>
    </div>}
  </section>
}
