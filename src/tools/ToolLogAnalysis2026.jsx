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
import './RcaWorkspaceV152.css'

const hasMetric = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
const f = (value, digits = 0) => hasMetric(value) ? Number(value).toLocaleString('en-US', { maximumFractionDigits: digits }) : '—'
const metricText = (value, digits = 0, suffix = '') => hasMetric(value) ? `${f(value, digits)}${suffix}` : '—'
const deltaText = (value, digits = 1, suffix = '') => hasMetric(value) ? `${Number(value) > 0 ? '+' : ''}${f(value, digits)}${suffix}` : '—'
const dateOf = (value = '') => String(value).match(/\d{4}-\d{2}-\d{2}/)?.[0] || '—'
const compactTime = (value = '') => {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}:\d{2})$/)
  return match ? `${match[2]}-${match[3]} ${match[4]}` : value
}
const displayState = (value) => value && value !== '?' ? value : 'No sample'
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
  if (!active || !payload?.length || String(label || '').startsWith('__gap-')) return null
  const row = payload[0].payload
  return <div className="rca26Tooltip"><strong>{row.timeLabel || label}</strong><span>CPU {f(row.cpuPct, 1)}%</span><span>RAM {f(row.memoryPct, 1)}%</span><span>Load per vCPU {f(row.loadRatio, 2)}</span><span>Swap In {f(row.swapIn)} p/s</span><span>WP Critical {row.wpCritical}</span></div>
}

function ResourceTip({ active, payload, label, mode }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  if (row.resourceAvailable === false) return <div className="rca26Tooltip"><strong>{label}</strong><span>Resource sample unavailable</span>{mode === 'pid' && row.pid ? <span>PID {row.pid}</span> : null}</div>
  if (mode === 'aggregate') return <div className="rca26Tooltip"><strong>{label}</strong><span>Workload CPU {metricText(row.cpu, 1, '%')}</span><span>Process RSS Sum {metricText(row.rssGb, 2, ' GB')}</span><span>Active PIDs {row.activePids}</span><span>D-state {row.dStateCount}</span><span>Errors {row.errorCount}</span></div>
  return <div className="rca26Tooltip"><strong>{label}</strong><span>PID {row.pid} · WP {row.wp || '—'}</span><span>OS State {displayState(row.state)}</span><span>CPU {metricText(row.cpu, 1, '%')}</span><span>RSS {metricText(row.rssGb, 2, ' GB')}</span><span>RABAX {hasMetric(row.rabax) ? f(row.rabax) : '—'}</span>{row.errorCode && row.errorCode !== '?' ? <span>Error {row.errorCode}</span> : null}</div>
}

function coverageOf(rows = []) {
  const total = rows.length
  const available = rows.filter((row) => row.resourceAvailable !== false).length
  return { total, available, missing: Math.max(0, total - available), pct: total ? Math.round((available / total) * 100) : 0 }
}

function expectedWorkloadTimes(telemetry = [], host = '', start = '', end = '') {
  const map = new Map()
  telemetry.filter((row) => row.host === host && (!start || row.timeLabel >= start) && (!end || row.timeLabel <= end)).sort((a, b) => a.sortKey - b.sortKey).forEach((row) => {
    if (!map.has(row.timeLabel)) map.set(row.timeLabel, row)
  })
  return Array.from(map.values()).map((row) => row.timeLabel)
}

function aggregateWorkloadHistory(records = [], times = []) {
  const grouped = new Map(times.map((timeLabel) => [timeLabel, []]))
  records.forEach((row) => {
    if (!grouped.has(row.timeLabel)) grouped.set(row.timeLabel, [])
    grouped.get(row.timeLabel).push(row)
  })
  return Array.from(grouped.entries()).map(([timeLabel, rows]) => {
    const cpuRows = rows.filter((row) => hasMetric(row.cpu))
    const rssRows = rows.filter((row) => hasMetric(row.rssGb))
    const errors = new Set(rows.map((row) => row.errorCode).filter((value) => value && value !== '?'))
    const states = rows.map((row) => String(row.state || '?').toUpperCase())
    const state = states.includes('D') ? 'D' : states.includes('R') ? 'R' : states.includes('S') ? 'S' : '?'
    return {
      timeLabel,
      snapshot: rows[0]?.snapshot || timeLabel,
      aggregate: true,
      cpu: cpuRows.length ? cpuRows.reduce((sum, row) => sum + Number(row.cpu), 0) : null,
      rssGb: rssRows.length ? rssRows.reduce((sum, row) => sum + Number(row.rssGb), 0) : null,
      activePids: new Set(rows.map((row) => row.pid).filter(Boolean)).size,
      dStateCount: states.filter((value) => value === 'D').length,
      errorCount: errors.size,
      state,
      resourceAvailable: cpuRows.length > 0 || rssRows.length > 0,
    }
  })
}

function alignPidHistory(records = [], times = [], pid = '') {
  const pidRows = records.filter((row) => row.pid === pid)
  const byTime = new Map()
  pidRows.forEach((row) => { if (!byTime.has(row.timeLabel)) byTime.set(row.timeLabel, row) })
  const labels = times.length ? times : Array.from(byTime.keys())
  return labels.map((timeLabel) => {
    const row = byTime.get(timeLabel)
    if (!row) return { timeLabel, snapshot: timeLabel, pid, wp: '', state: '?', cpu: null, rssGb: null, rabax: null, errorCode: '?', resourceAvailable: false }
    const resourceAvailable = hasMetric(row.cpu) || hasMetric(row.rssGb)
    return { ...row, resourceAvailable }
  })
}

