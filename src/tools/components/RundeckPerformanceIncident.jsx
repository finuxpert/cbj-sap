import React from 'react'
import { shortHost } from './sapUiFormat.js'
import './RundeckPerformanceIncident.css'

const API = `${import.meta.env.BASE_URL}api`

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

function CurrentJobFacts({ workload }) {
  const details = workload?.details || {}
  const program = details.program || (workload?.consumer_type === 'PROGRAM' ? workload.consumer_key : '—')
  const workProcess = [details.wp_type, details.wp].filter(Boolean).join(' ') || '—'

  return <dl className="rundeckIncidentFacts">
    <div><dt>ABAP Program</dt><dd>{program}</dd></div>
    <div><dt>Work Process</dt><dd>{workProcess}</dd></div>
    <div><dt>SAP User</dt><dd>{details.user || '—'}</dd></div>
    <div><dt>PID</dt><dd>{details.pid || '—'}</dd></div>
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
        const response = await fetch(`${API}/analysis/performance`, {
          cache: 'no-store',
          signal: controller.signal,
        })
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
      <div className="rundeckIncidentHeader">
        <h3>RCA data unavailable</h3>
        {showStatus && <StatusPill value="UNKNOWN" />}
      </div>
      <p className="rundeckIncidentAssessment">Last good SAP data remains available below.</p>
    </section>
  }

  if (!summary.active) {
    const waiting = summary.status === 'WAITING'
    return <section className="rundeckIncident" aria-label="SAP performance status">
      <div className="rundeckIncidentHeader">
        <h3>{waiting ? 'Waiting for SAP performance data' : 'No active SAP performance issue'}</h3>
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
  const resourceState = summary.host_resource_pressure ? 'WARNING' : 'NORMAL'
  const rcaText = summary.host_resource_pressure
    ? `OS resource pressure detected on ${shortHost(summary.affected_server)}. Review host metrics and SAP workload.`
    : `OS resources are normal. Review Critical WP and SAP workload on ${shortHost(summary.affected_server)}.`

  return <section className="rundeckIncident" aria-label="SAP performance issue">
    <div className="rundeckIncidentHeader">
      <h3>{shortHost(summary.affected_server)} · {signal.label || 'Performance signal'} {signalValue}</h3>
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
            onClick={() => onSelectJob?.(currentContext)}
          >{current.consumer_key}</button> : <strong>No current workload found</strong>}
          {current && <small>Run #{summary.execution_id || '—'} · CPU {metric(current.cpu_pct, '%')}</small>}
        </div>
        {current && <CurrentJobFacts workload={current} />}
      </section>

      <section className="rundeckIncidentWorkloadBlock is-persistent">
        <div className="rundeckIncidentWorkloadLead">
          <span>Recurring Workload</span>
          {persistentContext ? <button
            type="button"
            className={`rundeckIncidentJobButton ${selectedJob?.key === persistentContext.key && selectedJob?.host === persistentContext.host ? 'is-selected' : ''}`}
            onClick={() => onSelectJob?.(persistentContext)}
          >{persistent.consumer_key}</button> : <strong>No recurring workload found</strong>}
          {persistent && <small>
            {sameWorkload ? 'Also current · ' : ''}Seen in {persistent.occurrences} of {persistent.affected_samples} checks
          </small>}
        </div>
        {persistent && <dl className="rundeckIncidentFacts is-compact">
          <div><dt>Avg CPU</dt><dd>{metric(persistent.avg_cpu_pct, '%')}</dd></div>
          <div><dt>Peak CPU</dt><dd>{metric(persistent.peak_cpu_pct, '%')}</dd></div>
        </dl>}
      </section>
    </div>

    <div className="rundeckIncidentHostContext">
      <span><b>OS Resources</b><StatusPill value={resourceState} /></span>
      <span><b>CPU</b>{metric(hostMetrics.cpu_pct, '%')}</span>
      <span><b>RAM</b>{metric(hostMetrics.ram_pct, '%')}</span>
      <span><b>IO Wait</b>{metric(hostMetrics.io_wait_pct, '%')}</span>
    </div>

    <p className="rundeckIncidentAssessment"><b>RCA:</b> {rcaText}</p>
  </section>
}
