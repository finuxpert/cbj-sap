import React from 'react'
import './RundeckPerformanceIncident.css'

const API = `${import.meta.env.BASE_URL}api`

const formatTime = (value, date = false) => {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return String(value)
  return new Intl.DateTimeFormat('id-ID', date
    ? { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }
    : { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }
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

const shortHost = (host = '') => {
  const match = String(host).match(/APP(\d+)/i)
  return match ? `APP${match[1]}` : String(host)
}

function StatusPill({ value = 'UNKNOWN' }) {
  return <span className={`rundeckStatus is-${String(value).toLowerCase()}`}>{value}</span>
}

function WorkloadFacts({ workload, persistent = false }) {
  const details = workload?.details || {}
  const job = details.job_name || (workload?.consumer_type === 'JOB' ? workload.consumer_key : '—')
  const program = details.program || (workload?.consumer_type === 'PROGRAM' ? workload.consumer_key : '—')
  const workProcess = [details.wp_type, details.wp].filter(Boolean).join(' ') || '—'

  return <dl className="rundeckIncidentFacts">
    <div><dt>Background Job</dt><dd>{job}</dd></div>
    <div><dt>ABAP Program</dt><dd>{program}</dd></div>
    <div><dt>Work Process</dt><dd>{workProcess}</dd></div>
    <div><dt>SAP User</dt><dd>{details.user || '—'}</dd></div>
    <div><dt>OS PID</dt><dd>{details.pid || '—'}</dd></div>
    <div>
      <dt>{persistent ? 'Aggregated CPU' : 'Workload CPU'}</dt>
      <dd>{persistent
        ? `${metric(workload?.avg_cpu_pct, '%')} avg · ${metric(workload?.peak_cpu_pct, '%')} peak`
        : metric(workload?.cpu_pct, '%')}</dd>
    </div>
  </dl>
}

export default function RundeckPerformanceIncident({ refreshToken = '' }) {
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
        setSummary(await response.json())
        setError('')
      } catch (failure) {
        if (failure.name === 'AbortError') return
        setError(failure.message || 'Performance analysis unavailable')
      }
    }
    load()
    return () => controller.abort()
  }, [refreshToken])

  if (!summary && !error) return null

  if (error) {
    return <section className="rundeckIncident" aria-label="SAP performance incident">
      <div className="rundeckIncidentHeader">
        <div>
          <span className="rundeckIncidentEyebrow">Performance Assessment</span>
          <h3>Current RCA summary unavailable</h3>
        </div>
        <StatusPill value="UNKNOWN" />
      </div>
      <p className="rundeckIncidentAssessment">Last known collector telemetry remains available below.</p>
    </section>
  }

  if (!summary.active) {
    const waiting = summary.status === 'WAITING'
    return <section className="rundeckIncident" aria-label="SAP performance assessment">
      <div className="rundeckIncidentHeader">
        <div>
          <span className="rundeckIncidentEyebrow">Performance Assessment</span>
          <h3>{waiting ? 'Waiting for normalized performance telemetry' : 'No active performance degradation signal'}</h3>
        </div>
        <StatusPill value={summary.status || 'NORMAL'} />
      </div>
      <div className="rundeckIncidentMeta">
        <span><b>Collection</b>#{summary.execution_id || '—'}</span>
        <span><b>Last Observed</b>{formatTime(summary.last_observed, true)} WIB</span>
      </div>
      <p className="rundeckIncidentAssessment">{summary.assessment}</p>
    </section>
  }

  const signal = summary.primary_signal || {}
  const current = summary.current_workload
  const persistent = summary.persistent_workload || summary.primary_workload
  const hostMetrics = summary.current_host_metrics || {}
  const signalValue = metric(signal.value, signal.unit || '')
  const sameWorkload = current?.consumer_type === persistent?.consumer_type && current?.consumer_key === persistent?.consumer_key

  return <section className="rundeckIncident" aria-label="SAP performance incident">
    <div className="rundeckIncidentHeader">
      <div>
        <span className="rundeckIncidentEyebrow">Performance Incident</span>
        <h3>{shortHost(summary.affected_server)} · {signal.label || 'Performance signal'} {signalValue}</h3>
      </div>
      <StatusPill value={summary.status || 'WARNING'} />
    </div>

    <div className="rundeckIncidentMeta">
      <span><b>Signal Active Since</b>{formatTime(summary.signal_active_since || summary.detected_since, true)} WIB</span>
      <span><b>Last Observed</b>{formatTime(summary.last_observed, true)} WIB</span>
      <span><b>Duration</b>{duration(summary.duration_seconds)}</span>
      <span><b>Affected Server</b>{shortHost(summary.affected_server)}</span>
      <span><b>Evidence</b>{summary.incident_samples || 1} collection{Number(summary.incident_samples) === 1 ? '' : 's'}</span>
    </div>

    <div className="rundeckIncidentComparison">
      <section className="rundeckIncidentWorkloadBlock is-current">
        <div className="rundeckIncidentWorkloadLead">
          <span>Current Top SAP Workload</span>
          <strong>{current?.consumer_key || 'No normalized workload in current collection'}</strong>
          {current && <small>
            Exact Collection Cycle #{summary.execution_id || '—'} · rank #{current.rank || 1} · CPU {metric(current.cpu_pct, '%')}
          </small>}
        </div>
        {current && <WorkloadFacts workload={current} />}
      </section>

      <section className="rundeckIncidentWorkloadBlock is-persistent">
        <div className="rundeckIncidentWorkloadLead">
          <span>Persistent Correlated Workload</span>
          <strong>{persistent?.consumer_key || 'No persistent workload candidate'}</strong>
          {persistent && <small>
            {sameWorkload ? 'Also current top workload · ' : ''}{persistent.occurrences}/{persistent.affected_samples} collections · {metric(persistent.presence_pct, '%')} presence
          </small>}
        </div>
        {persistent && <WorkloadFacts workload={persistent} persistent />}
      </section>
    </div>

    <div className="rundeckIncidentHostContext">
      <span><b>Host CPU</b>{metric(hostMetrics.cpu_pct, '%')}</span>
      <span><b>Memory</b>{metric(hostMetrics.ram_pct, '%')}</span>
      <span><b>Load 1M</b>{metric(hostMetrics.load_1)}</span>
      <span><b>I/O Wait</b>{metric(hostMetrics.io_wait_pct, '%')}</span>
      <span><b>Swap I/O</b>{metric(hostMetrics.swap_pct, ' p/s')}</span>
      <span><b>Resource Pressure</b>{summary.host_resource_pressure ? 'DETECTED' : 'NOT DETECTED'}</span>
    </div>

    <p className="rundeckIncidentResourceAssessment">{summary.resource_assessment || 'CPU / Memory / I/O Wait assessment unavailable.'}</p>
    <p className="rundeckIncidentAssessment">{summary.assessment}</p>
  </section>
}
