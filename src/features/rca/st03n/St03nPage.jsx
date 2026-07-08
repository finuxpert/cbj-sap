import React from 'react'
import { fmt, loadJson, saveJson } from '../shared/rca-utils.js'
import { EmptyState, UploadedFilesPanel } from '../shared/RcaEvidenceKit.jsx'
import { buildSt03nAnalysis, classifySt03nFile, expandSt03nFiles, parseSt03nFile, REQUIRED_ST03N } from './st03n-parser.js'
import '../shared/RcaDashboard.css'
import './St03nPage.css'

const CACHE_KEY = 'sap_st03n_impact_v2_cache'
const ACCEPTED_TYPES = ['.xlsx', '.xls', '.csv', '.zip']
const ST03N_TABS = ['Time Profile', 'Workload Overview', 'Top Response Time', 'Top DB Accesses', 'Transaction Profile']
const TAB_KIND = {
  'Time Profile': 'timeProfile',
  'Workload Overview': 'workload',
  'Top Response Time': 'topResponse',
  'Top DB Accesses': 'topDb',
  'Transaction Profile': 'transactionStandard',
}

function compactLabel(value = '', max = 30) {
  const label = String(value || 'Unknown').trim() || 'Unknown'
  return label.length > max ? `${label.slice(0, max - 1)}…` : label
}

function metric(row = {}, primary, fallback) {
  return Math.round(Number(row?.[primary] ?? row?.[fallback] ?? 0))
}

function rowName(row = {}) {
  return compactLabel(row?.label || row?.name || row?.program || row?.transaction || row?.fileName || row?.kind || 'ST03N item', 36)
}

function taskType(row = {}) {
  return compactLabel(row?.taskType || row?.task || row?.component || row?.kind || 'Dialog', 18)
}

