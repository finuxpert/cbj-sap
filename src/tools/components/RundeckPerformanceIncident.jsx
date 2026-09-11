import React from 'react'
import { shortHost } from './sapUiFormat.js'
import { hostResourceState, sapWorkloadState } from './rundeckStatusSemantics.js'
import './RundeckPerformanceIncident.css'

const API = `${import.meta.env.BASE_URL}api`
const PROCESS_CPU_HINT = 'Process CPU can exceed 100% when a workload uses more than one CPU core or thread.'

const formatTime = (value, date = false) => {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)
  return new Intl.DateTimeFormat('id-ID', date
    ? { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }
    : { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }
  ).format(parsed)
}

const metric = (value, suffix = '') => (
  value === null || value === undefined || value === ''
    ? '—'
    : `${Number(value).toLocaleString('en-US', { maximumFractionDigits: 1 })}${suffix}`
)

const duration = (seconds) => {
  const value = Number(seconds)
  if (!Number.isFinite(value) || value < 0) return '—'
  if (value < 60) return '<1 min'
  const minutes = Math.floor(value / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

const shortSignal = (label = '') => String(label || 'Performance issue')
  .replace(/Critical Work Process/gi, 'Critical WP')
  .replace(/Work Process/gi, 'WP')

const issueSignalText = (label, value) => {
  const normalized = shortSignal(label)
  if (/^Critical WP\b/i.test(normalized)) return `${value} Critical WP`
  return [normalized, value].filter(Boolean).join(' ')
}

function StatusPill({ value = 'UNKNOWN' }) {
  return <span className={`rundeckStatus is-${String(value).toLowerCase()}`}>{value}</span>
}

function jobContext(workload, host, source) {
  if (!workload?.consumer_key) return null
  return {
    key: workload.consumer_key,
    host: host || workload.host || '',
    consumerType: workload.consumer_type || '',
    source,
  }
}

function scrollToSelectedWorkload() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  let frames = 0
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
  const navigate = () => {
    frames += 1
    if (frames < 3) {
      window.requestAnimationFrame(navigate)
      return
    }
    const target = document.querySelector('.rundeckJobHistory')
    target?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' })
  }
  window.requestAnimationFrame(navigate)
}

function CurrentJobFacts({ workload }) {
  const details = workload?.details || {}
  const program = details.program || (workload?.consumer_type === 'PROGRAM' ? workload.consumer_key : '')
  const workProcess = [details.wp_type, details.wp].filter(Boolean).join(' ')
  const facts = [
    program ? ['Program', program] : null,
    workProcess ? ['WP', workProcess] : null,
    details.pid ? ['PID', details.pid] : null,
    details.user ? ['User', details.user] : null,
  ].filter(Boolean)

  return <dl className="rundeckIncidentFacts">
    {facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
  </dl>
}

export default function RundeckPerformanceIncident({
  refreshToken = '',
  selectedJob = null,
  onSelectJob,
  onDefaultJob,
  onSummary,
  showStatus = true,
}) {
  const [summary, setSummary] = React.useState(null)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      try {
        const response = await fetch(`${API}/analysis/performance`, { cache: 'no-store', signal: controller.signal })
        if (!response.ok) throw new Error(`Performance analysis unavailable (${response.status})`)
        const result = await response.json()
        setSummary(result)
        onSummary?.(result)
        setError('')
      } catch (failure) {
        if (failure.name === 'AbortError') return
        setError(failure.message || 'Performance analysis unavailable')
      }
    }
    load()
    return () => controller.abort()
  }, [onSummary, refreshToken])

  React.useEffect(() => {
    const current = summary?.current_workload
    if (!summary?.active || !current?.consumer_key) return
    onDefaultJob?.(jobContext(current, summary.affected_server, 'current'))
  }, [onDefaultJob, summary?.active, summary?.affected_server, summary?.collection_id, summary?.current_workload])

  if (!summary && !error) return null

  if (error) {
    return <section className="rundeckIncident" aria-label="SAP performance issue">
      <div className="rundeckIncidentHeader"><h3>Performance data unavailable</h3>{showStatus && <StatusPill value="UNKNOWN" />}</div>
    </section>
  }

  if (!summary.active) {
    const waiting = summary.status === 'WAITING'
    return <section className="rundeckIncident" aria-label="SAP performance status">
      <div className="rundeckIncidentHeader">
        <h3>{waiting ? 'Waiting for performance data' : 'No active performance issue'}</h3>
        {showStatus && <StatusPill value={summary.status || 'NORMAL'} />}
      </div>
    </section>
  }

  const signal = summary.primary_signal || {}
  const current = summary.current_workload
  const persistent = summary.persistent_workload || summary.primary_workload
  const currentContext = jobContext(current, summary.affected_server, 'current')
  const persistentContext = jobContext(persistent, summary.affected_server, 'recurring')
  const hostMetrics = summary.current_host_metrics || {}
  const signalValue = metric(signal.value, signal.unit || '')
  const sameWorkload = current?.consumer_type === persistent?.consumer_type && current?.consumer_key === persistent?.consumer_key
  const resourceState = hostResourceState(hostMetrics)
  const criticalWpSignal = /^Critical WP\b/i.test(shortSignal(signal.label)) ? Number(signal.value || 0) : 0
  const workloadContext = {
    ...hostMetrics,
    wp_critical: hostMetrics.wp_critical ?? criticalWpSignal,
  }
  const derivedWorkloadState = sapWorkloadState(workloadContext)
  const workloadState = derivedWorkloadState === 'NORMAL' && summary.active && resourceState === 'NORMAL'
    ? 'ATTENTION'
    : derivedWorkloadState

  const selectAndInspect = (context) => {
    if (!context) return
    onSelectJob?.(context)
    scrollToSelectedWorkload()
  }

  return <section className="rundeckIncident" aria-label="SAP performance issue">
    <div className="rundeckIncidentHeader">
      <h3>Primary Issue · {shortHost(summary.affected_server)} · {issueSignalText(signal.label, signalValue)}</h3>
      {showStatus && <StatusPill value={summary.status || 'WARNING'} />}
    </div>

    <div className="rundeckIncidentMeta">
      <span><b>Since</b>{formatTime(summary.signal_active_since || summary.detected_since, true)} WIB</span>
      <span><b>Duration</b>{duration(summary.duration_seconds)}</span>
    </div>

    <div className="rundeckIncidentComparison">
      <section className="rundeckIncidentWorkloadBlock is-current">
        <div className="rundeckIncidentWorkloadLead">
          <span>Current Workload</span>
          {currentContext ? <button
            type="button"
            className={`rundeckIncidentJobButton ${selectedJob?.key === currentContext.key && selectedJob?.host === currentContext.host ? 'is-selected' : ''}`}
            onClick={() => selectAndInspect(currentContext)}
            title="Open selected workload detail"
            aria-label={`Open workload detail for ${current.consumer_key}`}
          >{current.consumer_key}</button> : <strong>No current workload found</strong>}
          {current && <small title={PROCESS_CPU_HINT}>Process CPU {metric(current.cpu_pct, '%')} · Run #{summary.execution_id || '—'}</small>}
        </div>
        {current && <CurrentJobFacts workload={current} />}
      </section>

      <section className="rundeckIncidentWorkloadBlock is-persistent">
        <div className="rundeckIncidentWorkloadLead">
          <span>Recurring Workload</span>
          {persistentContext ? <button
            type="button"
            className={`rundeckIncidentJobButton ${selectedJob?.key === persistentContext.key && selectedJob?.host === persistentContext.host ? 'is-selected' : ''}`}
            onClick={() => selectAndInspect(persistentContext)}
            title="Open selected workload detail"
            aria-label={`Open workload detail for ${persistent.consumer_key}`}
          >{persistent.consumer_key}</button> : <strong>No recurring workload found</strong>}
          {persistent && <small>{sameWorkload ? 'Also current · ' : ''}Seen {persistent.occurrences}/{persistent.affected_samples} checks</small>}
        </div>
        {persistent && <dl className="rundeckIncidentFacts is-compact">
          <div><dt title={PROCESS_CPU_HINT}>Avg Process CPU</dt><dd>{metric(persistent.avg_cpu_pct, '%')}</dd></div>
          <div><dt title={PROCESS_CPU_HINT}>Peak Process CPU</dt><dd>{metric(persistent.peak_cpu_pct, '%')}</dd></div>
        </dl>}
      </section>
    </div>

    <div className="rundeckIncidentHostContext">
      <span><b>Host Resource</b><StatusPill value={resourceState} /></span>
      <span><b>SAP Workload</b><StatusPill value={workloadState} /></span>
      <span><b>CPU</b>{metric(hostMetrics.cpu_pct, '%')}</span>
      <span><b>RAM</b>{metric(hostMetrics.ram_pct, '%')}</span>
      <span><b>IO Wait</b>{metric(hostMetrics.io_wait_pct, '%')}</span>
    </div>
  </section>
}
