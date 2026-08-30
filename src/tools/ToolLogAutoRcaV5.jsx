import React from 'react'
import { expandZipAwareFiles, fileExt } from './evidence-utils.js'
import { buildLogAnalysis, parseLogText, telemetryCapabilitiesV13 } from './logAnalysisV14.js'
import { buildAutoPeakRcaV3 } from './logRcaEngineV3.js'
import { rankResourceConsumersV5 } from './workloadAnalyticsV5.js'
import VirtualResourceTableV14 from './components/VirtualResourceTableV14.jsx'
import { LandscapeResourceEChartV14, WorkloadTrendEChart, LOG_V14_METRICS } from './components/LogLandscapeEChartV14.jsx'
import './LogAutoRcaV2.css'

const hasMetric = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
const fmt = (value, digits = 0) => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: digits })
const metricText = (value, digits = 0, suffix = '') => hasMetric(value) ? `${fmt(value, digits)}${suffix}` : '—'
const shortTime = (value = '') => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}:\d{2})/)
  return match ? `${match[2]}-${match[3]} ${match[4]}` : value || '—'
}
const signed = (value, digits = 1, suffix = '') => hasMetric(value) ? `${Number(value) > 0 ? '+' : ''}${fmt(value, digits)}${suffix}` : '—'
const robustZText = (value) => {
  if (!hasMetric(value)) return '—'
  const n = Number(value)
  if (n >= 8) return '≥8'
  if (n <= -8) return '≤-8'
  return fmt(n, 1)
}

function workerParse(files) {
  return new Promise((resolve, reject) => {
    if (typeof Worker === 'undefined') return reject(new Error('Worker unavailable'))
    const worker = new Worker(new URL('./workers/logParserV14.worker.js', import.meta.url), { type: 'module' })
    worker.onmessage = (event) => {
      worker.terminate()
      event.data?.ok ? resolve(event.data.analysis) : reject(new Error(event.data?.error || 'Worker parse failed'))
    }
    worker.onerror = (event) => { worker.terminate(); reject(new Error(event.message || 'Worker parse failed')) }
    worker.postMessage({ files })
  })
}

function Status({ value = 'NORMAL' }) {
  return <span className={`logV2Status ${String(value || '').toLowerCase()}`}>{value}</span>
}

function Stat({ label, value, meta, tone = '' }) {
  return <article className={`logV2Stat ${tone}`}><span>{label}</span><strong>{value}</strong><small>{meta}</small></article>
}

function collectionSkew(collection) {
  if (!collection?.rows?.length) return 0
  const stamps = collection.rows.map((row) => Date.parse(String(row.timeLabel || row.snapshot || '').replace(' ', 'T'))).filter(Number.isFinite)
  return stamps.length > 1 ? Math.round((Math.max(...stamps) - Math.min(...stamps)) / 60000) : 0
}

function SnapshotStrip({ collection, incidentKey, capabilities }) {
  if (!collection) return null
  const range = collection.endTime && collection.endTime !== collection.timeLabel ? `${shortTime(collection.timeLabel)} → ${shortTime(collection.endTime)}` : shortTime(collection.timeLabel)
  const incident = collection.key === incidentKey
  const skew = collectionSkew(collection)
  const skewGrade = skew <= 2 ? 'HIGH' : skew <= 5 ? 'MEDIUM' : 'LOW'
  const enhanced = capabilities?.mode === 'ENHANCED'
  return <section className="logV2Panel logV2SnapshotPanel">
    <div className="logV2PanelHead"><div><h2>Selected Collection · {range}{incident ? ' · RESOURCE INCIDENT COLLECTION' : ''}</h2><p>Host cards retain actual capture time. Landscape synchronization is {skewGrade} with {skew} min skew. Enhanced Linux metrics are {enhanced ? 'available where permitted' : 'not present in this evidence'}.</p></div><Status value={collection.severity} /></div>
    <div className="logV2SnapshotGrid">{collection.rows.map((row) => <article key={row.host}><div><b>{row.host}</b><Status value={row.severity} /></div><small>sample {shortTime(row.timeLabel || row.snapshot)} · resource {row.resourceSeverity} · coverage {row.resourceCoverage?.observed ?? 0}/4</small><dl>
      <div><dt>CPU</dt><dd>{metricText(row.cpuPct, 1, '%')}</dd></div>
      <div><dt>RAM</dt><dd>{metricText(row.memoryPct, 1, '%')}</dd></div>
      <div><dt>Load1/vCPU</dt><dd>{metricText(row.resourceLoadRatio, 2)}</dd></div>
      <div><dt>Swap In</dt><dd>{metricText(row.swapIn, 0, ' p/s')}</dd></div>
      <div><dt>CPU iowait</dt><dd>{metricText(row.iowaitPct, 1, '%')}</dd></div>
      <div><dt>PSI Mem Full10</dt><dd>{metricText(row.psiMemoryFull10, 1, '%')}</dd></div>
      <div><dt>PSI IO Full10</dt><dd>{metricText(row.psiIoFull10, 1, '%')}</dd></div>
      <div><dt>WP Critical</dt><dd>{metricText(row.wpCritical)}</dd></div>
      <div><dt>Calibrated pressure</dt><dd>{row.resourcePressure}/100</dd></div>
    </dl></article>)}</div>
  </section>
}

