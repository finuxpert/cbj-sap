import React from 'react'
import RundeckCurrentWorkload from './RundeckCurrentWorkload.jsx'
import RundeckMonitoringHistory from './RundeckMonitoringHistory.jsx'
import RundeckPerformanceIncident from './RundeckPerformanceIncident.jsx'
import { shortHost } from './sapUiFormat.js'
import './RundeckSource.css'
import './RundeckPlatformHealth.css'

const API = `${import.meta.env.BASE_URL}api`

const formatTime = (value, compact = false) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('id-ID', compact
    ? { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }
    : { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }
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

function StatusPill({ value = 'UNKNOWN' }) {
  return <span className={`rundeckStatus is-${String(value).toLowerCase()}`}>{value}</span>
}

function switchParentSource(value) {
  const select = document.querySelector('.logV2Header select')
  if (!select) return
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')
  if (descriptor?.set) descriptor.set.call(select, value)
  else select.value = value
  select.dispatchEvent(new Event('change', { bubbles: true }))
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
  const [exporting, setExporting] = React.useState(false)
  const [selectedJob, setSelectedJob] = React.useState(null)
  const [incidentSummary, setIncidentSummary] = React.useState(null)
  const loaded = React.useRef('')
  const panelRef = React.useRef(null)
  const onCollectionRef = React.useRef(onCollection)

  React.useEffect(() => {
    onCollectionRef.current = onCollection
  }, [onCollection])

  const selectJob = React.useCallback((job) => {
    if (!job?.key) return
    setSelectedJob({ ...job, pinned: true })
  }, [])

  const defaultJob = React.useCallback((job) => {
    if (!job?.key) return
    setSelectedJob((current) => current?.pinned ? current : { ...job, pinned: false })
  }, [])

  const loadLatest = React.useCallback(async () => {
    const response = await fetch(`${API}/collections/latest`, { cache: 'no-store' })
    if (response.status === 404) return
    if (!response.ok) throw new Error('Unable to load Rundeck data.')
    const collection = await response.json()
    if (collection.status !== 'READY') throw new Error('Latest Rundeck run is not ready.')

    setLatest(collection)

    if (loaded.current !== collection.collection_id) {
      const raw = await fetch(`${API}/collections/${encodeURIComponent(collection.collection_id)}/raw`, { cache: 'no-store' })
      if (!raw.ok) throw new Error('Unable to download Rundeck data.')
      const blob = await raw.blob()
      await onCollectionRef.current?.([
        new File([blob], `${collection.collection_id}.log`, { type: 'text/plain' }),
      ])
      loaded.current = collection.collection_id
    }
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
      setError(failure.message || 'Rundeck data unavailable.')
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
    source.onerror = () => {}
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

  async function exportPdf() {
    const panel = panelRef.current
    if (!panel || exporting) return
    setExporting(true)
    panel.classList.add('is-pdf-exporting')
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])
      await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)))
      const canvas = await html2canvas(panel, {
        backgroundColor: '#0f151a',
        scale: 1.35,
        useCORS: true,
        logging: false,
      })
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const margin = 6
      const maxWidth = pageWidth - margin * 2
      const maxHeight = pageHeight - margin * 2
      const ratio = Math.min(maxWidth / canvas.width, maxHeight / canvas.height)
      const width = canvas.width * ratio
      const height = canvas.height * ratio
      const x = (pageWidth - width) / 2
      const y = (pageHeight - height) / 2
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', x, y, width, height, undefined, 'FAST')
      const host = shortHost(selectedJob?.host || incidentSummary?.affected_server || 'SAP') || 'SAP'
      const stamp = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
        .format(new Date()).replaceAll('-', '').replace(', ', '_').replace(':', '')
      pdf.save(`SPHERE_RCA_${host}_${stamp}_Run${latest?.execution_id || 'NA'}.pdf`)
    } catch (failure) {
      setError(failure.message || 'PDF export failed.')
    } finally {
      panel.classList.remove('is-pdf-exporting')
      setExporting(false)
    }
  }

  const collectionAligned = !latest?.collection_id || !hostSnapshot?.collection_id || hostSnapshot.collection_id === latest.collection_id
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
  const collectorState = health?.rundeck_stale ? 'STALE' : 'OK'
  const platformState = platform?.status || 'UNKNOWN'
  const releaseState = platform?.releases?.backend?.status === 'WARNING' || platform?.releases?.web?.status === 'WARNING' ? 'WARNING' : 'NORMAL'
  const appCount = latest?.received_hosts?.length || operationalHosts.length || 0
  const incidentStart = incidentSummary?.signal_active_since || incidentSummary?.detected_since || ''

  const currentWorkload = <RundeckCurrentWorkload
    collectionId={latest?.collection_id || ''}
    selectedJob={selectedJob}
    onSelectJob={selectJob}
  />

  return <section ref={panelRef} className="rundeckPanel" aria-label="SAP performance monitoring" aria-live="polite">
    <header className="rundeckLandscapeHeader">
      <div className="rundeckTitleBlock">
        <h2>SAP Performance RCA</h2>
        <div className="rundeckLandscapeMeta" aria-label="SAP performance data status">
          <span>{formatTime(latest?.collection_time_wib || latest?.finished_at, true)} WIB</span>
          <span>{appCount || '—'} APP</span>
          <span>Run #{latest?.execution_id || '—'}</span>
        </div>
      </div>
      <div className="rundeckActions">
        <StatusPill value={overallHealth} />
        <div className="rundeckModeSwitch" role="group" aria-label="Data source">
          <button type="button" className="is-active" aria-pressed="true">Rundeck</button>
          <button type="button" onClick={() => switchParentSource('manual')}>Manual Upload</button>
        </div>
        <button type="button" className="rundeckPdfButton" disabled={exporting} onClick={exportPdf}>{exporting ? 'Exporting…' : 'Export PDF'}</button>
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

    {error && <div className={`rundeckMessage ${latest ? 'is-reconnecting' : ''}`} role="status">{latest ? `Refresh delayed. Showing last good run #${latest.execution_id || '—'}.` : error}</div>}
    {!collectionAligned && <div className="rundeckMessage" role="status">Waiting for one complete aligned Rundeck run.</div>}

    <RundeckPerformanceIncident
      refreshToken={latest?.collection_id || ''}
      selectedJob={selectedJob}
      onSelectJob={selectJob}
      onDefaultJob={defaultJob}
      onSummary={setIncidentSummary}
      showStatus={false}
    />

    {operationalHosts.length > 0 && <section className="rundeckServerSection">
      <div className="rundeckSectionTitle">
        <h3>Application Servers</h3>
      </div>
      <div className="rundeckServerTableWrap">
        <table className="rundeckServerTable">
          <thead><tr><th>APP</th><th>State</th><th>CPU</th><th>RAM</th><th>Load</th><th>IO Wait</th><th>Critical WP</th></tr></thead>
          <tbody>
            {operationalHosts.map((host) => <tr key={host.host}>
              <td><strong title={host.host}>{shortHost(host.host)}</strong></td>
              <td><StatusPill value={host.health} /></td>
              <td>{metric(host.cpu_pct, '%')}</td>
              <td>{metric(host.ram_pct, '%')}</td>
              <td>{metric(host.load_1)}</td>
              <td>{metric(host.io_wait_pct, '%')}</td>
              <td className={Number(host.wp_critical || 0) > 0 ? 'is-attention' : ''}>{metric(host.wp_critical)}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>}

    <RundeckMonitoringHistory
      refreshToken={latest?.collection_id || ''}
      databaseEnabled={Boolean(health?.database)}
      selectedJob={selectedJob}
      onSelectJob={selectJob}
      currentWorkloadContent={currentWorkload}
      incidentStart={incidentStart}
      latestCollectionId={latest?.collection_id || ''}
    />

    <div className="rundeckSupportingData">
      <div className="rundeckSupportingTitle">Supporting Data</div>
      <details className="rundeckHistory">
        <summary>Rundeck History <span>{collectionCount} runs · {partialCount} partial · {failedCount} failed</span></summary>
        <div className="rundeckHistoryTableWrap">
          <table>
            <thead><tr><th>Run</th><th>Time WIB</th><th>APP</th><th>Status</th></tr></thead>
            <tbody>
              {history.slice(0, 15).map((row) => <tr key={row.collection_id || row.execution_id}>
                <td>#{row.execution_id}</td>
                <td>{formatTime(row.collection_time_wib || row.finished_at)}</td>
                <td>{row.received_host_count ?? row.received_hosts?.length ?? '—'}</td>
                <td><StatusPill value={row.status || 'UNKNOWN'} /></td>
              </tr>)}
              {!history.length && <tr><td colSpan="4">No Rundeck history yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </details>

      <details className="rundeckPlatformHealth">
        <summary>SPHERE Health <StatusPill value={platformState} /></summary>
        <div className="rundeckPlatformTableWrap">
          <table className="rundeckPlatformTable">
            <thead><tr><th>Component</th><th>State</th><th>Detail</th></tr></thead>
            <tbody>
              <tr><td>Rundeck</td><td>{platform?.collector?.status || 'UNKNOWN'}</td><td>{platform?.collector ? `${platform.collector.poller_status} · ${platform.collector.credential_mode} · ${formatTime(platform.collector.checked_at)}` : '—'}</td></tr>
              <tr><td>Filesystem</td><td>{platform?.filesystem?.status || 'UNKNOWN'}</td><td>{metric(platform?.filesystem?.used_pct, '% used')}</td></tr>
              <tr><td>Inode</td><td>{platform?.inode?.status || 'UNKNOWN'}</td><td>{metric(platform?.inode?.used_pct, '% used')}</td></tr>
              <tr><td>Raw Logs</td><td>{platform?.filesystem?.status || 'UNKNOWN'}</td><td>{platform?.archive ? `${platform.archive.files} files · ${formatBytes(platform.archive.bytes)}` : '—'}</td></tr>
              <tr><td>PostgreSQL</td><td>{platform?.database?.status === 'ok' ? 'NORMAL' : String(platform?.database?.status || 'UNKNOWN').toUpperCase()}</td><td>{platform?.database ? `${formatBytes(platform.database.database_bytes)} · ${platform.database.connections ?? '—'} connections` : '—'}</td></tr>
              <tr><td>Retention</td><td>{platform?.maintenance?.status || 'UNKNOWN'}</td><td>{platform?.maintenance?.last_run ? `${formatTime(platform.maintenance.last_run)} · ${platform.maintenance.retention_days} days` : 'No maintenance result yet'}</td></tr>
              <tr><td>Backup</td><td>{platform?.backup?.status || 'NOT_CONFIGURED'}</td><td>{platform?.backup?.last_success ? `Last success ${formatTime(platform.backup.last_success)}` : 'Backup not configured'}</td></tr>
              <tr><td>Releases</td><td>{releaseState}</td><td>{platform?.releases ? `${platform.releases.backend.count} backend · ${platform.releases.web.count} web` : '—'}</td></tr>
            </tbody>
          </table>
        </div>
      </details>
    </div>
  </section>
}
