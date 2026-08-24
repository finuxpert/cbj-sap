import React from 'react'
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Brush } from 'recharts'
import { expandSt03nFiles, REQUIRED_ST03N } from './parsers/st03nParser.js'
import { analyzeSt03nFiles, transactionDecomposition } from './st03nAnalysis2026.js'
import RcaDataTable from './components/RcaDataTable.jsx'
import { downloadCsv, downloadWorkspacePdf } from './rcaExport.js'
import './RcaWorkspace2026.css'
import './RcaWorkspaceV13.css'
import './RcaWorkspaceV133.css'

const n = (value, digits = 0) => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: digits })
const sh = (value = '', max = 28) => String(value).length > max ? `${String(value).slice(0, max - 1)}…` : String(value)
const Metric = ({ label, value, meta, tone = '' }) => <div className={`rca26Metric ${tone}`}><span>{label}</span><strong title={String(value)}>{value}</strong><small>{meta || '—'}</small></div>

function workerParse(files) {
  return new Promise((resolve, reject) => {
    if (typeof Worker === 'undefined') return reject(new Error('Worker unavailable'))
    const worker = new Worker(new URL('./workers/st03nParser.worker.js', import.meta.url), { type: 'module' })
    worker.onmessage = (event) => { worker.terminate(); event.data?.ok ? resolve(event.data.analysis) : reject(new Error(event.data?.error || 'Worker failed')) }
    worker.onerror = (event) => { worker.terminate(); reject(new Error(event.message || 'Worker failed')) }
    worker.postMessage({ files })
  })
}

function TimeTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return <div className="rca26Tooltip"><strong>{label}</strong><span>Avg Response {n(row.avgResponseMs, 1)} ms</span><span>DB {n(row.avgDbMs, 1)} ms</span><span>CPU {n(row.avgCpuMs, 1)} ms</span><span>Wait and Roll {n(row.avgWaitTotalMs, 1)} ms</span><span>Steps {n(row.steps)}</span></div>
}

function DecompTip({ active, payload, label, percent }) {
  if (!active || !payload?.length) return null
  return <div className="rca26Tooltip"><strong>{label}</strong>{payload.filter((item) => Number(item.value) > 0).map((item) => <span key={item.dataKey}><i style={{ background: item.color }} />{item.name} {percent ? `${n(item.value, 1)}%` : `${n(item.value, 1)} ms`}</span>)}</div>
}

function recordHourMatches(timestamp = '', interval = '') {
  if (!interval) return true
  const start = Number(String(interval).match(/(\d{1,2})/)?.[1])
  const hour = Number(String(timestamp).match(/\s(\d{1,2}):/)?.[1])
  return Number.isFinite(start) && Number.isFinite(hour) ? hour === start : true
}

function recordObjectMatches(record, selectedObject = '') {
  if (!selectedObject) return true
  const target = selectedObject.trim().toUpperCase()
  return [record.transaction, record.program, record.label].some((value) => String(value || '').trim().toUpperCase() === target)
}

function percentDecomposition(rows) {
  return rows.map((row) => {
    const keys = ['db', 'cpu', 'wait', 'rollWait', 'load', 'unattributed']
    const total = keys.reduce((sum, key) => sum + Number(row[key] || 0), 0) || 1
    return { ...row, ...Object.fromEntries(keys.map((key) => [key, Number(row[key] || 0) / total * 100])) }
  })
}