function HostPeakSummary({ rca, selectedHost, onSelectHost }) {
  if (!rca?.hostPeaks?.length) return null
  return <section className="logV2Panel">
    <div className="logV2PanelHead"><div><h2>Application Server Resource Peak Summary</h2><p>Resource severity remains based on synchronized core telemetry. Enhanced iowait/PSI evidence refines incident interpretation without changing missing values to zero.</p></div></div>
    <div className="logV2HostTableWrap"><table className="logV2HostTable"><thead><tr><th>Host</th><th>Operational</th><th>Resource</th><th>Resource Peak</th><th>Peak Time</th><th>Run</th><th>Max CPU</th><th>Max RAM</th><th>Max Load1</th><th>Max Swap</th><th>Max WP Critical</th></tr></thead><tbody>
      {rca.hostPeaks.map((item) => <tr key={item.host} className={selectedHost === item.host ? 'active' : ''} onClick={() => onSelectHost?.(item.host)}>
        <td><b>{item.host}</b></td><td><Status value={item.severity} /></td><td><Status value={item.resourceSeverity} /></td><td><b>{item.peakPressure}</b>/100</td><td>{shortTime(item.peakTime)}</td>
        <td title={`${item.sustained?.sustainedMinutes || 0} min · ${item.sustained?.sustainedSamples || 0} samples · AUC ${item.sustained?.pressureAuc || 0}`}>{item.sustained?.sustainedClass || 'NONE'} · {item.sustained?.sustainedScore || 0}</td>
        <td>{metricText(item.metrics?.cpu?.value, 1, '%')}</td><td>{metricText(item.metrics?.ram?.value, 1, '%')}</td><td>{metricText(item.metrics?.load?.value, 2)}</td><td>{metricText(item.metrics?.swapIn?.value, 0, ' p/s')}</td><td>{metricText(item.metrics?.wpCritical?.value)}</td>
      </tr>)}
    </tbody></table></div>
  </section>
}

