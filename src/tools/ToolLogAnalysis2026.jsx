import React from 'react'
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ReferenceArea, Brush } from 'recharts'
import { expandZipAwareFiles, fileExt } from './evidence-utils.js'
import { buildLogAnalysis, parseLogText } from './logAnalysis2026.js'
import { buildLogView } from './logView2026.js'
import RcaDataTable from './components/RcaDataTable.jsx'
import LogLandscapeCompare from './components/LogLandscapeCompare.jsx'
import { downloadCsv, downloadWorkspacePdf } from './rcaExport.js'
import './RcaWorkspace2026.css'
import './RcaWorkspaceV13.css'
import './RcaWorkspaceV133.css'
import './RcaWorkspaceV151.css'

const hasMetric = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
const f = (value, digits = 0) => hasMetric(value) ? Number(value).toLocaleString('en-US', { maximumFractionDigits: digits }) : '—'
const metricText = (value, digits = 0, suffix = '') => hasMetric(value) ? `${f(value, digits)}${suffix}` : '—'
const deltaText = (value, digits = 1, suffix = '') => hasMetric(value) ? `${Number(value) > 0 ? '+' : ''}${f(value, digits)}${suffix}` : '—'
const dateOf = (value = '') => String(value).match(/\d{4}-\d{2}-\d{2}/)?.[0] || '—'
const displayState = (value) => value && value !== '?' ? value : 'Unavailable'
const stateClass = (value) => ['r', 's', 'd', 'z'].includes(String(value || '').toLowerCase()) ? String(value).toLowerCase() : 'unknown'
const Metric = ({ label, value, meta, tone = '', onClick }) => <button type="button" className={`rca26Metric ${tone} ${onClick ? 'clickable' : ''}`} onClick={onClick}><span>{label}</span><strong title={String(value)}>{value}</strong><small>{meta || '—'}</small></button>

function workerParse(files) {
  return new Promise((resolve, reject) => {
    if (typeof Worker === 'undefined') return reject(new Error('Worker unavailable'))
    const worker = new Worker(new URL('./workers/logParser.worker.js', import.meta.url), { type: 'module' })
    worker.onmessage = (event) => { worker.terminate(); event.data?.ok ? resolve(event.data.analysis) : reject(new Error(event.data?.error || 'Worker failed')) }
    worker.onerror = (event) => { worker.terminate(); reject(new Error(event.message || 'Worker failed')) }
    worker.postMessage({ files })
  })
}

function Tip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return <div className="rca26Tooltip"><strong>{label}</strong><span>CPU {f(row.cpuPct, 1)}%</span><span>RAM {f(row.memoryPct, 1)}%</span><span>Load per vCPU {f(row.loadRatio, 2)}</span><span>Swap In {f(row.swapIn)} p/s</span><span>WP Critical {row.wpCritical}</span></div>
}

function JobTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return <div className="rca26Tooltip"><strong>{label}</strong><span>PID {row.pid} · WP {row.wp}</span><span>OS State {displayState(row.state)}</span><span>CPU {metricText(row.cpu, 1, '%')}</span><span>RSS {metricText(row.rssGb, 2, ' GB')}</span><span>RABAX {f(row.rabax)}</span>{row.errorCode && row.errorCode !== '?' ? <span>Error {row.errorCode}</span> : null}</div>
}

function JobDetail({ job, incidentJob, incidentCount = 0 }) {
  if (!job) return <div className="rca26Empty compact">Select a workload.</div>
  const rss = job.peakRssRecord || {}, cpu = job.peakCpuRecord || {}
  const peakCpu = hasMetric(job.peakCpu) && cpu.timeLabel ? `${f(job.peakCpu, 1)}% @ ${cpu.timeLabel}` : '—'
  const peakRss = hasMetric(job.peakRss) && rss.timeLabel ? `${f(job.peakRss, 2)} GB @ ${rss.timeLabel}` : '—'
  const items = [
    ['Program', job.program], ['Host', job.host], ['Instance', rss.instance || cpu.instance], ['WP', job.topWp], ['WP Type', job.topType], ['PID', job.topPid], ['PID Count', job.pidCount || job.pids?.length || 0], ['Process Count', job.processCount || 0], ['OS State', displayState(job.topState)],
    ['Workload Peak CPU', peakCpu], ['Workload Peak RSS', peakRss], ['CPU Change', deltaText(job.cpuDelta, 1, ' pp')], ['RSS Change', deltaText(job.rssDelta, 2, ' GB')],
    ['Incident Presence', incidentCount ? (incidentJob?.persistenceText || `0/${incidentCount}`) : 'No incident'], ['Analysis Presence', job.persistenceText], ['First Seen', job.firstSeen], ['Last Seen', job.lastSeen], ['Errors', job.errors?.join(', ') || '—'],
  ]
  return <div className="rca26Detail"><div className="rca26DetailTitle"><span>Selected {job.identityType?.toLowerCase()}</span><strong>{job.name}</strong></div><dl>{items.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value ?? '—'}</dd></div>)}</dl><div className="rca26SapLookup"><b>SAP lookup</b><span>SM37 by job name. SM50 and SM66 by WP, PID, program and instance.</span></div></div>
}

