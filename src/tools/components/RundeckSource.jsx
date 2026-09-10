import React from 'react'
import RundeckMonitoringHistory from './RundeckMonitoringHistory.jsx'
import { SAP_INFRA_TERMS as TERMS } from './sapInfraTerms.js'
import './RundeckSource.css'
import './RundeckPlatformHealth.css'

const API = `${import.meta.env.BASE_URL}api`

const formatTime = (value, compact = false) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('id-ID', compact
    ? { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }
    : { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }
  ).format(date)
}

const metric = (value, suffix = '') => (
  value === null || value === undefined || value === ''
    ? '—'
    : `${Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 })}${suffix}`
)

const formatBytes = (value) => {
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let size = bytes / 1024
  let index = 0
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024
    index += 1
  }
  return `${size.toLocaleString('en-US', { maximumFractionDigits: size >= 10 ? 1 : 2 })} ${units[index]}`
}

const shortHost = (host = '') => {
  const match = String(host).match(/APP(\d+)/i)
  return match ? `APP${match[1]}` : String(host)
}

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
  const [platform, setPlatform] = React.useState(null)
  const [hosts, setHosts] = React.useState([])
  const [hostSnapshot, setHostSnapshot] = React.useState(null)
  const [history, setHistory] = React.useState([])
  const [runState, setRunState] = React.useState({ enabled: false, allowed: false })
  const [error, setError] = React.useState('')
  const [actionBusy, setActionBusy] = React.useState(false)
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
    const [healthResult, hostsResult, historyResult, runResult, platformResult] = await Promise.allSettled([
      json(`${API}/health`),
      json(`${API}/history/hosts/latest`),
      json(`${API}/history/collections?days=90&limit=30`),
      json(`${API}/collect-now/status`),
      json(`${API}/platform/health`),
    ])

    if (healthResult.status === 'fulfilled') setHealth(healthResult.value)
    if (hostsResult.status === 'fulfilled') {
      setHosts(hostsResult.value.items || [])
      setHostSnapshot(hostsResult.value)
    }
    if (historyResult.status === 'fulfilled') setHistory(historyResult.value.items || [])
    if (runResult.status === 'fulfilled') setRunState(runResult.value)
    if (platformResult.status === 'fulfilled') setPlatform(platformResult.value)
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
      // 60-second polling remains the fallback while EventSource reconnects.
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

  const currentCollection = hostSnapshot?.collection_id || latest?.collection_id
  const collectionAligned = !currentCollection || currentCollection === latest?.collection_id
  const operationalHosts = collectionAligned ? hosts : []
  const overallHealth = !collectionAligned
    ? 'WARNING'
    : operationalHosts.some((host) => host.health === 'CRITICAL')
      ? 'CRITICAL'
      : operationalHosts.some((host) => host.health === 'WARNING') || health?.rundeck_stale
        ? 'WARNING'
        : operationalHosts.length
          ? 'NORMAL'
          : 'WAITING'

  const collectionCount = history.length
  const partialCount = history.filter((row) => row.status === 'PARTIAL').length
  const failedCount = history.filter((row) => row.status === 'FAILED').length
  const collectorState = health?.rundeck_stale ? 'STALE' : 'CURRENT'
  const databaseState = health?.database ? 'ONLINE' : 'FILE FALLBACK'
  const platformState = platform?.status || 'UNKNOWN'
  const releaseState = platform?.releases?.backend?.status === 'WARNING' || platform?.releases?.web?.status === 'WARNING' ? 'WARNING' : 'NORMAL'

  return <section className="rundeckPanel" aria-label="SAP infrastructure monitoring" aria-live="polite">
    <header className="rundeckLandscapeHeader">
      <div>
        <span className="rundeckEyebrow">{TERMS.collector}</span>
        <h2>{TERMS.landscapeHealth}</h2>
      </div>
      <div className="rundeckActions">
        <StatusPill value={overallHealth} />
        {runState.enabled && (
          <button
            type="button"
            className="rundeckCollectButton"
            disabled={actionBusy || !runState.allowed}
            onClick={collectNow}
            title={runState.running ? 'Rundeck job is still running' : runState.cooldown ? 'Collect Now is in cooldown' : 'Run the approved SPHERE Rundeck job'}
          >
            {actionBusy ? 'Starting…' : runState.running ? `Running #${runState.execution_id || ''}` : runState.cooldown ? 'Cooldown' : 'Collect Now'}
          </button>
        )}
      </div>
    </header>

    {error && <div className="rundeckMessage" role="status">{error}</div>}
    {!collectionAligned && <div className="rundeckMessage" role="status">Latest database projection does not match the current Collection Cycle. Host telemetry is withheld until one complete cycle is available.</div>}

    <div className="rundeckLandscapeMeta" aria-label="Landscape telemetry status">
      <span><b>{TERMS.lastCollection}</b>{formatTime(latest?.collection_time_wib || latest?.finished_at)}</span>
      <span><b>{TERMS.telemetryCoverage}</b>{latest?.host_count || '—'}</span>
      <span><b>Rundeck</b>{collectorState}</span>
      <span><b>{TERMS.database}</b>{databaseState}</span>
      <span><b>Platform</b><StatusPill value={platformState} /></span>
      <span><b>Execution</b>#{latest?.execution_id || '—'}</span>
    </div>

    {operationalHosts.length > 0 && <section className="rundeckServerSection">
      <div className="rundeckSectionTitle">
        <h3>{TERMS.applicationServers}</h3>
        <span>Collection #{hostSnapshot?.execution_id || latest?.execution_id || '—'} · one-cycle telemetry</span>
      </div>
      <div className="rundeckServerTableWrap">
        <table className="rundeckServerTable">
          <thead>
            <tr>
              <th>Server</th>
              <th>State</th>
              <th>CPU</th>
              <th>Memory</th>
              <th>Load 1M</th>
              <th>I/O Wait</th>
              <th>Swap I/O</th>
              <th>{TERMS.criticalWorkProcess}</th>
              <th>Sample WIB</th>
            </tr>
          </thead>
          <tbody>
            {operationalHosts.map((host) => <tr key={host.host}>
              <td><strong title={host.host}>{shortHost(host.host)}</strong></td>
              <td><StatusPill value={host.health} /></td>
              <td>{metric(host.cpu_pct, '%')}</td>
              <td>{metric(host.ram_pct, '%')}</td>
              <td>{metric(host.load_1)}</td>
              <td>{metric(host.io_wait_pct, '%')}</td>
              <td>{metric(host.swap_pct, ' p/s')}</td>
              <td className={Number(host.wp_critical || 0) > 0 ? 'is-attention' : ''}>{metric(host.wp_critical)}</td>
              <td className="rundeckSampleTime">{formatTime(host.collected_at, true)}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>}

    <RundeckMonitoringHistory
      refreshToken={latest?.collection_id || ''}
      databaseEnabled={Boolean(health?.database)}
    />

    <details className="rundeckHistory">
      <summary>{TERMS.collectionCycle} History <span>{collectionCount} recent, {partialCount} partial, {failedCount} failed</span></summary>
      <div className="rundeckHistoryTableWrap">
        <table>
          <thead><tr><th>Execution</th><th>Collection Time WIB</th><th>Coverage</th><th>Status</th></tr></thead>
          <tbody>
            {history.slice(0, 15).map((row) => <tr key={row.collection_id || row.execution_id}>
              <td>#{row.execution_id}</td>
              <td>{formatTime(row.collection_time_wib || row.finished_at)}</td>
              <td>{row.host_count || `${row.received_host_count ?? '—'} of ${row.expected_host_count ?? 5}`}</td>
              <td><StatusPill value={row.status || 'UNKNOWN'} /></td>
            </tr>)}
            {!history.length && <tr><td colSpan="4">No collection history yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </details>

    <details className="rundeckPlatformHealth">
      <summary>SPHERE Platform Health <StatusPill value={platformState} /><span>OS, storage, database and maintenance</span></summary>
      <div className="rundeckPlatformTableWrap">
        <table className="rundeckPlatformTable">
          <thead><tr><th>Signal</th><th>State</th><th>Operational Detail</th></tr></thead>
          <tbody>
            <tr><td>Rundeck Collector</td><td>{platform?.collector?.status || 'UNKNOWN'}</td><td>{platform?.collector ? `${platform.collector.poller_status} · ${platform.collector.credential_mode} credential · ${formatTime(platform.collector.checked_at)}` : '—'}</td></tr>
            <tr><td>Filesystem</td><td>{platform?.filesystem?.status || 'UNKNOWN'}</td><td>{metric(platform?.filesystem?.used_pct, '% used')}</td></tr>
            <tr><td>Inode</td><td>{platform?.inode?.status || 'UNKNOWN'}</td><td>{metric(platform?.inode?.used_pct, '% used')}</td></tr>
            <tr><td>Raw Evidence</td><td>{platform?.filesystem?.status || 'UNKNOWN'}</td><td>{platform?.archive ? `${platform.archive.files} files · ${formatBytes(platform.archive.bytes)}` : '—'}</td></tr>
            <tr><td>PostgreSQL</td><td>{platform?.database?.status === 'ok' ? 'NORMAL' : String(platform?.database?.status || 'UNKNOWN').toUpperCase()}</td><td>{platform?.database ? `${formatBytes(platform.database.database_bytes)} · ${platform.database.connections ?? '—'} connections · ${platform.database.long_transactions ?? '—'} long tx` : '—'}</td></tr>
            <tr><td>Retention</td><td>{platform?.maintenance?.status || 'UNKNOWN'}</td><td>{platform?.maintenance?.last_error ? `Last failure ${formatTime(platform.maintenance.last_error)} · ${platform.maintenance.error_type || 'error'}` : platform?.maintenance?.last_run ? `${formatTime(platform.maintenance.last_run)} · ${platform.maintenance.retention_days} days` : 'No maintenance result yet'}</td></tr>
            <tr><td>Backup</td><td>{platform?.backup?.status || 'NOT_CONFIGURED'}</td><td>{platform?.backup?.last_success ? `Last success ${formatTime(platform.backup.last_success)}` : 'Backup status marker not configured'}</td></tr>
            <tr><td>Release Window</td><td>{releaseState}</td><td>{platform?.releases ? `${platform.releases.backend.count} backend · ${platform.releases.web.count} web · retain ${platform.releases.backend.retain}` : '—'}</td></tr>
          </tbody>
        </table>
      </div>
    </details>
  </section>
}
