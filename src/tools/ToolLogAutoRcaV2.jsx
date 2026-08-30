import React from 'react'
import { expandZipAwareFiles, fileExt } from './evidence-utils.js'
import { buildLogAnalysis, parseLogText } from './logAnalysis2026.js'
import { buildAutoPeakRca } from './logAutoPeak2026.js'
import { rankResourceConsumers } from './duckdbResourceAnalytics.js'
import VirtualResourceTable from './components/VirtualResourceTable.jsx'
import { LandscapeResourceEChart, WorkloadTrendEChart, LOG_V2_METRICS } from './components/LogLandscapeEChart.jsx'
import './LogAutoRcaV2.css'

const hasMetric = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
const num = (value, digits = 0) => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: digits })
const metricText = (value, digits = 0, suffix = '') => hasMetric(value) ? `${num(value, digits)}${suffix}` : '—'
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

function HostPeakSummary({ rca, selectedHost, onSelectHost }) {
  if (!rca?.hostPeaks?.length) return null
  return <section className="logV2Panel">
    <div className="logV2PanelHead"><div><h2>Application Server Peak Summary</h2><p>Each APP server is evaluated across the full uploaded evidence window. WP Critical can elevate a host to WARN, but resource CRIT requires CPU, RAM, load, or swap pressure.</p></div></div>
    <div className="logV2HostTableWrap"><table className="logV2HostTable"><thead><tr><th>Host</th><th>Status</th><th>Peak Pressure</th><th>Peak Time</th><th>Peak CPU</th><th>Peak RAM</th><th>Peak Load</th><th>Peak Swap</th><th>WP Critical</th></tr></thead><tbody>
      {rca.hostPeaks.map((item) => <tr key={item.host} className={selectedHost === item.host ? 'active' : ''} onClick={() => onSelectHost?.(item.host)}>
        <td><b>{item.host}</b></td><td><Status value={item.severity} /></td><td><b>{item.peakPressure}</b>/100</td><td>{shortTime(item.peakTime)}</td>
        <td>{metricText(item.metrics?.cpu?.value, 1, '%')}</td><td>{metricText(item.metrics?.ram?.value, 1, '%')}</td><td>{metricText(item.metrics?.load?.value, 2)}</td><td>{metricText(item.metrics?.swapIn?.value, 0, ' p/s')}</td><td>{metricText(item.metrics?.wpCritical?.value)}</td>
      </tr>)}
    </tbody></table></div>
  </section>
}

function SnapshotStrip({ collection }) {
  if (!collection) return null
  return <section className="logV2Panel logV2SnapshotPanel">
    <div className="logV2PanelHead"><div><h2>Selected Timestamp · {shortTime(collection.timeLabel)}</h2><p>Click any point on the landscape chart to inspect all APP servers at that time. Missing metrics remain unavailable instead of being converted to zero.</p></div><Status value={collection.severity} /></div>
    <div className="logV2SnapshotGrid">{collection.rows.map((row) => <article key={row.host}><div><b>{row.host}</b><Status value={row.severity} /></div><dl>
      <div><dt>CPU</dt><dd>{metricText(row.cpuPct, 1, '%')}</dd></div><div><dt>RAM</dt><dd>{metricText(row.memoryPct, 1, '%')}</dd></div><div><dt>Load/vCPU</dt><dd>{metricText(row.loadRatio, 2)}</dd></div><div><dt>Swap In</dt><dd>{metricText(row.swapIn, 0, ' p/s')}</dd></div><div><dt>WP Critical</dt><dd>{metricText(row.wpCritical)}</dd></div><div><dt>Pressure</dt><dd>{row.pressureScore}/100</dd></div>
    </dl></article>)}</div>
  </section>
}

