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

function SnapshotStrip({ collection }) {
  if (!collection) return null
  const range = collection.endTime && collection.endTime !== collection.timeLabel ? `${shortTime(collection.timeLabel)} → ${shortTime(collection.endTime)}` : shortTime(collection.timeLabel)
  return <section className="logV2Panel logV2SnapshotPanel">
    <div className="logV2PanelHead"><div><h2>Selected Collection · {range}</h2><p>One logical collection groups APP samples captured in the same evidence cycle. Each card retains its actual host sample timestamp.</p></div><Status value={collection.severity} /></div>
    <div className="logV2SnapshotGrid">{collection.rows.map((row) => <article key={row.host}><div><b>{row.host}</b><Status value={row.severity} /></div><small>sample {shortTime(row.timeLabel || row.snapshot)} · resource {row.resourceSeverity}</small><dl>
      <div><dt>CPU</dt><dd>{metricText(row.cpuPct, 1, '%')}</dd></div><div><dt>RAM</dt><dd>{metricText(row.memoryPct, 1, '%')}</dd></div><div><dt>Load/vCPU</dt><dd>{metricText(row.loadRatio, 2)}</dd></div><div><dt>Swap In</dt><dd>{metricText(row.swapIn, 0, ' p/s')}</dd></div><div><dt>WP Critical</dt><dd>{metricText(row.wpCritical)}</dd></div><div><dt>Resource pressure</dt><dd>{row.resourcePressure}/100</dd></div>
    </dl></article>)}</div>
  </section>
}

function HostPeakSummary({ rca, selectedHost, onSelectHost }) {
  if (!rca?.hostPeaks?.length) return null
  return <section className="logV2Panel">
    <div className="logV2PanelHead"><div><h2>Application Server Resource Peak Summary</h2><p>Resource peak excludes WP-only warnings. Operational status still includes WP Critical. Sustained pressure shows the strongest consecutive resource-elevated run.</p></div></div>
    <div className="logV2HostTableWrap"><table className="logV2HostTable"><thead><tr><th>Host</th><th>Operational</th><th>Resource</th><th>Resource Peak</th><th>Peak Time</th><th>Sustained</th><th>Max CPU</th><th>Max RAM</th><th>Max Load</th><th>Max Swap</th><th>Max WP Critical</th></tr></thead><tbody>
      {rca.hostPeaks.map((item) => <tr key={item.host} className={selectedHost === item.host ? 'active' : ''} onClick={() => onSelectHost?.(item.host)}>
        <td><b>{item.host}</b></td><td><Status value={item.severity} /></td><td><Status value={item.resourceSeverity} /></td><td><b>{item.peakPressure}</b>/100</td><td>{shortTime(item.peakTime)}</td>
        <td title={`${item.sustained?.sustainedMinutes || 0} min observed span · pressure AUC ${item.sustained?.pressureAuc || 0}`}>{item.sustained?.sustainedScore || 0}/100 · {item.sustained?.sustainedSamples || 0}x</td>
        <td title={item.metrics?.cpu?.timeLabel || ''}>{metricText(item.metrics?.cpu?.value, 1, '%')}</td><td title={item.metrics?.ram?.timeLabel || ''}>{metricText(item.metrics?.ram?.value, 1, '%')}</td><td title={item.metrics?.load?.timeLabel || ''}>{metricText(item.metrics?.load?.value, 2)}</td><td title={item.metrics?.swapIn?.timeLabel || ''}>{metricText(item.metrics?.swapIn?.value, 0, ' p/s')}</td><td title={item.metrics?.wpCritical?.timeLabel || ''}>{metricText(item.metrics?.wpCritical?.value)}</td>
      </tr>)}
    </tbody></table></div>
  </section>
}

function errorTone(value = '') {
  if (value === 'NEW_AT_PEAK') return 'critical'
  if (value === 'NEW_BEFORE_PEAK' || value === 'PERSISTENT_NEAR_PEAK') return 'warn'
  return 'neutral'
}

