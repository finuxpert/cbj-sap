import React from 'react'
import './IncidentLifecycleInsights.css'

const hasValue = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
const fmt = (value, digits = 1, unit = '') => hasValue(value) ? `${Number(value).toLocaleString('en-US', { maximumFractionDigits: digits })}${unit}` : '—'
const delta = (value, digits = 1, unit = '') => hasValue(value) ? `${Number(value) > 0 ? '+' : ''}${fmt(value, digits, unit)}` : '—'

function windowText(window = {}) {
  if (!window.count) return 'No contiguous evidence'
  if (window.start === window.end) return `${window.start} · ${window.count} sample`
  return `${window.start} → ${window.end} · ${window.count} samples`
}

function recoveryClass(tone = '') {
  if (tone === 'good') return 'good'
  if (tone === 'warn') return 'warn'
  return 'neutral'
}

export default function IncidentLifecycleInsights({ analytics, workloadAnalytics, hostLabel = '' }) {
  if (!analytics?.windows?.incident?.count) return null
  const metrics = analytics.metrics || []
  const recovery = analytics.recovery || { label: 'Unknown', tone: 'neutral', detail: 'Recovery could not be evaluated.' }
  const hostCorrelation = analytics.peakCorrelation || null
  const landscapeCorrelation = workloadAnalytics?.peakCorrelation || hostCorrelation
  const workloadCandidates = landscapeCorrelation?.workloadCandidates || []
  const topCandidates = workloadCandidates.slice(0, 3)

  return <section className="rca26Panel rca26LifecyclePanel rca26Deferred">
    <div className="rca26PanelHead">
      <div><h2>Before → Incident → After{hostLabel ? <span className="rca26IncidentScope">{hostLabel}</span> : null}</h2><p>Contiguous evidence only. Large collection gaps are never treated as baseline or recovery proof.</p></div>
      <span className={`rca26LifecycleRecovery ${recoveryClass(recovery.tone)}`}>{recovery.label}</span>
    </div>

    <div className="rca26LifecycleWindows">
      <div className={analytics.windows.before.count ? '' : 'missing'}><span>Before</span><b>{windowText(analytics.windows.before)}</b><small>{analytics.baselineNote || 'Contiguous pre-incident baseline.'}</small></div>
      <div className="incident"><span>Incident</span><b>{windowText(analytics.windows.incident)}</b><small>Selected incident episode.</small></div>
      <div className={analytics.windows.after.count ? 'after' : 'missing'}><span>After</span><b>{windowText(analytics.windows.after)}</b><small>{recovery.detail}</small></div>
      <div className={`recovery ${recoveryClass(recovery.tone)}`}><span>Recovery</span><b>{recovery.label}</b><small>{recovery.normalizedMetrics || 0}/{recovery.totalMetrics || metrics.length} resource metrics below warning median{recovery.time ? ` · from ${recovery.time}` : ''}</small></div>
    </div>

    <div className="rca26LifecycleTableWrap">
      <table className="rca26LifecycleTable">
        <thead><tr><th>Metric</th><th>Before median</th><th>Incident median</th><th>Incident peak</th><th>After median</th><th>Incident Δ</th><th>Recovery Δ</th></tr></thead>
        <tbody>{metrics.map((metric) => <tr key={metric.key}>
          <td><b>{metric.label}</b><span className={`rca26Status ${String(metric.threshold || 'NORMAL').toLowerCase()}`}>{metric.threshold || 'NORMAL'}</span></td>
          <td>{analytics.windows.before.count ? fmt(metric.before?.median, metric.digits, metric.unit) : 'No baseline'}</td>
          <td>{fmt(metric.during?.median, metric.digits, metric.unit)}</td>
          <td>{fmt(metric.during?.max, metric.digits, metric.unit)}</td>
          <td>{analytics.windows.after.count ? fmt(metric.after?.median, metric.digits, metric.unit) : 'No post data'}</td>
          <td>{delta(metric.deltaMedian, metric.digits, metric.changeUnit)}</td>
          <td className={hasValue(metric.recoveryDeltaMedian) && Number(metric.recoveryDeltaMedian) < 0 ? 'improving' : ''}>{delta(metric.recoveryDeltaMedian, metric.digits, metric.changeUnit)}</td>
        </tr>)}</tbody>
      </table>
    </div>

    <div className="rca26CorrelationBlock">
      <div className="rca26CorrelationSummary">
        <span>Peak Correlation</span>
        <b>{hostCorrelation?.time || '—'}</b>
        <small>{hostCorrelation ? `Pressure ${fmt(hostCorrelation.pressureScore, 0, '/100')} · ${hostCorrelation.alignedCount}/${hostCorrelation.totalMetrics} metric peaks within ±${hostCorrelation.alignmentMinutes} min` : 'No host peak correlation available.'}</small>
        {hostCorrelation?.alignedMetrics?.length ? <div className="rca26CorrelationBadges">{hostCorrelation.alignedMetrics.map((item) => <em key={item.key}>{item.label} {fmt(item.value, item.key === 'loadRatio' ? 2 : item.key === 'swapIn' || item.key === 'wpCritical' ? 0 : 1, item.unit)}</em>)}</div> : null}
      </div>
      <div className="rca26PeakWorkloads">
        <div className="rca26PeakWorkloadsHead"><span>Workloads at host peak</span><small>{landscapeCorrelation?.workloadSampleTime ? `process sample ${landscapeCorrelation.workloadSampleTime}` : 'No aligned process sample'}</small></div>
        {topCandidates.length ? topCandidates.map((item, index) => <div className="rca26PeakWorkload" key={item.key}><strong>{index + 1}</strong><div><b>{item.name}</b><small>{item.host} · {item.pidCount} PID · {item.processCount} process</small></div><span>CPU {fmt(item.cpu, 1, '%')}<br />RSS {fmt(item.rssGb, 2, ' GB')}</span><em className={item.dState || item.errors?.length ? 'warn' : ''}>D {item.dState} · Err {item.errors?.length || 0}</em></div>) : <div className="rca26LifecycleEmpty">No SAP process sample aligned with the host peak.</div>}
      </div>
    </div>
  </section>
}
