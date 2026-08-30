import React from 'react'
import { expandZipAwareFiles, fileExt } from './evidence-utils.js'
import { buildLogAnalysis, parseLogText } from './logAnalysis2026.js'
import { buildAutoPeakRcaV3 } from './logRcaEngineV3.js'
import { rankResourceConsumersV3 } from './workloadAnalyticsV3.js'
import VirtualResourceTable from './components/VirtualResourceTable.jsx'
import { LandscapeResourceEChart, WorkloadTrendEChart, LOG_V2_METRICS } from './components/LogLandscapeEChart.jsx'
import './LogAutoRcaV2.css'

const hasMetric = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
const fmt = (value, digits = 0) => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: digits })
const metricText = (value, digits = 0, suffix = '') => hasMetric(value) ? `${fmt(value, digits)}${suffix}` : '—'
const shortTime = (value = '') => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}:\d{2})$/)
  return match ? `${match[2]}-${match[3]} ${match[4]}` : value || '—'
}

function workerParse(files) {
  return new Promise((resolve, reject) => {
    if (typeof Worker === 'undefined') return reject(new Error('Worker unavailable'))
    const worker = new Worker(new URL('./workers/logParser.worker.js', import.meta.url), { type: 'module' })
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

function SnapshotStrip({ collection, incidentKey }) {
  if (!collection) return null
  const range = collection.endTime && collection.endTime !== collection.timeLabel ? `${shortTime(collection.timeLabel)} → ${shortTime(collection.endTime)}` : shortTime(collection.timeLabel)
  const incident = collection.key === incidentKey
  return <section className="logV2Panel logV2SnapshotPanel">
    <div className="logV2PanelHead"><div><h2>Selected Collection · {range}{incident ? ' · RESOURCE INCIDENT TARGET' : ''}</h2><p>Each card retains its actual host timestamp. Workload ranking is anchored to the automatic resource-landscape incident target, not to unrelated per-host maxima.</p></div><Status value={collection.severity} /></div>
    <div className="logV2SnapshotGrid">{collection.rows.map((row) => <article key={row.host}><div><b>{row.host}</b><Status value={row.severity} /></div><small>sample {shortTime(row.timeLabel || row.snapshot)} · resource {row.resourceSeverity} · coverage {row.resourceCoverage?.observed ?? 0}/4</small><dl>
      <div><dt>CPU</dt><dd>{metricText(row.cpuPct, 1, '%')}</dd></div><div><dt>RAM</dt><dd>{metricText(row.memoryPct, 1, '%')}</dd></div><div><dt>Load1/vCPU</dt><dd>{metricText(row.resourceLoadRatio, 2)}</dd></div><div><dt>Swap In</dt><dd>{metricText(row.swapIn, 0, ' p/s')}</dd></div><div><dt>WP Critical</dt><dd>{metricText(row.wpCritical)}</dd></div><div><dt>Calibrated pressure</dt><dd>{row.resourcePressure}/100</dd></div>
    </dl></article>)}</div>
  </section>
}

function HostPeakSummary({ rca, selectedHost, onSelectHost }) {
  if (!rca?.hostPeaks?.length) return null
  return <section className="logV2Panel">
    <div className="logV2PanelHead"><div><h2>Application Server Resource Peak Summary</h2><p>Instantaneous pressure prefers Load1/vCPU; Load15 remains context only. Resource severity outranks a merely high normal-pressure score. Sustained requires duration, while two points are labeled a short burst.</p></div></div>
    <div className="logV2HostTableWrap"><table className="logV2HostTable"><thead><tr><th>Host</th><th>Operational</th><th>Resource</th><th>Resource Peak</th><th>Peak Time</th><th>Run</th><th>Max CPU</th><th>Max RAM</th><th>Max Load1</th><th>Max Swap</th><th>Max WP Critical</th></tr></thead><tbody>
      {rca.hostPeaks.map((item) => <tr key={item.host} className={selectedHost === item.host ? 'active' : ''} onClick={() => onSelectHost?.(item.host)}>
        <td><b>{item.host}</b></td><td><Status value={item.severity} /></td><td><Status value={item.resourceSeverity} /></td><td><b>{item.peakPressure}</b>/100</td><td>{shortTime(item.peakTime)}</td>
        <td title={`${item.sustained?.sustainedMinutes || 0} min span · ${item.sustained?.sustainedSamples || 0} samples · AUC ${item.sustained?.pressureAuc || 0}`}>{item.sustained?.sustainedClass || 'NONE'} · {item.sustained?.sustainedScore || 0}</td>
        <td title={item.metrics?.cpu?.timeLabel || ''}>{metricText(item.metrics?.cpu?.value, 1, '%')}</td><td title={item.metrics?.ram?.timeLabel || ''}>{metricText(item.metrics?.ram?.value, 1, '%')}</td><td title={item.metrics?.load?.timeLabel || ''}>{metricText(item.metrics?.load?.value, 2)}</td><td title={item.metrics?.swapIn?.timeLabel || ''}>{metricText(item.metrics?.swapIn?.value, 0, ' p/s')}</td><td title={item.metrics?.wpCritical?.timeLabel || ''}>{metricText(item.metrics?.wpCritical?.value)}</td>
      </tr>)}
    </tbody></table></div>
  </section>
}

function errorTone(value = '') {
  if (value === 'NEW_AT_TARGET') return 'critical'
  if (value === 'NEW_BEFORE_TARGET' || value === 'PERSISTENT_NEAR_TARGET') return 'warn'
  return 'neutral'
}

function signed(value, digits = 1, suffix = '') {
  if (!hasMetric(value)) return '—'
  const number = Number(value)
  return `${number > 0 ? '+' : ''}${fmt(number, digits)}${suffix}`
}

function WorkloadDetail({ item }) {
  if (!item) return <section className="logV2Panel"><div className="logV2Empty">Select an observed workload from the incident-relevance ranking.</div></section>
  const timingText = item.errorTimings?.map((entry) => `${entry.error}: ${entry.state}${entry.deltaMinutes === null ? '' : ` (${signed(entry.deltaMinutes, 0, 'm')})`}`).join(' · ') || 'None'
  const breakdown = item.scoreBreakdown || {}
  return <section className="logV2Panel">
    <div className="logV2PanelHead"><div><span className="logV2Eyebrow">SELECTED INCIDENT-RELATIVE WORKLOAD</span><h2>{item.workload}</h2><p>{item.host} · {item.program} · landscape resource target {shortTime(item.targetTime)} · host resource {item.targetHostSeverity}</p></div><div className="logV2DetailBadges"><span className="logV2ScoreBadge">Incident {item.incidentScore}/100</span><span className="logV2ScoreBadge">Footprint {item.footprintScore}/100</span><span className={`logV2ErrorBadge ${errorTone(item.errorState)}`}>{item.errorState}</span></div></div>
    <div className="logV2DetailGrid">
      <div className="logV2DetailFacts"><dl>
        <div><dt>Target evidence</dt><dd>{item.targetEvidence}{item.targetDeltaCollections ? ` Δ${item.targetDeltaCollections > 0 ? '+' : ''}${item.targetDeltaCollections}` : ''}</dd></div><div><dt>Incident alignment</dt><dd>{metricText(item.incidentAlignment, 0, '%')}</dd></div>
        <div><dt>CPU Σ @ incident</dt><dd>{metricText(item.targetCpu, 1, '%')}</dd></div><div><dt>Max PID RSS @ incident</dt><dd>{metricText(item.targetMaxPidRss, 2, ' GB')}</dd></div>
        <div><dt>ΣRSS @ incident upper</dt><dd>{metricText(item.targetRss, 2, ' GB')}</dd></div><div><dt>D-state / PIDs @ incident</dt><dd>{hasMetric(item.targetDState) ? `${item.targetDState} / ${item.targetConcurrentPids}` : '—'}</dd></div>
        <div><dt>CPU contribution estimate</dt><dd>{metricText(item.cpuContributionPct, 1, '%')}</dd></div><div><dt>Memory lower-bound contribution</dt><dd>{metricText(item.memoryLowerContributionPct, 1, '%')}</dd></div>
        <div><dt>CPU baseline median</dt><dd>{metricText(item.cpuBaseline?.median, 1, '%')}</dd></div><div><dt>Max PID RSS baseline</dt><dd>{metricText(item.rssBaseline?.median, 2, ' GB')}</dd></div>
        <div><dt>CPU uplift vs baseline</dt><dd>{signed(item.cpuUplift?.delta, 1, '%')} · z {metricText(item.cpuUplift?.z, 1)}</dd></div><div><dt>RSS uplift vs baseline</dt><dd>{signed(item.rssUplift?.delta, 2, ' GB')} · z {metricText(item.rssUplift?.z, 1)}</dd></div>
        <div><dt>Window peak CPU Σ</dt><dd>{metricText(item.peakCpu, 1, '%')}</dd></div><div><dt>Window max PID RSS</dt><dd>{metricText(item.peakMaxPidRss, 2, ' GB')}</dd></div>
        <div><dt>Observed presence</dt><dd>{item.presenceCount}/{item.hostSampleCount || '—'}</dd></div><div><dt>First → last</dt><dd>{shortTime(item.firstSeen)} → {shortTime(item.lastSeen)}</dd></div>
        <div className="wide"><dt>Score components</dt><dd>contribution {fmt(breakdown.contribution, 1)} · uplift {fmt(breakdown.uplift, 1)} · blocked {fmt(breakdown.blocked, 1)} · temporal {fmt(breakdown.temporal, 1)} · persistence {fmt(breakdown.persistence, 1)} · error {fmt(breakdown.error, 1)} · host pressure {fmt(breakdown.hostPressure, 1)} · event multiplier {fmt(breakdown.eventWeight, 2)}</dd></div>
        <div className="wide"><dt>Errors</dt><dd>{item.errors?.join(', ') || 'None'}</dd></div><div className="wide"><dt>Error timing vs landscape incident</dt><dd>{timingText}</dd></div>
      </dl></div>
      <WorkloadTrendEChart records={item.samples} targetTime={item.targetTime} targetCollectionKey={item.targetCollectionKey} aggregated />
    </div>
    <div className="logV2Method"><b>Interpretation:</b> Incident Score is anchored to the automatic resource-landscape peak. It combines host-relative CPU/memory contribution at that target, robust uplift versus the workload baseline, D-state evidence when load/swap pressure supports blocking, temporal evidence quality, and small supporting persistence/error terms. Hosts that are resource-normal at the landscape incident are down-weighted. Full-window Footprint is context only. Max PID RSS is the lower-bound memory signal; ΣRSS remains an upper bound because shared Linux pages can be counted in multiple PIDs.</div>
  </section>
}

function SourceAudit({ collections = [] }) {
  return <details className="logV2SourceAudit"><summary>Source Audit · logical collection → host sample timestamps → file</summary><div><table><thead><tr><th>#</th><th>Collection</th><th>Host samples</th><th>Source file</th></tr></thead><tbody>{collections.map((item, index) => <tr key={item.key}><td>{index + 1}</td><td>{item.timeLabel}{item.endTime !== item.timeLabel ? ` → ${item.endTime}` : ''}</td><td>{item.rows.map((row) => `${row.host}@${row.timeLabel || row.snapshot}`).join(' · ')}</td><td>{item.fileName}</td></tr>)}</tbody></table></div></details>
}

export default function ToolLogAutoRcaV3() {
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('Upload WP-SCOUT / Daily Check logs. The v3.2 engine calibrates Load1-based host pressure and ranks workloads against the automatic landscape resource incident.')
  const [analysis, setAnalysis] = React.useState(null)
  const [rca, setRca] = React.useState(null)
  const [metric, setMetric] = React.useState('memoryPct')
  const [selectedCollectionKey, setSelectedCollectionKey] = React.useState('')
  const [selectedHost, setSelectedHost] = React.useState('')
  const [resourceRows, setResourceRows] = React.useState([])
  const [selectedResource, setSelectedResource] = React.useState(null)
  const [resourceEngine, setResourceEngine] = React.useState('WAITING')
  const [mapping, setMapping] = React.useState({ mappedRows: 0, unmappedRows: 0, counts: { EXACT: 0, NEAREST_2M: 0, NEAREST_5M: 0, UNMAPPED: 0 } })

  const rankResources = React.useCallback(async (nextAnalysis, nextRca) => {
    setResourceEngine('RANKING')
    const ranked = await rankResourceConsumersV3(nextAnalysis?.processes || [], nextRca)
    setResourceRows(ranked.rows)
    setSelectedResource(ranked.rows[0] || null)
    setResourceEngine(ranked.engine)
    setMapping({ mappedRows: ranked.mappedRows || 0, unmappedRows: ranked.unmappedRows || 0, counts: ranked.mappingCounts || { EXACT: 0, NEAREST_2M: 0, NEAREST_5M: 0, UNMAPPED: 0 } })
  }, [])

  const upload = React.useCallback(async (list) => {
    setBusy(true)
    setStatus('Parsing evidence → schema validation → calibrated Load1 resource peaks → incident-relative workload aggregation…')
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
      setAnalysis(nextAnalysis); setRca(nextRca)
      setSelectedCollectionKey(nextRca.resourceLandscapePeak?.key || nextRca.collections[0]?.key || '')
      setSelectedHost(nextRca.hostPeaks?.[0]?.host || nextRca.hosts?.[0] || '')
      setResourceRows([]); setSelectedResource(null); setMapping({ mappedRows: 0, unmappedRows: 0, counts: { EXACT: 0, NEAREST_2M: 0, NEAREST_5M: 0, UNMAPPED: 0 } })
      const rejected = (nextRca.quality?.telemetryRejected || 0) + (nextRca.quality?.processRejected || 0)
      setStatus(`Parsed ${expanded.length} files · ${nextRca.collections.length} logical collections · ${nextRca.hosts.length} application servers · schema rejects ${rejected}.`)
      await rankResources(nextAnalysis, nextRca)
    } catch (error) {
      setAnalysis(null); setRca(null); setResourceRows([]); setSelectedResource(null); setResourceEngine('FAILED')
      setStatus(error?.message || 'LOG analysis failed.')
    } finally { setBusy(false) }
  }, [rankResources])

  const selectedCollection = React.useMemo(() => rca?.collections?.find((item) => item.key === selectedCollectionKey) || rca?.resourceLandscapePeak || null, [rca, selectedCollectionKey])
  const selectedHostPeak = React.useMemo(() => rca?.hostPeaks?.find((item) => item.host === selectedHost) || rca?.hostPeaks?.[0] || null, [rca, selectedHost])
  const ranking = resourceEngine === 'RANKING'
  const engineLabel = ranking ? 'Ranking…' : resourceEngine.startsWith('DUCKDB') ? 'DuckDB-WASM v3.2' : resourceEngine.startsWith('JS_FALLBACK') ? 'JS fallback v3.2' : resourceEngine
  const mappingMeta = ranking ? `${analysis?.processes?.length || 0} validated process records` : `EXACT ${mapping.counts.EXACT || 0} · ≤2m ${mapping.counts.NEAREST_2M || 0} · ≤5m ${mapping.counts.NEAREST_5M || 0} · unmapped ${mapping.counts.UNMAPPED || 0}`

  return <section className="logV2Shell"><div className="logV2Inner">
    <header className="logV2Header"><div><span className="logV2Eyebrow">DETERMINISTIC · INCIDENT-RELATIVE RCA</span><h1>LOG Analysis</h1><p>The engine detects logical APP1–APP5 capture cycles, calibrates instantaneous resource pressure using Load1/vCPU, selects one automatic landscape resource incident, then ranks workloads by their evidence at that incident instead of unrelated full-window maxima.</p></div><label className="logV2Upload"><input type="file" multiple accept=".zip,.log,.txt,.csv" onChange={(event) => upload(event.target.files)} />{busy ? 'Analyzing…' : 'Upload Logs'}</label></header>
    <div className={`logV2StatusBar ${rca ? 'ready' : ''}`}>{status}</div>

    {!rca ? <div className="logV2EmptyState"><b>Incident-relative investigation flow</b><span>Upload → validate → logical collections → Load1-calibrated landscape incident → bounded process mapping → aggregate concurrent PIDs → baseline/uplift → incident ranking</span><p>Absence is never converted to zero, resource-normal hosts are down-weighted at the incident, and full-window footprint is separated from incident relevance.</p></div> : <>
      <section className="logV2Stats">
        <Stat label="Evidence" value={`${rca.collections.length} collections`} meta={`${rca.evidenceWindow.fileCount} source files · rejects ${(rca.quality?.telemetryRejected || 0) + (rca.quality?.processRejected || 0)}`} />
        <Stat label="Application servers" value={rca.hosts.length} meta={rca.hosts.join(' · ')} />
        <Stat label="Full time range" value={`${shortTime(rca.evidenceWindow.start)} → ${shortTime(rca.evidenceWindow.end)}`} meta={`${rca.cadence.nominalMinutes || '—'}-min collection cadence`} />
        <Stat label="Incident target / operational peak" value={`R ${shortTime(rca.resourceLandscapePeak?.timeLabel)} · O ${shortTime(rca.operationalLandscapePeak?.timeLabel)}`} meta={`resource ${rca.resourceLandscapePeak?.resourceElevated || 0}/${rca.resourceLandscapePeak?.hostCount || 0} · operational ${rca.operationalLandscapePeak?.elevated || 0}/${rca.operationalLandscapePeak?.hostCount || 0}`} tone={(rca.resourceLandscapePeak?.resourceCrit || 0) > 0 ? 'critical' : ''} />
        <Stat label="Resource engine" value={engineLabel} meta={mappingMeta} />
      </section>

      <section className="logV2Panel">
        <div className="logV2PanelHead"><div><h2>APP1–APP5 Logical Collection Timeline</h2><p>Load1/vCPU is used for instantaneous pressure; Load15/vCPU can be inspected separately. Clicking the timeline inspects another collection, while ranking remains anchored to the automatic resource incident.</p></div><div className="logV2MetricTabs">{Object.entries(LOG_V2_METRICS).map(([key, item]) => <button key={key} type="button" className={metric === key ? 'active' : ''} onClick={() => setMetric(key)}>{item.label}</button>)}</div></div>
        <LandscapeResourceEChart rca={rca} metric={metric} onSelectCollection={setSelectedCollectionKey} />
      </section>

      <SnapshotStrip collection={selectedCollection} incidentKey={rca.resourceLandscapePeak?.key} />
      <HostPeakSummary rca={rca} selectedHost={selectedHostPeak?.host} onSelectHost={(hostName) => {
        setSelectedHost(hostName)
        const first = resourceRows.find((row) => row.host === hostName)
        if (first) setSelectedResource(first)
      }} />

      <section className="logV2Panel">
        <div className="logV2PanelHead"><div><h2>Observed Workloads · Incident-Relevance Ranking</h2><p>Primary ranking answers: “which observed workload best explains the automatic landscape resource incident?” Full-window footprint is shown separately so an off-incident heavy workload cannot win only because it was large at another time.</p></div><div className="logV2Legend"><span><i className="resource" /> incident relevance</span><span><i className="peak" /> baseline uplift</span><span><i className="error" /> supporting error timing</span></div></div>
        {ranking ? <div className="logV2Empty"><b>Aggregating incident-relative workload evidence in DuckDB…</b><br />Parsed {analysis?.processes?.length || 0} validated process rows.</div> : <VirtualResourceTable rows={resourceRows} selectedKey={selectedResource?.key || ''} onSelect={setSelectedResource} />}
      </section>

      {!ranking && <WorkloadDetail item={selectedResource} />}
      <SourceAudit collections={rca.collections} />
    </>}
  </div></section>
}
