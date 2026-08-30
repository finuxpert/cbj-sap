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
const operatorLabel = (value = '') => ({ DB_CONCURRENCY: 'DB Concurrency', ABAP_SERIALIZATION: 'ABAP Serialization', ABAP_DATA: 'ABAP Data', NFS_IO_CONTENTION: 'NFS I/O Contention', IO_CONSUMER: 'I/O Consumer', ERROR_SIGNAL: 'Error Activity', MIXED: 'Mixed Evidence', BLOCKED_VICTIM: 'Blocked Workload', RESOURCE_CONSUMER: 'Resource Consumer', MEMORY_CONSUMER: 'Memory Consumer', BACKGROUND: 'Background' })[String(value || '').toUpperCase()] || humanize(value)
const robustZText = (value) => {
  if (!hasMetric(value)) return '—'
  const n = Number(value)
  if (n >= 8) return '≥8'
  if (n <= -8) return '≤-8'
  return fmt(n, 1)
}

function qualityPresentation(local = {}) {
  const score = hasMetric(local?.score) ? Number(local.score) : null
  if (score === null) return { label: 'Unknown', meta: 'local data unavailable' }
  const label = score >= 95 ? 'Complete' : score >= 80 ? 'Good' : score >= 60 ? 'Limited' : 'Low'
  return { label, meta: `${fmt(score, 0)}% coverage` }
}

function runPresentation(sustained = {}) {
  const name = sustained?.sustainedClass || 'NONE'
  if (name === 'NONE') return 'None'
  return humanize(name)
}

function patternPresentation(verdict, capabilities) {
  const raw = verdict?.pattern || 'RESOURCE_CONTENTION'
  const mode = capabilities?.mode || verdict?.telemetryMode || 'LEGACY'
  if (mode === 'LEGACY') {
    const legacyLabels = {
      MEMORY_BLOCKING_CONTENTION: 'High Memory Pressure with Blocked Work Processes',
      MEMORY_IO_CONTENTION: 'Memory Pressure with I/O Activity',
      NFS_IO_CONTENTION: 'NFS I/O Blocking',
      BLOCK_IO_CONTENTION: 'Block I/O Pressure',
      IO_STALL_CONTENTION: 'I/O Stall',
      MEMORY_RECLAIM_STALL: 'Memory Reclaim Activity',
      CPU_SATURATION: 'High CPU Utilization',
      MEMORY_PRESSURE: 'High Memory Pressure',
      CPU_PRESSURE: 'High CPU Pressure',
    }
    return { label: legacyLabels[raw] || humanize(raw), qualifier: 'Based on standard log data' }
  }
  if (mode === 'PARTIAL') return { label: humanize(raw), qualifier: 'Supported by partial Linux telemetry' }
  return { label: humanize(raw), qualifier: 'Supported by enhanced Linux telemetry' }
}

function dataSourcePresentation(capabilities = {}) {
  const mode = capabilities?.mode || 'LEGACY'
  if (mode === 'LEGACY') return { label: 'STANDARD', meta: 'Standard log metrics only' }
  if (mode === 'PARTIAL') return { label: 'PARTIAL', meta: `${capabilities?.coveragePct || 0}% additional telemetry coverage` }
  return { label: 'ENHANCED', meta: `${capabilities?.coveragePct || 0}% enhanced telemetry coverage` }
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
  return <span className={`logV141Decision ${confirmed ? 'confirmed' : 'unconfirmed'}`}>{confirmed ? 'IDENTIFIED' : 'UNRESOLVED'}</span>
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
  if (item.resourcePeak?.sourceHostStatus === 'MISMATCH' || item.operationalPeak?.sourceHostStatus === 'MISMATCH') return false
  if ((item.samples || []).some((row) => (row.host && row.host !== item.host) || row.sourceHostStatus === 'MISMATCH')) return false
  const metricRows = Object.values(item.metrics || {}).map((entry) => entry?.row).filter(Boolean)
  return !metricRows.some((row) => (row.host && row.host !== item.host) || row.sourceHostStatus === 'MISMATCH')
}