function JobResourceCharts({ rows = [], pid = '' }) {
  if (!rows.length) return <div className="rca26Empty compact">No resource history for this PID.</div>
  return <div className="rca26JobCharts">
    <section><div className="rca26MiniHead"><b>CPU History</b><span>{pid ? `Selected PID ${pid}` : 'Selected process'}</span></div><div className="rca26MiniChart"><ResponsiveContainer width="100%" height="100%"><LineChart data={rows} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}><CartesianGrid strokeDasharray="3 6" vertical={false} /><XAxis dataKey="timeLabel" /><YAxis unit="%" /><Tooltip content={<JobTip />} /><Line type="linear" dataKey="cpu" name="CPU %" stroke="#32c7cf" strokeWidth={2.2} dot connectNulls={false} /></LineChart></ResponsiveContainer></div></section>
    <section><div className="rca26MiniHead"><b>RSS Memory</b><span>{pid ? `Selected PID ${pid}` : 'GB'}</span></div><div className="rca26MiniChart"><ResponsiveContainer width="100%" height="100%"><LineChart data={rows} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}><CartesianGrid strokeDasharray="3 6" vertical={false} /><XAxis dataKey="timeLabel" /><YAxis unit="G" /><Tooltip content={<JobTip />} /><Line type="linear" dataKey="rssGb" name="RSS GB" stroke="#4d8fff" strokeWidth={2.2} dot connectNulls={false} /></LineChart></ResponsiveContainer></div></section>
    <div className="rca26StateTimeline"><div className="rca26MiniHead"><b>OS State</b><span>R running · S sleep · D uninterruptible sleep · ? unavailable</span></div><div className="rca26StateTrack">{rows.map((row) => <div key={`${row.snapshot}-${row.pid}-${row.wp}`} className={`rca26StatePoint state-${stateClass(row.state)}`} title={`${row.timeLabel} · State ${displayState(row.state)} · RABAX ${row.rabax || 0}${row.errorCode && row.errorCode !== '?' ? ` · ${row.errorCode}` : ''}`}><b>{row.state && row.state !== '?' ? row.state : '?'}</b><small>{row.timeLabel}</small></div>)}</div></div>
  </div>
}

function IncidentAnalyticsPanel({ analytics, workloadAnalytics }) {
  if (!analytics?.baselineAvailable || !analytics.metrics?.length) return null
  const rows = analytics.metrics.map((item) => ({
    ...item,
    beforeMedian: item.before?.median,
    incidentMedian: item.during?.median,
    incidentPeak: item.during?.max,
    afterMedian: item.after?.median,
  }))
  const columns = [
    { key: 'label', label: 'Metric' },
    { key: 'beforeMedian', label: 'Before', num: true, render: (row) => metricText(row.beforeMedian, row.digits, row.unit) },
    { key: 'incidentMedian', label: 'Incident', num: true, render: (row) => metricText(row.incidentMedian, row.digits, row.unit) },
    { key: 'incidentPeak', label: 'Peak', num: true, render: (row) => metricText(row.incidentPeak, row.digits, row.unit) },
    { key: 'afterMedian', label: 'After', render: (row) => analytics.windows.after.count ? metricText(row.afterMedian, row.digits, row.unit) : 'No post-incident data' },
    { key: 'deltaMedian', label: 'Change', num: true, render: (row) => deltaText(row.deltaMedian, row.digits, row.changeUnit) },
    { key: 'anomaly', label: 'Peak Anomaly', render: (row) => <span className={`rca26Status ${row.anomaly === 'HIGH' ? 'crit' : row.anomaly === 'ELEVATED' ? 'warn' : 'normal'}`}>{row.anomaly} · Peak {metricText(row.anomalyPeak, row.digits, row.unit)}</span> },
  ]
  const topSignal = analytics.concurrentSignals?.[0]
  const topWorkload = workloadAnalytics?.topWorkload || analytics.topWorkload
  return <section className="rca26Panel rca26Deferred"><div className="rca26PanelHead"><div><h2>Incident Comparison</h2><p>Deterministic baseline comparison.</p></div><div className="rca26Tag">{analytics.engine}</div></div><RcaDataTable rows={rows} columns={columns} compact search={false} pageSize={10} defaultSort={{ key: 'label', dir: 'asc' }} rowKey={(row) => row.key} /><div className="rca26SampleQuality"><span>Baseline samples <b>{analytics.windows.before.count}</b></span><span>Incident samples <b>{analytics.windows.incident.count}</b></span><span>Post-incident samples <b>{analytics.windows.after.count}</b></span></div><div className="rca26Snapshot">{topSignal ? <div><span>Strongest aligned timestamp</span><b>{topSignal.timeLabel} · {topSignal.count} signals</b></div> : null}{topWorkload ? <div><span>Highest workload change</span><b>{topWorkload.name} · score {f(topWorkload.score, 1)}/100</b></div> : null}<div><span>Baseline window</span><b>{analytics.windows.before.start} – {analytics.windows.before.end}</b></div><div><span>Recovery window</span><b>{analytics.windows.after.count ? `${analytics.windows.after.start} – ${analytics.windows.after.end}` : 'No post-incident data'}</b></div></div></section>
}

