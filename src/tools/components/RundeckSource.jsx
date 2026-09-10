import React from 'react'
import RundeckMonitoringHistory from './RundeckMonitoringHistory.jsx'
import './RundeckSource.css'

const API = `${import.meta.env.BASE_URL}api`

const formatTime = (value) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(
    formatter.formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second} WIB`
}

const formatUiTime = () => new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
}).format(new Date())

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
    setLastUpdate(formatUiTime())
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
      const result = await json(`${API}/collect-now`, {
        method: 'POST',
        headers: { 'X-SPHERE-Action': 'collect-now' },
      })
      setRunState(result)
      await refreshMeta()
    } catch (failure) {
      setError(failure.message || 'Collect Now failed.')
    } finally {
      setActionBusy(false)
    }
  }

  const sourceStatus = health?.rundeck_stale ? 'WARNING' : (latest?.status || 'WAITING')
  const overallHealth = hosts.some((host) => host.health === 'CRITICAL')
    ? 'CRITICAL'
    : hosts.some((host) => host.health === 'WARNING') || health?.rundeck_stale
      ? 'WARNING'
      : hosts.length
        ? 'NORMAL'
        : 'WAITING'
  const collectionCount = history.length
  const partialCount = history.filter((row) => row.status === 'PARTIAL').length
  const failedCount = history.filter((row) => row.status === 'FAILED').length

  return <section className="rundeckPanel" aria-label="Rundeck collection" aria-live="polite">
    <div className="rundeckPanelHead">
      <div>
        <span className="rundeckEyebrow">AUTOMATIC COLLECTION</span>
        <h2>Rundeck · SPHERE /dev</h2>
        <p>Rundeck ingestion · PostgreSQL 90-day history · Manual Upload remains fallback.</p>
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
      <div><span>Execution</span><strong>#{latest?.execution_id || '—'}</strong></div>
      <div><span>Collection Time · WIB</span><strong>{formatTime(latest?.collection_time_wib || latest?.finished_at)}</strong></div>
      <div><span>Hosts</span><strong>{latest?.host_count || '—'}</strong></div>
      <div><span>Collection</span><strong><StatusPill value={latest?.status || 'WAITING'} /></strong></div>
      <div><span>System Health</span><strong><StatusPill value={overallHealth} /></strong></div>
      <div><span>UI Updated · WIB</span><strong>{lastUpdate || '—'}</strong></div>
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
        <span>Recent Collections</span>
        <strong>{collectionCount || '—'}</strong>
        <small>{partialCount} partial · {failedCount} failed</small>
      </div>
    </div>

    {hosts.length > 0 && <div className="rundeckHostSection">
      <div className="rundeckSectionTitle">
        <div><h3>Application Server Health</h3><span>Latest normalized snapshot · worst-state summary</span></div>
        <StatusPill value={overallHealth} />
      </div>
      <div className="rundeckHostGrid">
        {hosts.map((host) => <article key={host.host} className="rundeckHostCard">
          <div><strong>{host.host}</strong><StatusPill value={host.health} /></div>
          <small>{formatTime(host.collected_at)}</small>
          <dl>
            <div><dt>CPU</dt><dd>{metric(host.cpu_pct, '%')}</dd></div>
            <div><dt>RAM</dt><dd>{metric(host.ram_pct, '%')}</dd></div>
            <div><dt>Load 1M</dt><dd>{metric(host.load_1)}</dd></div>
            <div><dt>I/O Wait</dt><dd>{metric(host.io_wait_pct, '%')}</dd></div>
            <div><dt>Swap I/O</dt><dd>{metric(host.swap_pct, ' p/s')}</dd></div>
            <div className={Number(host.wp_critical || 0) > 0 ? 'is-attention' : ''}><dt>WP Critical</dt><dd>{metric(host.wp_critical)}</dd></div>
          </dl>
        </article>)}
      </div>
    </div>}

    <RundeckMonitoringHistory
      refreshToken={latest?.collection_id || ''}
      databaseEnabled={Boolean(health?.database)}
    />

    <details className="rundeckHistory">
      <summary>Collection History · 90 days · {collectionCount} recent · {partialCount} partial · {failedCount} failed</summary>
      <div className="rundeckHistoryTableWrap">
        <table>
          <thead><tr><th>Execution</th><th>Collection Time · WIB</th><th>Hosts</th><th>Status</th></tr></thead>
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