function VerdictPanel({ verdict, capabilities }) {
  if (!verdict) return null
  const single = verdict.status === 'SINGLE_CULPRIT_SUPPORTED'
  const landscape = verdict.landscapeConfidence || {}
  return <section className="logV2Panel">
    <div className="logV2PanelHead"><div><span className="logV2Eyebrow">DETERMINISTIC RCA VERDICT · PATTERN v2</span><h2>{single ? 'Single culprit supported' : 'No single culprit established'}</h2><p>{verdict.interpretation}</p></div><Status value={single ? 'WARN' : 'NORMAL'} /></div>
    <div className="logV2SnapshotGrid">
      <article><small>Incident pattern</small><strong>{verdict.pattern || 'RESOURCE_CONTENTION'}</strong><p>Pattern uses host pressure plus available PSI, iowait, WCHAN, PSS and process I/O.</p></article>
      <article><small>Incident anchor</small><strong>{verdict.anchorHost || '—'}</strong><p>{shortTime(verdict.anchorTime)} · actual strongest host resource sample.</p></article>
      <article><small>Top related workload</small><strong>{verdict.topWorkload || '—'}</strong><p>{verdict.topHost || '—'} · causal {verdict.topCausalScore ?? 0} · victim {verdict.topVictimScore ?? 0} · margin {verdict.margin ?? 0}.</p></article>
      <article><small>Top local confidence</small><strong>{verdict.topLocalConfidence || 'LOW'}</strong><p>Workload ↔ host ↔ incident evidence quality.</p></article>
      <article><small>Landscape confidence</small><strong>{landscape.grade || 'LOW'} {hasMetric(landscape.score) ? `${landscape.score}/100` : ''}</strong><p>{landscape.skewMinutes ?? 0} min cross-host capture skew · exact hosts {landscape.exactHosts ?? 0}/{landscape.hostCount ?? 0}.</p></article>
      <article><small>Telemetry mode</small><strong>{capabilities?.mode || verdict.telemetryMode || 'LEGACY'}</strong><p>{capabilities?.enhanced ? 'Enhanced Linux evidence available.' : 'Legacy WP-SCOUT evidence only; PSS/WCHAN/PSI/I/O remain unavailable.'}</p></article>
    </div>
    {!!verdict.reasons?.length && <div className="logV2Method"><b>Why the engine abstained / qualified the verdict:</b> {verdict.reasons.join(' · ')}</div>}
  </section>
}

function errorTone(value = '') {
  if (value === 'NEW_AT_TARGET') return 'critical'
  if (value === 'NEW_BEFORE_TARGET' || value === 'PERSISTENT_NEAR_TARGET') return 'warn'
  return 'neutral'
}

function cpuShareText(item) {
  if (item.cpuContributionStatus === 'TEMPORAL_MISMATCH') return 'not synchronized'
  if (item.cpuContributionStatus === 'UNAVAILABLE_TARGET_CPU') return 'CPU unavailable'
  if (item.cpuContributionStatus === 'UNAVAILABLE_HOST_CPU_SCALE') return 'host CPU scale unavailable'
  if (item.cpuContributionStatus === 'INCONSISTENT_SCALE') return 'scale rejected'
  return metricText(item.estimatedCpuSharePct, 1, '%')
}