function WorkloadDetail({ item }) {
  if (!item) return <section className="logV2Panel"><div className="logV2Empty">Select an observed workload from the investigation ranking.</div></section>
  const errorTone = item.errorState === 'NEW_AT_PEAK' ? 'critical' : item.errorState === 'PERSISTENT_AT_PEAK' ? 'warn' : 'neutral'
  return <section className="logV2Panel">
    <div className="logV2PanelHead"><div><span className="logV2Eyebrow">SELECTED OBSERVED RESOURCE CONSUMER</span><h2>{item.workload}</h2><p>{item.host} · {item.program} · host peak {shortTime(item.hostPeakTime)}</p></div><div className="logV2DetailBadges"><span className="logV2ScoreBadge">Priority {item.resourceScore}/100</span><span className={`logV2ErrorBadge ${errorTone}`}>{item.errorState}</span></div></div>
    <div className="logV2DetailGrid">
      <div className="logV2DetailFacts"><dl>
        <div><dt>Host-peak alignment</dt><dd>{item.peakCorrelation}%</dd></div><div><dt>Avg CPU</dt><dd>{metricText(item.avgCpu, 1, '%')}</dd></div><div><dt>Peak CPU</dt><dd>{metricText(item.peakCpu, 1, '%')}</dd></div><div><dt>Peak RSS</dt><dd>{metricText(item.peakRss, 2, ' GB')}</dd></div>
        <div><dt>D-state hits</dt><dd>{item.dStateHits}</dd></div><div><dt>Unique PIDs</dt><dd>{item.pidCount}</dd></div><div><dt>Evidence presence</dt><dd>{item.presenceCount}/{item.hostSampleCount || '—'}</dd></div><div><dt>First → last</dt><dd>{shortTime(item.firstSeen)} → {shortTime(item.lastSeen)}</dd></div>
        <div className="wide"><dt>Errors</dt><dd>{item.errors?.join(', ') || 'None'}</dd></div><div className="wide"><dt>New error at peak</dt><dd>{item.newPeakErrors?.join(', ') || 'None detected'}</dd></div>
      </dl></div>
      <WorkloadTrendEChart records={item.records} hostPeakTime={item.hostPeakTime} />
    </div>
    <div className="logV2Method"><b>Interpretation:</b> Investigation Score is a triage priority based on observed CPU, RSS relative to host memory, D-state, PID fan-out, and per-host persistence. Host-Peak Alignment shows whether the workload is heavy around its host peak; it is not a statistical correlation or root-cause probability. Errors remain supporting evidence.</div>
  </section>
}

function SourceAudit({ collections = [] }) {
  return <details className="logV2SourceAudit"><summary>Source Audit · evidence timestamp → source file</summary><div><table><thead><tr><th>#</th><th>Parsed timestamp</th><th>Hosts</th><th>Source file</th></tr></thead><tbody>{collections.map((item, index) => <tr key={item.key}><td>{index + 1}</td><td>{item.timeLabel}</td><td>{item.hostCount}</td><td>{item.fileName}</td></tr>)}</tbody></table></div></details>
}