function scoreTone(score) {
  if (!hasMetric(score)) return 'normal'
  if (Number(score) >= 85) return 'high'
  if (Number(score) >= 60) return 'elevated'
  return 'normal'
}

const jobColumns = [
  { key: 'identityType', label: 'Scope', render: (row) => <span className={`rca26Scope ${row.identityType?.toLowerCase()}`}>{row.identityType}</span> },
  { key: 'host', label: 'Host' }, { key: 'name', label: 'Workload' }, { key: 'program', label: 'Program' }, { key: 'topType', label: 'Type' },
  { key: 'topWp', label: 'WP', num: true, value: (row) => Number(row.topWp || 0) }, { key: 'topPid', label: 'PID', num: true, value: (row) => Number(row.topPid || 0) }, { key: 'topState', label: 'OS State', render: (row) => row.topState && row.topState !== '?' ? row.topState : '—' },
  { key: 'avgCpu', label: 'Avg CPU', num: true, render: (row) => metricText(row.avgCpu, 1, '%') }, { key: 'peakCpu', label: 'Peak CPU', num: true, render: (row) => metricText(row.peakCpu, 1, '%') },
  { key: 'peakRss', label: 'Peak RSS', num: true, render: (row) => metricText(row.peakRss, 2, ' GB') }, { key: 'persistenceCount', label: 'Presence', num: true, render: (row) => row.persistenceText },
  { key: 'anomalyScore', label: 'Incident Score', num: true, render: (row) => hasMetric(row.anomalyScore) ? <span className={`rca26Score ${scoreTone(row.anomalyScore)}`}>{f(row.anomalyScore, 1)}</span> : '—' },
  { key: 'cpuDelta', label: 'CPU Δ', num: true, render: (row) => deltaText(row.cpuDelta, 1, ' pp') },
  { key: 'rssDelta', label: 'RSS Δ', num: true, render: (row) => deltaText(row.rssDelta, 2, ' GB') },
  { key: 'dStateIncrease', label: 'D-State Δ', num: true, render: (row) => hasMetric(row.dStateIncrease) ? f(row.dStateIncrease) : '—' },
  { key: 'newErrors', label: 'New Error', value: (row) => row.newErrors || [], render: (row) => row.newErrors?.join(', ') || '—' },
  { key: 'errors', label: 'Errors', value: (row) => row.errors || [], render: (row) => row.errors?.join(', ') || '—' },
]

