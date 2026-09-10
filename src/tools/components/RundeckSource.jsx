import React from 'react'
import './RundeckSource.css'

const API = `${import.meta.env.BASE_URL}api`

const formatTime = (value) => {
  if (!value) return '—'
  const text = String(value).replace('T', ' ')
  return text.replace(/([+-]\d{2}:\d{2}|Z)$/, '')
}

const metric = (value, suffix = '') => (
  value === null || value === undefined || value === '' ? '—' : `${Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 })}${suffix}`
)

function StatusPill({ value = 'UNKNOWN' }) {
  return <span className={`rundeckStatus is-${String(value).toLowerCase()}`}>{value}</span>
}

async function json(url, options = {}) {
  const response = await fetch(url, { cache: 'no-store', ...options })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.detail || `Request failed (${response.status})`)
  }
  return response.json()
}

export default function RundeckSource({ onCollection }) {
  const [latest, setLatest] = React.useState(null)
  const [health, setHealth] = React.useState(null)
  const [hosts, setHosts] = React.useState([])
  const [history, setHistory] = React.useState([])
  const [runState, setRunState] = React.useState({ enabled: false, allowed: false })
  const [error, setError] = React.useState('')
  const [actionBusy, setActionBusy] = React.useState(false)
  const [lastUpdate, setLastUpdate] = React.useState('')
  const loaded = React.useRef('')
  const onCollectionRef = React.useRef(onCollection)

  React.useEffect(() => {
    onCollectionRef.current = onCollection
  }, [onCollection])

  const loadLatest = React.useCallback(async () => {
    const response = await fetch(`${API}/collections/latest`, { cache: 'no-store' })
    if (response.status === 404) {
      setLatest(null)
      return
    }
    if (!response.ok) throw new Error('Unable to load Rundeck collection.')
    const collection = await response.json()
    if (collection.status !== 'READY') throw new Error('Latest Rundeck collection is not READY.')

    if (loaded.current !== collection.collection_id) {
      const raw = await fetch(`${API}/collections/${encodeURIComponent(collection.collection_id)}/raw`, { cache: 'no-store' })
      if (!raw.ok) throw new Error('Unable to download Rundeck collection.')
      const blob = await raw.blob()
      await onCollectionRef.current?.([
        new File([blob], `${collection.collection_id}.log`, { type: 'text/plain' }),
      ])
      loaded.current = collection.collection_id
    }

    setLatest(collection)
  }, [])

  const refreshMeta = React.useCallback(async () => {
    const [healthResult, hostsResult, historyResult, runResult] = await Promise.allSettled([
      json(`${API}/health`),
      json(`${API}/history/hosts/latest`),
      json(`${API}/history/collections?days=90&limit=30`),
      json(`${API}/collect-now/status`),
    ])

    if (healthResult.status === 'fulfilled') setHealth(healthResult.value)
    if (hostsResult.status === 'fulfilled') setHosts(hostsResult.value.items || [])
    if (historyResult.status === 'fulfilled') setHistory(historyResult.value.items || [])
    if (runResult.status === 'fulfilled') setRunState(runResult.value)
    setLastUpdate(new Date().toLocaleTimeString('id-ID', { hour12: false }))
  }, [])

  const refreshAll = React.useCallback(async () => {
    try {
      await Promise.all([loadLatest(), refreshMeta()])
      setError('')
    } catch (failure) {
      setError(failure.message || 'Rundeck source unavailable.')
    }
  }, [loadLatest, refreshMeta])

  React.useEffect(() => {
    refreshAll()
    const timer = window.setInterval(refreshAll, 60000)
    return () => window.clearInterval(timer)
  }, [refreshAll])

  React.useEffect(() => {
    if (typeof EventSource === 'undefined') return undefined
    const source = new EventSource(`${API}/events`)
    const onReady = () => refreshAll()
    source.addEventListener('collection_ready', onReady)
    source.onerror = () => {
      // The 60-second polling fallback remains active while EventSource reconnects.
    }
    return () => {
      source.removeEventListener('collection_ready', onReady)
      source.close()
    }
  }, [refreshAll])

  async function collectNow() {
    setActionBusy(true)
    setError('')
    try {
      const result = await json(`${API}/collect-now`, { method: 'POST' })
      setRunState(result)
      await refreshMeta()
    } catch (failure) {
      setError(failure.message || 'Collect Now failed.')
    } finally {
      setActionBusy(false)
    }
  }

  const sourceStatus = health?.rundeck_stale ? 'WARNING' : (latest?.status || 'WAITING')
  const collectionCount = history.length

  return <section className="rundeckPanel" aria-label="Rundeck collection" aria-live="polite">
    <div className="rundeckPanelHead">
      <div>
        <span className="rundeckEyebrow">AUTOMATIC COLLECTION</span>
        <h2>Rundeck · SPHERE /dev</h2>
        <p>Read-only ingestion with 90-day monitoring history. Manual Upload Logs remains available as fallback.</p>
      </div>
      <div className="rundeckActions">
        <StatusPill value={sourceStatus} />
        {runState.enabled && (
          <button
            type="button"
            className="rundeckCollectButton"
            disabled={actionBusy || !runState.allowed}
            onClick={collectNow}
            title={runState.running ? 'Rundeck job is still running' : runState.cooldown ? 'Collect Now is in 5-minute cooldown' : 'Run the whitelisted SPHERE Rundeck job'}
          >
            {actionBusy ? 'Starting…' : runState.running ? `Running #${runState.execution_id || ''}` : runState.cooldown ? 'Cooldown' : 'Collect Now'}
          </button>
        )}
      </div>
    </div>

    {error && <div className="rundeckMessage" role="status">{error}</div>}

    <div className="rundeckMetadata">
      <div><span>Source</span><strong>Rundeck</strong></div>
      <div><span>Execution ID</span><strong>{latest?.execution_id || '—'}</strong></div>
      <div><span>Collection Time · WIB</span><strong>{formatTime(latest?.collection_time_wib)}</strong></div>
      <div><span>Host</span><strong>{latest?.host_count || '—'}</strong></div>
      <div><span>Status</span><strong><StatusPill value={latest?.status || 'WAITING'} /></strong></div>
      <div><span>Last Update</span><strong>{lastUpdate || '—'}</strong></div>
    </div>

    <div className="rundeckOpsStrip">
      <div>
        <span>Database</span>
        <strong>{health?.database ? (health?.timescaledb ? 'PostgreSQL + TimescaleDB' : 'PostgreSQL') : 'File fallback'}</strong>
      </div>
      <div>
        <span>Storage</span>
        <strong><StatusPill value={health?.storage?.status || 'UNKNOWN'} /></strong>
        <small>{health?.storage?.used_pct !== undefined ? `${health.storage.used_pct}% used` : '—'}</small>
      </div>
      <div>
        <span>Rundeck Freshness</span>
        <strong>{health?.rundeck_stale ? 'STALE' : 'CURRENT'}</strong>
        <small>{health?.stale_after_minutes ? `threshold ${health.stale_after_minutes} min` : '—'}</small>
      </div>
      <div>
        <span>90-day Collections</span>
        <strong>{collectionCount || '—'}</strong>
        <small>latest rows loaded</small>
      </div>
    </div>

    {hosts.length > 0 && <div className="rundeckHostSection">
      <div className="rundeckSectionTitle"><h3>Application Server Health</h3><span>Latest normalized snapshot</span></div>
      <div className="rundeckHostGrid">
        {hosts.map((host) => <article key={host.host} className="rundeckHostCard">
          <div><strong>{host.host}</strong><StatusPill value={host.health} /></div>
          <small>{formatTime(host.collected_at)}</small>
          <dl>
            <div><dt>CPU</dt><dd>{metric(host.cpu_pct, '%')}</dd></div>
            <div><dt>RAM</dt><dd>{metric(host.ram_pct, '%')}</dd></div>
            <div><dt>Load1</dt><dd>{metric(host.load_1)}</dd></div>
            <div><dt>I/O Wait</dt><dd>{metric(host.io_wait_pct, '%')}</dd></div>
            <div><dt>Swap</dt><dd>{metric(host.swap_pct, '%')}</dd></div>
            <div><dt>WP Critical</dt><dd>{metric(host.wp_critical)}</dd></div>
          </dl>
        </article>)}
      </div>
    </div>}

    <details className="rundeckHistory">
      <summary>Collection History · 90 days</summary>
      <div className="rundeckHistoryTableWrap">
        <table>
          <thead><tr><th>Execution</th><th>Collection Time</th><th>Hosts</th><th>Status</th></tr></thead>
          <tbody>
            {history.slice(0, 15).map((row) => <tr key={row.collection_id || row.execution_id}>
              <td>#{row.execution_id}</td>
              <td>{formatTime(row.collection_time_wib || row.finished_at)}</td>
              <td>{row.host_count || `${row.received_host_count ?? '—'} / ${row.expected_host_count ?? 5}`}</td>
              <td><StatusPill value={row.status || 'UNKNOWN'} /></td>
            </tr>)}
            {!history.length && <tr><td colSpan="4">No collection history yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </details>
  </section>
}