function WorkloadDetail({ item }) {
  if (!item) return <section className="logV2Panel"><div className="logV2Empty">Select an observed workload from the role-aware causal ranking.</div></section>
  const timingText = item.errorTimings?.map((entry) => `${entry.error}: ${entry.state}${entry.deltaMinutes === null ? '' : ` (${signed(entry.deltaMinutes, 0, 'm')})`}`).join(' · ') || 'None'
  const taxonomy = item.errorTaxonomy || {}
  return <section className="logV2Panel">
    <div className="logV2PanelHead"><div><span className="logV2Eyebrow">SELECTED INCIDENT-RELATIVE WORKLOAD · TELEMETRY v1.13</span><h2>{item.workload}</h2><p>{item.host} · {item.program} · target {shortTime(item.targetTime)} · role {item.incidentRole}</p></div><div className="logV2DetailBadges"><span className="logV2ScoreBadge">Causal {item.causalScore}/100</span><span className="logV2ScoreBadge">Relevance {item.incidentScore}/100</span><span className="logV2ScoreBadge">Victim {item.victimScore}/100</span><span className={`logV2ErrorBadge ${errorTone(item.errorState)}`}>{item.errorState}</span></div></div>
    <div className="logV2DetailGrid">
      <div className="logV2DetailFacts"><dl>
        <div><dt>Incident role v2</dt><dd>{item.incidentRole}</dd></div><div><dt>Target evidence</dt><dd>{item.targetEvidence} · Δ {hasMetric(item.targetDeltaMinutes) ? signed(item.targetDeltaMinutes, 0, 'm') : '—'}</dd></div>
        <div><dt>Local confidence</dt><dd>{item.localConfidence?.grade || '—'} · {item.localConfidence?.score ?? '—'}/100</dd></div><div><dt>Landscape confidence</dt><dd>{item.landscapeConfidence?.grade || '—'} · {item.landscapeConfidence?.score ?? '—'}/100</dd></div>
        <div><dt>Host state @ incident</dt><dd>{item.targetHostSeverity || 'UNKNOWN'}</dd></div><div><dt>Nearest host evidence</dt><dd>{item.targetHostEvidenceSeverity || '—'} @ {shortTime(item.targetHostEvidenceTime)}</dd></div>
        <div><dt>CPU Σ @ evidence</dt><dd>{metricText(item.targetCpu, 1, '%')}</dd></div><div><dt>Estimated CPU share</dt><dd>{cpuShareText(item)}</dd></div>
        <div><dt>PSS Σ @ evidence</dt><dd>{metricText(item.targetPssGb, 2, ' GB')}</dd></div><div><dt>PSS baseline median</dt><dd>{metricText(item.pssBaseline?.median, 2, ' GB')}</dd></div>
        <div><dt>PSS uplift</dt><dd>{signed(item.pssUplift?.delta, 2, ' GB')} · robust z {robustZText(item.pssUplift?.z)}</dd></div><div><dt>Private / shared</dt><dd>{metricText(item.targetPrivateGb, 2, ' GB')} / {metricText(item.targetSharedGb, 2, ' GB')}</dd></div>
        <div><dt>Max PID RSS</dt><dd>{metricText(item.targetMaxPidRss, 2, ' GB')}</dd></div><div><dt>ΣRSS upper bound</dt><dd>{metricText(item.targetRss, 2, ' GB')}</dd></div>
        <div><dt>D-state / PIDs</dt><dd>{hasMetric(item.targetDState) ? `${item.targetDState} / ${item.targetConcurrentPids}` : '—'}</dd></div><div><dt>WCHAN</dt><dd>{item.wchanClass || 'NONE'} · {item.targetWchan || '—'}</dd></div>
        <div><dt>Process I/O read</dt><dd>{metricText(item.targetReadMiBps, 2, ' MiB/s')}</dd></div><div><dt>Process I/O write</dt><dd>{metricText(item.targetWriteMiBps, 2, ' MiB/s')}</dd></div>
        <div><dt>Major faults</dt><dd>{metricText(item.targetMajorFaultsPerMin, 1, '/min')}</dd></div><div><dt>Host iowait</dt><dd>{metricText(item.hostIowaitPct, 1, '%')}</dd></div>
        <div><dt>PSI memory some/full</dt><dd>{metricText(item.hostPsiMemorySome10, 1, '%')} / {metricText(item.hostPsiMemoryFull10, 1, '%')}</dd></div><div><dt>PSI I/O some/full</dt><dd>{metricText(item.hostPsiIoSome10, 1, '%')} / {metricText(item.hostPsiIoFull10, 1, '%')}</dd></div>
        <div><dt>CPU baseline</dt><dd>{metricText(item.cpuBaseline?.median, 1, '%')} · uplift {signed(item.cpuUplift?.delta, 1, '%')}</dd></div><div><dt>RSS baseline</dt><dd>{metricText(item.rssBaseline?.median, 2, ' GB')} · uplift {signed(item.rssUplift?.delta, 2, ' GB')}</dd></div>
        <div><dt>Error class</dt><dd>{taxonomy.strongest?.category || 'NONE'} · {taxonomy.strongest?.causalClass || 'NONE'}</dd></div><div><dt>Error direction</dt><dd>{taxonomy.direction || 'CONTEXT'}</dd></div>
        <div className="wide"><dt>Telemetry signals v2</dt><dd>PSS causal {item.telemetrySignalsV14?.pssCausal ?? 0} · I/O causal {item.telemetrySignalsV14?.ioCausal ?? 0} · blocked/victim {item.telemetrySignalsV14?.blockedVictim ?? 0} · error support {item.telemetrySignalsV14?.errorCausalSupport ?? 0}</dd></div>
        <div className="wide"><dt>Errors</dt><dd>{item.errors?.join(', ') || 'None'}</dd></div>
        <div className="wide"><dt>Error timing vs incident anchor</dt><dd>{timingText}</dd></div>
      </dl></div>
      <WorkloadTrendEChart records={item.samples} targetTime={item.targetTime} targetCollectionKey={item.targetCollectionKey} aggregated />
    </div>
    <div className="logV2Method"><b>Interpretation:</b> PSS is preferred over summed RSS for proportional physical-memory attribution. WCHAN + D-state primarily raise blocked-victim evidence unless the workload also has independent consumer signals. Per-process I/O uses positive deltas of cumulative `/proc/&lt;pid&gt;/io` counters. Missing enhanced fields remain unavailable.</div>
  </section>
}

