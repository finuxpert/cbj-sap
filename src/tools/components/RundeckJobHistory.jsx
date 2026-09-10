import React from 'react'
import './RundeckJobHistory.css'

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

const formatWib = (value, withDate = false) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('id-ID', withDate
    ? { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }
    : { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }
  ).format(date)
}

async function loadHistory(job, signal) {
  const params = new URLSearchParams({ job: job.key, days: '90', limit: '200' })
  if (job.host) params.set('host', job.host)
  if (job.consumerType) params.set('type', job.consumerType)
  const response = await fetch(`${API}/history/job?${params.toString()}`, { cache: 'no-store', signal })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.detail || `SAP Job History unavailable (${response.status})`)
  }
  return response.json()
}

export default function RundeckJobHistory({ job = null, refreshToken = '' }) {
  const [history, setHistory] = React.useState(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    if (!job?.key) {
      setHistory(null)
      setError('')
      return undefined
    }

    const controller = new AbortController()
    setLoading(true)
    setError('')
    loadHistory(job, controller.signal)
      .then(setHistory)
      .catch((failure) => {
        if (failure.name !== 'AbortError') setError(failure.message || 'SAP Job History unavailable')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [job?.consumerType, job?.host, job?.key, refreshToken])

  if (!job?.key) return null

  const items = history?.items || []
  const latest = items[0] || null
  const latestDetails = latest?.details || {}

  return <section className="rundeckJobHistory" aria-label="SAP Job History">
    <div className="rundeckJobHistoryHead">
      <div>
        <span>SAP Job History</span>
        <h3>{job.key}</h3>
        <small>{job.host ? `${shortHost(job.host)} · ` : ''}Last 90 days</small>
      </div>
      {history && <strong>{history.checks || 0} checks</strong>}
    </div>

    {loading && <div className="rundeckJobHistoryState">Loading job history…</div>}
    {error && <div className="rundeckJobHistoryState is-error">{error}</div>}

    {!loading && !error && history && <>
      <div className="rundeckJobHistorySummary">
        <span><b>First Seen</b>{formatWib(history.first_seen, true)} WIB</span>
        <span><b>Last Seen</b>{formatWib(history.last_seen, true)} WIB</span>
        <span><b>Avg CPU</b>{number(history.avg_cpu_pct)}%</span>
        <span><b>Peak CPU</b>{number(history.peak_cpu_pct)}%</span>
        {latestDetails.program && <span><b>ABAP Program</b>{latestDetails.program}</span>}
      </div>

      <div className="rundeckJobHistoryTableWrap">
        <table>
          <thead><tr><th>Time WIB</th><th>Run</th><th>Server</th><th>CPU</th><th>RAM</th><th>WP</th></tr></thead>
          <tbody>
            {items.slice(0, 12).map((row) => {
              const details = row.details || {}
              const wp = [details.wp_type, details.wp].filter(Boolean).join(' ') || '—'
              return <tr key={`${row.collection_id}-${row.host}-${row.collected_at}`}>
                <td>{formatWib(row.collected_at, true)}</td>
                <td>#{row.execution_id || String(row.collection_id || '').replace('rundeck-', '') || '—'}</td>
                <td title={row.host}>{shortHost(row.host)}</td>
                <td>{number(row.cpu_pct)}%</td>
                <td>{number(row.ram_pct)}%</td>
                <td>{wp}</td>
              </tr>
            })}
            {!items.length && <tr><td colSpan="6">No stored history for this SAP job yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>}
  </section>
}