function extractTimeLabel(value = '') {
  const raw = String(value || '').trim()
  if (!raw) return ''

  const time = raw.match(/(?:^|\D)([01]?\d|2[0-3])[:.](\d{2})(?::\d{2})?(?:\D|$)/)
  if (time) return `${String(time[1]).padStart(2, '0')}:${time[2]}`

  const compactTime = raw.match(/(?:^|\D)([01]\d|2[0-3])([0-5]\d)(?:\D|$)/)
  if (compactTime) return `${compactTime[1]}:${compactTime[2]}`

  const date = raw.match(/\b(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\b/)
  if (date) return date[1]

  return ''
}

function bucketLabel(row = {}, index = 0) {
  const candidates = [row.time, row.hour, row.interval, row.bucket, row.period, row.startTime, row.endTime, row.timestamp, row.dateTime, row.datetime, row.date, row.label, row.name, row.fileName]
  for (const item of candidates) {
    const extracted = extractTimeLabel(item)
    if (extracted) return compactLabel(extracted, 10)
    if (item && ['time', 'hour', 'interval', 'bucket', 'period', 'startTime', 'endTime'].some((key) => row[key] === item)) return compactLabel(item, 10)
  }
  return String(index + 1).padStart(2, '0')
}

function rowsForTab(rows = [], activeTab = 'Time Profile') {
  const kind = TAB_KIND[activeTab]
  if (!kind) return rows
  return rows.filter((row) => row.kind === kind)
}

function graphRows(rows = [], limit = 12) {
  return rows.slice(0, limit).map((row, index) => {
    const response = metric(row, 'response', 'responseMs')
    const db = metric(row, 'db', 'dbMs')
    const wait = metric(row, 'wait', 'waitMs')
    const cpu = metric(row, 'cpu', 'cpuMs')
    const steps = Math.round(Number(row.steps || 0))
    return {
      ...row,
      name: rowName(row),
      bucket: bucketLabel(row, index),
      taskType: taskType(row),
      response,
      db,
      wait,
      cpu,
      steps,
      effective: Math.max(response, db + wait + cpu),
    }
  })
}

function evidencePeriod(files = []) {
  const joined = files.map((file) => file.name || '').join(' ')
  const match = joined.match(/(\d{1,2}\.\d{1,2}\.\d{4})\s*-\s*(\d{1,2}\.\d{1,2}\.\d{4})/)
  if (match) return `${match[1]} - ${match[2]}`
  return 'Uploaded ST03N period'
}

function evidencePackName(files = []) {
  const zip = files.find((file) => String(file.name || '').toLowerCase().endsWith('.zip'))
  if (zip?.name) return zip.name
  const first = files[0]?.name
  if (!first) return 'No ST03N evidence loaded'
  return compactLabel(first, 64)
}

function buildReportText(analysis) {
  if (!analysis) return ''
  const rows = graphRows(analysis.rows || [], 10)
  return [
    'ST03N Workload Analysis',
    `Rows: ${fmt(analysis.rows?.length || 0, 0)}`,
    `Files: ${fmt(analysis.files?.length || 0, 0)}`,
    ...rows.map((row, index) => `#${index + 1} ${row.name} | Response ${fmt(row.response, 0)}ms | DB ${fmt(row.db, 0)}ms | Wait ${fmt(row.wait, 0)}ms | Steps ${fmt(row.steps, 0)}`),
  ].join('\n')
}

function pageStats(rows = []) {
  const data = graphRows(rows, rows.length || 1)
  const totalSteps = data.reduce((sum, row) => sum + row.steps, 0)
  const peakResponse = Math.max(0, ...data.map((row) => row.response))
  const peakDb = Math.max(0, ...data.map((row) => row.db))
  const weightedResponse = data.reduce((sum, row) => sum + (row.response * Math.max(row.steps, 1)), 0)
  const weight = data.reduce((sum, row) => sum + Math.max(row.steps, 1), 0) || 1
  return {
    totalSteps,
    peakResponse,
    avgResponse: Math.round(weightedResponse / weight),
    peakDb,
  }
}

function AcceptedTypes() {
  return <div className="acceptedTypes">{ACCEPTED_TYPES.map((item) => <span key={item}>{item}</span>)}</div>
}

function St03nHeader({ busy, files, analysis, onFiles }) {
  const displayedFiles = files.length ? files : (analysis?.files || [])
  return (
    <header className="rcaFinalHero">
      <div>
        <span>ST03N Evidence Console</span>
        <h1>ST03N Workload Analyzer</h1>
        <p>Technical workload view for Time Profile, Workload Overview, Top Response Time, Top DB Accesses, and Transaction Profile evidence.</p>
      </div>
      <label className="rcaFinalUpload">
        <input type="file" multiple accept=".zip,.xlsx,.xls,.csv" onChange={(event) => onFiles(event.target.files)} />
        <strong>{busy ? 'Parsing ST03N…' : 'Upload ST03N Evidence'}</strong>
        <small>Excel, CSV, or ZIP evidence pack</small>
        <AcceptedTypes />
      </label>
      <div className="st03nFilterBar">
        <label><span>System</span><select defaultValue="PRD"><option>PRD</option><option>AOQ</option><option>QAS</option></select></label>
        <label><span>Time Window</span><input readOnly value={evidencePeriod(displayedFiles)} /></label>
        <label><span>Evidence Pack</span><input readOnly value={evidencePackName(displayedFiles)} /></label>
        <label><span>Files</span><input readOnly value={`${displayedFiles.length || 0} / ${REQUIRED_ST03N.length}`} /></label>
      </div>
    </header>
  )
}

function St03nTabs({ activeTab, onChange }) {
  return <nav className="st03nTabs">{ST03N_TABS.map((tab) => <button type="button" className={activeTab === tab ? 'active' : ''} key={tab} onClick={() => onChange(tab)}>{tab}</button>)}</nav>
}

function KpiStrip({ analysis, stats, period }) {
  const kpis = [
    ['Selected Window', period, 'ST03N evidence period', 'wide'],
    ['Total Dialog Steps', fmt(stats.totalSteps, 0), 'Parsed workload steps', ''],
    ['Peak Response Time', `${fmt(stats.peakResponse, 0)} ms`, 'Highest parsed response', ''],
    ['Average Response Time', `${fmt(stats.avgResponse, 0)} ms`, 'Weighted by dialog steps', ''],
    ['Peak DB Time', `${fmt(stats.peakDb, 0)} ms`, 'Highest parsed DB time', ''],
    ['Files Parsed', `${analysis?.files?.length || 0} / ${REQUIRED_ST03N.length}`, 'Required evidence coverage', ''],
  ]
  return <section className="st03nKpiGrid">{kpis.map(([label, value, hint, tone]) => <div className={`st03nKpi ${tone || ''}`} key={label}><span>{label}</span><b>{value}</b><small>{hint}</small></div>)}</section>
}

function SeriesChart({ title, subtitle = 'Parsed time sequence', rows = [], series = [], height = 220 }) {
  const data = graphRows(rows, 10)
  const maxValue = Math.max(1, ...data.flatMap((row) => series.map((item) => Number(row[item.key] || 0))))
  const width = 1000
  const chartHeight = height
  const left = 46
  const right = 22
  const top = 18
  const bottom = 34
  const innerW = width - left - right
  const innerH = chartHeight - top - bottom
  const x = (index) => left + (data.length <= 1 ? 0 : (index / (data.length - 1)) * innerW)
  const y = (value) => top + innerH - ((Number(value || 0) / maxValue) * innerH)
  return (
    <section className="rcaFinalCard st03nChartPanel">
      <div className="rcaFinalPanelTitle"><h2>{title}</h2><span>{subtitle}</span></div>
      {data.length ? <svg className="st03nLineChart" viewBox={`0 0 ${width} ${chartHeight}`} role="img">
        {[0, .25, .5, .75, 1].map((tick) => <line key={tick} x1={left} x2={width - right} y1={top + tick * innerH} y2={top + tick * innerH} />)}
        {series.map((item) => {
          const points = data.map((row, index) => `${x(index)},${y(row[item.key])}`).join(' ')
          return <polyline key={item.key} className={item.key} points={points} />
        })}
        {data.map((row, index) => <text key={`${row.name}-${index}`} x={x(index)} y={chartHeight - 10}>{row.bucket}</text>)}
      </svg> : <p>No parsed ST03N rows available for this evidence tab.</p>}
      <div className="st03nLegend">{series.map((item) => <span className={item.key} key={item.key}>{item.label}</span>)}</div>
    </section>
  )
}

function DataTable({ title, subtitle, rows = [], columns = [], compact = false }) {
  return (
    <section className={`rcaFinalCard rcaFinalTableCard st03nDataTable ${compact ? 'compact' : ''}`}>
      <div className="rcaFinalPanelTitle"><h2>{title}</h2><span>{subtitle}</span></div>
      <div className="rcaFinalTableWrap">
        <table>
          <thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
          <tbody>
            {rows.length ? rows.map((row, index) => <tr key={`${title}-${row.name || row.taskType}-${index}`}>{columns.map((column) => <td key={column.key}>{column.render ? column.render(row, index) : row[column.key]}</td>)}</tr>) : <tr><td colSpan={columns.length}>No parsed ST03N rows available for this evidence tab.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function workloadRows(rows = []) {
  return Object.values(graphRows(rows, rows.length).reduce((acc, row) => {
    const key = row.taskType || 'Dialog'
    if (!acc[key]) acc[key] = { taskType: key, steps: 0, response: 0, db: 0, wait: 0, count: 0 }
    acc[key].steps += row.steps
    acc[key].response += row.response
    acc[key].db += row.db
    acc[key].wait += row.wait
    acc[key].count += 1
    return acc
  }, {})).map((item) => ({ ...item, response: Math.round(item.response / item.count), db: Math.round(item.db / item.count), wait: Math.round(item.wait / item.count) })).slice(0, 8)
}

function WorkloadOverview({ rows = [], full = false }) {
  const grouped = workloadRows(rows)
  return <DataTable compact title="Workload Overview" subtitle="By task type" rows={grouped} columns={[
    { key: 'taskType', label: 'Task Type' },
    { key: 'steps', label: 'Steps', render: (row) => fmt(row.steps, 0) },
    { key: 'response', label: 'Avg Resp', render: (row) => `${fmt(row.response, 0)} ms` },
    { key: 'db', label: 'Avg DB', render: (row) => `${fmt(row.db, 0)} ms` },
    { key: 'wait', label: 'Avg Wait', render: (row) => `${fmt(row.wait, 0)} ms` },
    ...(full ? [{ key: 'count', label: 'Records', render: (row) => fmt(row.count, 0) }] : []),
  ]} />
}

function preparedTables(rows = []) {
  const data = graphRows(rows, rows.length || 1)
  const topResponse = [...data].sort((a, b) => b.response - a.response).slice(0, 10)
  const topDb = [...data].sort((a, b) => b.db - a.db).slice(0, 10)
  const transactionRows = [...data].sort((a, b) => b.steps - a.steps).slice(0, 12)
  return { data, topResponse, topDb, transactionRows }
}

function TopResponseTable({ rows = [] }) {
  const { topResponse } = preparedTables(rows)
  return <DataTable title="Top Response Time" subtitle="By total response time" rows={topResponse} columns={[
    { key: 'rank', label: '#', render: (_row, index) => index + 1 },
    { key: 'name', label: 'Program / TCode' },
    { key: 'taskType', label: 'Task Type' },
    { key: 'response', label: 'Total Response', render: (row) => `${fmt(row.response, 0)} ms` },
    { key: 'db', label: 'DB Time', render: (row) => `${fmt(row.db, 0)} ms` },
    { key: 'wait', label: 'Wait', render: (row) => `${fmt(row.wait, 0)} ms` },
    { key: 'steps', label: 'Steps', render: (row) => fmt(row.steps, 0) },
  ]} />
}

function TopDbTable({ rows = [] }) {
  const { topDb } = preparedTables(rows)
  return <DataTable title="Top DB Accesses" subtitle="By DB time" rows={topDb} columns={[
    { key: 'rank', label: '#', render: (_row, index) => index + 1 },
    { key: 'name', label: 'Program / TCode' },
    { key: 'db', label: 'DB Time', render: (row) => `${fmt(row.db, 0)} ms` },
    { key: 'response', label: 'Response', render: (row) => `${fmt(row.response, 0)} ms` },
    { key: 'steps', label: 'Steps', render: (row) => fmt(row.steps, 0) },
  ]} />
}

function TransactionProfileTable({ rows = [] }) {
  const { transactionRows } = preparedTables(rows)
  return <DataTable title="Transaction Profile Standard" subtitle="Parsed workload records" rows={transactionRows} columns={[
    { key: 'name', label: 'Transaction / Report' },
    { key: 'taskType', label: 'Task Type' },
    { key: 'response', label: 'Avg Response', render: (row) => `${fmt(row.response, 0)} ms` },
    { key: 'db', label: 'DB Time', render: (row) => `${fmt(row.db, 0)} ms` },
    { key: 'cpu', label: 'CPU Time', render: (row) => `${fmt(row.cpu, 0)} ms` },
    { key: 'wait', label: 'Wait Time', render: (row) => `${fmt(row.wait, 0)} ms` },
    { key: 'steps', label: 'Dialog Steps', render: (row) => fmt(row.steps, 0) },
  ]} />
}

function St03nTabContent({ activeTab, rows = [] }) {
  const tabRows = rowsForTab(rows, activeTab)
  const { data, topResponse, topDb } = preparedTables(tabRows)
  if (activeTab === 'Workload Overview') {
    return <>
      <WorkloadOverview rows={tabRows} full />
      <div className="st03nThreeCol">
        <SeriesChart title="Average Response" rows={data} series={[{ key: 'response', label: 'Avg Response' }]} height={160} />
        <SeriesChart title="Average DB Time" rows={data} series={[{ key: 'db', label: 'Avg DB Time' }]} height={160} />
        <SeriesChart title="Average Wait Time" rows={data} series={[{ key: 'wait', label: 'Avg Wait Time' }]} height={160} />
      </div>
    </>
  }
  if (activeTab === 'Top Response Time') {
    return <>
      <TopResponseTable rows={tabRows} />
      <SeriesChart title="Top Response Time Trend" rows={topResponse} series={[{ key: 'response', label: 'Response Time' }]} height={190} />
    </>
  }
  if (activeTab === 'Top DB Accesses') {
    return <>
      <TopDbTable rows={tabRows} />
      <SeriesChart title="Top DB Time Trend" rows={topDb} series={[{ key: 'db', label: 'DB Time' }]} height={190} />
    </>
  }
  if (activeTab === 'Transaction Profile') {
    return <TransactionProfileTable rows={tabRows} />
  }
  return <>
    <div className="st03nTwoCol wideLeft">
      <SeriesChart title="Time Profile (Dialog Steps)" subtitle="Parsed time sequence" rows={tabRows} series={[{ key: 'response', label: 'Response Time' }, { key: 'db', label: 'DB Time' }, { key: 'wait', label: 'Wait Time' }]} />
      <WorkloadOverview rows={tabRows} />
    </div>
    <div className="st03nTwoCol">
      <TopResponseTable rows={tabRows} />
      <TopDbTable rows={tabRows} />
    </div>
  </>
}

export default function St03nPage() {
  const [files, setFiles] = React.useState([])
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('Upload ST03N evidence pack to render workload data.')
  const [analysis, setAnalysis] = React.useState(() => loadJson(CACHE_KEY, null))
  const [activeTab, setActiveTab] = React.useState('Time Profile')

  const analyze = async (nextFiles = files) => {
    setBusy(true)
    setStatus('Parsing ST03N evidence…')
    try {
      const rows = []
      const parseStatus = []
      for (const required of REQUIRED_ST03N) {
        const group = nextFiles.filter((file) => classifySt03nFile(file.name) === required.key)
        if (!group.length) {
          parseStatus.push({ key: required.key, label: required.label, ok: false, rows: 0, message: 'missing' })
          continue
        }
        for (const file of group) {
          const parsed = await parseSt03nFile(file, REQUIRED_ST03N)
          rows.push(...parsed.rows)
          parseStatus.push(parsed.status)
        }
      }
      rows.sort((a, b) => b.score - a.score)
      const result = buildSt03nAnalysis(nextFiles.map((file) => ({ name: file.name, size: file.size })), parseStatus, rows, null)
      setAnalysis(result)
      saveJson(CACHE_KEY, result)
      setStatus('ST03N analysis complete.')
    } catch (error) {
      setStatus(error?.message || 'Failed to analyze ST03N files.')
    } finally {
      setBusy(false)
    }
  }

  const onFiles = async (fileList) => {
    setBusy(true)
    try {
      const expanded = await expandSt03nFiles(fileList)
      setFiles(expanded)
      setActiveTab('Time Profile')
      await analyze(expanded)
    } catch (error) {
      setStatus(error?.message || 'Failed to read upload.')
    } finally {
      setBusy(false)
    }
  }

  const rows = analysis?.rows || []
  const displayedFiles = files.length ? files : (analysis?.files || [])
  const activeRows = rowsForTab(rows, activeTab)
  const stats = pageStats(activeRows)
  const period = evidencePeriod(displayedFiles)

  return (
    <section className="rcaFinalShell st03nImpactShell st03nTechnicalPage">
      <St03nHeader busy={busy} files={files} analysis={analysis} onFiles={onFiles} />
      <St03nTabs activeTab={activeTab} onChange={setActiveTab} />
      <KpiStrip analysis={analysis} stats={stats} period={period} />
      {analysis ? <>
        <St03nTabContent activeTab={activeTab} rows={rows} />
        <div className="rcaFinalFooterGrid st03nFooterCompact">
          <UploadedFilesPanel files={displayedFiles} />
          <section className="rcaFinalCard">
            <div className="rcaFinalPanelTitle"><h2>Parse Status</h2><span>Required ST03N files</span></div>
            <div className="rcaFinalStatusList">
              {REQUIRED_ST03N.map((required) => {
                const parsed = analysis?.parseStatus?.filter((item) => item.key === required.key) || []
                const okStatus = parsed.find((item) => item.ok)
                const cachedFile = displayedFiles.find((file) => classifySt03nFile(file.name) === required.key)
                return <div key={required.key} className={okStatus ? 'ok' : cachedFile ? 'detected' : 'missing'}><b>{required.label}</b><span>{okStatus ? 'Ready' : cachedFile ? 'Detected' : 'Missing'}</span><small>{cachedFile?.name || parsed[0]?.message || 'missing'}</small></div>
              })}
            </div>
          </section>
        </div>
      </> : <EmptyState title="Upload ST03N evidence pack"><p>{status} Required evidence: Time Profile, Workload Overview, Transaction Profile Standard, Top Response Time, and Top DB Accesses.</p></EmptyState>}
    </section>
  )
}
