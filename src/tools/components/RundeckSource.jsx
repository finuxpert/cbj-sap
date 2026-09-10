import React from 'react'
import RundeckCurrentWorkload from './RundeckCurrentWorkload.jsx'
import RundeckMonitoringHistory from './RundeckMonitoringHistory.jsx'
import RundeckPerformanceIncident from './RundeckPerformanceIncident.jsx'
import SphereIcon from './SphereIcon.jsx'
import { APP_DISPLAY_VERSION } from '../../app/version.js'
import { numberText, shortHost, workloadTypeLabel } from './sapUiFormat.js'
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

const pssText = (row = {}) => {
  const value = Number(row.details?.pss_gb)
  return Number.isFinite(value) ? `${numberText(value, 2)} GB` : '—'
}

const wpText = (row = {}) => [row.details?.wp_type, row.details?.wp].filter(Boolean).join(' ') || '—'

function StatusPill({ value = 'UNKNOWN' }) {
  return <span className={`rundeckStatus is-${String(value).toLowerCase()}`}>{value}</span>
}

function conservativeHostState(host = {}) {
  const cpu = Number(host.cpu_pct)
  const ram = Number(host.ram_pct)
  const ioWait = Number(host.io_wait_pct)
  const wp = Number(host.wp_critical || 0)
  if ((Number.isFinite(cpu) && cpu >= 90) || (Number.isFinite(ram) && ram >= 90) || (Number.isFinite(ioWait) && ioWait >= 20)) return 'CRITICAL'
  if ((Number.isFinite(cpu) && cpu >= 75) || (Number.isFinite(ram) && ram >= 80) || (Number.isFinite(ioWait) && ioWait >= 10) || wp > 0) return 'WARNING'
  return 'NORMAL'
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

function pdfStatusColor(status) {
  if (status === 'CRITICAL') return [190, 65, 73]
  if (status === 'WARNING') return [182, 132, 31]
  return [41, 131, 91]
}

function clipped(value, length = 44) {
  const text = String(value || '—')
  return text.length > length ? `${text.slice(0, length - 1)}…` : text
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
  const [wpDrilldown, setWpDrilldown] = React.useState(null)
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

  async function toggleCriticalWp(host) {
    const hostName = host?.host || ''
    if (!hostName || !latest?.collection_id) return
    if (wpDrilldown?.host === hostName) {
      setWpDrilldown(null)
      return
    }
    setWpDrilldown({ host: hostName, count: Number(host.wp_critical || 0), loading: true, rows: [], error: '' })
    try {
      const result = await json(`${API}/history/jobs/current?collection_id=${encodeURIComponent(latest.collection_id)}&limit=50`)
      const rows = (result.items || []).filter((row) => row.host === hostName).slice(0, 10)
      setWpDrilldown({ host: hostName, count: Number(host.wp_critical || 0), loading: false, rows, error: '' })
    } catch (failure) {
      setWpDrilldown({ host: hostName, count: Number(host.wp_critical || 0), loading: false, rows: [], error: failure.message || 'Workload detail unavailable.' })
    }
  }

  async function exportPdf() {
    const panel = panelRef.current
    if (!panel || exporting) return
    setExporting(true)
    setError('')
    try {
      const [{ default: html2canvas }, { jsPDF }, workloadResult, alertResult] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
        latest?.collection_id ? json(`${API}/history/jobs/current?collection_id=${encodeURIComponent(latest.collection_id)}&limit=5`) : Promise.resolve({ items: [] }),
        json(`${API}/history/alerts?days=1&limit=500`).catch(() => ({ items: [] })),
      ])

      const capture = async (selector) => {
        const element = panel.querySelector(selector)
        if (!element) return null
        return html2canvas(element, { backgroundColor: '#0f151a', scale: 1.2, useCORS: true, logging: false })
      }
      const [serverChart, workloadChart] = await Promise.all([
        capture('.rundeckTrendChart'),
        capture('.rundeckJobPerformanceChart, .rundeckSingleSample'),
      ])

      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
      const W = pdf.internal.pageSize.getWidth()
      const H = pdf.internal.pageSize.getHeight()
      const margin = 9
      const contentW = W - margin * 2
      pdf.setFillColor(248, 250, 251)
      pdf.rect(0, 0, W, H, 'F')
      pdf.setTextColor(22, 31, 38)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(15)
      pdf.text('SPHERE  SAP PERFORMANCE RCA', margin, 13)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7.5)
      pdf.setTextColor(92, 105, 114)
      pdf.text(`${formatTime(latest?.finished_at)} WIB  ·  Run #${latest?.execution_id || '—'}  ·  ${APP_DISPLAY_VERSION}`, margin, 18)

      const status = incidentSummary?.status || 'NORMAL'
      const [sr, sg, sb] = pdfStatusColor(status)
      pdf.setFillColor(sr, sg, sb)
      pdf.roundedRect(W - margin - 24, 8, 24, 7, 2, 2, 'F')
      pdf.setTextColor(255, 255, 255)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(7)
      pdf.text(status, W - margin - 12, 12.7, { align: 'center' })

      const affected = shortHost(incidentSummary?.affected_server || '')
      const signal = incidentSummary?.primary_signal || {}
      pdf.setTextColor(22, 31, 38)
      pdf.setFontSize(10)
      pdf.text(`${affected || 'SAP'}${signal.label ? ` · ${String(signal.label).replace(/Critical Work Process/gi, 'Critical WP')} ${metric(signal.value, signal.unit || '')}` : ''}`, margin, 26)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7)
      pdf.setTextColor(92, 105, 114)
      const since = incidentSummary?.signal_active_since || incidentSummary?.detected_since
      pdf.text(`Since ${formatTime(since)} WIB  ·  Confidence ${incidentSummary?.confidence || '—'}  ·  ${clipped(incidentSummary?.severity_reason || '', 92)}`, margin, 31)

      const current = incidentSummary?.current_workload || {}
      const recurring = incidentSummary?.persistent_workload || {}
      pdf.setFillColor(235, 240, 242)
      pdf.roundedRect(margin, 35, contentW, 22, 2, 2, 'F')
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(7)
      pdf.setTextColor(71, 87, 97)
      pdf.text('CURRENT WORKLOAD', margin + 4, 40)
      pdf.text('RECURRING WORKLOAD', margin + contentW / 2 + 4, 40)
      pdf.setTextColor(22, 31, 38)
      pdf.setFontSize(9)
      pdf.text(clipped(current.consumer_key, 42), margin + 4, 46)
      pdf.text(clipped(recurring.consumer_key, 42), margin + contentW / 2 + 4, 46)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(6.8)
      pdf.setTextColor(92, 105, 114)
      pdf.text(`CPU ${metric(current.cpu_pct, '%')}  ·  ${wpText(current)}`, margin + 4, 52)
      pdf.text(recurring.consumer_key ? `Seen ${recurring.occurrences || 0} of ${recurring.affected_samples || 0} checks  ·  Avg ${metric(recurring.avg_cpu_pct, '%')}  ·  Peak ${metric(recurring.peak_cpu_pct, '%')}` : '—', margin + contentW / 2 + 4, 52)

      let y = 63
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(8)
      pdf.setTextColor(22, 31, 38)
      pdf.text('APPLICATION SERVERS', margin, y)
      y += 4
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(6.5)
      const columns = [0, 25, 53, 82, 112, 144]
      ;['APP', 'STATE', 'CPU', 'RAM', 'IO WAIT', 'CRIT WP'].forEach((label, index) => pdf.text(label, margin + columns[index], y))
      y += 4
      operationalHosts.slice(0, 5).forEach((host) => {
        const state = conservativeHostState(host)
        pdf.text(shortHost(host.host), margin + columns[0], y)
        pdf.text(state, margin + columns[1], y)
        pdf.text(metric(host.cpu_pct, '%'), margin + columns[2], y)
        pdf.text(metric(host.ram_pct, '%'), margin + columns[3], y)
        pdf.text(metric(host.io_wait_pct, '%'), margin + columns[4], y)
        pdf.text(metric(host.wp_critical), margin + columns[5], y)
        y += 4
      })

      const chartY = 91
      const chartW = contentW
      if (serverChart) {
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(8)
        pdf.text('SERVER TREND', margin, chartY - 3)
        const ratio = Math.min(chartW / serverChart.width, 58 / serverChart.height)
        pdf.addImage(serverChart.toDataURL('image/jpeg', .9), 'JPEG', margin, chartY, serverChart.width * ratio, serverChart.height * ratio, undefined, 'FAST')
      }

      const workY = 151
      const leftW = contentW * .64
      pdf.setTextColor(22, 31, 38)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(8)
      pdf.text(`SELECTED WORKLOAD  ${clipped(selectedJob?.key || current.consumer_key, 54)}`, margin, workY - 3)
      if (workloadChart) {
        const ratio = Math.min(leftW / workloadChart.width, 44 / workloadChart.height)
        pdf.addImage(workloadChart.toDataURL('image/jpeg', .9), 'JPEG', margin, workY, workloadChart.width * ratio, workloadChart.height * ratio, undefined, 'FAST')
      }

      const sideX = margin + leftW + 7
      pdf.setFontSize(7.5)
      pdf.text('TOP CURRENT WORKLOAD', sideX, workY - 3)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(6.3)
      let sideY = workY + 3
      ;(workloadResult.items || []).slice(0, 5).forEach((row, index) => {
        pdf.setTextColor(22, 31, 38)
        pdf.text(`${index + 1}. ${shortHost(row.host)}  ${clipped(row.consumer_key, 32)}`, sideX, sideY)
        pdf.setTextColor(92, 105, 114)
        pdf.text(`CPU ${metric(row.cpu_pct, '%')}  ·  PSS ${pssText(row)}`, sideX, sideY + 3.3)
        sideY += 8
      })

      const alerts = alertResult.items || []
      const criticalAlerts = alerts.filter((row) => row.severity === 'CRITICAL').length
      const warningAlerts = alerts.filter((row) => row.severity === 'WARNING').length
      pdf.setDrawColor(210, 217, 221)
      pdf.line(margin, H - 12, W - margin, H - 12)
      pdf.setFontSize(6.5)
      pdf.setTextColor(92, 105, 114)
      pdf.text(`Alerts last 24h: ${criticalAlerts} critical · ${warningAlerts} warning  ·  Source: Rundeck  ·  First Seen means first SPHERE observation, not exact SAP start time.`, margin, H - 7)

      const host = shortHost(selectedJob?.host || incidentSummary?.affected_server || 'SAP') || 'SAP'
      const stamp = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
        .format(new Date()).replaceAll('-', '').replace(', ', '_').replace(':', '')
      pdf.save(`SPHERE_RCA_${host}_${stamp}_Run${latest?.execution_id || 'NA'}.pdf`)
    } catch (failure) {
      setError(failure.message || 'PDF export failed.')
    } finally {
      setExporting(false)
    }
  }

  const collectionAligned = !latest?.collection_id || !hostSnapshot?.collection_id || hostSnapshot.collection_id === latest.collection_id
  const operationalHosts = collectionAligned ? hosts : []
  const hostStates = operationalHosts.map(conservativeHostState)
  const fallbackHealth = !collectionAligned
    ? 'WARNING'
    : hostStates.includes('CRITICAL')
      ? 'CRITICAL'
      : hostStates.includes('WARNING') || health?.rundeck_stale
        ? 'WARNING'
        : operationalHosts.length
          ? 'NORMAL'
          : 'WAITING'
  const overallHealth = incidentSummary?.active ? incidentSummary.status : fallbackHealth

  const collectionCount = history.length
  const partialCount = history.filter((row) => row.status === 'PARTIAL').length
  const failedCount = history.filter((row) => row.status === 'FAILED').length
  const platformState = platform?.status || 'UNKNOWN'
  const releaseState = platform?.releases?.backend?.status === 'WARNING' || platform?.releases?.web?.status === 'WARNING' ? 'WARNING' : 'NORMAL'
  const appCount = latest?.received_hosts?.length || operationalHosts.length || 0
  const incidentStart = incidentSummary?.signal_active_since || incidentSummary?.detected_since || ''
  const latestCollectionAt = latest?.collection_time_wib || latest?.finished_at || ''

  const currentWorkload = <RundeckCurrentWorkload
    collectionId={latest?.collection_id || ''}
    selectedJob={selectedJob}
    onSelectJob={selectJob}
  />

  return <section ref={panelRef} className="rundeckPanel" aria-label="SAP performance monitoring" aria-live="polite">
    <header className="rundeckLandscapeHeader">
      <div className="rundeckTitleBlock">
        <h2><SphereIcon name="activity" /> SAP Performance RCA</h2>
        <div className="rundeckLandscapeMeta" aria-label="SAP performance data status">
          <span>{formatTime(latestCollectionAt, true)} WIB</span>
          <span>{appCount || '—'} APP</span>
          <span>Run #{latest?.execution_id || '—'}</span>
        </div>
      </div>
      <div className="rundeckActions">
        <StatusPill value={overallHealth} />
        <div className="rundeckModeSwitch" role="group" aria-label="Data source">
          <button type="button" className="is-active" aria-pressed="true"><SphereIcon name="refresh" /> Rundeck</button>
          <button type="button" onClick={() => switchParentSource('manual')}><SphereIcon name="upload" /> Manual Upload</button>
        </div>
        <button type="button" className="rundeckPdfButton" disabled={exporting} onClick={exportPdf}><SphereIcon name="pdf" /> {exporting ? 'Exporting…' : 'Export PDF'}</button>
        {runState.enabled && (
          <button
            type="button"
            className="rundeckCollectButton"
            disabled={actionBusy || !runState.allowed}
            onClick={collectNow}
            title={runState.running ? 'Rundeck job is still running' : runState.cooldown ? 'Collect Now is in cooldown' : 'Run the approved SPHERE Rundeck job'}
          >
            <SphereIcon name="refresh" /> {actionBusy ? 'Starting…' : runState.running ? `Running #${runState.execution_id || ''}` : runState.cooldown ? 'Cooldown' : 'Collect Now'}
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
        <h3><SphereIcon name="server" /> Application Servers</h3>
      </div>
      <div className="rundeckServerTableWrap">
        <table className="rundeckServerTable">
          <thead><tr><th>APP</th><th>State</th><th>CPU</th><th>RAM</th><th>Load</th><th>IO Wait</th><th>Critical WP</th></tr></thead>
          <tbody>
            {operationalHosts.map((host) => {
              const wpCount = Number(host.wp_critical || 0)
              return <tr key={host.host} className={wpDrilldown?.host === host.host ? 'is-selected' : ''}>
                <td><strong title={host.host}>{shortHost(host.host)}</strong></td>
                <td><StatusPill value={conservativeHostState(host)} /></td>
                <td>{metric(host.cpu_pct, '%')}</td>
                <td>{metric(host.ram_pct, '%')}</td>
                <td>{metric(host.load_1)}</td>
                <td>{metric(host.io_wait_pct, '%')}</td>
                <td className={wpCount > 0 ? 'is-attention' : ''}>
                  {wpCount > 0
                    ? <button type="button" className="rundeckWpButton" onClick={() => toggleCriticalWp(host)} aria-expanded={wpDrilldown?.host === host.host}><SphereIcon name="alert" /> {wpCount}</button>
                    : '0'}
                </td>
              </tr>
            })}
          </tbody>
        </table>
      </div>

      {wpDrilldown && <section className="rundeckWpDrilldown" aria-live="polite">
        <div className="rundeckWpDrilldownHead">
          <h4><SphereIcon name="alert" /> {shortHost(wpDrilldown.host)} · Critical WP {wpDrilldown.count}</h4>
          <button type="button" onClick={() => setWpDrilldown(null)}>Close</button>
        </div>
        <p>Exact WP mapping is not available yet. Current workloads on {shortHost(wpDrilldown.host)} are shown for investigation.</p>
        {wpDrilldown.loading && <div className="rundeckWpDrilldownState">Loading workload…</div>}
        {wpDrilldown.error && <div className="rundeckWpDrilldownState is-error">{wpDrilldown.error}</div>}
        {!wpDrilldown.loading && !wpDrilldown.error && <div className="rundeckWpDrilldownTableWrap">
          <table>
            <thead><tr><th>Workload</th><th>Type</th><th>WP</th><th>PID</th><th>User</th><th>CPU</th><th>PSS</th></tr></thead>
            <tbody>
              {wpDrilldown.rows.map((row) => {
                const details = row.details || {}
                const context = { key: row.consumer_key, host: row.host, consumerType: row.consumer_type, source: 'critical-wp-drilldown' }
                return <tr key={`${row.host}-${row.consumer_type}-${row.consumer_key}`}>
                  <td><button type="button" onClick={() => selectJob(context)}>{row.consumer_key}</button></td>
                  <td>{workloadTypeLabel(row.consumer_type)}</td>
                  <td>{wpText(row)}</td>
                  <td>{details.pid || '—'}</td>
                  <td>{details.user || '—'}</td>
                  <td>{metric(row.cpu_pct, '%')}</td>
                  <td>{pssText(row)}</td>
                </tr>
              })}
              {!wpDrilldown.rows.length && <tr><td colSpan="7">No current workload rows stored for this APP.</td></tr>}
            </tbody>
          </table>
        </div>}
      </section>}
    </section>}

    <RundeckMonitoringHistory
      refreshToken={latest?.collection_id || ''}
      databaseEnabled={Boolean(health?.database)}
      selectedJob={selectedJob}
      onSelectJob={selectJob}
      currentWorkloadContent={currentWorkload}
      incidentStart={incidentStart}
      latestCollectionId={latest?.collection_id || ''}
      latestCollectionAt={latestCollectionAt}
    />

    <div className="rundeckSupportingData">
      <div className="rundeckSupportingTitle">Supporting Data</div>
      <details className="rundeckHistory">
        <summary><SphereIcon name="history" /> Rundeck History <span>{collectionCount} runs · {partialCount} partial · {failedCount} failed</span></summary>
        <div className="rundeckHistoryTableWrap">
          <table>
            <thead><tr><th>Run</th><th>Time WIB</th><th>APP</th><th>Status</th></tr></thead>
            <tbody>
              {history.slice(0, 10).map((row) => <tr key={row.collection_id || row.execution_id}>
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
        <summary><SphereIcon name="database" /> SPHERE Health <StatusPill value={platformState} /></summary>
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