function JobDetail({ job, incidentJob, incidentCount = 0, coverage }) {
  if (!job) return <div className="rca26Empty compact">Select a workload.</div>
  const rss = job.peakRssRecord || {}, cpu = job.peakCpuRecord || {}
  const peakCpu = hasMetric(job.peakCpu) && cpu.timeLabel ? `${f(job.peakCpu, 1)}% @ ${cpu.timeLabel}` : '—'
  const peakRss = hasMetric(job.peakRss) && rss.timeLabel ? `${f(job.peakRss, 2)} GB @ ${rss.timeLabel}` : '—'
  const items = [
    ['Program', job.program], ['Host', job.host], ['Instance', rss.instance || cpu.instance], ['WP', job.topWp], ['WP Type', job.topType], ['PID', job.topPid], ['PID Count', job.pidCount || job.pids?.length || 0], ['Process Count', job.processCount || 0], ['OS State', displayState(job.topState)],
    ['Workload Peak CPU', peakCpu], ['Workload Peak RSS', peakRss], ['Evidence Score', hasMetric(job.anomalyScore) ? `${f(job.anomalyScore, 1)}/100` : '—'], ['Resource Coverage', coverage?.total ? `${coverage.available}/${coverage.total}${coverage.missing ? ` · ${coverage.missing} missing` : ''}` : '—'],
    ['CPU Change', deltaText(job.cpuDelta, 1, ' pp')], ['RSS Change', deltaText(job.rssDelta, 2, ' GB')], ['Incident Presence', incidentCount ? (incidentJob?.persistenceText || `0/${incidentCount}`) : 'No incident'], ['Analysis Presence', job.persistenceText], ['First Seen', job.firstSeen], ['Last Seen', job.lastSeen], ['Errors', job.errors?.join(', ') || '—'],
  ]
  return <div className="rca26Detail"><div className="rca26DetailTitle"><span>Selected {job.identityType?.toLowerCase()}</span><strong>{job.name}</strong></div><dl>{items.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value ?? '—'}</dd></div>)}</dl></div>
}

function WorkloadResourceCharts({ rows = [], mode = 'aggregate', pid = '', coverage }) {
  if (!rows.length) return <div className="rca26Empty compact">No resource history.</div>
  const aggregate = mode === 'aggregate'
  return <div className="rca26JobCharts">
    <section><div className="rca26MiniHead"><b>{aggregate ? 'Workload CPU' : 'CPU History'}</b><span>{aggregate ? 'Sum of sampled processes' : `Selected PID ${pid}`}</span></div><div className="rca26MiniChart"><ResponsiveContainer width="100%" height="100%"><LineChart data={rows} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}><CartesianGrid strokeDasharray="3 6" vertical={false} /><XAxis dataKey="timeLabel" /><YAxis unit="%" /><Tooltip content={<ResourceTip mode={mode} />} /><Line type="linear" dataKey="cpu" name={aggregate ? 'Workload CPU %' : 'CPU %'} stroke="#32c7cf" strokeWidth={2.2} dot connectNulls={false} /></LineChart></ResponsiveContainer></div></section>
    <section><div className="rca26MiniHead"><b>{aggregate ? 'Process RSS Sum' : 'RSS Memory'}</b><span>{aggregate ? 'Process RSS, not unique physical memory' : `Selected PID ${pid}`}</span></div><div className="rca26MiniChart"><ResponsiveContainer width="100%" height="100%"><LineChart data={rows} margin={{ top: 8, right: 12, left: -12, bottom: 4 }}><CartesianGrid strokeDasharray="3 6" vertical={false} /><XAxis dataKey="timeLabel" /><YAxis unit="G" /><Tooltip content={<ResourceTip mode={mode} />} /><Line type="linear" dataKey="rssGb" name={aggregate ? 'Process RSS Sum GB' : 'RSS GB'} stroke="#4d8fff" strokeWidth={2.2} dot connectNulls={false} /></LineChart></ResponsiveContainer></div></section>
    {aggregate ? <div className="rca26AggregateTrack"><div className="rca26MiniHead"><b>Workload Activity</b><span>{coverage?.missing ? `${coverage.missing} timestamp${coverage.missing === 1 ? '' : 's'} without resource samples` : 'All timestamps covered'}</span></div><div className="rca26AggregateTrackInner">{rows.map((row) => <div className="rca26AggregatePoint" key={row.timeLabel} title={row.resourceAvailable === false ? `${row.timeLabel} · Resource sample unavailable` : `${row.timeLabel} · PIDs ${row.activePids} · D-state ${row.dStateCount} · Errors ${row.errorCount}`}><b>{row.timeLabel}</b><span>PIDs {row.activePids}</span><span className={row.dStateCount ? 'warn' : ''}>D {row.dStateCount}</span><span className={row.errorCount ? 'crit' : ''}>Err {row.errorCount}</span><span className={row.resourceAvailable === false ? 'rca26MissingHint' : ''}>{row.resourceAvailable === false ? 'No sample' : 'Sampled'}</span></div>)}</div></div> : <div className="rca26StateTimeline"><div className="rca26MiniHead"><b>OS State</b><span>R Running · S Sleep · D I/O wait · ? No sample</span></div><div className="rca26StateTrack">{rows.map((row) => <div key={`${row.timeLabel}-${row.pid}-${row.wp}`} className={`rca26StatePoint state-${stateClass(row.state)}`} title={`${row.timeLabel} · ${displayState(row.state)}${row.resourceAvailable === false ? ' · Resource sample unavailable' : ''}${hasMetric(row.rabax) ? ` · RABAX ${row.rabax}` : ''}${row.errorCode && row.errorCode !== '?' ? ` · ${row.errorCode}` : ''}`}><b>{row.state && row.state !== '?' ? row.state : '?'}</b><small>{row.timeLabel}</small></div>)}</div></div>}
  </div>
}

