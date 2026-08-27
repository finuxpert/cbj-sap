import React from 'react'
import './IncidentLifecycleInsights.css'

const hasValue = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
const fmt = (value, digits = 1, unit = '') => hasValue(value) ? `${Number(value).toLocaleString('en-US', { maximumFractionDigits: digits })}${unit}` : '—'
const delta = (value, digits = 1, unit = '') => hasValue(value) ? `${Number(value) > 0 ? '+' : ''}${fmt(value, digits, unit)}` : '—'

const MATERIALITY = {
  cpuPct: 5,
  memoryPct: 5,
  loadRatio: 0.1,
  swapIn: 100,
  wpCritical: 1,
}

const TRIGGER_LIMITS = {
  cpuPct: { warn: 75, crit: 90 },
  memoryPct: { warn: 75, crit: 85 },
  loadRatio: { warn: 1, crit: 1.5 },
  swapIn: { warn: 100, crit: 1000 },
  wpCritical: { warn: 1, crit: 3 },
}

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

function deviationInfo(metric = {}) {
  if (!metric.before?.count) return { label: 'NO BASELINE', tone: 'stable' }
  const threshold = String(metric.threshold || 'NORMAL').toUpperCase()
  const peakDelta = hasValue(metric.deltaPeak) ? Math.abs(Number(metric.deltaPeak)) : 0
  const material = threshold !== 'NORMAL' || peakDelta >= (MATERIALITY[metric.key] ?? 0)
  if (!material) return { label: 'STABLE', tone: 'stable' }
  if (metric.anomaly === 'HIGH') return { label: 'STRONG', tone: 'strong' }
  if (metric.anomaly === 'ELEVATED') return { label: 'MODERATE', tone: 'moderate' }
  if (threshold === 'CRIT') return { label: 'STRONG', tone: 'strong' }
  if (threshold === 'WARN') return { label: 'MODERATE', tone: 'moderate' }
  return { label: 'STABLE', tone: 'stable' }
}

function triggerPeak(correlation = {}) {
  const rows = correlation?.metricPeaks || []
  const ranked = rows.filter((item) => item.threshold === 'WARN' || item.threshold === 'CRIT').map((item) => {
    const limits = TRIGGER_LIMITS[item.key] || { warn: 1, crit: 1 }
    const base = item.threshold === 'CRIT' ? limits.crit : limits.warn
    const severityWeight = item.threshold === 'CRIT' ? 200 : 100
    return { ...item, rank: severityWeight + (hasValue(item.value) && base ? Number(item.value) / base : 0) }
  }).sort((a, b) => b.rank - a.rank || String(a.time || '').localeCompare(String(b.time || '')))
  return ranked[0] || null
}

