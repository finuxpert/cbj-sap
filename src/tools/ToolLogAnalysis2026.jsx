import React from 'react'
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ReferenceArea, Brush } from 'recharts'
import { expandZipAwareFiles, fileExt } from './evidence-utils.js'
import { buildLogAnalysis, parseLogText } from './logAnalysis2026.js'
import { buildLogView } from './logView2026.js'
import RcaDataTable from './components/RcaDataTable.jsx'
import { downloadCsv } from './rcaExport.js'
import './RcaWorkspace2026.css'
import './RcaWorkspaceV13.css'

const f = (value, digits = 0) => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: digits })
const dateOf = (value = '') => String(value).match(/\d{4}-\d{2}-\d{2}/)?.[0] || '—'
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
  return <div className="rca26Tooltip"><strong>{label}</strong><span>CPU {f(row.cpuPct, 1)}%</span><span>RAM {f(row.memoryPct, 1)}%</span><span>Load/vCPU {f(row.loadRatio, 2)}</span><span>Swap In {f(row.swapIn)} p/s</span><span>WP Critical {row.wpCritical}</span></div>
}

function JobDetail({ job }) {
  if (!job) return <div className="rca26Empty compact">Select a job or process.</div>
  const rss = job.peakRssRecord || {}, cpu = job.peakCpuRecord || {}
  const items = [['Program', job.program], ['Host', job.host], ['Instance', rss.instance || cpu.instance], ['WP / Type', `${job.topWp || '—'} / ${job.topType || '—'}`], ['PID', job.topPid], ['State', job.topState], ['Peak CPU', `${f(job.peakCpu, 1)}% @ ${cpu.timeLabel || '—'}`], ['Peak RSS', `${f(job.peakRss, 2)} GB @ ${rss.timeLabel || '—'}`], ['First / Last', `${job.firstSeen} / ${job.lastSeen}`], ['Seen', job.persistenceText], ['Errors', job.errors?.join(', ') || '—']]
  return <div className="rca26Detail"><div className="rca26DetailTitle"><span>Selected {job.identityType?.toLowerCase()}</span><strong>{job.name}</strong></div><dl>{items.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value || '—'}</dd></div>)}</dl><div className="rca26SapLookup"><b>SAP lookup</b><span>SM37 by Job Name · SM50/SM66 by WP, PID, program and instance.</span></div></div>
}

const jobColumns = [
  { key: 'identityType', label: 'Scope', render: (row) => <span className={`rca26Scope ${row.identityType?.toLowerCase()}`}>{row.identityType}</span> },
  { key: 'name', label: 'Job / Process' }, { key: 'program', label: 'Program' }, { key: 'topType', label: 'Type' },
  { key: 'topWp', label: 'WP', num: true, value: (row) => Number(row.topWp || 0) }, { key: 'topPid', label: 'PID', num: true, value: (row) => Number(row.topPid || 0) }, { key: 'topState', label: 'State' },
  { key: 'avgCpu', label: 'Avg CPU', num: true, render: (row) => `${f(row.avgCpu, 1)}%` }, { key: 'peakCpu', label: 'Peak CPU', num: true, render: (row) => `${f(row.peakCpu, 1)}%` },
  { key: 'peakRss', label: 'Peak RSS', num: true, render: (row) => `${f(row.peakRss, 2)} GB` }, { key: 'persistenceCount', label: 'Seen', num: true, render: (row) => row.persistenceText },
  { key: 'errors', label: 'Errors', value: (row) => row.errors || [], render: (row) => row.errors?.join(', ') || '—' },
]