function IncidentSummary({ verdict, capabilities, topRow }) {
  if (!verdict) return null
  const single = verdict.status === 'SINGLE_CULPRIT_SUPPORTED'
  const landscape = verdict.landscapeConfidence || {}
  const pattern = patternPresentation(verdict, capabilities)
  const quality = qualityPresentation(topRow?.localConfidence)
  const source = dataSourcePresentation(capabilities)
  return <section className="logV2Panel logV141Summary">
    <div className="logV141SummaryTop">
      <div><span className="logV141Kicker">INCIDENT SUMMARY</span><h2>{single ? 'Primary workload identified' : 'Root cause not isolated'}</h2></div>
      <DecisionBadge confirmed={single} />
    </div>
    <div className="logV141SummaryGrid">
      <div><span>Server and time</span><strong>{verdict.anchorHost || '—'}</strong><small>{shortTime(verdict.anchorTime)}</small></div>
      <div><span>Observed condition</span><strong>{pattern.label}</strong><small>{pattern.qualifier}</small></div>
      <div><span>Primary workload for review</span><strong>{verdict.topWorkload || '—'}</strong><small>{verdict.topHost || '—'} · {operatorLabel(topRow?.incidentRole || 'UNKNOWN')} · RCA priority {verdict.topCausalScore ?? 0} · blocked {verdict.topVictimScore ?? 0}</small></div>
      <div><span>Data coverage</span><strong>{quality.label}</strong><small>{quality.meta}</small></div>
      <div><span>Server time alignment</span><strong>{landscape.grade || 'LOW'}</strong><small>{landscape.skewMinutes ?? 0} min difference · {landscape.exactHosts ?? 0} of {landscape.hostCount ?? 0} servers aligned</small></div>
      <div><span>Data source</span><strong>{source.label}</strong><small>{source.meta}</small></div>
    </div>
  </section>
}