export default function IncidentLifecycleInsights({ analytics, workloadAnalytics, hostLabel = '' }) {
  if (!analytics?.windows?.incident?.count) return null
  const metrics = analytics.metrics || []
  const recovery = analytics.recovery || { label: 'Unknown', tone: 'neutral', detail: 'Recovery could not be evaluated.' }
  const hostCorrelation = analytics.peakCorrelation || null
  const landscapeCorrelation = workloadAnalytics?.peakCorrelation || hostCorrelation
  const workloadCandidates = landscapeCorrelation?.workloadCandidates || []
  const topCandidates = workloadCandidates.slice(0, 3)
  const trigger = triggerPeak(hostCorrelation)

  return <section className="rca26Panel rca26LifecyclePanel rca26Deferred">
    <div className="rca26PanelHead">
      <div><h2>Before → Incident → After{hostLabel ? <span className="rca26IncidentScope">{hostLabel}</span> : null}</h2><p>Contiguous evidence only. Large collection gaps are never treated as baseline or recovery proof.</p></div>
      <span className={`rca26LifecycleRecovery ${recoveryClass(recovery.tone)}`}>Host recovery {recovery.label}</span>
    </div>

    <div className="rca26LifecycleWindows">
      <div className={analytics.windows.before.count ? '' : 'missing'}><span>Before</span><b>{windowText(analytics.windows.before)}</b><small>{analytics.baselineNote || 'Contiguous pre-incident baseline.'}</small></div>
      <div className="incident"><span>Incident</span><b>{windowText(analytics.windows.incident)}</b><small>Selected incident window.</small></div>
      <div className={analytics.windows.after.count ? 'after' : 'missing'}><span>After</span><b>{windowText(analytics.windows.after)}</b><small>{recovery.detail}</small></div>
      <div className={`recovery ${recoveryClass(recovery.tone)}`}><span>Selected host recovery</span><b>{recovery.label}</b><small>{recovery.normalizedMetrics || 0}/{recovery.totalMetrics || metrics.length} resource metrics below warning median{recovery.time ? ` · from ${recovery.time}` : ''}. Landscape recovery is not evaluated here.</small></div>
    </div>

    <div className="rca26LifecycleTableWrap">
      <table className="rca26LifecycleTable">
        <thead><tr><th>Metric</th><th>Before median</th><th>Incident median</th><th>Incident peak</th><th>After median</th><th>Incident Δ</th><th>Recovery Δ</th><th>Baseline deviation</th></tr></thead>
        <tbody>{metrics.map((metric) => { const deviation = deviationInfo(metric); return <tr key={metric.key}>
          <td><b>{metric.label}</b><span className={`rca26Status ${String(metric.threshold || 'NORMAL').toLowerCase()}`}>{metric.threshold || 'NORMAL'}</span></td>
          <td>{analytics.windows.before.count ? fmt(metric.before?.median, metric.digits, metric.unit) : 'No baseline'}</td>
          <td>{fmt(metric.during?.median, metric.digits, metric.unit)}</td>
          <td>{fmt(metric.during?.max, metric.digits, metric.unit)}</td>
          <td>{analytics.windows.after.count ? fmt(metric.after?.median, metric.digits, metric.unit) : 'No post data'}</td>
          <td>{delta(metric.deltaMedian, metric.digits, metric.changeUnit)}</td>
          <td className={hasValue(metric.recoveryDeltaMedian) && Number(metric.recoveryDeltaMedian) < 0 ? 'improving' : ''}>{delta(metric.recoveryDeltaMedian, metric.digits, metric.changeUnit)}</td>
          <td><span className={`rca26Deviation ${deviation.tone}`} title={`Materiality gate applied before statistical deviation. Peak delta from baseline p95: ${delta(metric.deltaPeak, metric.digits, metric.changeUnit)}`}>{deviation.label}</span></td>
        </tr> })}</tbody>
      </table>
    </div>

    <div className="rca26CorrelationBlock">
      <div className="rca26CorrelationSummary">
        <span>Incident trigger peak</span>
        <b>{trigger?.time || '—'}</b>
        <small>{trigger ? `${trigger.label} ${fmt(trigger.value, trigger.key === 'loadRatio' ? 2 : trigger.key === 'swapIn' || trigger.key === 'wpCritical' ? 0 : 1, trigger.unit)} · ${trigger.threshold}` : 'No WARN or CRIT threshold trigger found.'}</small>
        <span className="rca26CorrelationSubhead">Resource pressure peak</span>
        <b>{hostCorrelation?.time || '—'}</b>
        <small>{hostCorrelation ? `Pressure ${fmt(hostCorrelation.pressureScore, 0, '/100')} · ${hostCorrelation.alignedCount}/${hostCorrelation.totalMetrics} metric peaks within ±${hostCorrelation.alignmentMinutes} min` : 'No host pressure correlation available.'}</small>
        {hostCorrelation?.alignedMetrics?.length ? <div className="rca26CorrelationBadges">{hostCorrelation.alignedMetrics.map((item) => <em key={item.key}>{item.label} {fmt(item.value, item.key === 'loadRatio' ? 2 : item.key === 'swapIn' || item.key === 'wpCritical' ? 0 : 1, item.unit)}</em>)}</div> : null}
      </div>
      <div className="rca26PeakWorkloads">
        <div className="rca26PeakWorkloadsHead"><span>Landscape workloads at pressure peak</span><small>{landscapeCorrelation?.workloadSampleTime ? `Selected-host pressure peak · process sample ${landscapeCorrelation.workloadSampleTime}` : 'No aligned process sample'}</small></div>
        {topCandidates.length ? topCandidates.map((item, index) => <div className="rca26PeakWorkload" key={item.key}><strong>{index + 1}</strong><div><b>{item.name}</b><small>{item.host} · {item.pidCount} PID · {item.processCount} process</small></div><span>CPU {fmt(item.cpu, 1, '%')}<br />RSS {fmt(item.rssGb, 2, ' GB')}</span><em className={item.dState || item.errors?.length ? 'warn' : ''}>D {item.dState} · Err {item.errors?.length || 0}</em></div>) : <div className="rca26LifecycleEmpty">No SAP process sample aligned with the selected-host pressure peak.</div>}
      </div>
    </div>
  </section>
}
