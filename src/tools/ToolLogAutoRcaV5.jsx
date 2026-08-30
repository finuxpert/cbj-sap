import React from 'react'
import { expandZipAwareFiles, fileExt } from './evidence-utils.js'
import { buildLogAnalysis, parseLogText, telemetryCapabilitiesV13 } from './logAnalysisV14.js'
import { buildAutoPeakRcaV3 } from './logRcaEngineV3.js'
import { rankResourceConsumersV5 } from './workloadAnalyticsV5.js'
import VirtualResourceTableV14 from './components/VirtualResourceTableV14.jsx'
import { LandscapeResourceEChartV14, WorkloadTrendEChart, LOG_V14_METRICS } from './components/LogLandscapeEChartV14.jsx'
import './LogAutoRcaV2.css'
import './LogAutoRcaV141.css'

const hasMetric = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
const fmt = (value, digits = 0) => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: digits })
const metricText = (value, digits = 0, suffix = '') => hasMetric(value) ? `${fmt(value, digits)}${suffix}` : '—'
const signed = (value, digits = 1, suffix = '') => hasMetric(value) ? `${Number(value) > 0 ? '+' : ''}${fmt(value, digits)}${suffix}` : '—'
const shortTime = (value = '') => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}:\d{2})/)
  return match ? `${match[2]}-${match[3]} ${match[4]}` : value || '—'
}
const humanize = (value = '') => String(value || '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase())
const robustZText = (value) => {
  if (!hasMetric(value)) return '—'
  const n = Number(value)
  if (n >= 8) return '≥8'
  if (n <= -8) return '≤-8'
  return fmt(n, 1)
}

function patternPresentation(verdict, capabilities) {
  const raw = verdict?.pattern || 'RESOURCE_CONTENTION'
  const mode = capabilities?.mode || verdict?.telemetryMode || 'LEGACY'
  if (mode === 'LEGACY') {
    const legacyLabels = {
      MEMORY_BLOCKING_CONTENTION: 'Memory Pressure + Blocking Signals',
      MEMORY_IO_CONTENTION: 'Memory + I/O Pressure Signals',
      NFS_IO_CONTENTION: 'NFS / I/O Blocking Signals',
      BLOCK_IO_CONTENTION: 'Block I/O Pressure Signals',
      IO_STALL_CONTENTION: 'I/O Stall Signals',
      MEMORY_RECLAIM_STALL: 'Memory Reclaim Signals',
      CPU_SATURATION: 'CPU Saturation Signals',
      MEMORY_PRESSURE: 'Memory Pressure',
      CPU_PRESSURE: 'CPU Pressure',
    }
    return { label: legacyLabels[raw] || humanize(raw), qualifier: 'Indicative · legacy telemetry' }
  }
  if (mode === 'PARTIAL') return { label: humanize(raw), qualifier: 'Supported · partial telemetry' }
  return { label: humanize(raw), qualifier: 'Enhanced telemetry' }
}

function workerParse(files) {
  return new Promise((resolve, reject) => {
    if (typeof Worker === 'undefined') return reject(new Error('Worker unavailable'))
    const worker = new Worker(new URL('./workers/logParserV14.worker.js', import.meta.url), { type: 'module' })
    worker.onmessage = (event) => { worker.terminate(); event.data?.ok ? resolve(event.data.analysis) : reject(new Error(event.data?.error || 'Worker parse failed')) }
    worker.onerror = (event) => { worker.terminate(); reject(new Error(event.message || 'Worker parse failed')) }
    worker.postMessage({ files })
  })
}

function Status({ value = 'NORMAL' }) {
  return <span className={`logV2Status ${String(value || '').toLowerCase()}`}>{value}</span>
}

function DecisionBadge({ confirmed = false }) {
  return <span className={`logV141Decision ${confirmed ? 'confirmed' : 'unconfirmed'}`}>{confirmed ? 'CONFIRMED' : 'UNCONFIRMED'}</span>
}

function Stat({ label, value, meta, tone = '' }) {
  return <article className={`logV2Stat ${tone}`}><span>{label}</span><strong>{value}</strong><small>{meta}</small></article>
}

function collectionSkew(collection) {
  if (!collection?.rows?.length) return 0
  const stamps = collection.rows.map((row) => Date.parse(String(row.timeLabel || row.snapshot || '').replace(' ', 'T'))).filter(Number.isFinite)
  return stamps.length > 1 ? Math.round((Math.max(...stamps) - Math.min(...stamps)) / 60000) : 0
}

function hostPeakAttributionValid(item = {}) {
  if (!item.host) return false
  if (item.resourcePeak?.host && item.resourcePeak.host !== item.host) return false
  if (item.operationalPeak?.host && item.operationalPeak.host !== item.host) return false
  if ((item.samples || []).some((row) => row.host && row.host !== item.host)) return false
  const metricRows = Object.values(item.metrics || {}).map((entry) => entry?.row).filter(Boolean)
  return !metricRows.some((row) => row.host && row.host !== item.host)
}

function IncidentSummary({ verdict, capabilities }) {
  if (!verdict) return null
  const single = verdict.status === 'SINGLE_CULPRIT_SUPPORTED'
  const landscape = verdict.landscapeConfidence || {}
  const pattern = patternPresentation(verdict, capabilities)
  return <section className="logV2Panel logV141Summary">
    <div className="logV141SummaryTop">
      <div><span className="logV141Kicker">INCIDENT SUMMARY</span><h2>{single ? 'Dominant workload confirmed' : 'No dominant workload'}</h2></div>
      <DecisionBadge confirmed={single} />
    </div>
    <div className="logV141SummaryGrid">
      <div><span>Host / time</span><strong>{verdict.anchorHost || '—'}</strong><small>{shortTime(verdict.anchorTime)}</small></div>
      <div><span>Pattern</span><strong>{pattern.label}</strong><small>{pattern.qualifier}</small></div>
      <div><span>Top candidate</span><strong>{verdict.topWorkload || '—'}</strong><small>{verdict.topHost || '—'} · priority {verdict.topCausalScore ?? 0} · victim {verdict.topVictimScore ?? 0}</small></div>
      <div><span>Data quality</span><strong>{verdict.topLocalConfidence || 'LOW'}</strong><small>local workload evidence</small></div>
      <div><span>Cross-host</span><strong>{landscape.grade || 'LOW'} {hasMetric(landscape.score) ? `${landscape.score}/100` : ''}</strong><small>{landscape.skewMinutes ?? 0}m skew · exact {landscape.exactHosts ?? 0}/{landscape.hostCount ?? 0}</small></div>
      <div><span>Telemetry</span><strong>{capabilities?.mode || verdict.telemetryMode || 'LEGACY'}</strong><small>{capabilities?.coveragePct ?? 0}% enhanced coverage</small></div>
    </div>
  </section>
}

function SnapshotStrip({ collection, incidentKey, capabilities }) {
  if (!collection) return null
  const range = collection.endTime && collection.endTime !== collection.timeLabel ? `${shortTime(collection.timeLabel)} → ${shortTime(collection.endTime)}` : shortTime(collection.timeLabel)
  const incident = collection.key === incidentKey
  const skew = collectionSkew(collection)
  return <section className="logV2Panel logV2SnapshotPanel">
    <div className="logV2PanelHead"><div><h2>{incident ? 'Incident Collection' : 'Selected Collection'} · {range}</h2><p>Cross-host skew {skew}m · telemetry {capabilities?.mode || 'LEGACY'}</p></div><Status value={collection.resourceSeverity || collection.severity} /></div>
    <div className="logV2SnapshotGrid">{collection.rows.map((row) => <article key={row.host}><div className="logV141HostHead"><b>{row.host}</b><div className="logV141HostStates"><span>RESOURCE</span><Status value={row.resourceSeverity} /><span>OPS</span><Status value={row.severity} /></div></div><small>{shortTime(row.timeLabel || row.snapshot)}</small><dl>
      <div><dt>CPU</dt><dd>{metricText(row.cpuPct, 1, '%')}</dd></div><div><dt>RAM</dt><dd>{metricText(row.memoryPct, 1, '%')}</dd></div>
      <div><dt>Load1/vCPU</dt><dd>{metricText(row.resourceLoadRatio, 2)}</dd></div><div><dt>Swap In</dt><dd>{metricText(row.swapIn, 0, ' p/s')}</dd></div>
      <div><dt>CPU iowait</dt><dd>{metricText(row.iowaitPct, 1, '%')}</dd></div><div><dt>PSI Mem Full10</dt><dd>{metricText(row.psiMemoryFull10, 1, '%')}</dd></div>
      <div><dt>PSI IO Full10</dt><dd>{metricText(row.psiIoFull10, 1, '%')}</dd></div><div><dt>WP Critical</dt><dd>{metricText(row.wpCritical)}</dd></div>
      <div><dt>Pressure</dt><dd>{row.resourcePressure}/100</dd></div>
    </dl></article>)}</div>
  </section>
}

function HostPeakSummary({ rca, selectedHost, onSelectHost }) {
  if (!rca?.hostPeaks?.length) return null
  return <section className="logV2Panel">
    <div className="logV2PanelHead"><div><h2>Application Server Peaks</h2></div></div>
    <div className="logV2HostTableWrap"><table className="logV2HostTable"><thead><tr><th>Host</th><th>Operational</th><th>Resource</th><th>Peak</th><th>Time</th><th>Run</th><th>Max CPU</th><th>Max RAM</th><th>Max Load1</th><th>Max Swap</th><th>WP Critical</th></tr></thead><tbody>
      {rca.hostPeaks.map((item) => {
        const attributionOk = hostPeakAttributionValid(item)
        return <tr key={item.host} className={`${selectedHost === item.host ? 'active' : ''} ${attributionOk ? '' : 'attributionError'}`} onClick={() => onSelectHost?.(item.host)}>
          <td><b>{item.host}</b>{!attributionOk && <span className="logV141Integrity">ATTRIB</span>}</td><td><Status value={item.severity} /></td><td><Status value={item.resourceSeverity} /></td><td><b>{attributionOk ? item.peakPressure : '—'}</b>{attributionOk ? '/100' : ''}</td><td>{attributionOk ? shortTime(item.peakTime) : 'mapping error'}</td>
          <td>{item.sustained?.sustainedClass || 'NONE'} · {item.sustained?.sustainedScore || 0}</td><td>{attributionOk ? metricText(item.metrics?.cpu?.value, 1, '%') : '—'}</td><td>{attributionOk ? metricText(item.metrics?.ram?.value, 1, '%') : '—'}</td><td>{attributionOk ? metricText(item.metrics?.load?.value, 2) : '—'}</td><td>{attributionOk ? metricText(item.metrics?.swapIn?.value, 0, ' p/s') : '—'}</td><td>{attributionOk ? metricText(item.metrics?.wpCritical?.value) : '—'}</td>
        </tr>
      })}
    </tbody></table></div>
  </section>
}

function cpuShareText(item) {
  if (item.cpuContributionStatus === 'TEMPORAL_MISMATCH') return 'not synchronized'
  if (item.cpuContributionStatus === 'UNAVAILABLE_TARGET_CPU') return 'CPU unavailable'
  if (item.cpuContributionStatus === 'UNAVAILABLE_HOST_CPU_SCALE') return 'host scale unavailable'
  if (item.cpuContributionStatus === 'INCONSISTENT_SCALE') return 'scale rejected'
  return metricText(item.estimatedCpuSharePct, 1, '%')
}

function WorkloadDetail({ item }) {
  if (!item) return null
  const taxonomy = item.errorTaxonomy || {}
  const timingText = taxonomy.classified?.map((entry) => `${entry.code}: ${entry.timing?.state || 'NONE'}${hasMetric(entry.timing?.deltaMinutes) ? ` (${signed(entry.timing.deltaMinutes, 0, 'm')})` : ''}`).join(' · ') || 'None'
  return <section className="logV2Panel">
    <div className="logV2PanelHead"><div><span className="logV141Kicker">WORKLOAD DETAIL</span><h2>{item.workload}</h2><p>{item.host} · {item.program} · {humanize(item.incidentRole)}</p></div><div className="logV2DetailBadges"><span className="logV2ScoreBadge">Priority {item.causalScore}</span><span className="logV2ScoreBadge">Victim {item.victimScore}</span></div></div>
    <div className="logV2DetailGrid">
      <div className="logV2DetailFacts"><dl>
        <div><dt>Role</dt><dd>{humanize(item.incidentRole)}</dd></div><div><dt>Target</dt><dd>{humanize(item.targetEvidence)} · {signed(item.targetDeltaMinutes, 0, 'm')}</dd></div>
        <div><dt>Data quality</dt><dd>{item.localConfidence?.grade || '—'} · {item.localConfidence?.score ?? '—'}/100</dd></div><div><dt>Cross-host</dt><dd>{item.landscapeConfidence?.grade || '—'} · {item.landscapeConfidence?.score ?? '—'}/100</dd></div>
        <div><dt>Host @ incident</dt><dd>{item.targetHostSeverity || 'UNKNOWN'}</dd></div><div><dt>Host evidence</dt><dd>{item.targetHostEvidenceSeverity || '—'} @ {shortTime(item.targetHostEvidenceTime)}</dd></div>
        <div><dt>CPU @ evidence</dt><dd>{metricText(item.targetCpu, 1, '%')}</dd></div><div><dt>Estimated CPU share</dt><dd>{cpuShareText(item)}</dd></div>
        <div><dt>PSS</dt><dd>{metricText(item.targetPssGb, 2, ' GB')}</dd></div><div><dt>PSS baseline</dt><dd>{metricText(item.pssBaseline?.median, 2, ' GB')} · z {robustZText(item.pssUplift?.z)}</dd></div>
        <div><dt>Private memory</dt><dd>{metricText(item.targetPrivateGb, 2, ' GB')}</dd></div><div><dt>Σ shared mappings</dt><dd>{metricText(item.targetSharedGb, 2, ' GB')} · non-exclusive</dd></div>
        <div><dt>Max PID RSS</dt><dd>{metricText(item.targetMaxPidRss, 2, ' GB')}</dd></div><div><dt>D-state / PIDs</dt><dd>{hasMetric(item.targetDState) ? `${item.targetDState} / ${item.targetConcurrentPids}` : '—'}</dd></div>
        <div><dt>Blocking WCHAN</dt><dd>{humanize(item.wchanClass || 'NONE')} · {item.targetWchan || '—'}{item.wchanScope === 'D_STATE' ? ' · D-state first' : ''}</dd></div><div><dt>Enhanced timing</dt><dd>{humanize(item.enhancedEvidenceQuality || 'UNAVAILABLE')}{hasMetric(item.enhancedEvidenceDeltaMinutes) ? ` · ${item.enhancedEvidenceDeltaMinutes}m` : ''}</dd></div>
        <div><dt>Avg read since previous sample</dt><dd>{metricText(item.targetReadMiBps, 2, ' MiB/s')} {hasMetric(item.targetIoWindowMinutes) ? `· ${fmt(item.targetIoWindowMinutes, 0)}m` : ''}</dd></div><div><dt>Avg write since previous sample</dt><dd>{metricText(item.targetWriteMiBps, 2, ' MiB/s')} {hasMetric(item.targetIoWindowMinutes) ? `· ${fmt(item.targetIoWindowMinutes, 0)}m` : ''}</dd></div>
        <div><dt>Host iowait</dt><dd>{metricText(item.hostIowaitPct, 1, '%')}</dd></div><div><dt>PSI mem / I/O full10</dt><dd>{metricText(item.hostPsiMemoryFull10, 1, '%')} / {metricText(item.hostPsiIoFull10, 1, '%')}</dd></div>
        <div><dt>Error class</dt><dd>{humanize(taxonomy.strongest?.category || 'NONE')}</dd></div><div><dt>Error direction</dt><dd>{humanize(taxonomy.direction || 'CONTEXT')}</dd></div>
        <div className="wide"><dt>Error timing</dt><dd>{timingText}</dd></div>
      </dl></div>
      <WorkloadTrendEChart records={item.samples} targetTime={item.targetTime} targetCollectionKey={item.targetCollectionKey} aggregated />
    </div>
  </section>
}

function AnalyticsDiagnostics({ diagnostics, capabilities, mapping, verdict, rca }) {
  const parity = diagnostics?.parity || {}
  const attributionIssues = (rca?.hostPeaks || []).filter((item) => !hostPeakAttributionValid(item)).map((item) => item.host)
  return <details className="logV2SourceAudit"><summary>Diagnostics</summary><div><table><tbody>
    <tr><th>RCA engine</th><td>{diagnostics?.engineDiagnostics?.rcaEngine || 'RCA v3.6.2'}</td></tr>
    <tr><th>Core aggregator</th><td>{diagnostics?.engineDiagnostics?.coreAggregator || diagnostics?.engineDiagnostics?.activeEngine || '—'}</td></tr>
    <tr><th>DuckDB</th><td>{diagnostics?.engineDiagnostics?.duckDbStatus || '—'} · {diagnostics?.engineReason || diagnostics?.engineDiagnostics?.reason || 'no error'}</td></tr>
    <tr><th>Parity</th><td>{parity.status || 'NOT_RUN'} · compared {parity.compared || 0} · mismatches {parity.mismatchCount || 0}</td></tr>
    <tr><th>Process mapping</th><td>EXACT {mapping?.counts?.EXACT || 0} · ≤2m {mapping?.counts?.NEAREST_2M || 0} · ≤5m {mapping?.counts?.NEAREST_5M || 0} · unmapped {mapping?.counts?.UNMAPPED || 0}</td></tr>
    <tr><th>Host peak attribution</th><td>{attributionIssues.length ? `FAIL · ${attributionIssues.join(', ')}` : 'PASS'}</td></tr>
    <tr><th>Telemetry</th><td>{capabilities?.mode || 'LEGACY'} · coverage {capabilities?.coveragePct || 0}% · host {capabilities?.hostCoveragePct || 0}% · process {capabilities?.processCoveragePct || 0}%</td></tr>
    <tr><th>Verdict rules</th><td>{verdict?.reasons?.join(' · ') || 'none'}</td></tr>
  </tbody></table></div></details>
}

function SourceAudit({ collections = [] }) {
  return <details className="logV2SourceAudit"><summary>Source Audit</summary><div><table><thead><tr><th>#</th><th>Collection</th><th>Host samples</th><th>Source file</th></tr></thead><tbody>{collections.map((item, index) => <tr key={item.key}><td>{index + 1}</td><td>{item.timeLabel}{item.endTime !== item.timeLabel ? ` → ${item.endTime}` : ''}</td><td>{item.rows.map((row) => `${row.host}@${row.timeLabel || row.snapshot}`).join(' · ')}</td><td>{item.fileName}</td></tr>)}</tbody></table></div></details>
}

export default function ToolLogAutoRcaV5() {
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('Upload WP-SCOUT / Daily Check logs.')
  const [analysis, setAnalysis] = React.useState(null)
  const [rca, setRca] = React.useState(null)
  const [metric, setMetric] = React.useState('memoryPct')
  const [selectedCollectionKey, setSelectedCollectionKey] = React.useState('')
  const [selectedHost, setSelectedHost] = React.useState('')
  const [resourceRows, setResourceRows] = React.useState([])
  const [selectedResource, setSelectedResource] = React.useState(null)
  const [resourceEngine, setResourceEngine] = React.useState('WAITING')
  const [verdict, setVerdict] = React.useState(null)
  const [capabilities, setCapabilities] = React.useState({ mode: 'LEGACY', enhanced: false })
  const [diagnostics, setDiagnostics] = React.useState({ parity: { status: 'NOT_RUN' }, crossHostConfidence: { grade: '—', skewMinutes: 0 } })
  const [mapping, setMapping] = React.useState({ mappedRows: 0, unmappedRows: 0, counts: { EXACT: 0, NEAREST_2M: 0, NEAREST_5M: 0, UNMAPPED: 0 } })

  const rankResources = React.useCallback(async (nextAnalysis, nextRca) => {
    setResourceEngine('RANKING')
    const ranked = await rankResourceConsumersV5(nextAnalysis?.processes || [], nextRca, nextAnalysis)
    setResourceRows(ranked.rows); setSelectedResource(ranked.rows[0] || null); setResourceEngine(ranked.engine); setVerdict(ranked.verdict || null)
    setCapabilities(ranked.telemetryCapabilities || telemetryCapabilitiesV13(nextAnalysis))
    setDiagnostics({ parity: ranked.parity || { status: 'NOT_RUN' }, crossHostConfidence: ranked.crossHostConfidence || { grade: '—', skewMinutes: 0 }, landscapeConfidence: ranked.landscapeConfidence, engineReason: ranked.engineReason || '', engineDiagnostics: ranked.engineDiagnostics || {} })
    setMapping({ mappedRows: ranked.mappedRows || 0, unmappedRows: ranked.unmappedRows || 0, counts: ranked.mappingCounts || { EXACT: 0, NEAREST_2M: 0, NEAREST_5M: 0, UNMAPPED: 0 } })
    if (ranked.incidentAnchor?.host) setSelectedHost(ranked.incidentAnchor.host)
    if (ranked.incidentAnchor?.collectionKey) setSelectedCollectionKey(ranked.incidentAnchor.collectionKey)
  }, [])

  const upload = React.useCallback(async (list) => {
    setBusy(true); setStatus('Analyzing logs…')
    try {
      const expanded = (await expandZipAwareFiles(list, ['log', 'txt', 'csv'])).filter((file) => ['log', 'txt', 'csv'].includes(fileExt(file.name)))
      if (!expanded.length) throw new Error('No supported .log, .txt, or .csv files found.')
      const input = []
      for (const file of expanded) input.push({ name: file.name, text: await file.text() })
      let parsedAnalysis
      try { parsedAnalysis = await workerParse(input) } catch { parsedAnalysis = buildLogAnalysis(input.map((item) => parseLogText(item.text, item.name))) }
      const nextRca = buildAutoPeakRcaV3(parsedAnalysis)
      const nextAnalysis = nextRca.validatedAnalysis || parsedAnalysis
      if (!nextRca?.collections?.length) throw new Error('No host telemetry snapshots found in the uploaded logs.')
      const caps = telemetryCapabilitiesV13(nextAnalysis)
      setAnalysis(nextAnalysis); setRca(nextRca); setCapabilities(caps)
      setSelectedCollectionKey(nextRca.resourceLandscapePeak?.key || nextRca.collections[0]?.key || ''); setSelectedHost(nextRca.hostPeaks?.[0]?.host || nextRca.hosts?.[0] || '')
      setResourceRows([]); setSelectedResource(null); setVerdict(null)
      const rejected = (nextRca.quality?.telemetryRejected || 0) + (nextRca.quality?.processRejected || 0)
      setStatus(`${expanded.length} files · ${nextRca.collections.length} collections · ${nextRca.hosts.length} application servers · rejects ${rejected} · telemetry ${caps.mode}`)
      await rankResources(nextAnalysis, nextRca)
    } catch (error) {
      setAnalysis(null); setRca(null); setResourceRows([]); setSelectedResource(null); setResourceEngine('FAILED'); setVerdict(null); setStatus(error?.message || 'LOG analysis failed.')
    } finally { setBusy(false) }
  }, [rankResources])

  const selectedCollection = React.useMemo(() => rca?.collections?.find((item) => item.key === selectedCollectionKey) || rca?.resourceLandscapePeak || null, [rca, selectedCollectionKey])
  const selectedHostPeak = React.useMemo(() => rca?.hostPeaks?.find((item) => item.host === selectedHost) || rca?.hostPeaks?.[0] || null, [rca, selectedHost])
  const ranking = resourceEngine === 'RANKING'
  const visibleMetrics = Object.entries(LOG_V14_METRICS).filter(([, item]) => !item.enhanced || capabilities.mode !== 'LEGACY')
  const incidentAnchorTime = verdict?.anchorTime || rca?.resourceIncidentAnchor?.time || rca?.resourceLandscapePeak?.incidentAnchorTime || rca?.resourceLandscapePeak?.timeLabel
  const incidentAnchorHost = verdict?.anchorHost || rca?.resourceIncidentAnchor?.host || ''
  const pattern = patternPresentation(verdict, capabilities)

  return <section className="logV2Shell"><div className="logV2Inner">
    <header className="logV2Header"><div><span className="logV141Kicker">SAP APP / LINUX RCA</span><h1>LOG Analysis</h1></div><label className="logV2Upload"><input type="file" multiple accept=".zip,.log,.txt,.csv" onChange={(event) => upload(event.target.files)} />{busy ? 'Analyzing…' : 'Upload Logs'}</label></header>
    <div className={`logV2StatusBar ${rca ? 'ready' : ''}`}>{status}</div>

    {!rca ? <div className="logV2EmptyState"><b>Upload evidence</b><p>WP-SCOUT / Daily Check logs. Enhanced Linux telemetry is optional.</p></div> : <>
      <section className="logV2Stats">
        <Stat label="Evidence" value={`${rca.collections.length} collections`} meta={`${rca.evidenceWindow.fileCount} files`} />
        <Stat label="Servers" value={rca.hosts.length} meta={rca.hosts.join(' · ')} />
        <Stat label="Time range" value={`${shortTime(rca.evidenceWindow.start)} → ${shortTime(rca.evidenceWindow.end)}`} meta={`${rca.cadence.nominalMinutes || '—'}m cadence`} />
        <Stat label="Incident" value={`${incidentAnchorHost || '—'} ${shortTime(incidentAnchorTime)}`} meta={`cross-host ${diagnostics.landscapeConfidence?.grade || '—'} · ${diagnostics.landscapeConfidence?.skewMinutes ?? 0}m skew`} tone={(rca.resourceLandscapePeak?.resourceCrit || 0) > 0 ? 'critical' : ''} />
        <Stat label="Verdict" value={ranking ? 'Ranking…' : verdict?.status === 'SINGLE_CULPRIT_SUPPORTED' ? 'DOMINANT WORKLOAD' : 'NO DOMINANT WORKLOAD'} meta={ranking ? 'working' : pattern.label} />
        <Stat label="Telemetry" value={capabilities.mode || 'LEGACY'} meta={`${capabilities.coveragePct || 0}% enhanced coverage`} />
      </section>

      {!ranking && <IncidentSummary verdict={verdict} capabilities={capabilities} />}

      <section className="logV2Panel">
        <div className="logV2PanelHead"><div><h2>APP1–APP5 Timeline</h2></div><div className="logV2MetricTabs">{visibleMetrics.map(([key, item]) => <button key={key} type="button" className={metric === key ? 'active' : ''} onClick={() => setMetric(key)}>{item.label}</button>)}</div></div>
        <LandscapeResourceEChartV14 rca={rca} metric={metric} onSelectCollection={setSelectedCollectionKey} />
      </section>

      <SnapshotStrip collection={selectedCollection} incidentKey={rca.resourceLandscapePeak?.key} capabilities={capabilities} />
      <HostPeakSummary rca={rca} selectedHost={selectedHostPeak?.host} onSelectHost={(hostName) => { setSelectedHost(hostName); const first = resourceRows.find((row) => row.host === hostName); if (first) setSelectedResource(first) }} />

      <section className="logV2Panel">
        <div className="logV2PanelHead"><div><h2>Workload Ranking</h2><p>Sorted by incident priority. Click a row for details.</p></div></div>
        {ranking ? <div className="logV2Empty">Ranking {analysis?.processes?.length || 0} process rows…</div> : <VirtualResourceTableV14 rows={resourceRows} selectedKey={selectedResource?.key || ''} onSelect={setSelectedResource} />}
      </section>

      {!ranking && <WorkloadDetail item={selectedResource} />}
      <AnalyticsDiagnostics diagnostics={diagnostics} capabilities={capabilities} mapping={mapping} verdict={verdict} rca={rca} />
      <SourceAudit collections={rca.collections} />
    </>}
  </div></section>
}