export default function ToolLogAnalysis2026({ processMode = false }) {
  const [files, setFiles] = React.useState([])
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('Upload multiple OS/WP-SCOUT log snapshots.')
  const [analysis, setAnalysis] = React.useState(null)
  const [host, setHost] = React.useState('')
  const [rangeStart, setRangeStart] = React.useState('')
  const [rangeEnd, setRangeEnd] = React.useState('')
  const [focusTime, setFocusTime] = React.useState('')
  const [selected, setSelected] = React.useState('')
  const [jobViewRows, setJobViewRows] = React.useState([])

  const analyze = React.useCallback(async (inputFiles) => {
    setBusy(true); setStatus('Parsing snapshots and SAP processes…')
    try {
      const input = []; for (const file of inputFiles) input.push({ name: file.name, text: await file.text() })
      let result; try { result = await workerParse(input) } catch { result = buildLogAnalysis(input.map((item) => parseLogText(item.text, item.name))) }
      setAnalysis(result); setHost(result.primaryHost || ''); setRangeStart(''); setRangeEnd(''); setFocusTime(''); setSelected('')
      setStatus(`Parsed ${result.primarySnapshots.length} primary-host snapshot(s) across ${new Set(result.telemetry.map((item) => item.host)).size} host(s).`)
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
  const snapshots = view?.snapshots || [], peaks = view?.peaks || {}, incident = view?.incidentWindow || { start: '—', end: '—', count: 0, severity: 'NORMAL' }
  const jobs = focusTime ? (view?.jobsFocus || []) : processMode ? (view?.jobsWindow || []) : (view?.jobsIncident || [])
  const selectedJob = jobs.find((item) => item.key === selected) || jobs[0] || null
  const detailJob = selectedJob ? (view?.jobsWindow || []).find((item) => item.key === selectedJob.key) || selectedJob : null
  React.useEffect(() => { if (jobs.length && !jobs.some((item) => item.key === selected)) setSelected(jobs[0].key) }, [jobs, selected])
  const history = [...(detailJob?.records || [])].sort((a, b) => a.sortKey - b.sortKey)
  const severity = view?.severity || 'WAITING'
  const peak = view?.peakSnapshot
  const completeness = view?.completeness || { expected: 0, received: 0, missing: [], intervalMinutes: 0 }

  const jobFilters = [
    { key: 'identityType', label: 'Scope' }, { key: 'topType', label: 'Type' }, { key: 'topState', label: 'State' }, { key: 'errors', label: 'Error', value: (row) => row.errors || [] },
  ]
  const hostColumns = [
    { key: 'host', label: 'Host' }, { key: 'cpuPct', label: 'CPU', num: true, render: (row) => `${f(row.cpuPct, 1)}%` }, { key: 'memoryPct', label: 'RAM', num: true, render: (row) => `${f(row.memoryPct, 1)}%` },
    { key: 'loadRatio', label: 'Load/vCPU', num: true, render: (row) => f(row.loadRatio, 2) }, { key: 'swapIn', label: 'Swap In', num: true, render: (row) => f(row.swapIn) }, { key: 'wpCritical', label: 'WP Crit', num: true },
  ]
  const snapshotColumns = [
    { key: 'timeLabel', label: 'Time' }, { key: 'cpuPct', label: 'CPU', num: true, render: (row) => `${f(row.cpuPct, 2)}%` }, { key: 'memoryPct', label: 'RAM', num: true, render: (row) => `${f(row.memoryPct, 1)}%` },
    { key: 'loadRatio', label: 'Load/vCPU', num: true, render: (row) => f(row.loadRatio, 2) }, { key: 'swapIn', label: 'Swap In', num: true, render: (row) => f(row.swapIn) }, { key: 'wpCritical', label: 'WP Crit', num: true },
    { key: 'severity', label: 'Status', render: (row) => <span className={`rca26Status ${row.severity.toLowerCase()}`}>{row.severity}</span> },
  ]
  const historyColumns = [
    { key: 'timeLabel', label: 'Time' }, { key: 'pid', label: 'PID', num: true }, { key: 'wp', label: 'WP', num: true }, { key: 'type', label: 'Type' }, { key: 'state', label: 'State' },
    { key: 'cpu', label: 'CPU', num: true, render: (row) => `${f(row.cpu, 1)}%` }, { key: 'rssGb', label: 'RSS', num: true, render: (row) => `${f(row.rssGb, 2)} GB` }, { key: 'rabax', label: 'RABAX', num: true }, { key: 'errorCode', label: 'Error', render: (row) => row.errorCode !== '?' ? row.errorCode : '—' },
  ]
  const errorColumns = [
    { key: 'errorCode', label: 'Error Code' }, { key: 'snapshotRecords', label: 'Snapshot Records', num: true }, { key: 'uniqueProcesses', label: 'Unique WP/PID', num: true }, { key: 'affectedJobs', label: 'Affected Jobs', num: true }, { key: 'firstSeen', label: 'First Seen' }, { key: 'lastSeen', label: 'Last Seen' },
  ]

  const setPeakFocus = (time) => { if (time) setFocusTime((current) => current === time ? '' : time) }
  const jobsTitle = focusTime ? `Jobs / Programs at ${focusTime}` : processMode ? 'Jobs / Programs in Analysis Window' : incident.count ? `Jobs / Programs During ${incident.severity} Window (${incident.start} – ${incident.end})` : 'No Incident Window Detected'
  const currentErrors = processMode ? view?.errorsWindow || [] : view?.errorsIncident || []

  return <section className="rca26Shell"><div className="rca26Inner">
    <header className="rca26Head"><div><h1>{processMode ? 'LOG Processes & Jobs' : 'LOG Analysis'}</h1><p>Time → resource pressure → SAP job/program → WP/PID.</p></div><div className="rca26TopActions"><button className="rca26Btn" disabled={!jobViewRows.length} onClick={() => downloadCsv(`log-${view?.host || 'host'}-${view?.analysisWindow.start || 'start'}-${view?.analysisWindow.end || 'end'}.csv`, jobColumns, jobViewRows)}>Export CSV</button><button className="rca26Btn" onClick={() => window.print()}>Print / PDF</button><label className="rca26Upload"><input type="file" multiple accept=".zip,.log,.txt,.csv" onChange={(event) => upload(event.target.files)} />{busy ? 'Parsing…' : 'Upload Logs'}</label></div></header>

    <div className="rca26ModeSwitch"><a href="#/log" data-active={!processMode}>Overview</a><a href="#/tool/logs/process" data-active={processMode}>Jobs & Processes</a></div>

    <section className="rca26ControlBar">
      <label className="rca26Control"><span>Host</span><select value={host || ''} onChange={(event) => { setHost(event.target.value); setRangeStart(''); setRangeEnd(''); setFocusTime('') }}>{(view?.hosts || []).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label className="rca26Control"><span>From</span><select value={rangeStart || ''} onChange={(event) => { setRangeStart(event.target.value); setFocusTime('') }}>{(view?.allHostSnapshots || []).map((row) => <option key={`s-${row.snapshot}`} value={row.timeLabel}>{row.timeLabel}</option>)}</select></label>
      <label className="rca26Control"><span>To</span><select value={rangeEnd || ''} onChange={(event) => { setRangeEnd(event.target.value); setFocusTime('') }}>{(view?.allHostSnapshots || []).map((row) => <option key={`e-${row.snapshot}`} value={row.timeLabel}>{row.timeLabel}</option>)}</select></label>
      {focusTime && <button className="rca26FocusChip" onClick={() => setFocusTime('')}>Focused snapshot {focusTime} ×</button>}
      <div className={`rca26Completeness ${completeness.missing.length ? 'warn' : 'ok'}`}><b>{completeness.received}/{completeness.expected || completeness.received}</b><span>{completeness.intervalMinutes ? `${completeness.intervalMinutes}-min interval` : 'interval unknown'}</span>{completeness.missing.length ? <small>Missing: {completeness.missing.slice(0, 6).join(', ')}{completeness.missing.length > 6 ? '…' : ''}</small> : <small>Snapshot sequence complete</small>}</div>
    </section>

    <section className="rca26MetricStrip">
      <Metric label="Analysis window" value={`${view?.analysisWindow.start || '—'} – ${view?.analysisWindow.end || '—'}`} meta={`${dateOf(peak?.snapshot || snapshots[0]?.snapshot)} · ${view?.analysisWindow.count || 0} snapshots`} />
      <Metric label="System / Host" value={view?.host || '—'} meta={peak ? `SID ${peak.sid || '—'} · Inst ${peak.instance || '—'} · vCPU ${peak.vcpu || '—'}` : status} />
      <Metric label="Incident" value={severity} meta={incident.count ? `${incident.severity} ${incident.start} – ${incident.end}` : 'No WARN/CRIT window'} tone={severity === 'CRIT' ? 'critical' : severity === 'WARN' ? 'warn' : 'good'} />
      <Metric label="Peak CPU" value={`${f(peaks.cpu?.value, 1)}%`} meta={`at ${peaks.cpu?.time || '—'}`} onClick={() => setPeakFocus(peaks.cpu?.time)} />
      <Metric label="Peak RAM" value={`${f(peaks.ram?.value, 1)}%`} meta={`at ${peaks.ram?.time || '—'}`} tone={peaks.ram?.value >= 85 ? 'critical' : ''} onClick={() => setPeakFocus(peaks.ram?.time)} />
      <Metric label="Peak Load / vCPU" value={f(peaks.load?.value, 2)} meta={`at ${peaks.load?.time || '—'}`} tone={peaks.load?.value >= 1.5 ? 'critical' : ''} onClick={() => setPeakFocus(peaks.load?.time)} />
      <Metric label="Peak Swap In" value={f(peaks.swapIn?.value)} meta={`p/s at ${peaks.swapIn?.time || '—'}`} tone={peaks.swapIn?.value >= 1000 ? 'warn' : ''} onClick={() => setPeakFocus(peaks.swapIn?.time)} />
      <Metric label="WP Critical (peak)" value={f(peaks.wpCritical?.value)} meta={`at ${peaks.wpCritical?.time || '—'}`} tone={peaks.wpCritical?.value >= 3 ? 'critical' : peaks.wpCritical?.value >= 1 ? 'warn' : ''} onClick={() => setPeakFocus(peaks.wpCritical?.time)} />
    </section>

    <div className="rca26Grid logMain"><section className="rca26Panel"><div className="rca26PanelHead"><div><h2>Resource Timeline</h2><p>Drag the lower range selector or click a point to focus the job/process view.</p></div><span className="rca26Tag">Actual snapshots</span></div>{snapshots.length ? <><div className="rca26Chart tall wideChart"><ResponsiveContainer width="100%" height="100%"><LineChart data={snapshots} onClick={(state) => state?.activeLabel && setFocusTime(state.activeLabel)} margin={{ top: 10, right: 45, left: 0, bottom: snapshots.length > 12 ? 28 : 8 }}><CartesianGrid strokeDasharray="3 6" vertical={false} /><XAxis dataKey="timeLabel" /><YAxis yAxisId="pct" domain={[0, 100]} tickFormatter={(value) => `${value}%`} /><YAxis yAxisId="load" orientation="right" /><YAxis yAxisId="swap" orientation="right" hide />{incident.count ? <ReferenceArea yAxisId="pct" x1={incident.start} x2={incident.end} fill="#8aa0ad" fillOpacity={0.08} stroke="#748b97" /> : null}<Tooltip content={<Tip />} /><Legend /><Line yAxisId="pct" type="linear" dataKey="cpuPct" name="CPU %" stroke="#32c7cf" strokeWidth={2.2} dot /><Line yAxisId="pct" type="linear" dataKey="memoryPct" name="RAM %" stroke="#4d8fff" strokeWidth={2.2} dot /><Line yAxisId="load" type="linear" dataKey="loadRatio" name="Load / vCPU" stroke="#f5a623" strokeWidth={2} dot /><Line yAxisId="swap" type="linear" dataKey="swapIn" name="Swap In (p/s)" stroke="#9b72ff" strokeWidth={2} dot />{snapshots.length > 4 ? <Brush dataKey="timeLabel" height={20} onChange={(range) => { if (range?.startIndex != null && range?.endIndex != null) { setRangeStart(snapshots[range.startIndex]?.timeLabel || rangeStart); setRangeEnd(snapshots[range.endIndex]?.timeLabel || rangeEnd); setFocusTime('') } }} /> : null}</LineChart></ResponsiveContainer></div><div className="rca26StatusLine">{snapshots.map((row) => <button key={`${row.snapshot}-${row.host}`} onClick={() => setFocusTime(row.timeLabel)} className={row.severity.toLowerCase()} data-active={focusTime === row.timeLabel}><b>{row.timeLabel}</b>{row.severity}</button>)}</div></> : <div className="rca26Empty">{status}</div>}</section>
      <aside className="rca26Stack"><section className="rca26Panel compactPanel"><div className="rca26PanelHead"><div><h2>Resource Peaks</h2><p>Click a peak to inspect jobs active at that timestamp.</p></div></div>{[['CPU', `${f(peaks.cpu?.value, 1)}%`, peaks.cpu?.time], ['RAM', `${f(peaks.ram?.value, 1)}%`, peaks.ram?.time], ['Load/vCPU', f(peaks.load?.value, 2), peaks.load?.time], ['Swap In', `${f(peaks.swapIn?.value)} p/s`, peaks.swapIn?.time], ['WP Critical', f(peaks.wpCritical?.value), peaks.wpCritical?.time]].map(([label, value, time]) => <button className="rca26KeyValue clickable" key={label} onClick={() => setPeakFocus(time)}><span>{label}</span><b>{value}</b><small>{time || '—'}</small></button>)}</section><section className="rca26Panel compactPanel"><div className="rca26PanelHead"><div><h2>Peak pressure snapshot ({view?.peakTime || '—'})</h2><p>Combined pressure point; individual resources keep their own peaks.</p></div></div>{peak ? <div className="rca26Snapshot">{[['Host', peak.host], ['CPU', `${f(peak.cpuPct, 1)}%`], ['RAM', `${f(peak.memoryPct, 1)}%`], ['Load 1/5/15', `${f(peak.load1, 2)} / ${f(peak.load5, 2)} / ${f(peak.load15, 2)}`], ['Load/vCPU', f(peak.loadRatio, 2)], ['Swap In/Out', `${f(peak.swapIn)} / ${f(peak.swapOut)} p/s`], ['WP Run/Standby/Crit', `${peak.wpRunning} / ${peak.wpStandby} / ${peak.wpCritical}`]].map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div> : <div className="rca26Empty compact">No snapshot.</div>}</section></aside>
    </div>

    <div className="rca26Grid two rca26Deferred"><section className="rca26Panel"><div className="rca26PanelHead"><div><h2>Host Comparison — peak collector batch</h2><p>Confirms whether pressure is host-specific or landscape-wide.</p></div></div><RcaDataTable rows={view?.hostComparison || []} columns={hostColumns} compact search={false} pageSize={20} defaultSort={{ key: 'loadRatio', dir: 'desc' }} rowKey={(row) => `${row.host}-${row.timeLabel}`} /></section><section className="rca26Panel"><div className="rca26PanelHead"><div><h2>Raw Snapshot List</h2><p>Current host and selected time range.</p></div></div><RcaDataTable rows={snapshots} columns={snapshotColumns} compact search={false} pageSize={100} defaultSort={{ key: 'timeLabel', dir: 'asc' }} rowKey={(row) => `${row.host}-${row.snapshot}`} onRowClick={(row) => setFocusTime(row.timeLabel)} selectedKey={focusTime ? `${view?.host}-${snapshots.find((row) => row.timeLabel === focusTime)?.snapshot}` : ''} /></section></div>

    <section className="rca26Panel rca26Deferred"><div className="rca26PanelHead"><div><h2>{jobsTitle}</h2><p>{focusTime ? 'Snapshot-focused job/process evidence.' : processMode ? 'Full selected analysis-window inventory.' : 'Only workloads observed inside the detected WARN/CRIT window.'}</p></div>{focusTime && <button className="rca26TextBtn" onClick={() => setFocusTime('')}>Clear snapshot focus</button>}</div><RcaDataTable rows={jobs} columns={jobColumns} filters={jobFilters} searchPlaceholder="Search job, program, PID, WP, error…" pageSize={50} defaultSort={{ key: 'peakRss', dir: 'desc' }} rowKey={(row) => row.key} onRowClick={(row) => setSelected(row.key)} selectedKey={selectedJob?.key || ''} onViewChange={setJobViewRows} emptyText={focusTime ? `No processes captured at ${focusTime}.` : processMode ? 'No processes in the selected window.' : 'No WARN/CRIT incident jobs in this window.'} /></section>

    <div className="rca26Grid logDetail rca26Deferred"><section className="rca26Panel"><JobDetail job={detailJob} /></section><section className="rca26Panel"><div className="rca26PanelHead"><div><h2>Job Resource History</h2><p>Same job/program across the selected analysis window.</p></div></div><RcaDataTable rows={history} columns={historyColumns} search={false} filters={[{ key: 'type', label: 'Type' }, { key: 'state', label: 'State' }]} pageSize={50} defaultSort={{ key: 'timeLabel', dir: 'asc' }} rowKey={(row) => `${row.snapshot}-${row.pid}-${row.wp}`} /></section></div>

    <section className="rca26Panel rca26Deferred"><div className="rca26PanelHead"><div><h2>{processMode ? 'Error Evidence in Analysis Window' : 'Error Evidence During Incident'}</h2><p>Error is supporting evidence, deduplicated by snapshot and unique WP/PID.</p></div></div><RcaDataTable rows={currentErrors} columns={errorColumns} searchPlaceholder="Search error code…" pageSize={50} defaultSort={{ key: 'uniqueProcesses', dir: 'desc' }} rowKey={(row) => row.errorCode} /></section>
  </div></section>
}