export default function ToolSt03nAnalysis2026() {
  const reportRef = React.useRef(null)
  const [files, setFiles] = React.useState([])
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('Upload five ST03N exports or one ZIP pack.')
  const [analysis, setAnalysis] = React.useState(null)
  const [selectedInterval, setSelectedInterval] = React.useState('')
  const [selectedObject, setSelectedObject] = React.useState('')
  const [txQuery, setTxQuery] = React.useState('')
  const [decompMode, setDecompMode] = React.useState('percent')
  const [transactionViewRows, setTransactionViewRows] = React.useState([])

  const analyze = React.useCallback(async (inputFiles) => {
    setBusy(true); setStatus('Parsing ST03N exports…')
    try {
      let result; try { result = await workerParse(inputFiles) } catch { result = await analyzeSt03nFiles(inputFiles) }
      setAnalysis(result); setSelectedInterval(''); setSelectedObject(''); setTxQuery('')
      setStatus(`Parsed ${result.totalRows} rows from ${result.coverage.filter((item) => item.ok).length} of ${REQUIRED_ST03N.length} data groups.`)
    } catch (error) { setStatus(error?.message || 'ST03N parse failed.') } finally { setBusy(false) }
  }, [])

  const upload = React.useCallback(async (list) => {
    setBusy(true)
    try { const expanded = await expandSt03nFiles(list); setFiles(expanded); await analyze(expanded) }
    catch (error) { setStatus(error?.message || 'Upload failed.'); setBusy(false) }
  }, [analyze])

  const workload = analysis?.workloadTransactions || analysis?.transactions || []
  const decompositionAbsolute = React.useMemo(() => transactionDecomposition(workload, 8), [workload])
  const decomposition = React.useMemo(() => decompMode === 'percent' ? percentDecomposition(decompositionAbsolute) : decompositionAbsolute, [decompositionAbsolute, decompMode])
  const ok = analysis?.coverage?.filter((item) => item.ok).length || 0
  const peak = analysis?.peakInterval?.row, topTx = analysis?.topTransaction, topResp = analysis?.topResponseRecord, topDb = analysis?.topDbRecord
  const max = Math.max(1, ...workload.slice(0, 8).map((item) => Number(item.totalResponseSec || 0)))
  const packDate = topResp?.timestamp?.slice(0, 10) || topDb?.timestamp?.slice(0, 10) || '—'

  const selectObject = (object) => { setSelectedObject((current) => current === object ? '' : object); setTxQuery(object || '') }
  const filteredResponse = (analysis?.responseRecords || []).filter((row) => recordHourMatches(row.timestamp, selectedInterval) && recordObjectMatches(row, selectedObject))
  const filteredDb = (analysis?.dbRecords || []).filter((row) => recordHourMatches(row.timestamp, selectedInterval) && recordObjectMatches(row, selectedObject))

  const taskColumns = [
    { key: 'taskType', label: 'Task Type' }, { key: 'steps', label: 'Steps', num: true }, { key: 'avgResponseMs', label: 'Avg Response', num: true, render: (row) => `${n(row.avgResponseMs, 1)} ms` },
    { key: 'avgDbMs', label: 'DB', num: true, render: (row) => n(row.avgDbMs, 1) }, { key: 'avgCpuMs', label: 'CPU', num: true, render: (row) => n(row.avgCpuMs, 1) }, { key: 'avgWaitTotalMs', label: 'Wait and Roll', num: true, render: (row) => n(row.avgWaitTotalMs, 1) },
  ]
  const transactionColumns = [
    { key: 'scope', label: 'Scope', value: (row) => row.technical ? 'TECH' : 'WORKLOAD', render: (row) => <span className={`rca26Scope ${row.technical ? 'technical' : 'workload'}`}>{row.technical ? 'TECH' : 'WORKLOAD'}</span> },
    { key: 'object', label: 'Object' }, { key: 'jobName', label: 'Background Job', render: (row) => row.jobName || '—' }, { key: 'steps', label: 'Steps', num: true },
    { key: 'totalResponseSec', label: 'Total Response', num: true, render: (row) => `${n(row.totalResponseSec)} s` }, { key: 'avgResponseMs', label: 'Avg Response', num: true, render: (row) => `${n(row.avgResponseMs, 1)} ms` },
    { key: 'responseConsistency', label: 'Consistency', render: (row) => <span className={`rca26Status ${row.responseConsistency === 'CHECK' ? 'warn' : 'ok'}`}>{row.responseConsistency}{row.responseConsistency === 'CHECK' ? ` ${n(row.responseConsistencyPct, 1)}%` : ''}</span> },
    { key: 'avgDbMs', label: 'Avg DB', num: true, render: (row) => n(row.avgDbMs, 1) }, { key: 'avgCpuMs', label: 'Avg CPU', num: true, render: (row) => n(row.avgCpuMs, 1) }, { key: 'avgWaitTotalMs', label: 'Avg Wait and Roll', num: true, render: (row) => n(row.avgWaitTotalMs, 1) },
  ]
  const responseColumns = [
    { key: 'timestamp', label: 'Timestamp' }, { key: 'label', label: 'Object', value: (row) => row.program || row.transaction || row.label }, { key: 'taskType', label: 'Task' }, { key: 'wp', label: 'WP', num: true }, { key: 'user', label: 'User' },
    { key: 'responseMs', label: 'Response', num: true, render: (row) => `${n(row.responseMs)} ms` }, { key: 'dbMs', label: 'DB', num: true, render: (row) => n(row.dbMs) }, { key: 'cpuMs', label: 'CPU', num: true, render: (row) => n(row.cpuMs) }, { key: 'waitMs', label: 'Wait', num: true, render: (row) => n(row.waitMs) }, { key: 'rollWaitMs', label: 'Roll Wait', num: true, render: (row) => n(row.rollWaitMs) },
  ]
  const dbColumns = [
    { key: 'timestamp', label: 'Timestamp' }, { key: 'label', label: 'Object', value: (row) => row.program || row.transaction || row.label }, { key: 'taskType', label: 'Task' }, { key: 'wp', label: 'WP', num: true },
    { key: 'dbAccessMs', label: 'DB Access', num: true, render: (row) => `${n(row.dbAccessMs)} ms` }, { key: 'logicalCalls', label: 'Logical Calls', num: true }, { key: 'sequentialReads', label: 'Seq Reads', num: true }, { key: 'directReads', label: 'Direct Reads', num: true },
  ]

  return <section className="rca26Shell"><div className="rca26Inner" ref={reportRef}>
    <header className="rca26Head"><div><h1>ST03N Analysis</h1><p>SAP workload and response-time analysis.</p></div><div className="rca26TopActions"><button className="rca26Btn" disabled={!transactionViewRows.length} onClick={() => downloadCsv(`st03n-transactions-${packDate}.csv`, transactionColumns, transactionViewRows)}>Export CSV</button><button className="rca26Btn" onClick={() => downloadWorkspacePdf(reportRef.current, { filename: `sap-rca-st03n-${packDate}.pdf`, title: 'SAP RCA Workspace · ST03N Analysis' })}>Export PDF</button><label className="rca26Upload"><input type="file" multiple accept=".zip,.xlsx,.xls,.csv" onChange={(event) => upload(event.target.files)} />{busy ? 'Parsing…' : 'Upload ST03N Pack'}</label></div></header>

    {(selectedInterval || selectedObject) && <div className="rca26ActiveFilters"><span>Active filters</span>{selectedInterval && <button onClick={() => setSelectedInterval('')}>Hour {selectedInterval} ×</button>}{selectedObject && <button onClick={() => { setSelectedObject(''); setTxQuery('') }}>Object {selectedObject} ×</button>}<small>Applies to response and database records.</small></div>}

    <section className="rca26MetricStrip st03nStrip"><Metric label="Data Coverage" value={`${ok}/${REQUIRED_ST03N.length}`} meta={`${analysis?.totalRows || 0} normalized rows`} tone={ok === REQUIRED_ST03N.length ? 'good' : 'warn'} /><Metric label="Pack Date" value={packDate} meta={files.length ? `${files.length} files` : status} /><Metric label="Peak Hour Response" value={peak ? `${n(peak.avgResponseMs, 1)} ms` : '—'} meta={peak?.interval || 'Time Profile'} /><Metric label="Top Workload" value={topTx ? sh(topTx.object, 22) : '—'} meta={topTx ? `${n(topTx.totalResponseSec)} s · ${n(topTx.steps)} steps` : 'Transaction Standard'} /><Metric label="Top Response Record" value={topResp ? sh(topResp.label, 22) : '—'} meta={topResp ? `${n(topResp.responseMs)} ms · ${topResp.timestamp}` : 'Top Response'} /><Metric label="Data Consistency" value={analysis ? `${analysis.consistencyCheckCount || 0} CHECK` : '—'} meta="Response total consistency check" tone={analysis?.consistencyCheckCount ? 'warn' : 'good'} /></section>

    <div className="rca26Grid st03nMain"><section className="rca26Panel"><div className="rca26PanelHead"><div><h2>Time Profile</h2><p data-pdf-ignore="true">Select an hour to filter related records.</p></div><span className="rca26Tag">24-hour workload</span></div>{analysis?.timeProfile?.length ? <div className="rca26Chart tall wideChart"><ResponsiveContainer width="100%" height="100%"><LineChart data={analysis.timeProfile} onClick={(state) => state?.activeLabel && setSelectedInterval((current) => current === state.activeLabel ? '' : state.activeLabel)} margin={{ top: 10, right: 20, left: 0, bottom: 28 }}><CartesianGrid strokeDasharray="3 6" vertical={false} /><XAxis dataKey="interval" /><YAxis /><Tooltip content={<TimeTip />} /><Legend /><Line type="linear" dataKey="avgResponseMs" name="Avg Response" stroke="#4d8fff" strokeWidth={2.4} dot /><Line type="linear" dataKey="avgDbMs" name="Avg DB" stroke="#32c7cf" strokeWidth={2} dot /><Line type="linear" dataKey="avgCpuMs" name="Avg CPU" stroke="#f5a623" strokeWidth={2} dot /><Line type="linear" dataKey="avgWaitTotalMs" name="Wait and Roll" stroke="#9b72ff" strokeWidth={2} dot /><Brush dataKey="interval" height={20} /></LineChart></ResponsiveContainer></div> : <div className="rca26Empty">{status}</div>}</section><section className="rca26Panel compactPanel"><div className="rca26PanelHead"><div><h2>Task Types</h2><p>Aggregate workload.</p></div></div><RcaDataTable rows={analysis?.taskTypes || []} columns={taskColumns} searchPlaceholder="Search task type…" pageSize={25} defaultSort={{ key: 'avgResponseMs', dir: 'desc' }} rowKey={(row) => row.taskType} /></section></div>

    <section className="rca26Panel rca26Deferred"><div className="rca26PanelHead"><div><h2>Response Time Breakdown</h2><p>{decompMode === 'percent' ? 'Relative component mix.' : 'Source response components in milliseconds.'}</p></div><div className="rca26ToggleGroup"><button data-active={decompMode === 'percent'} onClick={() => setDecompMode('percent')}>Percent</button><button data-active={decompMode === 'absolute'} onClick={() => setDecompMode('absolute')}>Milliseconds</button></div></div>{decomposition.length ? <div className="rca26Chart tall wideChart"><ResponsiveContainer width="100%" height="100%"><BarChart data={decomposition} onClick={(state) => state?.activeLabel && selectObject(state.activeLabel)} margin={{ top: 8, right: 18, left: 0, bottom: 72 }}><CartesianGrid strokeDasharray="3 6" vertical={false} /><XAxis dataKey="name" angle={-28} textAnchor="end" interval={0} height={82} tickFormatter={(value) => sh(value, 20)} /><YAxis domain={decompMode === 'percent' ? [0, 100] : undefined} tickFormatter={decompMode === 'percent' ? (value) => `${value}%` : undefined} /><Tooltip content={<DecompTip percent={decompMode === 'percent'} />} /><Legend /><Bar stackId="a" dataKey="db" name="DB" fill="#32c7cf" /><Bar stackId="a" dataKey="cpu" name="CPU" fill="#4d8fff" /><Bar stackId="a" dataKey="wait" name="Wait" fill="#9b72ff" /><Bar stackId="a" dataKey="rollWait" name="Roll Wait" fill="#7356b6" /><Bar stackId="a" dataKey="load" name="Load" fill="#f5a623" /><Bar stackId="a" dataKey="unattributed" name="Unattributed" fill="#60717b" /></BarChart></ResponsiveContainer></div> : <div className="rca26Empty compact">No transaction data.</div>}</section>

    <div className="rca26Grid st03nWorkloadGrid rca26Deferred"><section className="rca26Panel"><div className="rca26PanelHead"><div><h2>Top Workloads</h2><p data-pdf-ignore="true">Select a workload to filter related records.</p></div></div><div className="rca26Bars">{workload.slice(0, 8).map((row) => <button className="rca26BarRow workload clickable" data-active={selectedObject === row.object} key={`${row.object}-${row.jobName}`} onClick={() => selectObject(row.object)}><label>{row.object}</label><div className="rca26BarTrack"><div className="rca26BarFill" style={{ width: `${Math.max(2, Number(row.totalResponseSec || 0) / max * 100)}%` }} /></div><strong>{n(row.totalResponseSec)}s</strong></button>)}</div></section><section className="rca26Panel"><div className="rca26PanelHead"><div><h2>Workload Details</h2><p>Source values unchanged.</p></div></div><RcaDataTable rows={analysis?.transactions || []} columns={transactionColumns} query={txQuery} onQueryChange={setTxQuery} searchPlaceholder="Search object or background job…" filters={[{ key: 'scope', label: 'Scope', value: (row) => row.technical ? 'TECH' : 'WORKLOAD', options: ['WORKLOAD', 'TECH'] }, { key: 'responseConsistency', label: 'Consistency', options: ['OK', 'CHECK'] }]} pageSize={50} defaultSort={{ key: 'totalResponseSec', dir: 'desc' }} rowKey={(row, index) => `${row.object}-${row.jobName}-${index}`} onRowClick={(row) => selectObject(row.object)} onViewChange={setTransactionViewRows} /></section></div>

    <div className="rca26Grid two rca26Deferred"><section className="rca26Panel"><div className="rca26PanelHead"><div><h2>Response Records</h2><p>{selectedInterval || selectedObject ? 'Linked filters active.' : 'Individual response records.'}</p></div></div><RcaDataTable rows={filteredResponse} columns={responseColumns} searchPlaceholder="Search object or user…" filters={[{ key: 'taskType', label: 'Task' }, { key: 'user', label: 'User' }]} pageSize={50} defaultSort={{ key: 'responseMs', dir: 'desc' }} rowKey={(row, index) => `${row.timestamp}-${row.label}-${index}`} /></section><section className="rca26Panel"><div className="rca26PanelHead"><div><h2>Database Records</h2><p>{selectedInterval || selectedObject ? 'Linked filters active.' : 'Database access and logical calls.'}</p></div></div><RcaDataTable rows={filteredDb} columns={dbColumns} searchPlaceholder="Search object…" filters={[{ key: 'taskType', label: 'Task' }]} pageSize={50} defaultSort={{ key: 'dbAccessMs', dir: 'desc' }} rowKey={(row, index) => `${row.timestamp}-${row.label}-${index}`} /></section></div>

    <section className="rca26Panel rca26Deferred"><div className="rca26PanelHead"><div><h2>Data Coverage</h2><p>Expected ST03N exports.</p></div></div><div className="rca26Coverage">{REQUIRED_ST03N.map((required) => { const item = (analysis?.coverage || []).find((row) => row.kind === required.key); return <div key={required.key} data-ok={item?.ok}><span>{required.label}</span><b>{item?.ok ? 'Parsed' : 'Missing'}</b><small>{item?.fileName || '—'}{item?.ok ? ` · ${item.rows} rows` : ''}</small></div> })}</div></section>
  </div></section>
}
