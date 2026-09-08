import React from 'react'
import { expandZipAwareFiles, fileExt } from './evidence-utils.js'
import { buildLogAnalysis, parseLogText, telemetryCapabilitiesV15 } from './logAnalysisV15.js'
import { buildAutoPeakRcaV3 } from './logRcaEngineV3.js'
import { rankResourceConsumersV5 } from './workloadAnalyticsV5.js'
import { LOG_V14_METRICS } from './components/logChartMetrics.js'
import './LogAutoRcaV2.css'
import './LogAutoRcaV141.css'

const VirtualResourceTableV14 = React.lazy(() => import('./components/VirtualResourceTableV14.jsx'))
const LandscapeResourceEChartV14 = React.lazy(() => import('./components/LogLandscapeEChartV14.jsx').then((module) => ({ default: module.LandscapeResourceEChartV14 })))
const WorkloadTrendEChart = React.lazy(() => import('./components/LogLandscapeEChart.jsx').then((module) => ({ default: module.WorkloadTrendEChart })))

const hasMetric = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
const fmt = (value, digits = 0) => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: digits })
const metricText = (value, digits = 0, suffix = '') => hasMetric(value) ? `${fmt(value, digits)}${suffix}` : '—'
const shortTime = (value = '') => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}:\d{2})/)
  return match ? `${match[2]}-${match[3]} ${match[4]}` : value || '—'
}
const humanize = (value = '') => String(value || '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase())
const operatorLabel = (value = '') => ({ DB_CONCURRENCY: 'DB Concurrency', ABAP_SERIALIZATION: 'ABAP Serialization', ABAP_DATA: 'ABAP Data', NFS_IO_CONTENTION: 'NFS I/O Contention', IO_CONSUMER: 'I/O Consumer', ERROR_SIGNAL: 'Error Activity', MIXED: 'Mixed Evidence', BLOCKED_VICTIM: 'Blocked Workload', RESOURCE_CONSUMER: 'Resource Consumer', MEMORY_CONSUMER: 'Memory Consumer', BACKGROUND: 'Background' })[String(value || '').toUpperCase()] || humanize(value)

function workerParse(files) {
  return new Promise((resolve, reject) => {
    if (typeof Worker === 'undefined') return reject(new Error('Worker unavailable'))
    const worker = new Worker(new URL('./workers/logParserV15.worker.js', import.meta.url), { type: 'module' })
    worker.onmessage = (event) => { worker.terminate(); event.data?.ok ? resolve(event.data.analysis) : reject(new Error(event.data?.error || 'Worker parse failed')) }
    worker.onerror = (event) => { worker.terminate(); reject(new Error(event.message || 'Worker parse failed')) }
    worker.postMessage({ files })
  })
}

function Status({ value = 'NORMAL' }) {
  return <span className={`logV2Status ${String(value || '').toLowerCase()}`}>{value}</span>
}

function Stat({ label, value, meta, tone = '' }) {
  return <article className={`logV2Stat ${tone}`}><span>{label}</span><strong>{value}</strong>{meta ? <small>{meta}</small> : null}</article>
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

function consumerMemory(item = {}) {
  return item.targetPssGb ?? item.targetMaxPidRss ?? item.peakMaxPidRss ?? item.peakRss ?? null
}

function PointInTimeSummary({ topRow, collection }) {
  if (!topRow || !collection) return null
  const range = collection.endTime && collection.endTime !== collection.timeLabel ? `${shortTime(collection.timeLabel)} → ${shortTime(collection.endTime)}` : shortTime(collection.timeLabel)
  return <section className="logV2Panel logV141Summary">
    <div className="logV141SummaryTop"><div><span className="logV141Kicker">POINT IN TIME</span><h2>Top consumer at sample time</h2></div></div>
    <div className="logV141SummaryGrid logV141SummaryGridCompact">
      <div><span>Job Name or ABAP Program</span><strong>{topRow.workload || topRow.program || '—'}</strong><small>{topRow.program && topRow.program !== topRow.workload ? topRow.program : range}</small></div>
      <div><span>Application Server</span><strong>{topRow.host || '—'}</strong><small>{range}</small></div>
      <div><span>WP Type</span><strong>{topRow.type || '—'}</strong><small>{topRow.targetConcurrentPids || 0} process rows</small></div>
      <div><span>CPU</span><strong>{metricText(topRow.targetCpu, 1, '%')}</strong><small>process CPU at sample</small></div>
      <div><span>Memory</span><strong>{metricText(consumerMemory(topRow), 2, ' GB')}</strong><small>{hasMetric(topRow.targetPssGb) ? 'PSS' : 'RSS'}</small></div>
    </div>
  </section>
}

function IncidentSummary({ verdict, topRow }) {
  if (!verdict) return null
  const single = verdict.status === 'SINGLE_CULPRIT_SUPPORTED'
  return <section className="logV2Panel logV141Summary logV2TrendSummary">
    <div className="logV141SummaryGrid logV141SummaryGridTrend">
      <div><span>Overall Status</span><strong>{single ? 'Primary consumer identified' : 'No single bottleneck identified'}</strong></div>
      <div><span>Peak Server</span><strong>{verdict.anchorHost || '—'}</strong><small>{shortTime(verdict.anchorTime)}</small></div>
      <div><span>Top Consumer</span><strong>{verdict.topWorkload || '—'}</strong><small>{verdict.topHost || '—'} · {topRow?.type || '—'}</small></div>
    </div>
  </section>
}

function SnapshotStrip({ collection }) {
  if (!collection) return null
  const range = collection.endTime && collection.endTime !== collection.timeLabel ? `${shortTime(collection.timeLabel)} → ${shortTime(collection.endTime)}` : shortTime(collection.timeLabel)
  const skew = collectionSkew(collection)
  return <section className="logV2Panel logV2SnapshotPanel">
    <div className="logV2PanelHead"><div><h2>Application Server Status · {range}</h2><p>{collection.rows.length} host samples · collected within {skew} min</p></div><Status value={collection.resourceSeverity || collection.severity} /></div>
    <div className="logV2SnapshotGrid">{collection.rows.map((row) => <article key={row.host}><div className="logV141HostHead"><b>{row.host}</b><div className="logV141HostStates"><span>HOST</span><Status value={row.resourceSeverity} /><span>WP</span><Status value={row.severity} /></div></div><small>{shortTime(row.timeLabel || row.snapshot)}</small><dl>
      <div><dt>CPU</dt><dd>{metricText(row.cpuPct, 1, '%')}</dd></div><div><dt>RAM</dt><dd>{metricText(row.memoryPct, 1, '%')}</dd></div>
      <div><dt>Load1 vCPU</dt><dd>{metricText(row.resourceLoadRatio, 2)}</dd></div><div><dt>Swap In</dt><dd>{metricText(row.swapIn, 0, ' p/s')}</dd></div>
      <div><dt>I/O Wait</dt><dd>{metricText(row.iowaitPct, 1, '%')}</dd></div><div><dt>WP Critical</dt><dd>{metricText(row.wpCritical)}</dd></div>
    </dl></article>)}</div>
  </section>
}

function HostPeakSummary({ rca, selectedHost, onSelectHost }) {
  if (!rca?.hostPeaks?.length) return null
  return <section className="logV2Panel logV2HostPeakPanel">
    <div className="logV2PanelHead"><div><h2>Application Server Resource Usage</h2><p>Peak values during the selected period.</p></div></div>
    <div className="logV2HostTableWrap"><table className="logV2HostTable"><thead><tr><th>Server</th><th>Peak Time</th><th>Max CPU</th><th>Max RAM</th><th>Max Load1 vCPU</th><th>Critical WP</th></tr></thead><tbody>
      {rca.hostPeaks.map((item) => {
        const attributionOk = hostPeakAttributionValid(item)
        return <tr key={item.host} className={`${selectedHost === item.host ? 'active' : ''} ${attributionOk ? '' : 'attributionError'}`} onClick={() => onSelectHost?.(item.host)}>
          <td><b>{item.host}</b>{!attributionOk && <span className="logV141Integrity">ATTRIB</span>}</td><td>{attributionOk ? shortTime(item.peakTime) : 'mapping error'}</td><td>{attributionOk ? metricText(item.metrics?.cpu?.value, 1, '%') : '—'}</td><td>{attributionOk ? metricText(item.metrics?.ram?.value, 1, '%') : '—'}</td><td>{attributionOk ? metricText(item.metrics?.load?.value, 2) : '—'}</td><td>{attributionOk ? metricText(item.metrics?.wpCritical?.value) : '—'}</td>
        </tr>
      })}
    </tbody></table></div>
  </section>
}

function ServerDetails({ rca, collection, selectedHost, onSelectHost }) {
  return <details className="logV2SourceAudit logV2ServerDetails">
    <summary>Server Details</summary>
    <div className="logV2ServerDetailsBody">
      <SnapshotStrip collection={collection} />
      <HostPeakSummary rca={rca} selectedHost={selectedHost} onSelectHost={onSelectHost} />
    </div>
  </details>
}

function WorkloadDetail({ item, capabilities, pointInTime = false }) {
  if (!item) return null
  const enhancedDetailsAvailable = capabilities?.mode !== 'LEGACY'
  const taxonomy = item.errorTaxonomy || {}
  const errorLabel = taxonomy.strongest?.category && taxonomy.strongest.category !== 'NONE' ? operatorLabel(taxonomy.strongest.category) : (item.errors || []).filter((value) => value && value !== '?').join(' · ') || 'None'
  const memory = consumerMemory(item)
  return <details className="logV2SourceAudit logV2ConsumerDetail">
    <summary>Selected Consumer Details · {item.workload}</summary>
    <div className="logV2ConsumerDetailBody"><section className="logV2Panel">
      <div className="logV2PanelHead"><div><span className="logV141Kicker">CONSUMER DETAILS</span><h2>{item.workload}</h2><p>{item.host} · {item.program} · {item.type || '—'}</p></div><div className="logV2DetailBadges"><span className="logV2ScoreBadge">{item.type || 'WP'}</span><span className="logV2ScoreBadge">CPU {metricText(pointInTime ? item.targetCpu : item.peakCpu, 1, '%')}</span></div></div>
      <div className="logV2DetailGrid" style={pointInTime ? { gridTemplateColumns: '1fr' } : undefined}>
        <div className="logV2DetailFacts"><dl>
          <div><dt>Application Server</dt><dd>{item.host || '—'}</dd></div><div><dt>WP Type</dt><dd>{item.type || '—'}</dd></div>
          <div><dt>ABAP Program</dt><dd>{item.program || '—'}</dd></div><div><dt>{pointInTime ? 'Sample Time' : 'Observed'}</dt><dd>{pointInTime ? shortTime(item.targetTime) : `${item.presenceCount || 0} of ${item.hostSampleCount || 0} samples`}</dd></div>
          {pointInTime ? <><div><dt>CPU at Sample</dt><dd>{metricText(item.targetCpu, 1, '%')}</dd></div><div><dt>Memory at Sample</dt><dd>{metricText(memory, 2, ' GB')}</dd></div></> : <><div><dt>Average CPU</dt><dd>{metricText(item.avgCpu, 1, '%')}</dd></div><div><dt>Peak CPU</dt><dd>{metricText(item.peakCpu, 1, '%')}</dd></div><div><dt>Peak Memory</dt><dd>{metricText(memory, 2, ' GB')}</dd></div><div><dt>First Seen</dt><dd>{shortTime(item.firstSeen)}</dd></div></>}
          <div><dt>D-State WP</dt><dd>{metricText(pointInTime ? item.targetDState : item.dStateHits)}</dd></div><div><dt>Error or Short Dump</dt><dd>{errorLabel}</dd></div>
          {enhancedDetailsAvailable && <>
            <div><dt>Kernel Wait</dt><dd>{operatorLabel(item.wchanClass || 'NONE')} · {item.targetWchan || '—'}</dd></div><div><dt>PSS</dt><dd>{metricText(item.targetPssGb, 2, ' GB')}</dd></div>
            <div><dt>Read Rate</dt><dd>{metricText(item.targetReadMiBps, 2, ' MiB/s')}</dd></div><div><dt>Write Rate</dt><dd>{metricText(item.targetWriteMiBps, 2, ' MiB/s')}</dd></div>
          </>}
        </dl></div>
        {!pointInTime && <React.Suspense fallback={<div className="logV2WorkloadChart logV2Empty" role="status">Loading workload chart…</div>}>
          <WorkloadTrendEChart records={item.samples} targetTime={item.targetTime} targetCollectionKey={item.targetCollectionKey} aggregated />
        </React.Suspense>}
      </div>
    </section></div>
  </details>
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

function topObservedConsumer(rows = []) {
  return [...rows].sort((a, b) => {
    const cpu = Number(b.targetCpu ?? -1) - Number(a.targetCpu ?? -1)
    if (cpu) return cpu
    return Number(consumerMemory(b) ?? -1) - Number(consumerMemory(a) ?? -1)
  })[0] || null
}

export default function ToolLogAutoRcaV5() {
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('')
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
    const rows = ranked.rows || []
    const verdictRow = rows.find((row) => row.host === ranked.verdict?.topHost && row.workload === ranked.verdict?.topWorkload) || null
    const defaultRow = nextRca?.collections?.length === 1 ? topObservedConsumer(rows) : verdictRow || rows[0] || null
    setResourceRows(rows); setSelectedResource(defaultRow); setResourceEngine(ranked.engine); setVerdict(ranked.verdict || null)
    setCapabilities(ranked.telemetryCapabilities || telemetryCapabilitiesV15(nextAnalysis))
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
      if (!nextRca?.collections?.length) throw new Error('No host telemetry collections found in the uploaded logs.')
      const caps = telemetryCapabilitiesV15(nextAnalysis)
      setAnalysis(nextAnalysis); setRca(nextRca); setCapabilities(caps)
      setSelectedCollectionKey(nextRca.resourceLandscapePeak?.key || nextRca.collections[0]?.key || ''); setSelectedHost(nextRca.hostPeaks?.[0]?.host || nextRca.hosts?.[0] || '')
      setResourceRows([]); setSelectedResource(null); setVerdict(null)
      setStatus('')
      await rankResources(nextAnalysis, nextRca)
    } catch (error) {
      setAnalysis(null); setRca(null); setResourceRows([]); setSelectedResource(null); setResourceEngine('FAILED'); setVerdict(null); setStatus(error?.message || 'LOG analysis failed.')
    } finally { setBusy(false) }
  }, [rankResources])

  const selectedCollection = React.useMemo(() => rca?.collections?.find((item) => item.key === selectedCollectionKey) || rca?.resourceLandscapePeak || null, [rca, selectedCollectionKey])
  const selectedHostPeak = React.useMemo(() => rca?.hostPeaks?.find((item) => item.host === selectedHost) || rca?.hostPeaks?.[0] || null, [rca, selectedHost])
  const ranking = resourceEngine === 'RANKING'
  const visibleMetrics = Object.entries(LOG_V14_METRICS).filter(([, item]) => !item.enhanced || capabilities.mode !== 'LEGACY')
  const pointInTime = (rca?.collections?.length || 0) === 1
  const topConsumer = pointInTime ? topObservedConsumer(resourceRows) : resourceRows[0] || null
  const trendTopConsumer = !pointInTime && verdict
    ? resourceRows.find((row) => row.host === verdict.topHost && row.workload === verdict.topWorkload) || topConsumer
    : topConsumer

  const selectHost = React.useCallback((hostName) => {
    setSelectedHost(hostName)
    const first = resourceRows.find((row) => row.host === hostName)
    if (first) setSelectedResource(first)
  }, [resourceRows])

  return <section className="logV2Shell"><div className="logV2Inner">
    <header className="logV2Header"><div><span className="logV141Kicker">SAP APPLICATION SERVER ANALYSIS</span><h1>LOG Analysis</h1></div><label className="logV2Upload"><input type="file" multiple accept=".zip,.log,.txt,.csv" onChange={(event) => upload(event.target.files)} />{busy ? 'Analyzing…' : 'Upload Logs'}</label></header>
    {status ? <div className="logV2StatusBar">{status}</div> : null}

    {!rca ? <div className="logV2EmptyState"><b>Upload log files</b><p>WP-SCOUT or Daily Check logs. Additional Linux telemetry is optional.</p></div> : <>
      <section className="logV2Stats logV2StatsCompact">
        <Stat label="Analysis" value={pointInTime ? 'POINT IN TIME' : 'TREND ANALYSIS'} meta={`${rca.collections.length} ${rca.collections.length === 1 ? 'collection' : 'collections'}`} />
        <Stat label="Period" value={`${shortTime(rca.evidenceWindow.start)} → ${shortTime(rca.evidenceWindow.end)}`} meta={pointInTime ? `${collectionSkew(rca.collections[0])} min collection window` : `${rca.cadence.nominalMinutes || '—'} min interval`} />
        <Stat label="Application Servers" value={rca.hosts.length} />
      </section>

      {!ranking && (pointInTime ? <PointInTimeSummary topRow={topConsumer} collection={selectedCollection} /> : <IncidentSummary verdict={verdict} topRow={trendTopConsumer} />)}

      {!pointInTime && <section className="logV2Panel">
        <div className="logV2PanelHead"><div><h2>Application Server Trend</h2><p>Resource trend by log timestamp.</p></div><div className="logV2MetricTabs">{visibleMetrics.map(([key, item]) => <button key={key} type="button" className={metric === key ? 'active' : ''} onClick={() => setMetric(key)}>{item.label}</button>)}</div></div>
        <React.Suspense fallback={<div className="logV2LandscapeChart logV2Empty" role="status">Loading trend…</div>}>
          <LandscapeResourceEChartV14 rca={rca} metric={metric} onSelectCollection={setSelectedCollectionKey} />
        </React.Suspense>
      </section>}

      {pointInTime ? <SnapshotStrip collection={selectedCollection} /> : null}

      <section className="logV2Panel">
        <div className="logV2PanelHead"><div><h2>Top Resource Consumers</h2><p>{pointInTime ? 'Jobs and ABAP programs observed in this collection.' : 'Jobs and ABAP programs observed across the selected period.'}</p></div></div>
        {ranking ? <div className="logV2Empty">Analyzing {analysis?.processes?.length || 0} process rows…</div> : <React.Suspense fallback={<div className="logV2Empty" role="status">Loading resource consumers…</div>}>
          <VirtualResourceTableV14 rows={resourceRows} selectedKey={selectedResource?.key || ''} onSelect={setSelectedResource} pointInTime={pointInTime} />
        </React.Suspense>}
      </section>

      {!ranking && <WorkloadDetail item={selectedResource} capabilities={capabilities} pointInTime={pointInTime} />}
      {!pointInTime && <ServerDetails rca={rca} collection={selectedCollection} selectedHost={selectedHostPeak?.host} onSelectHost={selectHost} />}
      <AnalyticsDiagnostics diagnostics={diagnostics} capabilities={capabilities} mapping={mapping} verdict={verdict} rca={rca} analysis={analysis} />
      <SourceAudit collections={rca.collections} />
    </>}
  </div></section>
}