function WorkloadDetail({ item }) {
  if (!item) return <section className="logV2Panel"><div className="logV2Empty">Select an observed workload from the investigation ranking.</div></section>
  const timingText = item.errorTimings?.map((entry) => `${entry.error}: ${entry.state}${entry.deltaCollections === null ? '' : ` (Δ${entry.deltaCollections >= 0 ? '+' : ''}${entry.deltaCollections})`}`).join(' · ') || 'None'
  return <section className="logV2Panel">
    <div className="logV2PanelHead"><div><span className="logV2Eyebrow">SELECTED AGGREGATED WORKLOAD</span><h2>{item.workload}</h2><p>{item.host} · {item.program} · host resource peak {shortTime(item.hostPeakTime)}</p></div><div className="logV2DetailBadges"><span className="logV2ScoreBadge">Priority {item.resourceScore}/100</span><span className={`logV2ErrorBadge ${errorTone(item.errorState)}`}>{item.errorState}</span></div></div>
    <div className="logV2DetailGrid">
      <div className="logV2DetailFacts"><dl>
        <div><dt>Host-peak alignment</dt><dd>{metricText(item.peakCorrelation, 0, '%')}</dd></div><div><dt>Avg CPU Σ (observed)</dt><dd>{metricText(item.avgCpu, 1, '%')}</dd></div><div><dt>Peak CPU Σ</dt><dd>{metricText(item.peakCpu, 1, '%')}</dd></div><div><dt>Peak ΣRSS upper bound</dt><dd>{metricText(item.peakRss, 2, ' GB')}</dd></div>
        <div><dt>Max PID RSS</dt><dd>{metricText(item.peakMaxPidRss, 2, ' GB')}</dd></div><div><dt>D-state hits</dt><dd>{item.dStateHits}</dd></div><div><dt>Peak concurrent PIDs</dt><dd>{item.peakConcurrentPids}</dd></div><div><dt>Unique PIDs / window</dt><dd>{item.uniquePidCount}</dd></div>
        <div><dt>Evidence presence</dt><dd>{item.presenceCount}/{item.hostSampleCount || '—'}</dd></div><div><dt>First → last</dt><dd>{shortTime(item.firstSeen)} → {shortTime(item.lastSeen)}</dd></div><div className="wide"><dt>Errors</dt><dd>{item.errors?.join(', ') || 'None'}</dd></div><div className="wide"><dt>Error timing vs host peak</dt><dd>{timingText}</dd></div>
      </dl></div>
      <WorkloadTrendEChart records={item.samples} hostPeakTime={item.hostPeakTime} hostPeakCollectionKey={item.hostPeakCollectionKey} aggregated />
    </div>
    <div className="logV2Method"><b>Interpretation:</b> CPU is workload aggregate across observed concurrent PIDs. ΣRSS is an upper-bound signal because Linux RSS can double-count shared pages; the score therefore uses Max PID RSS as the primary memory signal and gives ΣRSS reduced weight. Missing metrics and unavailable alignment remain N/A. Error timing distinguishes before, exact, and after the host resource peak.</div>
  </section>
}

function SourceAudit({ collections = [] }) {
  return <details className="logV2SourceAudit"><summary>Source Audit · logical collection → host sample timestamps → file</summary><div><table><thead><tr><th>#</th><th>Collection</th><th>Host samples</th><th>Source file</th></tr></thead><tbody>{collections.map((item, index) => <tr key={item.key}><td>{index + 1}</td><td>{item.timeLabel}{item.endTime !== item.timeLabel ? ` → ${item.endTime}` : ''}</td><td>{item.rows.map((row) => `${row.host}@${row.timeLabel || row.snapshot}`).join(' · ')}</td><td>{item.fileName}</td></tr>)}</tbody></table></div></details>
}

