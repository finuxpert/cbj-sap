import React from 'react'
import RundeckCurrentWorkload from './RundeckCurrentWorkload.jsx'
import RundeckMonitoringHistory from './RundeckMonitoringHistory.jsx'
import RundeckPerformanceIncident from './RundeckPerformanceIncident.jsx'
import SphereIcon from './SphereIcon.jsx'
import { APP_DISPLAY_VERSION, APP_TAGLINE } from '../../app/version.js'
import { numberText, shortHost, workloadTypeLabel } from './sapUiFormat.js'
import { hostResourceState, overallOperationalState, sapWorkloadState, statusExplanation } from './rundeckStatusSemantics.js'
import './RundeckSource.css'
import './RundeckPlatformHealth.css'

const API = `${import.meta.env.BASE_URL}api`
const BRAND_LOGO = `${import.meta.env.BASE_URL}branding/logo/sphere-logo-navbar-dark.png`
const REPORT_URL = typeof window === 'undefined' ? '' : `${window.location.origin}${import.meta.env.BASE_URL}#/tool/logs`
const CPU_HINT = 'CPU Usage is the grouped workload CPU observation and can exceed 100 percent when more than one CPU core is used.'

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
  const raw = row.details?.total_pss_gb ?? row.details?.pss_gb
  const value = Number(raw)
  return Number.isFinite(value) ? `${numberText(value, 2)} GB` : '—'
}

const processText = (row = {}) => {
  const value = Number(row.details?.process_count || 0)
  return Number.isFinite(value) && value > 0 ? numberText(value, 0) : '1'
}

const wpText = (row = {}) => [row.details?.wp_type, row.details?.wp].filter(Boolean).join(' ') || '—'

const programText = (row = {}) => {
  const program = row.details?.program
  if (program) return program
  return String(row.consumer_type || '').toUpperCase() === 'PROGRAM' ? row.consumer_key || '' : ''
}

const distinctProgramText = (row = {}) => {
  const program = String(programText(row) || '').trim()
  const workload = String(row.consumer_key || '').trim()
  if (!program) return ''
  return program.toUpperCase() === workload.toUpperCase() ? '' : program
}

const shortSignal = (label = '') => String(label || 'Performance issue')
  .replace(/Critical Work Process/gi, 'Critical WP')
  .replace(/Work Process/gi, 'WP')

const issueSignalText = (label, value) => {
  const normalized = shortSignal(label)
  if (/^Critical WP\b/i.test(normalized)) return `${value} Critical WP Active`
  return [normalized, value].filter(Boolean).join(' ')
}

function StatusPill({ value = 'UNKNOWN', title = '' }) {
  return <span key={String(value)} className={`rundeckStatus rundeckStatusMotion is-${String(value).toLowerCase()}`} title={title || undefined}>{value}</span>
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

function loadImage(src) {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = src
  })
}

function pdfStatusColor(status) {
  if (status === 'CRITICAL') return [190, 65, 73]
  if (status === 'WARNING') return [182, 132, 31]
  if (status === 'ATTENTION') return [88, 132, 184]
  return [41, 131, 91]
}

function clipped(value, length = 44) {
  const text = String(value || '—')
  return text.length > length ? `${text.slice(0, length - 1)}…` : text
}