function SnapshotStrip({ collection, incidentKey, capabilities }) {
  if (!collection) return null
  const range = collection.endTime && collection.endTime !== collection.timeLabel ? `${shortTime(collection.timeLabel)} → ${shortTime(collection.endTime)}` : shortTime(collection.timeLabel)
  const incident = collection.key === incidentKey
  const skew = collectionSkew(collection)
  return <section className="logV2Panel logV2SnapshotPanel">
    <div className="logV2PanelHead"><div><h2>{incident ? 'Incident Snapshot' : 'Selected Snapshot'} · {range}</h2><p>Server time difference: {skew} min · data source {dataSourcePresentation(capabilities).label}</p></div><Status value={collection.resourceSeverity || collection.severity} /></div>
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
    <div className="logV2PanelHead"><div><h2>Server Resource Peaks</h2><p>Highest recorded values for each server during the selected period.</p></div></div>
    <div className="logV2HostTableWrap"><table className="logV2HostTable"><thead><tr><th>Host</th><th>Operational</th><th>Resource</th><th>Peak Score</th><th>Peak Time</th><th>Duration</th><th>Max CPU</th><th>Max RAM</th><th>Max Load1</th><th>Max Swap</th><th>WP Critical</th></tr></thead><tbody>
      {rca.hostPeaks.map((item) => {
        const attributionOk = hostPeakAttributionValid(item)
        return <tr key={item.host} className={`${selectedHost === item.host ? 'active' : ''} ${attributionOk ? '' : 'attributionError'}`} onClick={() => onSelectHost?.(item.host)}>
          <td><b>{item.host}</b>{!attributionOk && <span className="logV141Integrity">ATTRIB</span>}</td><td><Status value={item.severity} /></td><td><Status value={item.resourceSeverity} /></td><td><b>{attributionOk ? item.peakPressure : '—'}</b>{attributionOk ? '/100' : ''}</td><td>{attributionOk ? shortTime(item.peakTime) : 'mapping error'}</td>
          <td>{runPresentation(item.sustained)}</td><td>{attributionOk ? metricText(item.metrics?.cpu?.value, 1, '%') : '—'}</td><td>{attributionOk ? metricText(item.metrics?.ram?.value, 1, '%') : '—'}</td><td>{attributionOk ? metricText(item.metrics?.load?.value, 2) : '—'}</td><td>{attributionOk ? metricText(item.metrics?.swapIn?.value, 0, ' p/s') : '—'}</td><td>{attributionOk ? metricText(item.metrics?.wpCritical?.value) : '—'}</td>
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
  const quality = qualityPresentation(item.localConfidence)
  const timingText = taxonomy.classified?.map((entry) => `${entry.code}: ${entry.timing?.state || 'NONE'}${hasMetric(entry.timing?.deltaMinutes) ? ` (${signed(entry.timing.deltaMinutes, 0, 'm')})` : ''}`).join(' · ') || 'None'
  return <section className="logV2Panel">
    <div className="logV2PanelHead"><div><span className="logV141Kicker">WORKLOAD DETAILS</span><h2>{item.workload}</h2><p>{item.host} · {item.program} · {operatorLabel(item.incidentRole)}</p></div><div className="logV2DetailBadges"><span className="logV2ScoreBadge">Priority {item.causalScore}</span><span className="logV2ScoreBadge">Blocked {item.victimScore}</span></div></div>
    <div className="logV2DetailGrid">
      <div className="logV2DetailFacts"><dl>
        <div><dt>Workload role</dt><dd>{operatorLabel(item.incidentRole)}</dd></div><div><dt>Time match</dt><dd>{humanize(item.targetEvidence)} · {signed(item.targetDeltaMinutes, 0, 'm')}</dd></div>
        <div><dt>Data coverage</dt><dd>{quality.label} · {quality.meta}</dd></div><div><dt>Server time alignment</dt><dd>{item.landscapeConfidence?.grade || '—'} · {item.landscapeConfidence?.skewMinutes ?? 0} min difference</dd></div>
        <div><dt>Host status at incident</dt><dd>{item.targetHostSeverity || 'UNKNOWN'}</dd></div><div><dt>Host sample</dt><dd>{item.targetHostEvidenceSeverity || '—'} @ {shortTime(item.targetHostEvidenceTime)}</dd></div>
        <div><dt>{item.targetEvidence === 'EXACT_TARGET' ? 'CPU at incident' : 'CPU at sample'}</dt><dd>{metricText(item.targetCpu, 1, '%')}</dd></div><div><dt>Estimated host CPU share</dt><dd>{cpuShareText(item)}</dd></div>
        <div><dt>PSS</dt><dd>{metricText(item.targetPssGb, 2, ' GB')}</dd></div><div><dt>PSS baseline</dt><dd>{metricText(item.pssBaseline?.median, 2, ' GB')} · z {robustZText(item.pssUplift?.z)}</dd></div>
        <div><dt>Private memory</dt><dd>{metricText(item.targetPrivateGb, 2, ' GB')}</dd></div><div><dt>Σ shared mappings</dt><dd>{metricText(item.targetSharedGb, 2, ' GB')} · non-exclusive</dd></div>
        <div><dt>Max PID RSS</dt><dd>{metricText(item.targetMaxPidRss, 2, ' GB')}</dd></div><div><dt>D-state and PIDs</dt><dd>{hasMetric(item.targetDState) ? `${item.targetDState} / ${item.targetConcurrentPids}` : '—'}</dd></div>
        <div><dt>Kernel wait</dt><dd>{operatorLabel(item.wchanClass || 'NONE')} · {item.targetWchan || '—'}{item.wchanScope === 'D_STATE' ? ' · D-state first' : ''}</dd></div><div><dt>Metric sample time</dt><dd>{humanize(item.enhancedEvidenceQuality || 'UNAVAILABLE')}{hasMetric(item.enhancedEvidenceDeltaMinutes) ? ` · ${item.enhancedEvidenceDeltaMinutes} min` : ''}</dd></div>
        <div><dt>Average read rate</dt><dd>{metricText(item.targetReadMiBps, 2, ' MiB/s')} {hasMetric(item.targetIoWindowMinutes) ? `· ${fmt(item.targetIoWindowMinutes, 0)} min window` : ''}</dd></div><div><dt>Average write rate</dt><dd>{metricText(item.targetWriteMiBps, 2, ' MiB/s')} {hasMetric(item.targetIoWindowMinutes) ? `· ${fmt(item.targetIoWindowMinutes, 0)} min window` : ''}</dd></div>
        <div><dt>Host iowait</dt><dd>{metricText(item.hostIowaitPct, 1, '%')}</dd></div><div><dt>PSI memory and I/O full10</dt><dd>{metricText(item.hostPsiMemoryFull10, 1, '%')} / {metricText(item.hostPsiIoFull10, 1, '%')}</dd></div>
        <div><dt>Error type</dt><dd>{operatorLabel(taxonomy.strongest?.category || 'NONE')}</dd></div><div><dt>Error context</dt><dd>{humanize(taxonomy.direction || 'CONTEXT')}</dd></div>
        <div className="wide"><dt>Error timeline</dt><dd>{timingText}</dd></div>
      </dl></div>
      <WorkloadTrendEChart records={item.samples} targetTime={item.targetTime} targetCollectionKey={item.targetCollectionKey} aggregated />
    </div>
  </section>
}

function AnalyticsDiagnostics({ diagnostics, capabilities, mapping, verdict, rca, analysis }) {
  const parity = diagnostics?.parity || {}
  const attributionIssues = (rca?.hostPeaks || []).filter((item) => !hostPeakAttributionValid(item)).map((item) => item.host)
  const source = analysis?.sourceHostProvenance || {}
  const sourceText = source.totalBlocks
    ? `${source.status || 'WARN'} · verified ${source.verifiedBlocks || 0}/${source.totalBlocks} · unverified ${source.unverifiedBlocks || 0} · mismatch ${source.mismatchBlocks || 0} · dropped T/P ${source.droppedTelemetryRows || 0}/${source.droppedProcessRows || 0}`
    : 'WARN · raw source-host headers unavailable'
  return <details className="logV2SourceAudit"><summary>Diagnostics</summary><div><table><tbody>
    <tr><th>RCA engine</th><td>{diagnostics?.engineDiagnostics?.rcaEngine || 'RCA v3.6.3'}</td></tr>
    <tr><th>Core aggregator</th><td>{diagnostics?.engineDiagnostics?.coreAggregator || diagnostics?.engineDiagnostics?.activeEngine || '—'}</td></tr>
    <tr><th>DuckDB</th><td>{diagnostics?.engineDiagnostics?.duckDbStatus || '—'} · {diagnostics?.engineReason || diagnostics?.engineDiagnostics?.reason || 'no error'}</td></tr>
    <tr><th>Parity</th><td>{parity.status || 'NOT_RUN'} · compared {parity.compared || 0} · mismatches {parity.mismatchCount || 0}</td></tr>
    <tr><th>Process mapping</th><td>EXACT {mapping?.counts?.EXACT || 0} · ≤2m {mapping?.counts?.NEAREST_2M || 0} · ≤5m {mapping?.counts?.NEAREST_5M || 0} · unmapped {mapping?.counts?.UNMAPPED || 0}</td></tr>
    <tr><th>Source host provenance</th><td>{sourceText}</td></tr>
    <tr><th>Host peak attribution</th><td>{attributionIssues.length ? `FAIL · ${attributionIssues.join(', ')}` : 'PASS'}</td></tr>
    <tr><th>Telemetry</th><td>{capabilities?.mode || 'LEGACY'} · coverage {capabilities?.coveragePct || 0}% · host {capabilities?.hostCoveragePct || 0}% · process {capabilities?.processCoveragePct || 0}%</td></tr>
    <tr><th>Verdict rules</th><td>{verdict?.reasons?.join(' · ') || 'none'}</td></tr>
  </tbody></table></div></details>
}

function SourceAudit({ collections = [] }) {
  return <details className="logV2SourceAudit"><summary>Source Audit</summary><div><table><thead><tr><th>#</th><th>Collection</th><th>Host samples</th><th>Source file</th></tr></thead><tbody>{collections.map((item, index) => <tr key={item.key}><td>{index + 1}</td><td>{item.timeLabel}{item.endTime !== item.timeLabel ? ` → ${item.endTime}` : ''}</td><td>{item.rows.map((row) => `${row.host}@${row.timeLabel || row.snapshot}${row.sourceHostStatus ? ` [${row.sourceHostStatus}]` : ''}`).join(' · ')}</td><td>{item.fileName}</td></tr>)}</tbody></table></div></details>
}

export default function ToolLogAutoRcaV5() {
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('Upload WP-SCOUT or Daily Check logs.')
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
      const sourceStatus = nextAnalysis?.sourceHostProvenance?.status || 'WARN'
      setStatus(`${expanded.length} files · ${nextRca.collections.length} collections · ${nextRca.hosts.length} application servers · rejects ${rejected} · source-host ${sourceStatus} · telemetry ${caps.mode}`)
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
  const dataSource = dataSourcePresentation(capabilities)

  return <section className="logV2Shell"><div className="logV2Inner">
    <header className="logV2Header"><div><span className="logV141Kicker">SAP APPLICATION SERVER ANALYSIS</span><h1>LOG Analysis</h1></div><label className="logV2Upload"><input type="file" multiple accept=".zip,.log,.txt,.csv" onChange={(event) => upload(event.target.files)} />{busy ? 'Analyzing…' : 'Upload Logs'}</label></header>
    <div className={`logV2StatusBar ${rca ? 'ready' : ''}`}>{status}</div>

    {!rca ? <div className="logV2EmptyState"><b>Upload log files</b><p>WP-SCOUT or Daily Check logs. Additional Linux telemetry is optional.</p></div> : <>
      <section className="logV2Stats">
        <Stat label="Data set" value={`${rca.collections.length} snapshots`} meta={`${rca.evidenceWindow.fileCount} files`} />
        <Stat label="Servers" value={rca.hosts.length} meta={rca.hosts.join(' · ')} />
        <Stat label="Analysis period" value={`${shortTime(rca.evidenceWindow.start)} → ${shortTime(rca.evidenceWindow.end)}`} meta={`${rca.cadence.nominalMinutes || '—'} min interval`} />
        <Stat label="Incident" value={`${incidentAnchorHost || '—'} ${shortTime(incidentAnchorTime)}`} meta={`server alignment ${diagnostics.landscapeConfidence?.grade || '—'} · ${diagnostics.landscapeConfidence?.skewMinutes ?? 0} min difference`} tone={(rca.resourceLandscapePeak?.resourceCrit || 0) > 0 ? 'critical' : ''} />
        <Stat label="RCA status" value={ranking ? 'ANALYZING' : verdict?.status === 'SINGLE_CULPRIT_SUPPORTED' ? 'PRIMARY WORKLOAD IDENTIFIED' : 'ROOT CAUSE NOT ISOLATED'} meta={ranking ? 'processing workload evidence' : pattern.label} />
        <Stat label="Data source" value={dataSource.label} meta={dataSource.meta} />
      </section>

      {!ranking && <IncidentSummary verdict={verdict} capabilities={capabilities} topRow={resourceRows[0]} />}

      <section className="logV2Panel">
        <div className="logV2PanelHead"><div><h2>APP1–APP5 Timeline</h2></div><div className="logV2MetricTabs">{visibleMetrics.map(([key, item]) => <button key={key} type="button" className={metric === key ? 'active' : ''} onClick={() => setMetric(key)}>{item.label}</button>)}</div></div>
        <LandscapeResourceEChartV14 rca={rca} metric={metric} onSelectCollection={setSelectedCollectionKey} />
      </section>

      <SnapshotStrip collection={selectedCollection} incidentKey={rca.resourceLandscapePeak?.key} capabilities={capabilities} />
      <HostPeakSummary rca={rca} selectedHost={selectedHostPeak?.host} onSelectHost={(hostName) => { setSelectedHost(hostName); const first = resourceRows.find((row) => row.host === hostName); if (first) setSelectedResource(first) }} />

      <section className="logV2Panel">
        <div className="logV2PanelHead"><div><h2>Workload Analysis</h2><p>Workloads observed around the incident time. Select a row for details.</p></div></div>
        {ranking ? <div className="logV2Empty">Ranking {analysis?.processes?.length || 0} process rows…</div> : <VirtualResourceTableV14 rows={resourceRows} selectedKey={selectedResource?.key || ''} onSelect={setSelectedResource} />}
      </section>

      {!ranking && <WorkloadDetail item={selectedResource} />}
      <AnalyticsDiagnostics diagnostics={diagnostics} capabilities={capabilities} mapping={mapping} verdict={verdict} rca={rca} analysis={analysis} />
      <SourceAudit collections={rca.collections} />
    </>}
  </div></section>
}