export default function ToolLogAnalysis2026() {
  const reportRef = React.useRef(null)
  const [files, setFiles] = React.useState([])
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('Upload OS and SAP process snapshots.')
  const [analysis, setAnalysis] = React.useState(null)
  const [host, setHost] = React.useState('')
  const [rangeStart, setRangeStart] = React.useState('')
  const [rangeEnd, setRangeEnd] = React.useState('')
  const [focusTime, setFocusTime] = React.useState('')
  const [jobScope, setJobScope] = React.useState('incident')
  const [selected, setSelected] = React.useState('')
  const [selectedPid, setSelectedPid] = React.useState('')
  const [jobViewRows, setJobViewRows] = React.useState([])
  const [timelineMode, setTimelineMode] = React.useState('landscape')
  const [compareMetric, setCompareMetric] = React.useState('memoryPct')

  const analyze = React.useCallback(async (inputFiles) => {
    setBusy(true); setStatus('Parsing snapshots and SAP processes…')
    try {
      const input = []; for (const file of inputFiles) input.push({ name: file.name, text: await file.text() })
      let result; try { result = await workerParse(input) } catch { result = buildLogAnalysis(input.map((item) => parseLogText(item.text, item.name))) }
      setAnalysis(result); setHost(result.primaryHost || ''); setRangeStart(''); setRangeEnd(''); setFocusTime(''); setSelected(''); setSelectedPid(''); setJobScope('incident'); setTimelineMode('landscape'); setCompareMetric('memoryPct')
      setStatus(`Parsed ${result.primarySnapshots.length} primary-host snapshots across ${new Set(result.telemetry.map((item) => item.host)).size} hosts.`)
    } catch (error) { setStatus(error?.message || 'LOG parse failed.') } finally { setBusy(false) }
  }, [])

  const upload = React.useCallback(async (list) => {
    setBusy(true)
    try {
      const expanded = (await expandZipAwareFiles(list, ['log', 'txt', 'csv'])).filter((file) => ['log', 'txt', 'csv'].includes(fileExt(file.name)))
      setFiles(expanded); await analyze(expanded)
    } catch (error) { setStatus(error?.message || 'Upload failed.'); setBusy(false) }
  }, [analyze])

  const baseView = React.useMemo(() => buildLogView(analysis, { host: host || analysis?.primaryHost, start: rangeStart, end: rangeEnd, focusTime }), [analysis, host, rangeStart, rangeEnd, focusTime])
  React.useEffect(() => {
    if (!baseView) return
    if (!host) setHost(baseView.host)
    if (!rangeStart && baseView.allHostSnapshots.length) setRangeStart(baseView.allHostSnapshots[0].timeLabel)
    if (!rangeEnd && baseView.allHostSnapshots.length) setRangeEnd(baseView.allHostSnapshots.at(-1).timeLabel)
  }, [baseView, host, rangeStart, rangeEnd])

  const view = React.useMemo(() => buildLogView(analysis, { host, start: rangeStart, end: rangeEnd, focusTime }), [analysis, host, rangeStart, rangeEnd, focusTime])
  const snapshots = view?.snapshots || [], peaks = view?.peaks || {}, incident = view?.incidentWindow || { start: '—', end: '—', count: 0, severity: 'NORMAL', times: [] }
  const scopedJobs = jobScope === 'full' ? (view?.landscapeJobsWindow || []) : (view?.landscapeJobsIncident || [])
  const jobs = focusTime ? (view?.landscapeJobsFocus || []) : scopedJobs
  const selectedJob = jobs.find((item) => item.key === selected) || jobs[0] || null
  const detailJob = selectedJob ? (view?.landscapeJobsWindow || []).find((item) => item.key === selectedJob.key) || selectedJob : null
  const incidentJob = detailJob ? (view?.landscapeJobsIncident || []).find((item) => item.key === detailJob.key) : null
  React.useEffect(() => { if (jobs.length && !jobs.some((item) => item.key === selected)) setSelected(jobs[0].key) }, [jobs, selected])
  const history = React.useMemo(() => [...(detailJob?.records || [])].sort((a, b) => a.sortKey - b.sortKey), [detailJob])
  const pids = React.useMemo(() => Array.from(new Set(history.map((row) => row.pid).filter(Boolean))), [history])
  React.useEffect(() => { const preferred = detailJob?.topPid && pids.includes(detailJob.topPid) ? detailJob.topPid : pids[0] || ''; setSelectedPid(preferred) }, [detailJob?.key, detailJob?.topPid, pids.join('|')])
  const chartHistory = selectedPid ? history.filter((row) => row.pid === selectedPid) : history
  const severity = view?.severity || 'WAITING', peak = view?.peakSnapshot
  const completeness = view?.completeness || { received: 0, intervalMinutes: 0, isRegular: false, observedIntervals: [] }

  const jobFilters = [{ key: 'host', label: 'Host' }, { key: 'identityType', label: 'Scope' }, { key: 'topType', label: 'Type' }, { key: 'topState', label: 'OS State' }, { key: 'errors', label: 'Error', value: (row) => row.errors || [] }]
  const hostColumns = [
    { key: 'host', label: 'Host' }, { key: 'role', label: 'Role', render: (row) => <span className={`rca26HostRole ${row.role.toLowerCase()}`}>{row.role}</span> }, { key: 'severity', label: 'Status', render: (row) => <span className={`rca26Status ${row.severity.toLowerCase()}`}>{row.severity}</span> },
    { key: 'trigger', label: 'Trigger', render: (row) => <span className={`rca26Trigger ${row.severity.toLowerCase()}`}>{row.trigger}</span> },
    { key: 'peakCpu', label: 'Peak CPU', num: true, render: (row) => `${f(row.peakCpu, 1)}%` }, { key: 'peakRam', label: 'Peak RAM', num: true, render: (row) => `${f(row.peakRam, 1)}%` }, { key: 'peakLoad', label: 'Peak Load', num: true, render: (row) => f(row.peakLoad, 2) },
    { key: 'peakSwap', label: 'Peak Swap', num: true, render: (row) => f(row.peakSwap) }, { key: 'peakWpCritical', label: 'WP Critical', num: true }, { key: 'impact', label: 'Impact' },
  ]
  const snapshotColumns = [
    { key: 'timeLabel', label: 'Time' }, { key: 'cpuPct', label: 'CPU', num: true, render: (row) => `${f(row.cpuPct, 2)}%` }, { key: 'memoryPct', label: 'RAM', num: true, render: (row) => `${f(row.memoryPct, 1)}%` },
    { key: 'loadRatio', label: 'Load per vCPU', num: true, render: (row) => f(row.loadRatio, 2) }, { key: 'swapIn', label: 'Swap In', num: true, render: (row) => f(row.swapIn) }, { key: 'wpCritical', label: 'WP Critical', num: true },
    { key: 'severity', label: 'Status', render: (row) => <span className={`rca26Status ${row.severity.toLowerCase()}`}>{row.severity}</span> },
  ]
  const historyColumns = [
    { key: 'timeLabel', label: 'Time' }, { key: 'pid', label: 'PID', num: true }, { key: 'wp', label: 'WP', num: true }, { key: 'type', label: 'Type' }, { key: 'state', label: 'OS State', render: (row) => row.state && row.state !== '?' ? row.state : '—' },
    { key: 'cpu', label: 'CPU', num: true, render: (row) => metricText(row.cpu, 1, '%') }, { key: 'rssGb', label: 'RSS', num: true, render: (row) => metricText(row.rssGb, 2, ' GB') }, { key: 'rabax', label: 'RABAX', num: true }, { key: 'errorCode', label: 'Error', render: (row) => row.errorCode !== '?' ? row.errorCode : '—' },
  ]
  const errorColumns = [
    { key: 'errorCode', label: 'Error Code' }, { key: 'snapshotRecords', label: 'Snapshots', num: true }, { key: 'uniqueProcesses', label: 'Unique WP and PID', num: true }, { key: 'affectedJobs', label: 'Affected Jobs', num: true }, { key: 'firstSeen', label: 'First Seen' }, { key: 'lastSeen', label: 'Last Seen' },
  ]

  const setPeakFocus = (time) => { if (time) setFocusTime((current) => current === time ? '' : time) }
  const jobsTitle = focusTime ? `Workloads at ${focusTime} · All Servers` : jobScope === 'full' ? 'Workloads in Full Window · All Servers' : incident.count ? `Workloads During Incident · ${incident.start} – ${incident.end} · All Servers` : 'No Incident Workloads'
  const currentErrors = jobScope === 'full' ? view?.landscapeErrorsWindow || [] : view?.landscapeErrorsIncident || []
  const completenessText = completeness.isRegular ? `${completeness.intervalMinutes}-min interval` : completeness.observedIntervals?.length ? `Irregular intervals: ${completeness.observedIntervals.join(', ')} min` : 'Interval unavailable'

  return <section className="rca26Shell"><div className="rca26Inner" ref={reportRef}>
    <header className="rca26Head"><div><h1>LOG Analysis</h1><p>Host resources and SAP workload analysis.</p></div><div className="rca26TopActions"><button className="rca26Btn" disabled={!jobViewRows.length} onClick={() => downloadCsv(`log-landscape-${view?.analysisWindow.start || 'start'}-${view?.analysisWindow.end || 'end'}.csv`, jobColumns, jobViewRows)}>Export CSV</button><button className="rca26Btn" onClick={() => downloadWorkspacePdf(reportRef.current, { filename: `sap-rca-log-${view?.host || 'host'}-${view?.analysisWindow.start || 'start'}-${view?.analysisWindow.end || 'end'}.pdf`, title: 'SAP RCA Workspace · LOG Analysis' })}>Export PDF</button><label className="rca26Upload"><input type="file" multiple accept=".zip,.log,.txt,.csv" onChange={(event) => upload(event.target.files)} />{busy ? 'Parsing…' : 'Upload Logs'}</label></div></header>

    <section className="rca26ControlBar">
      <label className="rca26Control"><span>Host Detail</span><select value={host || ''} onChange={(event) => { setHost(event.target.value); setRangeStart(''); setRangeEnd(''); setFocusTime(''); setSelected(''); setTimelineMode('host') }}>{(view?.hosts || []).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label className="rca26Control"><span>From</span><select value={rangeStart || ''} onChange={(event) => { setRangeStart(event.target.value); setFocusTime('') }}>{(view?.allHostSnapshots || []).map((row) => <option key={`s-${row.snapshot}`} value={row.timeLabel}>{row.timeLabel}</option>)}</select></label>
      <label className="rca26Control"><span>To</span><select value={rangeEnd || ''} onChange={(event) => { setRangeEnd(event.target.value); setFocusTime('') }}>{(view?.allHostSnapshots || []).map((row) => <option key={`e-${row.snapshot}`} value={row.timeLabel}>{row.timeLabel}</option>)}</select></label>
      <label className="rca26Control"><span>Workload Range</span><select value={jobScope} onChange={(event) => { setJobScope(event.target.value); setFocusTime(''); setSelected('') }}><option value="incident">Incident Only</option><option value="full">Full Window</option></select></label>
      <div className="rca26TimelineModeGroup" data-pdf-ignore="true"><button type="button" data-active={timelineMode === 'landscape'} onClick={() => setTimelineMode('landscape')}>Landscape Compare</button><button type="button" data-active={timelineMode === 'host'} onClick={() => setTimelineMode('host')}>Host Detail</button></div>
      {focusTime && <button className="rca26FocusChip" onClick={() => setFocusTime('')}>Snapshot {focusTime} ×</button>}
      <div className={`rca26Completeness ${completeness.isRegular ? 'ok' : 'neutral'}`}><b>{completeness.received} snapshots</b><span>{completenessText}</span><small>{completeness.isRegular ? 'Cadence consistent.' : 'Expected count requires collector interval metadata.'}</small></div>
    </section>

    <section className="rca26MetricStrip">
      <Metric label="Analysis Window" value={`${view?.analysisWindow.start || '—'} – ${view?.analysisWindow.end || '—'}`} meta={`${dateOf(peak?.snapshot || snapshots[0]?.snapshot)} · ${view?.analysisWindow.count || 0} snapshots`} />
      <Metric label="System Host" value={view?.host || '—'} meta={peak ? `${view?.role?.role || '—'} · ${view?.role?.impact || '—'} · SID ${peak.sid || '—'} · Instance ${peak.instance || '—'}` : status} />
      <Metric label="Host Incident" value={severity} meta={incident.count ? `${incident.start} – ${incident.end}` : 'No incident window'} tone={severity === 'CRIT' ? 'critical' : severity === 'WARN' ? 'warn' : 'good'} />
      <Metric label="Peak CPU" value={`${f(peaks.cpu?.value, 1)}%`} meta={`at ${peaks.cpu?.time || '—'}`} onClick={() => setPeakFocus(peaks.cpu?.time)} />
      <Metric label="Peak RAM" value={`${f(peaks.ram?.value, 1)}%`} meta={`at ${peaks.ram?.time || '—'}`} tone={peaks.ram?.value >= 85 ? 'critical' : ''} onClick={() => setPeakFocus(peaks.ram?.time)} />
      <Metric label="Peak Load" value={f(peaks.load?.value, 2)} meta={`per vCPU · ${peaks.load?.time || '—'}`} tone={peaks.load?.value >= 1.5 ? 'critical' : ''} onClick={() => setPeakFocus(peaks.load?.time)} />
      <Metric label="Peak Swap In" value={f(peaks.swapIn?.value)} meta={`p/s at ${peaks.swapIn?.time || '—'}`} tone={peaks.swapIn?.value >= 1000 ? 'warn' : ''} onClick={() => setPeakFocus(peaks.swapIn?.time)} />
      <Metric label="Peak WP Critical" value={f(peaks.wpCritical?.value)} meta={`at ${peaks.wpCritical?.time || '—'}`} tone={peaks.wpCritical?.value >= 3 ? 'critical' : peaks.wpCritical?.value >= 1 ? 'warn' : ''} onClick={() => setPeakFocus(peaks.wpCritical?.time)} />
    </section>

    <div className="rca26Grid logMain">
      {timelineMode === 'landscape' ? <LogLandscapeCompare view={view} metric={compareMetric} onMetricChange={setCompareMetric} focusTime={focusTime} onFocusTime={setFocusTime} onHostDrilldown={(nextHost, time) => { setHost(nextHost); if (time) setFocusTime(time); setTimelineMode('host') }} /> : <section className="rca26Panel"><div className="rca26PanelHead"><div><h2>Resource Timeline · {view?.host || 'Host'}</h2><p data-pdf-ignore="true">Select a point or drag the range to inspect workloads.</p></div><span className="rca26Tag">Actual snapshots</span></div>{snapshots.length ? <><div className="rca26Chart tall wideChart"><ResponsiveContainer width="100%" height="100%"><LineChart data={snapshots} onClick={(state) => state?.activeLabel && setFocusTime(state.activeLabel)} margin={{ top: 10, right: 45, left: 0, bottom: snapshots.length > 12 ? 28 : 8 }}><CartesianGrid strokeDasharray="3 6" vertical={false} /><XAxis dataKey="timeLabel" /><YAxis yAxisId="pct" domain={[0, 100]} tickFormatter={(value) => `${value}%`} /><YAxis yAxisId="load" orientation="right" /><YAxis yAxisId="swap" orientation="right" hide />{incident.count ? <ReferenceArea yAxisId="pct" x1={incident.start} x2={incident.end} fill="#8aa0ad" fillOpacity={0.08} stroke="#748b97" /> : null}<Tooltip content={<Tip />} /><Legend /><Line yAxisId="pct" type="linear" dataKey="cpuPct" name="CPU %" stroke="#32c7cf" strokeWidth={2.2} dot /><Line yAxisId="pct" type="linear" dataKey="memoryPct" name="RAM %" stroke="#4d8fff" strokeWidth={2.2} dot /><Line yAxisId="load" type="linear" dataKey="loadRatio" name="Load per vCPU" stroke="#f5a623" strokeWidth={2} dot /><Line yAxisId="swap" type="linear" dataKey="swapIn" name="Swap In" stroke="#9b72ff" strokeWidth={2} dot />{snapshots.length > 4 ? <Brush dataKey="timeLabel" height={20} onChange={(range) => { if (range?.startIndex != null && range?.endIndex != null) { setRangeStart(snapshots[range.startIndex]?.timeLabel || rangeStart); setRangeEnd(snapshots[range.endIndex]?.timeLabel || rangeEnd); setFocusTime('') } }} /> : null}</LineChart></ResponsiveContainer></div><div className="rca26StatusLine">{snapshots.map((row) => <button key={`${row.snapshot}-${row.host}`} onClick={() => setFocusTime(row.timeLabel)} className={row.severity.toLowerCase()} data-active={focusTime === row.timeLabel}><b>{row.timeLabel}</b>{row.severity}</button>)}</div></> : <div className="rca26Empty">{status}</div>}</section>}
      <aside className="rca26Stack"><section className="rca26Panel compactPanel"><div className="rca26PanelHead"><div><h2>Resource Peaks</h2><p data-pdf-ignore="true">Select a metric to focus its timestamp.</p></div></div>{[['CPU', `${f(peaks.cpu?.value, 1)}%`, peaks.cpu?.time], ['RAM', `${f(peaks.ram?.value, 1)}%`, peaks.ram?.time], ['Load per vCPU', f(peaks.load?.value, 2), peaks.load?.time], ['Swap In', `${f(peaks.swapIn?.value)} p/s`, peaks.swapIn?.time], ['WP Critical', f(peaks.wpCritical?.value), peaks.wpCritical?.time]].map(([label, value, time]) => <button className="rca26KeyValue clickable" key={label} onClick={() => setPeakFocus(time)}><span>{label}</span><b>{value}</b><small>{time || '—'}</small></button>)}</section><section className="rca26Panel compactPanel"><div className="rca26PanelHead"><div><h2>Peak Host Snapshot · {view?.peakTime || '—'}</h2></div></div>{peak ? <div className="rca26Snapshot">{[['Host', peak.host], ['Role', view?.role?.role || '—'], ['Impact', view?.role?.impact || '—'], ['CPU', `${f(peak.cpuPct, 1)}%`], ['RAM', `${f(peak.memoryPct, 1)}%`], ['Load Average', `${f(peak.load1, 2)} · ${f(peak.load5, 2)} · ${f(peak.load15, 2)}`], ['Load per vCPU', f(peak.loadRatio, 2)], ['Swap In', `${f(peak.swapIn)} p/s`], ['Swap Out', `${f(peak.swapOut)} p/s`], ['WP Running', peak.wpRunning], ['WP Standby', peak.wpStandby], ['WP Critical', peak.wpCritical]].map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div> : <div className="rca26Empty compact">No snapshot.</div>}</section></aside>
    </div>

    <IncidentAnalyticsPanel analytics={view?.analytics} workloadAnalytics={view?.landscapeAnalytics} />

    <div className="rca26Grid two rca26Deferred"><section className="rca26Panel"><div className="rca26PanelHead"><div><h2>Application Server Overview</h2></div></div><RcaDataTable rows={view?.hostOverview || []} columns={hostColumns} compact search={false} pageSize={20} defaultSort={{ key: 'role', dir: 'asc' }} rowKey={(row) => row.host} onRowClick={(row) => { setHost(row.host); setRangeStart(''); setRangeEnd(''); setFocusTime(''); setSelected(''); setTimelineMode('host') }} selectedKey={view?.host || ''} /></section><section className="rca26Panel"><div className="rca26PanelHead"><div><h2>Resource Snapshots</h2></div></div><RcaDataTable rows={snapshots} columns={snapshotColumns} compact search={false} pageSize={100} defaultSort={{ key: 'timeLabel', dir: 'asc' }} rowKey={(row) => `${row.host}-${row.snapshot}`} onRowClick={(row) => setFocusTime(row.timeLabel)} selectedKey={focusTime ? `${view?.host}-${snapshots.find((row) => row.timeLabel === focusTime)?.snapshot}` : ''} /></section></div>

    <section className="rca26Panel rca26Deferred"><div className="rca26PanelHead"><div><h2>{jobsTitle}</h2>{selectedJob ? <p className="rca26SelectedContext">Selected: <b>{selectedJob.name}</b> · {selectedJob.host}</p> : view?.landscapeAnalytics?.topWorkload ? <p>Highest change: {view.landscapeAnalytics.topWorkload.name} · score {f(view.landscapeAnalytics.topWorkload.score, 1)}/100</p> : null}</div>{focusTime && <button className="rca26TextBtn" onClick={() => setFocusTime('')}>Clear snapshot</button>}</div><RcaDataTable rows={jobs} columns={jobColumns} filters={jobFilters} searchPlaceholder="Search workload, host, program, PID, WP, error…" pageSize={50} defaultSort={{ key: 'anomalyScore', dir: 'desc' }} rowKey={(row) => row.key} onRowClick={(row) => setSelected(row.key)} selectedKey={selectedJob?.key || ''} onViewChange={setJobViewRows} emptyText={focusTime ? `No processes captured at ${focusTime}.` : jobScope === 'full' ? 'No processes in the selected window.' : 'No incident workloads in this window.'} /></section>

    <div className="rca26Grid logDetail rca26Deferred"><section className="rca26Panel"><JobDetail job={detailJob} incidentJob={incidentJob} incidentCount={incident.count} /></section><section className="rca26Panel"><div className="rca26PanelHead"><div><h2>Job Resource Trend</h2><p>CPU and memory history for the selected PID.</p></div>{pids.length > 1 ? <label className="rca26Control compact"><span>PID</span><select value={selectedPid} onChange={(event) => setSelectedPid(event.target.value)}>{pids.map((pid) => <option value={pid} key={pid}>{pid}</option>)}</select></label> : null}</div><JobResourceCharts rows={chartHistory} pid={selectedPid} /></section></div>

    <section className="rca26Panel rca26Deferred"><div className="rca26PanelHead"><div><h2>Process History</h2><p>Linux process samples. “—” marks unavailable resource metrics.</p></div></div><RcaDataTable rows={history} columns={historyColumns} search={false} filters={[{ key: 'type', label: 'Type' }, { key: 'state', label: 'OS State' }]} pageSize={50} defaultSort={{ key: 'timeLabel', dir: 'asc' }} rowKey={(row) => `${row.snapshot}-${row.pid}-${row.wp}`} /></section>

    <section className="rca26Panel rca26Deferred"><div className="rca26PanelHead"><div><h2>{jobScope === 'full' ? 'Analysis Window Errors' : 'Incident Errors'}</h2><p>Deduplicated across application servers by snapshot, WP and PID.</p></div></div><RcaDataTable rows={currentErrors} columns={errorColumns} searchPlaceholder="Search error code…" pageSize={50} defaultSort={{ key: 'uniqueProcesses', dir: 'desc' }} rowKey={(row) => row.errorCode} /></section>
  </div></section>
}