export default function ToolLogAutoRcaV3() {
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('Upload WP-SCOUT / Daily Check logs. The v3.1 engine validates evidence, builds logical capture cycles, then ranks only confidently mapped workloads.')
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
    setStatus('Parsing evidence → schema validation → logical collections → resource peaks → workload aggregation…')
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
  const engineLabel = ranking ? 'Ranking…' : resourceEngine.startsWith('DUCKDB') ? 'DuckDB-WASM v3.1' : resourceEngine.startsWith('JS_FALLBACK') ? 'JS fallback v3.1' : resourceEngine
  const mappingMeta = ranking ? `${analysis?.processes?.length || 0} validated process records` : `EXACT ${mapping.counts.EXACT || 0} · ≤2m ${mapping.counts.NEAREST_2M || 0} · ≤5m ${mapping.counts.NEAREST_5M || 0} · unmapped ${mapping.counts.UNMAPPED || 0}`

  return <section className="logV2Shell"><div className="logV2Inner">
    <header className="logV2Header"><div><span className="logV2Eyebrow">DETERMINISTIC · ACCURACY-HARDENED RCA</span><h1>LOG Analysis</h1><p>Logical capture cycles group APP1–APP5 before host peaks and workload aggregation. Resource and operational peaks are separated, workload mapping is confidence-bounded, and RSS scoring avoids treating ΣRSS as physical memory.</p></div><label className="logV2Upload"><input type="file" multiple accept=".zip,.log,.txt,.csv" onChange={(event) => upload(event.target.files)} />{busy ? 'Analyzing…' : 'Upload Logs'}</label></header>
    <div className={`logV2StatusBar ${rca ? 'ready' : ''}`}>{status}</div>

    {!rca ? <div className="logV2EmptyState"><b>Deterministic investigation flow</b><span>Upload → validate → logical collections → resource/operational peaks → bounded process mapping → aggregate concurrent PIDs → rank observed workloads</span><p>Missing metrics stay null, unmapped rows are excluded from ranking, and ΣRSS is treated as an upper-bound signal.</p></div> : <>
      <section className="logV2Stats">
        <Stat label="Evidence" value={`${rca.collections.length} collections`} meta={`${rca.evidenceWindow.fileCount} source files · rejects ${(rca.quality?.telemetryRejected || 0) + (rca.quality?.processRejected || 0)}`} />
        <Stat label="Application servers" value={rca.hosts.length} meta={rca.hosts.join(' · ')} />
        <Stat label="Full time range" value={`${shortTime(rca.evidenceWindow.start)} → ${shortTime(rca.evidenceWindow.end)}`} meta={`${rca.cadence.nominalMinutes || '—'}-min collection cadence`} />
        <Stat label="Resource / operational peaks" value={`R ${shortTime(rca.resourceLandscapePeak?.timeLabel)} · O ${shortTime(rca.operationalLandscapePeak?.timeLabel)}`} meta={`resource ${rca.resourceLandscapePeak?.resourceElevated || 0}/${rca.resourceLandscapePeak?.hostCount || 0} · operational ${rca.operationalLandscapePeak?.elevated || 0}/${rca.operationalLandscapePeak?.hostCount || 0}`} tone={(rca.resourceLandscapePeak?.resourceCrit || 0) > 0 ? 'critical' : ''} />
        <Stat label="Resource engine" value={engineLabel} meta={mappingMeta} />
      </section>

      <section className="logV2Panel">
        <div className="logV2PanelHead"><div><h2>APP1–APP5 Logical Collection Timeline</h2><p>Each x-axis point is one capture cycle, not one host timestamp. Resource and operational landscape peaks are marked separately when they differ.</p></div><div className="logV2MetricTabs">{Object.entries(LOG_V2_METRICS).map(([key, item]) => <button key={key} type="button" className={metric === key ? 'active' : ''} onClick={() => setMetric(key)}>{item.label}</button>)}</div></div>
        <LandscapeResourceEChart rca={rca} metric={metric} onSelectCollection={setSelectedCollectionKey} />
      </section>

      <SnapshotStrip collection={selectedCollection} />
      <HostPeakSummary rca={rca} selectedHost={selectedHostPeak?.host} onSelectHost={(hostName) => {
        setSelectedHost(hostName)
        const first = resourceRows.find((row) => row.host === hostName)
        if (first) setSelectedResource(first)
      }} />

      <section className="logV2Panel">
        <div className="logV2PanelHead"><div><h2>Observed Workloads · Aggregated & Ranked</h2><p>CPU is aggregate across observed concurrent PIDs. ΣRSS is an upper-bound signal; Max PID RSS is the primary memory-ranking input. Only EXACT / ≤5-minute mapped evidence enters ranking.</p></div><div className="logV2Legend"><span><i className="resource" /> investigation priority</span><span><i className="peak" /> host-peak alignment</span><span><i className="error" /> error timing</span></div></div>
        {ranking ? <div className="logV2Empty"><b>Aggregating workload snapshots in DuckDB…</b><br />Parsed {analysis?.processes?.length || 0} validated process rows.</div> : <VirtualResourceTable rows={resourceRows} selectedKey={selectedResource?.key || ''} onSelect={setSelectedResource} />}
      </section>

      {!ranking && <WorkloadDetail item={selectedResource} />}
      <SourceAudit collections={rca.collections} />
    </>}
  </div></section>
}