export default function ToolLogAutoRcaV2() {
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('Upload WP-SCOUT / Daily Check logs. Analysis runs across the full evidence timeline automatically.')
  const [analysis, setAnalysis] = React.useState(null)
  const [rca, setRca] = React.useState(null)
  const [metric, setMetric] = React.useState('memoryPct')
  const [selectedTime, setSelectedTime] = React.useState('')
  const [selectedHost, setSelectedHost] = React.useState('')
  const [resourceRows, setResourceRows] = React.useState([])
  const [selectedResource, setSelectedResource] = React.useState(null)
  const [resourceEngine, setResourceEngine] = React.useState('WAITING')

  const rankResources = React.useCallback(async (nextAnalysis, nextRca) => {
    setResourceEngine('RANKING')
    const ranked = await rankResourceConsumers(nextAnalysis?.processes || [], nextRca?.hostPeaks || [], nextRca?.cadence?.nominalMinutes || 10, nextRca?.collections?.length || 1)
    setResourceRows(ranked.rows)
    setSelectedResource(ranked.rows[0] || null)
    setResourceEngine(ranked.engine)
  }, [])

  const upload = React.useCallback(async (list) => {
    setBusy(true)
    setStatus('Parsing logs in a Web Worker, sorting timestamps, finding APP peaks, and ranking observed resource consumers…')
    try {
      const expanded = (await expandZipAwareFiles(list, ['log', 'txt', 'csv'])).filter((file) => ['log', 'txt', 'csv'].includes(fileExt(file.name)))
      if (!expanded.length) throw new Error('No supported .log, .txt, or .csv files found.')
      const input = []
      for (const file of expanded) input.push({ name: file.name, text: await file.text() })
      let nextAnalysis
      try { nextAnalysis = await workerParse(input) } catch { nextAnalysis = buildLogAnalysis(input.map((item) => parseLogText(item.text, item.name))) }
      const nextRca = buildAutoPeakRca(nextAnalysis)
      if (!nextRca?.collections?.length) throw new Error('No host telemetry snapshots found in the uploaded logs.')
      setAnalysis(nextAnalysis)
      setRca(nextRca)
      setSelectedTime(nextRca.landscapePeak?.timeLabel || nextRca.collections[0]?.timeLabel || '')
      setSelectedHost(nextRca.hostPeaks?.[0]?.host || nextRca.hosts?.[0] || '')
      setResourceRows([])
      setSelectedResource(null)
      setStatus(`Parsed ${expanded.length} files · ${nextRca.collections.length} chronological collections · ${nextRca.hosts.length} application servers.`)
      await rankResources(nextAnalysis, nextRca)
    } catch (error) {
      setAnalysis(null); setRca(null); setResourceRows([]); setSelectedResource(null); setResourceEngine('FAILED')
      setStatus(error?.message || 'LOG analysis failed.')
    } finally {
      setBusy(false)
    }
  }, [rankResources])

  const selectedCollection = React.useMemo(() => rca?.collections?.find((item) => item.timeLabel === selectedTime) || rca?.landscapePeak || null, [rca, selectedTime])
  const selectedHostPeak = React.useMemo(() => rca?.hostPeaks?.find((item) => item.host === selectedHost) || rca?.hostPeaks?.[0] || null, [rca, selectedHost])
  const engineLabel = resourceEngine === 'RANKING' ? 'Ranking…' : resourceEngine.startsWith('DUCKDB') ? 'DuckDB-WASM' : resourceEngine.startsWith('JS_FALLBACK') ? 'JS fallback' : resourceEngine
  const ranking = resourceEngine === 'RANKING'

  return <section className="logV2Shell"><div className="logV2Inner">
    <header className="logV2Header"><div><span className="logV2Eyebrow">TIME-FIRST · LANDSCAPE RCA</span><h1>LOG Analysis</h1><p>Upload once. The workspace sorts the full timeline, finds APP1–APP5 peaks, then ranks workloads observed in WP-SCOUT evidence by resource consumption and host-peak alignment.</p></div><label className="logV2Upload"><input type="file" multiple accept=".zip,.log,.txt,.csv" onChange={(event) => upload(event.target.files)} />{busy ? 'Analyzing…' : 'Upload Logs'}</label></header>

    <div className={`logV2StatusBar ${rca ? 'ready' : ''}`}>{status}</div>

    {!rca ? <div className="logV2EmptyState"><b>Automatic investigation flow</b><span>Upload → sort time → APP1–APP5 full graph → host peaks → observed workloads ranked → error correlation</span><p>No host, incident, From/To, or workload-scope selection is required.</p></div> : <>
      <section className="logV2Stats">
        <Stat label="Evidence" value={`${rca.collections.length} collections`} meta={`${rca.evidenceWindow?.fileCount || rca.collections.length} log files`} />
        <Stat label="Application servers" value={rca.hosts.length} meta={rca.hosts.join(' · ')} />
        <Stat label="Full time range" value={`${shortTime(rca.evidenceWindow?.start)} → ${shortTime(rca.evidenceWindow?.end)}`} meta={`${rca.cadence?.nominalMinutes || '—'}-min cadence`} />
        <Stat label="Landscape peak" value={shortTime(rca.landscapePeak?.timeLabel)} meta={`${rca.landscapePeak?.elevated || 0}/${rca.landscapePeak?.hostCount || 0} elevated · ${rca.landscapePeak?.crit || 0} CRIT`} tone={(rca.landscapePeak?.crit || 0) > 0 ? 'critical' : ''} />
        <Stat label="Resource engine" value={engineLabel} meta={ranking ? `${analysis?.processes?.length || 0} process records parsed` : `${resourceRows.length} observed workloads ranked`} />
      </section>

      <section className="logV2Panel">
        <div className="logV2PanelHead"><div><h2>APP1–APP5 Full Evidence Timeline</h2><p>All uploaded timestamps are shown. MAX markers are per-host peaks; the dashed line is the landscape peak. Drag the zoom bar instead of choosing From/To.</p></div><div className="logV2MetricTabs">{Object.entries(LOG_V2_METRICS).map(([key, item]) => <button key={key} type="button" className={metric === key ? 'active' : ''} onClick={() => setMetric(key)}>{item.label}</button>)}</div></div>
        <LandscapeResourceEChart rca={rca} metric={metric} onSelectTime={setSelectedTime} />
      </section>

      <SnapshotStrip collection={selectedCollection} />
      <HostPeakSummary rca={rca} selectedHost={selectedHostPeak?.host} onSelectHost={(hostName) => {
        setSelectedHost(hostName)
        const first = resourceRows.find((row) => row.host === hostName)
        if (first) setSelectedResource(first)
      }} />

      <section className="logV2Panel">
        <div className="logV2PanelHead"><div><h2>Observed Workloads · Ranked for Investigation</h2><p>Full evidence window, all APP servers. Only workloads present in uploaded WP-SCOUT top-process evidence can be ranked; absence here does not prove a workload was not running.</p></div><div className="logV2Legend"><span><i className="resource" /> investigation priority</span><span><i className="peak" /> host-peak alignment</span><span><i className="error" /> error timing</span></div></div>
        {ranking ? <div className="logV2Empty"><b>Ranking observed workloads…</b><br />Parsed {analysis?.processes?.length || 0} process records. The table will appear when the resource engine finishes.</div> : <VirtualResourceTable rows={resourceRows} selectedKey={selectedResource?.key || ''} onSelect={setSelectedResource} />}
      </section>

      {!ranking && <WorkloadDetail item={selectedResource} />}
      <SourceAudit collections={rca.collections} />
    </>}
  </div></section>
}