function AnalyticsDiagnostics({ diagnostics, capabilities, mapping }) {
  const parity = diagnostics?.parity || {}
  return <details className="logV2SourceAudit"><summary>Analytics Diagnostics · engine, DuckDB parity, mapping, enhanced telemetry</summary><div>
    <table><tbody>
      <tr><th>Active engine</th><td>{diagnostics?.engineDiagnostics?.activeEngine || diagnostics?.activeEngine || '—'}</td></tr>
      <tr><th>DuckDB status</th><td>{diagnostics?.engineDiagnostics?.duckDbStatus || '—'}</td></tr>
      <tr><th>DuckDB / fallback reason</th><td>{diagnostics?.engineReason || diagnostics?.engineDiagnostics?.reason || 'None'}</td></tr>
      <tr><th>JS ↔ DuckDB parity</th><td>{parity.status || 'NOT_RUN'} · compared {parity.compared || 0} · mismatches {parity.mismatchCount || 0}</td></tr>
      <tr><th>Process mapping</th><td>EXACT {mapping?.counts?.EXACT || 0} · ≤2m {mapping?.counts?.NEAREST_2M || 0} · ≤5m {mapping?.counts?.NEAREST_5M || 0} · unmapped {mapping?.counts?.UNMAPPED || 0}</td></tr>
      <tr><th>Telemetry mode</th><td>{capabilities?.mode || 'LEGACY'}</td></tr>
      <tr><th>Enhanced coverage</th><td>PSS {capabilities?.pss || 0} · WCHAN {capabilities?.wchan || 0} · proc I/O {capabilities?.processIo || 0} · iowait {capabilities?.iowait || 0} · PSI mem {capabilities?.psiMemory || 0} · PSI I/O {capabilities?.psiIo || 0}</td></tr>
    </tbody></table>
  </div></details>
}

function SourceAudit({ collections = [] }) {
  return <details className="logV2SourceAudit"><summary>Source Audit · logical collection → host sample timestamps → file</summary><div><table><thead><tr><th>#</th><th>Collection</th><th>Host samples</th><th>Source file</th></tr></thead><tbody>{collections.map((item, index) => <tr key={item.key}><td>{index + 1}</td><td>{item.timeLabel}{item.endTime !== item.timeLabel ? ` → ${item.endTime}` : ''}</td><td>{item.rows.map((row) => `${row.host}@${row.timeLabel || row.snapshot}`).join(' · ')}</td><td>{item.fileName}</td></tr>)}</tbody></table></div></details>
}