function deviationLabel(value = '') {
  if (value === 'HIGH') return 'STRONG'
  if (value === 'ELEVATED') return 'MODERATE'
  return 'STABLE'
}

function IncidentAnalyticsPanel({ analytics, workloadAnalytics, hostLabel = '' }) {
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
    { key: 'threshold', label: 'Resource Status', render: (row) => <span className={`rca26Status ${String(row.threshold || 'NORMAL').toLowerCase()}`}>{row.threshold || 'NORMAL'}</span> },
    { key: 'afterMedian', label: 'After', render: (row) => analytics.windows.after.count ? metricText(row.afterMedian, row.digits, row.unit) : 'No post-incident data' },
    { key: 'deltaMedian', label: 'Median Δ', num: true, render: (row) => deltaText(row.deltaMedian, row.digits, row.changeUnit) },
    { key: 'anomaly', label: 'Baseline Deviation', render: (row) => { const label = deviationLabel(row.anomaly); return <span title="Deviation of the incident peak from baseline behavior; not operational severity." className={`rca26Deviation ${label.toLowerCase()}`}>{label} · Peak {metricText(row.anomalyPeak, row.digits, row.unit)}</span> } },
  ]
  const topSignal = analytics.concurrentSignals?.[0]
  const topWorkload = workloadAnalytics?.topWorkload || analytics.topWorkload
  return <section className="rca26Panel rca26Deferred"><div className="rca26PanelHead"><div><h2>Incident Comparison{hostLabel ? <span className="rca26IncidentScope">{hostLabel}</span> : null}</h2><p>Selected-host baseline and incident values.</p></div></div><RcaDataTable rows={rows} columns={columns} compact search={false} pageSize={10} defaultSort={{ key: 'label', dir: 'asc' }} rowKey={(row) => row.key} /><div className="rca26IncidentMeta"><span><b>Baseline</b>{analytics.windows.before.start}–{analytics.windows.before.end} · {analytics.windows.before.count} samples</span><span><b>Incident</b>{analytics.windows.incident.count} samples</span><span><b>Post-incident</b>{analytics.windows.after.count ? `${analytics.windows.after.count} samples` : 'No data'}</span>{topSignal ? <span><b>Aligned peak</b>{topSignal.timeLabel} · {topSignal.count} signals</span> : null}{topWorkload ? <span><b>Top workload</b>{topWorkload.name} · evidence {f(topWorkload.score, 1)}/100</span> : null}</div></section>
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
  { key: 'anomalyScore', label: 'Evidence Score', num: true, render: (row) => hasMetric(row.anomalyScore) ? <span className={`rca26Score ${scoreTone(row.anomalyScore)}`}>{f(row.anomalyScore, 1)}</span> : '—' },
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
  const [incidentFocus, setIncidentFocus] = React.useState('latest')
  const [jobScope, setJobScope] = React.useState('incident')
  const [selected, setSelected] = React.useState('')
  const [selectedPid, setSelectedPid] = React.useState('')
  const [jobViewRows, setJobViewRows] = React.useState([])
  const [timelineMode, setTimelineMode] = React.useState('landscape')
  const [compareMetric, setCompareMetric] = React.useState('memoryPct')
  const [resourceMode, setResourceMode] = React.useState('aggregate')

  const analyze = React.useCallback(async (inputFiles) => {
    setBusy(true); setStatus('Parsing snapshots and SAP processes…')
    try {
      const input = []; for (const file of inputFiles) input.push({ name: file.name, text: await file.text() })
      let result; try { result = await workerParse(input) } catch { result = buildLogAnalysis(input.map((item) => parseLogText(item.text, item.name))) }
      setAnalysis(result); setHost(result.primaryHost || ''); setRangeStart(''); setRangeEnd(''); setFocusTime(''); setIncidentFocus('latest'); setSelected(''); setSelectedPid(''); setJobScope('incident'); setTimelineMode('landscape'); setCompareMetric('memoryPct'); setResourceMode('aggregate')
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

  const baseView = React.useMemo(() => buildLogView(analysis, { host: host || analysis?.primaryHost, start: rangeStart, end: rangeEnd, focusTime, incidentFocus }), [analysis, host, rangeStart, rangeEnd, focusTime, incidentFocus])
  React.useEffect(() => {
    if (!baseView) return
    if (!host) setHost(baseView.host)
    if (!rangeStart && baseView.allHostSnapshots.length) setRangeStart(baseView.allHostSnapshots[0].timeLabel)
    if (!rangeEnd && baseView.allHostSnapshots.length) setRangeEnd(baseView.allHostSnapshots.at(-1).timeLabel)
  }, [baseView, host, rangeStart, rangeEnd])

  const view = React.useMemo(() => buildLogView(analysis, { host, start: rangeStart, end: rangeEnd, focusTime, incidentFocus }), [analysis, host, rangeStart, rangeEnd, focusTime, incidentFocus])
  const snapshots = view?.snapshots || [], chartSnapshots = view?.chartSnapshots || snapshots, peaks = view?.peaks || {}, incident = view?.incidentWindow || { start: '—', end: '—', count: 0, severity: 'NORMAL', times: [] }
  const episodes = view?.incidentEpisodes || [], episodeCounts = view?.incidentEpisodeCounts || { CRIT: 0, WARN: 0 }, evidenceWindow = view?.evidenceWindow || view?.analysisWindow || { start: '—', end: '—', count: 0 }
  React.useEffect(() => {
    if (!view) return
    if (incidentFocus !== 'all' && incidentFocus !== 'latest' && incidentFocus !== 'peak' && !episodes.some((episode) => episode.key === incidentFocus)) setIncidentFocus(episodes.length ? 'latest' : 'all')
    if (!episodes.length && incidentFocus !== 'all') setIncidentFocus('all')
  }, [view, episodes, incidentFocus])
  const scopedJobs = jobScope === 'full' ? (view?.landscapeJobsWindow || []) : (view?.landscapeJobsIncident || [])
  const jobs = focusTime ? (view?.landscapeJobsFocus || []) : scopedJobs
  const selectedJob = jobs.find((item) => item.key === selected) || (!selected ? jobs[0] : null) || null
  const detailJob = selectedJob ? (view?.landscapeJobsWindow || []).find((item) => item.key === selectedJob.key) || selectedJob : null
  const incidentJob = detailJob ? (view?.landscapeJobsIncident || []).find((item) => item.key === detailJob.key) : null
  React.useEffect(() => { if (selected && !jobs.some((item) => item.key === selected)) setSelected('') }, [jobs, selected])
  React.useEffect(() => { if (selected && jobViewRows.length && !jobViewRows.some((item) => item.key === selected)) setSelected('') }, [jobViewRows, selected])
  const history = React.useMemo(() => [...(detailJob?.records || [])].sort((a, b) => a.sortKey - b.sortKey), [detailJob])
  const pids = React.useMemo(() => Array.from(new Set(history.map((row) => row.pid).filter(Boolean))), [history])
  React.useEffect(() => { const preferred = detailJob?.topPid && pids.includes(detailJob.topPid) ? detailJob.topPid : pids[0] || ''; setSelectedPid(preferred); setResourceMode('aggregate') }, [detailJob?.key, detailJob?.topPid, pids.join('|')])
  const workloadTimes = React.useMemo(() => expectedWorkloadTimes(analysis?.telemetry || [], detailJob?.host || '', rangeStart, rangeEnd), [analysis?.telemetry, detailJob?.host, rangeStart, rangeEnd])
  const aggregateHistory = React.useMemo(() => aggregateWorkloadHistory(history, workloadTimes), [history, workloadTimes.join('|')])
  const pidHistory = React.useMemo(() => alignPidHistory(history, workloadTimes, selectedPid), [history, workloadTimes.join('|'), selectedPid])
  const resourceRows = resourceMode === 'aggregate' ? aggregateHistory : pidHistory
  const resourceCoverage = React.useMemo(() => coverageOf(resourceRows), [resourceRows])
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

  const clearSelection = React.useCallback(() => { setSelected(''); setSelectedPid(''); setResourceMode('aggregate') }, [])
  const changeFocusTime = React.useCallback((time) => { setFocusTime((current) => current === time ? '' : (time || '')); clearSelection() }, [clearSelection])
  const setPeakFocus = (time) => { if (time) changeFocusTime(time) }
  const jobsTitle = focusTime ? `Workloads at ${focusTime} · All Servers` : jobScope === 'full' ? 'Workloads in Evidence Window · All Servers' : incident.isAggregate ? `Workloads Across ${episodes.length} Incident Episodes · All Servers` : incident.count ? `Workloads During Selected Incident · ${incident.start} – ${incident.end} · All Servers` : 'No Incident Workloads'
  const currentErrors = jobScope === 'full' ? view?.landscapeErrorsWindow || [] : view?.landscapeErrorsIncident || []
  const completenessText = completeness.isRegular ? `${completeness.intervalMinutes}-min interval` : completeness.observedIntervals?.length ? `Irregular: ${completeness.observedIntervals.join(', ')} min` : 'Interval metadata unavailable'
  const reportHosts = (view?.hostOverview || []).filter((row) => row.severity === 'CRIT')
  const reportJobs = [...(view?.landscapeJobsIncident || [])].filter((row) => Number(row.anomalyScore || 0) >= 60 || Number(row.dStateIncrease || 0) > 0 || (row.newErrors?.length || 0) > 0).sort((a, b) => Number(b.anomalyScore || 0) - Number(a.anomalyScore || 0)).slice(0, 12)
  const reportErrors = [...(view?.landscapeErrorsIncident || [])].sort((a, b) => Number(b.affectedJobs || 0) - Number(a.affectedJobs || 0) || Number(b.uniqueProcesses || 0) - Number(a.uniqueProcesses || 0)).slice(0, 10)
  const reportJobColumns = jobColumns.filter((column) => ['host', 'name', 'program', 'topWp', 'topPid', 'peakCpu', 'peakRss', 'anomalyScore', 'dStateIncrease', 'newErrors'].includes(column.key))
  const reportTopJob = reportJobs[0] || null
  const reportTopTimes = reportTopJob ? (incident.isAggregate ? incident.times || [] : expectedWorkloadTimes(analysis?.telemetry || [], reportTopJob.host, incident.start, incident.end)) : []
  const reportTopHistory = reportTopJob ? aggregateWorkloadHistory(reportTopJob.records || [], reportTopTimes) : []
  const reportTopCoverage = coverageOf(reportTopHistory)
  const reportKeySignals = reportTopJob ? [
    Math.abs(Number(reportTopJob.cpuDelta || 0)) >= 1 ? `CPU ${deltaText(reportTopJob.cpuDelta, 1, ' pp')}` : '',
    Math.abs(Number(reportTopJob.rssDelta || 0)) >= 0.1 ? `RSS ${deltaText(reportTopJob.rssDelta, 2, ' GB')}` : '',
    Number(reportTopJob.dStateIncrease || 0) > 0 ? `D-state +${f(reportTopJob.dStateIncrease)}` : '',
    ...(reportTopJob.newErrors || []).slice(0, 2),
  ].filter(Boolean).join(' · ') || 'No strong workload-side delta' : 'No qualifying workload'
  const recoveryText = view?.analytics?.windows?.after?.count ? `${view.analytics.windows.after.count} post-incident samples` : incident.isAggregate ? 'All-evidence mode' : 'No post-incident data'

  return <section className="rca26Shell"><div className="rca26Inner" ref={reportRef} data-report-kind="log">
    <header className="rca26Head"><div><h1>LOG Analysis</h1><p>Host resources and SAP workload analysis.</p></div><div className="rca26TopActions"><button className="rca26Btn" disabled={!jobViewRows.length} onClick={() => downloadCsv(`log-landscape-${view?.analysisWindow.start || 'start'}-${view?.analysisWindow.end || 'end'}.csv`, jobColumns, jobViewRows)}>Export CSV</button><button className="rca26Btn" onClick={() => downloadWorkspacePdf(reportRef.current, { filename: `sap-rca-log-${view?.host || 'host'}-${view?.analysisWindow.start || 'start'}-${view?.analysisWindow.end || 'end'}.pdf`, title: 'SAP RCA Workspace · LOG Incident Report' })}>Export PDF</button><label className="rca26Upload"><input type="file" multiple accept=".zip,.log,.txt,.csv" onChange={(event) => upload(event.target.files)} />{busy ? 'Parsing…' : 'Upload Logs'}</label></div></header>

    <section className="rca26ControlBar">
      <label className="rca26Control"><span>Host</span><select value={host || ''} onChange={(event) => { setHost(event.target.value); setRangeStart(''); setRangeEnd(''); setFocusTime(''); setIncidentFocus('latest'); clearSelection(); setTimelineMode('host') }}>{(view?.hosts || []).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label className="rca26Control"><span>From</span><select value={rangeStart || ''} onChange={(event) => { setRangeStart(event.target.value); setFocusTime(''); setIncidentFocus('latest'); clearSelection() }}>{(view?.allHostSnapshots || []).map((row) => <option key={`s-${row.snapshot}`} value={row.timeLabel}>{row.timeLabel}</option>)}</select></label>
      <label className="rca26Control"><span>To</span><select value={rangeEnd || ''} onChange={(event) => { setRangeEnd(event.target.value); setFocusTime(''); setIncidentFocus('latest'); clearSelection() }}>{(view?.allHostSnapshots || []).map((row) => <option key={`e-${row.snapshot}`} value={row.timeLabel}>{row.timeLabel}</option>)}</select></label>
      <label className="rca26Control rca26IncidentControl"><span>Incident</span><select value={incidentFocus} onChange={(event) => { const value = event.target.value; setIncidentFocus(value); setFocusTime(''); setJobScope(value === 'all' ? 'full' : 'incident'); clearSelection() }}><option value="all">All Evidence</option><option value="latest">Latest Incident</option><option value="peak">Peak Incident</option>{episodes.map((episode) => <option key={episode.key} value={episode.key}>{episode.label} · {compactTime(episode.start)} → {compactTime(episode.end)} · {episode.severity}</option>)}</select></label>
      <label className="rca26Control"><span>Workload</span><select value={jobScope} onChange={(event) => { setJobScope(event.target.value); setFocusTime(''); clearSelection() }}><option value="incident">Incident Only</option><option value="full">Full Window</option></select></label>
      <div className="rca26TimelineModeGroup" data-pdf-ignore="true"><button type="button" data-active={timelineMode === 'landscape'} onClick={() => setTimelineMode('landscape')}>Landscape</button><button type="button" data-active={timelineMode === 'host'} onClick={() => setTimelineMode('host')}>Host Detail</button></div>
      {focusTime && <button className="rca26FocusChip" onClick={() => { setFocusTime(''); clearSelection() }}>Snapshot {focusTime} ×</button>}
      <div className={`rca26Completeness ${completeness.isRegular ? 'ok' : 'neutral'}`}><b>{completeness.received} evidence snapshots</b><span>{completenessText}</span><small>{episodes.length} incident episode{episodes.length === 1 ? '' : 's'} · gap threshold {view?.incidentCadence?.gapThresholdMinutes || 30} min</small></div>
    </section>

    <section className="rca26MetricStrip">
      <Metric label="Evidence Window" value={`${evidenceWindow.start || '—'} – ${evidenceWindow.end || '—'}`} meta={`${evidenceWindow.count || 0} snapshots · full uploaded scope`} />
      <Metric label="System Host" value={view?.host || '—'} meta={peak ? `${view?.role?.role || '—'} · ${view?.role?.impact || '—'} · SID ${peak.sid || '—'} · Instance ${peak.instance || '—'}` : status} />
      <Metric label="Incident Episodes" value={episodes.length} meta={`${episodeCounts.CRIT || 0} CRIT · ${episodeCounts.WARN || 0} WARN`} tone={(episodeCounts.CRIT || 0) > 0 ? 'critical' : (episodeCounts.WARN || 0) > 0 ? 'warn' : 'good'} />
      <Metric label="Selected Incident" value={incident.isAggregate ? 'ALL' : severity} meta={incident.count ? incident.isAggregate ? `${episodes.length} episodes · ${incident.count} flagged snapshots` : `${incident.start} – ${incident.end}` : 'No incident episode'} tone={severity === 'CRIT' ? 'critical' : severity === 'WARN' ? 'warn' : 'good'} />
      <Metric label="Peak CPU" value={`${f(peaks.cpu?.value, 1)}%`} meta={`at ${peaks.cpu?.time || '—'}`} onClick={() => setPeakFocus(peaks.cpu?.time)} />
      <Metric label="Peak RAM" value={`${f(peaks.ram?.value, 1)}%`} meta={`at ${peaks.ram?.time || '—'}`} tone={peaks.ram?.value >= 85 ? 'critical' : ''} onClick={() => setPeakFocus(peaks.ram?.time)} />
      <Metric label="Peak Load" value={f(peaks.load?.value, 2)} meta={`per vCPU · ${peaks.load?.time || '—'}`} tone={peaks.load?.value >= 1.5 ? 'critical' : ''} onClick={() => setPeakFocus(peaks.load?.time)} />
      <Metric label="Peak Swap In" value={f(peaks.swapIn?.value)} meta={`p/s at ${peaks.swapIn?.time || '—'}`} tone={peaks.swapIn?.value >= 1000 ? 'warn' : ''} onClick={() => setPeakFocus(peaks.swapIn?.time)} />
      <Metric label="Peak WP Critical" value={f(peaks.wpCritical?.value)} meta={`at ${peaks.wpCritical?.time || '—'}`} tone={peaks.wpCritical?.value >= 3 ? 'critical' : peaks.wpCritical?.value >= 1 ? 'warn' : ''} onClick={() => setPeakFocus(peaks.wpCritical?.time)} />
    </section>

    <div className="rca26Grid logMain">
      {timelineMode === 'landscape' ? <LogLandscapeCompare view={view} metric={compareMetric} onMetricChange={setCompareMetric} focusTime={focusTime} onFocusTime={(time) => { setFocusTime(time || ''); clearSelection() }} onHostDrilldown={(nextHost, time) => { setHost(nextHost); if (time) setFocusTime(time); clearSelection(); setTimelineMode('host') }} /> : <section className="rca26Panel"><div className="rca26PanelHead"><div><h2>Resource Timeline · {view?.host || 'Host'}</h2><p data-pdf-ignore="true">{incident.isAggregate ? 'All evidence is shown; large collection gaps are intentionally disconnected.' : 'Selected incident episode; select a point or drag the range to inspect workloads.'}</p></div><span className="rca26Tag">Actual snapshots</span></div>{snapshots.length ? <><div className="rca26Chart tall wideChart"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartSnapshots} onClick={(state) => state?.activeLabel && !String(state.activeLabel).startsWith('__gap-') && changeFocusTime(state.activeLabel)} margin={{ top: 10, right: 45, left: 0, bottom: chartSnapshots.length > 12 ? 28 : 8 }}><CartesianGrid strokeDasharray="3 6" vertical={false} /><XAxis dataKey="chartKey" tickFormatter={(value) => String(value).startsWith('__gap-') ? '' : compactTime(value)} /><YAxis yAxisId="pct" domain={[0, 100]} tickFormatter={(value) => `${value}%`} /><YAxis yAxisId="load" orientation="right" /><YAxis yAxisId="swap" orientation="right" hide />{incident.count && !incident.isAggregate ? <ReferenceArea yAxisId="pct" x1={incident.start} x2={incident.end} fill="#8aa0ad" fillOpacity={0.08} stroke="#748b97" /> : null}<Tooltip content={<Tip />} /><Legend /><Line yAxisId="pct" type="linear" dataKey="cpuPct" name="CPU %" stroke="#32c7cf" strokeWidth={2.2} dot connectNulls={false} /><Line yAxisId="pct" type="linear" dataKey="memoryPct" name="RAM %" stroke="#4d8fff" strokeWidth={2.2} dot connectNulls={false} /><Line yAxisId="load" type="linear" dataKey="loadRatio" name="Load per vCPU" stroke="#f5a623" strokeWidth={2} dot connectNulls={false} /><Line yAxisId="swap" type="linear" dataKey="swapIn" name="Swap In" stroke="#9b72ff" strokeWidth={2} dot connectNulls={false} />{chartSnapshots.length > 4 ? <Brush dataKey="chartKey" height={20} tickFormatter={(value) => String(value).startsWith('__gap-') ? '' : compactTime(value)} onChange={(range) => { if (range?.startIndex != null && range?.endIndex != null) { const selectedRows = chartSnapshots.slice(range.startIndex, range.endIndex + 1).filter((row) => !row.chartGap); if (selectedRows.length) { setRangeStart(selectedRows[0].timeLabel || rangeStart); setRangeEnd(selectedRows.at(-1).timeLabel || rangeEnd); setFocusTime(''); setIncidentFocus('latest'); clearSelection() } } }} /> : null}</LineChart></ResponsiveContainer></div><div className="rca26StatusLine">{snapshots.map((row) => <button key={`${row.snapshot}-${row.host}`} onClick={() => changeFocusTime(row.timeLabel)} className={row.severity.toLowerCase()} data-active={focusTime === row.timeLabel}><b>{row.timeLabel}</b>{row.severity}</button>)}</div></> : <div className="rca26Empty">{status}</div>}</section>}
      <aside className="rca26Stack"><section className="rca26Panel compactPanel"><div className="rca26PanelHead"><div><h2>Resource Peaks</h2><p data-pdf-ignore="true">{incident.isAggregate ? 'Peaks across the evidence window.' : 'Peaks inside the selected incident episode.'}</p></div></div>{[['CPU', `${f(peaks.cpu?.value, 1)}%`, peaks.cpu?.time], ['RAM', `${f(peaks.ram?.value, 1)}%`, peaks.ram?.time], ['Load per vCPU', f(peaks.load?.value, 2), peaks.load?.time], ['Swap In', `${f(peaks.swapIn?.value)} p/s`, peaks.swapIn?.time], ['WP Critical', f(peaks.wpCritical?.value), peaks.wpCritical?.time]].map(([label, value, time]) => <button className="rca26KeyValue clickable" key={label} onClick={() => setPeakFocus(time)}><span>{label}</span><b>{value}</b><small>{time || '—'}</small></button>)}</section><section className="rca26Panel compactPanel"><div className="rca26PanelHead"><div><h2>Peak Host Snapshot · {view?.peakTime || '—'}</h2></div></div>{peak ? <div className="rca26Snapshot">{[['Host', peak.host], ['Role', view?.role?.role || '—'], ['Impact', view?.role?.impact || '—'], ['CPU', `${f(peak.cpuPct, 1)}%`], ['RAM', `${f(peak.memoryPct, 1)}%`], ['Load Average', `${f(peak.load1, 2)} · ${f(peak.load5, 2)} · ${f(peak.load15, 2)}`], ['Load per vCPU', f(peak.loadRatio, 2)], ['Swap In', `${f(peak.swapIn)} p/s`], ['Swap Out', `${f(peak.swapOut)} p/s`], ['WP Running', peak.wpRunning], ['WP Standby', peak.wpStandby], ['WP Critical', peak.wpCritical]].map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div> : <div className="rca26Empty compact">No snapshot.</div>}</section></aside>
    </div>

    <IncidentAnalyticsPanel analytics={view?.analytics} workloadAnalytics={view?.landscapeAnalytics} hostLabel={view?.host || ''} />

    <div className="rca26Grid two rca26Deferred"><section className="rca26Panel"><div className="rca26PanelHead"><div><h2>Application Server Overview</h2></div></div><RcaDataTable rows={view?.hostOverview || []} columns={hostColumns} compact search={false} pageSize={20} defaultSort={{ key: 'role', dir: 'asc' }} rowKey={(row) => row.host} onRowClick={(row) => { setHost(row.host); setRangeStart(''); setRangeEnd(''); setFocusTime(''); setIncidentFocus('latest'); clearSelection(); setTimelineMode('host') }} selectedKey={view?.host || ''} /></section><section className="rca26Panel"><div className="rca26PanelHead"><div><h2>{incident.isAggregate ? 'Evidence Resource Snapshots' : 'Selected Incident Snapshots'}</h2></div></div><RcaDataTable rows={snapshots} columns={snapshotColumns} compact search={false} pageSize={100} defaultSort={{ key: 'timeLabel', dir: 'asc' }} rowKey={(row) => `${row.host}-${row.snapshot}`} onRowClick={(row) => { setFocusTime(row.timeLabel); clearSelection() }} selectedKey={focusTime ? `${view?.host}-${snapshots.find((row) => row.timeLabel === focusTime)?.snapshot}` : ''} /></section></div>

    <section className="rca26Panel rca26Deferred"><div className="rca26PanelHead"><div><h2>{jobsTitle}</h2>{selectedJob ? <p className="rca26SelectedContext">Selected: <b>{selectedJob.name}</b> · {selectedJob.host}</p> : view?.landscapeAnalytics?.topWorkload ? <p>Highest change: {view.landscapeAnalytics.topWorkload.name} · evidence {f(view.landscapeAnalytics.topWorkload.score, 1)}/100</p> : null}</div>{focusTime && <button className="rca26TextBtn" onClick={() => { setFocusTime(''); clearSelection() }}>Clear snapshot</button>}</div><RcaDataTable rows={jobs} columns={jobColumns} filters={jobFilters} searchPlaceholder="Search workload, host, program, PID, WP, error…" pageSize={50} defaultSort={{ key: 'anomalyScore', dir: 'desc' }} rowKey={(row) => row.key} onRowClick={(row) => { setSelected(row.key); setResourceMode('aggregate') }} selectedKey={selectedJob?.key || ''} onViewChange={setJobViewRows} emptyText={focusTime ? `No processes captured at ${focusTime}.` : jobScope === 'full' ? 'No processes in the selected evidence window.' : 'No workloads in the selected incident scope.'} /></section>

    <div className="rca26Grid logDetail rca26Deferred"><section className="rca26Panel"><JobDetail job={detailJob} incidentJob={incidentJob} incidentCount={incident.count} coverage={coverageOf(aggregateHistory)} /></section><section className="rca26Panel"><div className="rca26PanelHead"><div><h2>Workload Resource Trend</h2><p>{resourceMode === 'aggregate' ? 'Aggregate sampled processes for the selected workload.' : 'Resource evidence for one selected PID.'}</p></div><div className="rca26ResourceHeadActions"><div className="rca26ResourceMode" role="group" aria-label="Workload resource view"><button type="button" data-active={resourceMode === 'aggregate'} onClick={() => setResourceMode('aggregate')}>Aggregate</button><button type="button" data-active={resourceMode === 'pid'} disabled={!pids.length} onClick={() => setResourceMode('pid')}>PID Detail</button></div>{resourceMode === 'pid' && pids.length > 1 ? <label className="rca26Control compact"><span>PID</span><select value={selectedPid} onChange={(event) => setSelectedPid(event.target.value)}>{pids.map((pid) => <option value={pid} key={pid}>{pid}</option>)}</select></label> : null}<span className={`rca26CoverageBadge ${resourceCoverage.missing ? 'warn' : 'ok'}`}><b>Coverage {resourceCoverage.available}/{resourceCoverage.total}</b>{resourceCoverage.missing ? `· ${resourceCoverage.missing} missing` : '· complete'}</span></div></div><WorkloadResourceCharts rows={resourceRows} mode={resourceMode} pid={selectedPid} coverage={resourceCoverage} /></section></div>

    <section className="rca26Panel rca26Deferred rca26IncidentErrors"><div className="rca26PanelHead"><div><h2>{jobScope === 'full' ? 'Evidence Window Errors' : incident.isAggregate ? 'All Incident Episode Errors' : 'Selected Incident Errors'}</h2><p>Deduplicated across application servers by snapshot, WP and PID.</p></div></div><RcaDataTable rows={currentErrors} columns={errorColumns} searchPlaceholder="Search error code…" pageSize={50} defaultSort={{ key: 'affectedJobs', dir: 'desc' }} rowKey={(row) => row.errorCode} /></section>

    <details className="rca26HistoryDisclosure rca26Deferred"><summary>Process History ({history.length} records)</summary><section className="rca26Panel"><div className="rca26PanelHead"><div><h2>Process History</h2><p>Linux process samples. “—” means the resource sample was unavailable.</p></div></div><RcaDataTable rows={history} columns={historyColumns} search={false} filters={[{ key: 'type', label: 'Type' }, { key: 'state', label: 'OS State' }]} pageSize={50} defaultSort={{ key: 'timeLabel', dir: 'asc' }} rowKey={(row) => `${row.snapshot}-${row.pid}-${row.wp}`} /></section></details>

    <div className="rca26IncidentReportOnly" aria-hidden="true">
      <div className="rca26IncidentReportHead"><div><h1>LOG Incident Report</h1><p>Host and workload evidence for the selected incident scope.</p></div><strong>{incident.isAggregate ? `${episodes.length} incident episodes` : incident.count ? `${incident.start}–${incident.end}` : 'No incident detected'}</strong></div>
      <div className="rca26IncidentReportGrid"><div className="reportMetric"><span>Host</span><b>{view?.host || '—'}</b></div><div className="reportMetric crit"><span>Incident</span><b>{incident.isAggregate ? 'ALL' : severity}</b></div><div className="reportMetric"><span>Peak CPU</span><b>{metricText(peaks.cpu?.value, 1, '%')}</b></div><div className="reportMetric"><span>Peak RAM</span><b>{metricText(peaks.ram?.value, 1, '%')}</b></div><div className="reportMetric"><span>Peak Load</span><b>{metricText(peaks.load?.value, 2)}</b></div><div className="reportMetric"><span>Peak Swap In</span><b>{metricText(peaks.swapIn?.value, 0, ' p/s')}</b></div><div className="reportMetric"><span>Peak WP Critical</span><b>{metricText(peaks.wpCritical?.value, 0)}</b></div><div className="reportMetric"><span>Affected Servers</span><b>{reportHosts.length}</b></div></div>
      <IncidentAnalyticsPanel analytics={view?.analytics} workloadAnalytics={view?.landscapeAnalytics} hostLabel={view?.host || ''} />
      <section className="rca26Panel"><div className="rca26PanelHead"><div><h2>Affected Application Servers</h2><p>Hosts that reached CRIT in the selected incident scope; impact distinguishes landscape and host scope.</p></div></div><RcaDataTable rows={reportHosts} columns={hostColumns} compact search={false} pageSize={10} defaultSort={{ key: 'role', dir: 'asc' }} rowKey={(row) => row.host} emptyText="No affected application server." /></section>
      <section className="rca26Panel"><div className="rca26PanelHead"><div><h2>Incident Workloads</h2><p>Top evidence-ranked workloads with D-state increase or new incident errors.</p></div></div><RcaDataTable rows={reportJobs} columns={reportJobColumns} compact search={false} pageSize={12} defaultSort={{ key: 'anomalyScore', dir: 'desc' }} rowKey={(row) => row.key} emptyText="No incident workload met the report threshold." /></section>
      {reportTopJob ? <section className="rca26Panel rca26ReportTopWorkload"><div className="rca26PanelHead"><div><h2>Top Workload Detail · {reportTopJob.name}</h2><p>{reportTopJob.host} · PID {reportTopJob.topPid || '—'} · WP {reportTopJob.topWp || '—'} · Evidence {metricText(reportTopJob.anomalyScore, 1, '/100')}</p></div></div><WorkloadResourceCharts rows={reportTopHistory} mode="aggregate" coverage={reportTopCoverage} /></section> : null}
      <section className="rca26Panel"><div className="rca26PanelHead"><div><h2>Incident Errors</h2><p>Top incident errors ranked by affected workloads and unique processes.</p></div></div><RcaDataTable rows={reportErrors} columns={errorColumns} compact search={false} pageSize={10} defaultSort={{ key: 'affectedJobs', dir: 'desc' }} rowKey={(row) => row.errorCode} emptyText="No incident errors." /></section>
      <section className="rca26Panel"><div className="rca26PanelHead"><div><h2>RCA Findings</h2><p>Deterministic evidence summary; not an automatic root-cause claim.</p></div></div><div className="rca26ReportFindings"><div className="rca26ReportFinding"><span>Evidence Window</span><b>{evidenceWindow.start}–{evidenceWindow.end} · {evidenceWindow.count} snapshots</b></div><div className="rca26ReportFinding"><span>Incident Scope</span><b>{incident.isAggregate ? `${episodes.length} episodes` : incident.count ? `${incident.start}–${incident.end}` : 'No incident detected'}</b></div><div className="rca26ReportFinding"><span>Primary Host</span><b>{analysis?.primaryHost || view?.host || '—'}</b></div><div className="rca26ReportFinding"><span>Top Workload</span><b>{reportTopJob ? `${reportTopJob.name} · ${f(reportTopJob.anomalyScore, 1)}/100` : 'No qualifying workload'}</b></div><div className="rca26ReportFinding"><span>Key Signals</span><b>{reportKeySignals}</b></div><div className="rca26ReportFinding"><span>Recovery</span><b>{recoveryText}</b></div><div className="rca26ReportFinding"><span>Evidence Scope</span><b>{reportHosts.length} affected server{reportHosts.length === 1 ? '' : 's'} · {reportJobs.length} reported workload{reportJobs.length === 1 ? '' : 's'} · {reportErrors.length} reported error{reportErrors.length === 1 ? '' : 's'}</b></div></div></section>
    </div>
  </div></section>
}