function reportDuration(seconds) {
  const value = Number(seconds)
  if (!Number.isFinite(value) || value < 0) return '—'
  const minutes = Math.floor(value / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
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
  const [pdfPreview, setPdfPreview] = React.useState(null)
  const [selectedJob, setSelectedJob] = React.useState(null)
  const [incidentSummary, setIncidentSummary] = React.useState(null)
  const [wpDrilldown, setWpDrilldown] = React.useState(null)
  const [trendContext, setTrendContext] = React.useState({ metricLabel: 'CPU', rangeLabel: '6H', mode: 'max' })
  const loaded = React.useRef('')
  const panelRef = React.useRef(null)
  const onCollectionRef = React.useRef(onCollection)

  React.useEffect(() => {
    onCollectionRef.current = onCollection
  }, [onCollection])

  React.useEffect(() => () => {
    if (pdfPreview?.url) URL.revokeObjectURL(pdfPreview.url)
  }, [pdfPreview?.url])

  const closePdfPreview = React.useCallback(() => {
    setPdfPreview((current) => {
      if (current?.url) URL.revokeObjectURL(current.url)
      return null
    })
  }, [])

  const selectJob = React.useCallback((job) => {
    if (!job?.key) return
    const scrollTop = typeof window !== 'undefined' ? window.scrollY : null
    setSelectedJob({ ...job, pinned: true })
    if (scrollTop !== null) {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        window.scrollTo({ top: scrollTop, left: 0, behavior: 'auto' })
      }))
    }
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
      const [{ default: html2canvas }, { jsPDF }, workloadResult, brandLogo] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
        latest?.collection_id ? json(`${API}/history/jobs/current?collection_id=${encodeURIComponent(latest.collection_id)}&limit=4`) : Promise.resolve({ items: [] }),
        loadImage(BRAND_LOGO),
      ])

      const capture = async (selector) => {
        const element = panel.querySelector(selector)
        if (!element) return null
        return html2canvas(element, { backgroundColor: '#0f151a', scale: 1.55, useCORS: true, logging: false })
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

      pdf.setFillColor(15, 21, 26)
      pdf.roundedRect(margin, 7, contentW, 16, 1, 1, 'F')
      let brandX = margin + 4
      if (brandLogo?.naturalWidth && brandLogo?.naturalHeight) {
        const logoH = 8
        const logoW = Math.min(31, logoH * (brandLogo.naturalWidth / brandLogo.naturalHeight))
        pdf.addImage(brandLogo, 'PNG', brandX, 11, logoW, logoH, undefined, 'FAST')
        brandX += logoW + 5
      } else {
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(12)
        pdf.setTextColor(240, 245, 247)
        pdf.text('SPHERE', brandX, 17)
        brandX += 25
      }
      pdf.setTextColor(232, 238, 241)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(10.5)
      if (typeof pdf.textWithLink === 'function' && REPORT_URL) pdf.textWithLink(APP_TAGLINE, brandX, 17, { url: REPORT_URL })
      else pdf.text(APP_TAGLINE, brandX, 17)

      const status = overallHealth || 'NORMAL'
      const [sr, sg, sb] = pdfStatusColor(status)
      pdf.setFillColor(sr, sg, sb)
      pdf.rect(W - margin - 25, 11, 21, 7, 'F')
      pdf.setTextColor(255, 255, 255)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(7.4)
      pdf.text(status, W - margin - 14.5, 15.7, { align: 'center' })

      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7.8)
      pdf.setTextColor(92, 105, 114)
      pdf.text(`${formatTime(latest?.finished_at)} WIB  ·  Run #${latest?.execution_id || '—'}  ·  ${APP_DISPLAY_VERSION}`, margin, 29)

      const affected = shortHost(incidentSummary?.affected_server || '')
      const signal = incidentSummary?.primary_signal || {}
      const signalValue = metric(signal.value, signal.unit || '')
      const since = incidentSummary?.signal_active_since || incidentSummary?.detected_since
      pdf.setTextColor(22, 31, 38)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(9.8)
      pdf.text(`PRIMARY ISSUE · ${affected || 'SAP'}${signal.label ? ` · ${issueSignalText(signal.label, signalValue)}` : ''}`, margin, 36)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7.5)
      pdf.setTextColor(92, 105, 114)
      pdf.text(`Since ${formatTime(since)} WIB  ·  Duration ${reportDuration(incidentSummary?.duration_seconds)}`, margin, 41)

      const current = incidentSummary?.current_workload || {}
      const recurring = incidentSummary?.persistent_workload || {}
      const currentProgram = distinctProgramText(current)
      const recurringProgram = distinctProgramText(recurring)
      pdf.setFillColor(235, 240, 242)
      pdf.roundedRect(margin, 45, contentW, 21, 1, 1, 'F')
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(7.5)
      pdf.setTextColor(71, 87, 97)
      pdf.text('CURRENT WORKLOAD', margin + 4, 50)
      pdf.text('RECURRING WORKLOAD', margin + contentW / 2 + 4, 50)
      pdf.setTextColor(22, 31, 38)
      pdf.setFontSize(8.8)
      pdf.text(clipped(current.consumer_key, 42), margin + 4, 55)
      pdf.text(clipped(recurring.consumer_key, 42), margin + contentW / 2 + 4, 55)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(6.9)
      pdf.setTextColor(92, 105, 114)
      if (currentProgram) pdf.text(`Program ${clipped(currentProgram, 40)}`, margin + 4, 59)
      if (recurringProgram) pdf.text(`Program ${clipped(recurringProgram, 40)}`, margin + contentW / 2 + 4, 59)
      pdf.setFontSize(7.1)
      pdf.text(`CPU ${metric(current.cpu_pct, '%')}  ·  PSS ${pssText(current)}  ·  Processes ${processText(current)}`, margin + 4, 63)
      pdf.text(recurring.consumer_key ? `Observed ${recurring.occurrences || 0} checks  ·  Avg CPU ${metric(recurring.avg_cpu_pct, '%')}  ·  Peak ${metric(recurring.peak_cpu_pct, '%')}` : '—', margin + contentW / 2 + 4, 63)

      let y = 73
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(8.2)
      pdf.setTextColor(22, 31, 38)
      pdf.text('SAP APP SERVER STATUS', margin, y)
      y += 4
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(6.8)
      const columns = [0, 25, 60, 98, 120, 145, 176]
      ;['APP', 'OS RESOURCE', 'SAP WORKLOAD', 'CPU', 'MEMORY', 'I/O WAIT', 'CRIT WP'].forEach((label, index) => pdf.text(label, margin + columns[index], y))
      y += 4
      operationalHosts.slice(0, 5).forEach((host) => {
        pdf.text(shortHost(host.host), margin + columns[0], y)
        pdf.text(hostResourceState(host), margin + columns[1], y)
        pdf.text(sapWorkloadState(host), margin + columns[2], y)
        pdf.text(metric(host.cpu_pct, '%'), margin + columns[3], y)
        pdf.text(metric(host.ram_pct, '%'), margin + columns[4], y)
        pdf.text(metric(host.io_wait_pct, '%'), margin + columns[5], y)
        pdf.text(metric(host.wp_critical), margin + columns[6], y)
        y += 4
      })

      const chartY = y + 5
      if (serverChart) {
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(8.2)
        const trendMetric = String(trendContext.metricLabel || 'Performance').toUpperCase()
        const trendRange = String(trendContext.rangeLabel || '6H').toUpperCase()
        pdf.text(`SERVER ${trendMetric} TREND · ${trendRange}`, margin, chartY - 3)
        const ratio = Math.min(contentW / serverChart.width, 38 / serverChart.height)
        pdf.addImage(serverChart.toDataURL('image/jpeg', .92), 'JPEG', margin, chartY, serverChart.width * ratio, serverChart.height * ratio, undefined, 'FAST')
      }

      const workY = 154
      const leftW = contentW * .70
      const inspectedHost = shortHost(selectedJob?.host || incidentSummary?.affected_server || '') || 'SAP'
      const inspectedWorkload = selectedJob?.key || current.consumer_key
      const inspectedSource = [current, recurring, ...(workloadResult.items || [])].find((row) => (
        row?.consumer_key === inspectedWorkload && (!selectedJob?.host || !row?.host || row.host === selectedJob.host)
      )) || {}
      const inspectedProgram = distinctProgramText(inspectedSource)
      pdf.setTextColor(22, 31, 38)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(8.2)
      pdf.text(`SELECTED WORKLOAD · ${inspectedHost} · ${clipped(inspectedWorkload, 48)}`, margin, workY - 3)
      if (inspectedProgram) {
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(6.7)
        pdf.setTextColor(92, 105, 114)
        pdf.text(`Program ${clipped(inspectedProgram, 48)}`, margin, workY + 0.8)
      }
      if (workloadChart) {
        const chartTop = inspectedProgram ? workY + 3 : workY
        const chartMaxH = inspectedProgram ? 38 : 41
        const ratio = Math.min(leftW / workloadChart.width, chartMaxH / workloadChart.height)
        pdf.addImage(workloadChart.toDataURL('image/jpeg', .94), 'JPEG', margin, chartTop, workloadChart.width * ratio, workloadChart.height * ratio, undefined, 'FAST')
      }

      const sideX = margin + leftW + 7
      pdf.setTextColor(22, 31, 38)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(7.8)
      pdf.text('TOP ACTIVE WORKLOADS', sideX, workY - 3)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7)
      let sideY = workY + 3
      ;(workloadResult.items || []).slice(0, 4).forEach((row, index) => {
        pdf.setTextColor(22, 31, 38)
        pdf.text(`${index + 1}. ${shortHost(row.host)}  ${clipped(row.consumer_key, 28)}`, sideX, sideY)
        pdf.setTextColor(92, 105, 114)
        pdf.text(`CPU ${metric(row.cpu_pct, '%')}  ·  PSS ${pssText(row)}  ·  Proc ${processText(row)}`, sideX, sideY + 3.3)
        sideY += 8
      })

      pdf.setDrawColor(210, 217, 221)
      pdf.line(margin, H - 12, W - margin, H - 12)
      pdf.setFontSize(7.2)
      pdf.setTextColor(92, 105, 114)
      pdf.text(`Source: Rundeck  ·  Run #${latest?.execution_id || '—'}  ·  ${APP_DISPLAY_VERSION}`, margin, H - 7)

      const host = shortHost(incidentSummary?.affected_server || selectedJob?.host || 'SAP') || 'SAP'
      const stamp = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
        .format(new Date()).replaceAll('-', '').replace(', ', '_').replace(':', '')
      const filename = `SPHERE_Performance_${host}_${stamp}_Run${latest?.execution_id || 'NA'}.pdf`
      const blob = pdf.output('blob')
      const url = URL.createObjectURL(blob)
      setPdfPreview((currentPreview) => {
        if (currentPreview?.url) URL.revokeObjectURL(currentPreview.url)
        return { url, blob, filename }
      })
    } catch (failure) {
      setError(failure.message || 'PDF preview failed.')
    } finally {
      setExporting(false)
    }
  }

  const collectionAligned = !latest?.collection_id || !hostSnapshot?.collection_id || hostSnapshot.collection_id === latest.collection_id
  const operationalHosts = collectionAligned ? hosts : []
  const overallHealth = !collectionAligned
    ? 'WARNING'
    : overallOperationalState(operationalHosts, {
        stale: Boolean(health?.rundeck_stale),
        incidentActive: Boolean(incidentSummary?.active),
      })

  const collectionCount = history.length
  const partialCount = history.filter((row) => row.status === 'PARTIAL').length
  const failedCount = history.filter((row) => row.status === 'FAILED').length
  const platformState = platform?.status || 'UNKNOWN'
  const releaseState = platform?.releases?.backend?.status === 'WARNING' || platform?.releases?.web?.status === 'WARNING' ? 'WARNING' : 'NORMAL'
  const appCount = latest?.received_hosts?.length || operationalHosts.length || 0
  const incidentStart = incidentSummary?.signal_active_since || incidentSummary?.detected_since || ''
  const latestCollectionAt = latest?.collection_time_wib || latest?.finished_at || ''
  const primarySignalHint = incidentSummary?.active
    ? ` Primary signal: ${shortSignal(incidentSummary?.primary_signal?.label || 'performance signal')}.`
    : ''
  const statusHint = !collectionAligned
    ? 'Waiting for one complete aligned Rundeck run.'
    : `${statusExplanation(overallHealth, operationalHosts)}${primarySignalHint}`

  const currentWorkload = <RundeckCurrentWorkload
    collectionId={latest?.collection_id || ''}
    selectedJob={selectedJob}
    onSelectJob={selectJob}
  />

  return <section ref={panelRef} className="rundeckPanel" aria-label="SAP performance monitoring" aria-live="polite">
    <header className="rundeckLandscapeHeader">
      <div className="rundeckTitleBlock">
        <h2><SphereIcon name="activity" /> SAP Performance Summary</h2>
        <div key={latest?.collection_id || 'waiting'} className="rundeckLandscapeMeta is-fresh" aria-label="SAP performance data status">
          <span>{formatTime(latestCollectionAt, true)} WIB</span>
          <span>{appCount || '—'} APP</span>
          <span>Run #{latest?.execution_id || '—'}</span>
        </div>
      </div>
      <div className="rundeckActions">
        <StatusPill value={overallHealth} title={statusHint} />
        <div className="rundeckModeSwitch" role="group" aria-label="Data source">
          <button type="button" className="is-active" aria-pressed="true" title="Automatic Rundeck source"><SphereIcon name="refresh" /> Rundeck</button>
          <button type="button" onClick={() => switchParentSource('manual')} title="Manual Upload Logs"><SphereIcon name="upload" /> Manual</button>
        </div>
        <button type="button" className="rundeckPdfButton" disabled={exporting} onClick={exportPdf} title="Preview one-page performance report"><SphereIcon name="pdf" /> {exporting ? 'Generating…' : 'PDF Preview'}</button>
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
        <h3><SphereIcon name="server" /> SAP App Servers</h3>
      </div>
      <div className="rundeckServerTableWrap">
        <table className="rundeckServerTable">
          <thead><tr><th>APP</th><th>OS Resource</th><th>SAP Workload</th><th>CPU</th><th>Memory</th><th>I/O Wait</th><th>Critical WP</th></tr></thead>
          <tbody>
            {operationalHosts.map((host) => {
              const wpCount = Number(host.wp_critical || 0)
              const workloadState = sapWorkloadState(host)
              return <tr key={host.host} className={wpDrilldown?.host === host.host ? 'is-selected' : ''}>
                <td><strong title={host.host}>{shortHost(host.host)}</strong></td>
                <td><StatusPill value={hostResourceState(host)} /></td>
                <td><StatusPill value={workloadState} /></td>
                <td>{metric(host.cpu_pct, '%')}</td>
                <td>{metric(host.ram_pct, '%')}</td>
                <td>{metric(host.io_wait_pct, '%')}</td>
                <td className={wpCount > 0 ? `is-${workloadState.toLowerCase()}` : ''}>
                  {wpCount > 0
                    ? <button type="button" className="rundeckWpButton" onClick={() => toggleCriticalWp(host)} aria-expanded={wpDrilldown?.host === host.host} title={`${wpCount} Critical WP reported on ${shortHost(host.host)}. Click to inspect workload context.`}><SphereIcon name="alert" /> {wpCount}</button>
                    : '0'}
                </td>
              </tr>
            })}
          </tbody>
        </table>
      </div>

      {wpDrilldown && <section className="rundeckWpDrilldown" aria-live="polite">
        <div className="rundeckWpDrilldownHead">
          <h4><SphereIcon name="alert" /> {shortHost(wpDrilldown.host)} · {wpDrilldown.count} Critical WP</h4>
          <button type="button" onClick={() => setWpDrilldown(null)}>Close</button>
        </div>
        <p>Direct WP mapping is not available from the current collector. Workloads on {shortHost(wpDrilldown.host)} are shown for Basis review.</p>
        {wpDrilldown.loading && <div className="rundeckWpDrilldownState">Loading workload…</div>}
        {wpDrilldown.error && <div className="rundeckWpDrilldownState is-error">{wpDrilldown.error}</div>}
        {!wpDrilldown.loading && !wpDrilldown.error && <div className="rundeckWpDrilldownTableWrap">
          <table>
            <thead><tr><th>Workload</th><th>Type</th><th>WP</th><th>PID</th><th>User</th><th title={CPU_HINT}>CPU Usage</th><th>PSS Memory</th></tr></thead>
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
                  <td title={CPU_HINT}>{metric(row.cpu_pct, '%')}</td>
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
      onTrendContext={setTrendContext}
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
        <summary title="Health of SPHERE platform services and storage; separate from SAP performance status."><SphereIcon name="database" /> SPHERE Platform Health <StatusPill value={platformState} /></summary>
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

    {pdfPreview && <div className="rundeckPdfPreviewBackdrop" role="dialog" aria-modal="true" aria-label="PDF preview">
      <section className="rundeckPdfPreview">
        <header>
          <div><span>Report Preview</span><strong>{pdfPreview.filename}</strong></div>
          <button type="button" onClick={closePdfPreview} aria-label="Close PDF preview">Close</button>
        </header>
        <iframe src={pdfPreview.url} title="SPHERE PDF preview" />
        <footer>
          <a href={pdfPreview.url} target="_blank" rel="noreferrer">Open in New Tab</a>
          <a className="is-primary" href={pdfPreview.url} download={pdfPreview.filename}>Download PDF</a>
        </footer>
      </section>
    </div>}
  </section>
}