export default function ToolLogAutoRcaV5() {
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('Upload WP-SCOUT / Daily Check logs. v1.14 accepts optional RCA-EXT PSS/WCHAN/PSI/process-I/O evidence while remaining backward compatible.')
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
    setResourceRows(ranked.rows)
    setSelectedResource(ranked.rows[0] || null)
    setResourceEngine(ranked.engine)
    setVerdict(ranked.verdict || null)
    setCapabilities(ranked.telemetryCapabilities || telemetryCapabilitiesV13(nextAnalysis))
    setDiagnostics({
      parity: ranked.parity || { status: 'NOT_RUN' },
      crossHostConfidence: ranked.crossHostConfidence || { grade: '—', skewMinutes: 0 },
      landscapeConfidence: ranked.landscapeConfidence,
      engineReason: ranked.engineReason || '',
      engineDiagnostics: ranked.engineDiagnostics || {},
    })
    setMapping({ mappedRows: ranked.mappedRows || 0, unmappedRows: ranked.unmappedRows || 0, counts: ranked.mappingCounts || { EXACT: 0, NEAREST_2M: 0, NEAREST_5M: 0, UNMAPPED: 0 } })
    if (ranked.incidentAnchor?.host) setSelectedHost(ranked.incidentAnchor.host)
    if (ranked.incidentAnchor?.collectionKey) setSelectedCollectionKey(ranked.incidentAnchor.collectionKey)
  }, [])

  const upload = React.useCallback(async (list) => {
    setBusy(true)
    setStatus('Parsing → schema validation → logical collections → incident anchor → PSS/WCHAN/PSI/I/O enrichment → error taxonomy → RCA verdict…')
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
      setAnalysis(nextAnalysis)
      setRca(nextRca)
      setCapabilities(caps)
      setSelectedCollectionKey(nextRca.resourceLandscapePeak?.key || nextRca.collections[0]?.key || '')
      setSelectedHost(nextRca.hostPeaks?.[0]?.host || nextRca.hosts?.[0] || '')
      setResourceRows([])
      setSelectedResource(null)
      setVerdict(null)
      setDiagnostics({ parity: { status: 'NOT_RUN' }, crossHostConfidence: { grade: '—', skewMinutes: 0 } })
      setMapping({ mappedRows: 0, unmappedRows: 0, counts: { EXACT: 0, NEAREST_2M: 0, NEAREST_5M: 0, UNMAPPED: 0 } })
      const rejected = (nextRca.quality?.telemetryRejected || 0) + (nextRca.quality?.processRejected || 0)
      setStatus(`Parsed ${expanded.length} files · ${nextRca.collections.length} logical collections · ${nextRca.hosts.length} application servers · schema rejects ${rejected} · telemetry ${caps.mode}.`)
      await rankResources(nextAnalysis, nextRca)
    } catch (error) {
      setAnalysis(null); setRca(null); setResourceRows([]); setSelectedResource(null); setResourceEngine('FAILED'); setVerdict(null)
      setStatus(error?.message || 'LOG analysis failed.')
    } finally {
      setBusy(false)
    }
  }, [rankResources])

  const selectedCollection = React.useMemo(() => rca?.collections?.find((item) => item.key === selectedCollectionKey) || rca?.resourceLandscapePeak || null, [rca, selectedCollectionKey])
  const selectedHostPeak = React.useMemo(() => rca?.hostPeaks?.find((item) => item.host === selectedHost) || rca?.hostPeaks?.[0] || null, [rca, selectedHost])
  const ranking = resourceEngine === 'RANKING'
  const mappingMeta = ranking ? `${analysis?.processes?.length || 0} validated process records` : `EXACT ${mapping.counts.EXACT || 0} · ≤2m ${mapping.counts.NEAREST_2M || 0} · ≤5m ${mapping.counts.NEAREST_5M || 0} · unmapped ${mapping.counts.UNMAPPED || 0}`
  const visibleMetrics = Object.entries(LOG_V14_METRICS).filter(([, item]) => !item.enhanced || capabilities.mode === 'ENHANCED')
  const incidentAnchorTime = verdict?.anchorTime || rca?.resourceIncidentAnchor?.time || rca?.resourceLandscapePeak?.incidentAnchorTime || rca?.resourceLandscapePeak?.timeLabel
  const incidentAnchorHost = verdict?.anchorHost || rca?.resourceIncidentAnchor?.host || ''

  return <section className="logV2Shell"><div className="logV2Inner">
    <header className="logV2Header"><div><span className="logV2Eyebrow">DETERMINISTIC · TELEMETRY-ENRICHED RCA v1.14</span><h1>LOG Analysis</h1><p>Incident anchoring, causal abstention, PSS-aware memory attribution, WCHAN/I/O victim analysis, Linux PSI/iowait correlation, error taxonomy, and incident-pattern v2 remain deterministic and auditable.</p></div><label className="logV2Upload"><input type="file" multiple accept=".zip,.log,.txt,.csv" onChange={(event) => upload(event.target.files)} />{busy ? 'Analyzing…' : 'Upload Logs'}</label></header>
    <div className={`logV2StatusBar ${rca ? 'ready' : ''}`}>{status}</div>

    {!rca ? <div className="logV2EmptyState"><b>Evidence-first RCA flow</b><span>Upload → validate → collections → true incident anchor → enhanced Linux evidence → workload aggregation → taxonomy → role-aware scoring → verdict</span><p>Legacy WP-SCOUT logs still work. Enhanced metrics are optional and never synthesized when unavailable.</p></div> : <>
      <section className="logV2Stats">
        <Stat label="Evidence" value={`${rca.collections.length} collections`} meta={`${rca.evidenceWindow.fileCount} source files · rejects ${(rca.quality?.telemetryRejected || 0) + (rca.quality?.processRejected || 0)}`} />
        <Stat label="Application servers" value={rca.hosts.length} meta={rca.hosts.join(' · ')} />
        <Stat label="Full time range" value={`${shortTime(rca.evidenceWindow.start)} → ${shortTime(rca.evidenceWindow.end)}`} meta={`${rca.cadence.nominalMinutes || '—'}-min collection cadence`} />
        <Stat label="Incident anchor" value={`${incidentAnchorHost || 'R'} ${shortTime(incidentAnchorTime)}`} meta={`landscape ${diagnostics.landscapeConfidence?.grade || diagnostics.crossHostConfidence?.grade || '—'} · skew ${diagnostics.landscapeConfidence?.skewMinutes ?? diagnostics.crossHostConfidence?.skewMinutes ?? 0}m`} tone={(rca.resourceLandscapePeak?.resourceCrit || 0) > 0 ? 'critical' : ''} />
        <Stat label="RCA verdict" value={ranking ? 'Ranking…' : verdict?.status || '—'} meta={ranking ? 'deterministic scoring in progress' : `${verdict?.pattern || '—'} · top causal ${verdict?.topCausalScore ?? '—'}`} />
        <Stat label="Telemetry" value={capabilities.mode || 'LEGACY'} meta={`PSS ${capabilities.pss || 0} · WCHAN ${capabilities.wchan || 0} · PSI IO ${capabilities.psiIo || 0}`} />
        <Stat label="Analytics engine" value={ranking ? 'Ranking…' : diagnostics.engineDiagnostics?.activeEngine || resourceEngine} meta={`${mappingMeta} · parity ${diagnostics.parity?.status || 'NOT_RUN'}`} />
      </section>

      {!ranking && <VerdictPanel verdict={verdict} capabilities={capabilities} />}

      <section className="logV2Panel">
        <div className="logV2PanelHead"><div><h2>APP1–APP5 Logical Collection Timeline</h2><p>The dashed incident marker stays on the logical collection axis but labels the actual host anchor timestamp. Enhanced PSI/iowait tabs appear only when present.</p></div><div className="logV2MetricTabs">{visibleMetrics.map(([key, item]) => <button key={key} type="button" className={metric === key ? 'active' : ''} onClick={() => setMetric(key)}>{item.label}</button>)}</div></div>
        <LandscapeResourceEChartV14 rca={rca} metric={metric} onSelectCollection={setSelectedCollectionKey} />
      </section>

      <SnapshotStrip collection={selectedCollection} incidentKey={rca.resourceLandscapePeak?.key} capabilities={capabilities} />
      <HostPeakSummary rca={rca} selectedHost={selectedHostPeak?.host} onSelectHost={(hostName) => {
        setSelectedHost(hostName)
        const first = resourceRows.find((row) => row.host === hostName)
        if (first) setSelectedResource(first)
      }} />

      <section className="logV2Panel">
        <div className="logV2PanelHead"><div><h2>Observed Workloads · Causal Ranking + Telemetry v1.13</h2><p>Primary sort is Causal Priority. PSS and own I/O can strengthen consumer evidence; WCHAN/D-state primarily strengthen victim evidence. Error signals are taxonomy-qualified, not assumed causal.</p></div><div className="logV2Legend"><span><i className="resource" /> causal priority</span><span><i className="peak" /> local/landscape confidence</span><span><i className="error" /> taxonomy/timing</span></div></div>
        {ranking ? <div className="logV2Empty"><b>Aggregating enhanced workload evidence…</b><br />Parsed {analysis?.processes?.length || 0} validated process rows.</div> : <VirtualResourceTableV14 rows={resourceRows} selectedKey={selectedResource?.key || ''} onSelect={setSelectedResource} />}
      </section>

      {!ranking && <WorkloadDetail item={selectedResource} />}
      <AnalyticsDiagnostics diagnostics={diagnostics} capabilities={capabilities} mapping={mapping} />
      <SourceAudit collections={rca.collections} />
    </>}
  </div></section>
}
