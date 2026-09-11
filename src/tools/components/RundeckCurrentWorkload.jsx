import React from 'react'
import SphereIcon from './SphereIcon.jsx'
import { numberText, shortHost, workloadTypeLabel } from './sapUiFormat.js'
import './RundeckCurrentWorkload.css'

const API = `${import.meta.env.BASE_URL}api`
const CPU_HINT = 'CPU Usage is the grouped workload CPU observation and can exceed 100 percent when more than one CPU core is used.'

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
  const raw = row.details?.total_pss_gb ?? row.details?.pss_gb
  if (raw === null || raw === undefined || raw === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

function wpText(details = {}) {
  return [details.wp_type, details.wp].filter(Boolean).join(' ') || '—'
}

function processCount(details = {}) {
  const value = Number(details.process_count || 0)
  return Number.isFinite(value) && value > 0 ? value : 1
}

function programText(row = {}) {
  const program = String(row.details?.program || '').trim()
  const workload = String(row.consumer_key || '').trim()
  if (!program || program.toUpperCase() === workload.toUpperCase()) return ''
  return program
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

  return <section className="rundeckCurrentWorkload" aria-label="Current SAP workloads">
    <div className="rundeckCurrentWorkloadHead">
      <h3><SphereIcon name="workload" /> Current Workloads</h3>
      {rows.length > 10 && <button type="button" onClick={() => setShowAll((value) => !value)}>
        {showAll ? 'Top 10' : `View all ${rows.length}`}
      </button>}
    </div>

    {loading && <div className="rundeckCurrentWorkloadState">Loading workloads…</div>}
    {error && <div className="rundeckCurrentWorkloadState is-error">{error}</div>}

    {!loading && !error && <div className="rundeckCurrentWorkloadTableWrap">
      <table>
        <thead><tr><th>APP</th><th>Workload</th><th>Type</th><th title={CPU_HINT}>CPU Usage</th><th>PSS Memory</th><th>Processes</th><th>WP</th></tr></thead>
        <tbody>
          {visible.map((row) => {
            const details = row.details || {}
            const context = jobContext(row)
            const active = context && selectedJob?.key === context.key && selectedJob?.host === context.host
            const pss = pssGb(row)
            const cpu = Number(row.cpu_pct)
            const program = programText(row)
            const processes = processCount(details)
            return <tr key={`${row.collection_id}-${row.host}-${row.consumer_type}-${row.consumer_key}`} className={active ? 'is-selected' : ''}>
              <td title={row.host}>{shortHost(row.host)}</td>
              <td className="rundeckCurrentWorkloadName">
                <button type="button" onClick={() => context && onSelectJob?.(context)}>{row.consumer_key}</button>
                {program && <small title={program}>{program}</small>}
              </td>
              <td>{workloadTypeLabel(row.consumer_type)}</td>
              <td title={CPU_HINT} className={Number.isFinite(cpu) && cpu >= 80 ? 'is-attention' : ''}>{numberText(row.cpu_pct)}%</td>
              <td className={pss !== null && pss >= 2 ? 'is-attention' : ''}>{pss === null ? '—' : `${numberText(pss, 2)} GB`}</td>
              <td>{numberText(processes, 0)}</td>
              <td>{wpText(details)}</td>
            </tr>
          })}
          {!rows.length && <tr><td colSpan="7">No current workload stored for this run.</td></tr>}
        </tbody>
      </table>
    </div>}
  </section>
}
