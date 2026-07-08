import React from 'react'
import ReactECharts from 'echarts-for-react'
import { getRecentEvidence, fmt, latestRcaSession, loadJson, saveJson } from './evidence-utils.js'
import { DecisionCard, EmptyState, EvidenceServerPanel, EvidenceToolbar, SessionBanner, UploadedFilesPanel } from './EvidenceDecisionKit.jsx'
import { buildSt03nAnalysis, classifySt03nFile, expandSt03nFiles, parseSt03nFile, REQUIRED_ST03N } from './parsers/st03nParser.js'
import St03nOffenderTable from './St03nOffenderTable.jsx'
import './EnterpriseRcaFinal.css'

const CACHE_KEY = 'sap_st03n_impact_v2_cache'
const ACCEPTED_TYPES = ['.xlsx', '.xls', '.csv', '.zip']
const GRAPH_COLORS = ['#2563eb', '#0f766e', '#f59e0b', '#9333ea', '#dc2626', '#0891b2']

function compactLabel(value = '', max = 28) {
  const label = String(value || 'Unknown').trim() || 'Unknown'
  return label.length > max ? `${label.slice(0, max - 1)}…` : label
}

function rowLabel(row = {}, fallback = 'ST03N item') {
  return compactLabel(row?.label || row?.name || row?.program || row?.transaction || row?.fileName || row?.kind || fallback, 34)
}

function metric(row = {}, primary, fallback) {
  return Math.round(Number(row?.[primary] ?? row?.[fallback] ?? 0))
}

function dominantKind(row = {}) {
  const entries = [
    ['Response', Number(row.response || row.responseMs || 0)],
    ['DB', Number(row.db || row.dbMs || 0)],
    ['Wait', Number(row.wait || row.waitMs || 0)],
    ['CPU', Number(row.cpu || row.cpuMs || 0)],
  ]
  return entries.sort((a, b) => b[1] - a[1])[0]?.[0] || 'Response'
}

function graphRows(rows = [], limit = 8) {
  return rows.slice(0, limit).map((row, index) => ({
    ...row,
    name: rowLabel(row),
    color: GRAPH_COLORS[index % GRAPH_COLORS.length],
    response: metric(row, 'response', 'responseMs'),
    db: metric(row, 'db', 'dbMs'),
    wait: metric(row, 'wait', 'waitMs'),
    cpu: metric(row, 'cpu', 'cpuMs'),
    steps: Math.round(Number(row.steps || 0)),
  }))
}

function buildReportText(analysis) {
  if (!analysis) return ''
  const top = analysis.top
  return [
    'SAP ST03N Impact Summary',
    `Verdict: ${analysis.verdict}`,
    `Confidence: ${analysis.confidence}% - ${analysis.correlation}`,
    `Completeness: ${analysis.completeness}%`,
    `Dominant Component: ${analysis.dominant}`,
    top ? `Top Evidence: ${top.label}` : 'Top Evidence: -',
    top ? `Response: ${fmt(top.responseMs, 0)}ms | DB: ${fmt(top.dbMs, 0)}ms | Wait: ${fmt(top.waitMs, 0)}ms` : '',
    `Next Action: ${analysis.nextAction}`,
  ].filter(Boolean).join('\n')
}

function AcceptedTypes() {
  return <div className="acceptedTypes">{ACCEPTED_TYPES.map((item) => <span key={item}>{item}</span>)}</div>
}

function FinalHero({ busy, onFiles }) {
  return (
    <header className="rcaFinalHero">
      <div>
        <span>SAP Basis RCA Evidence Analyzer</span>
        <h1>ST03N Workload Analyzer</h1>
        <p>Compact workload impact console based on uploaded ST03N evidence, cached analysis, parse coverage, and top offender ranking.</p>
      </div>
      <label className="rcaFinalUpload">
        <input type="file" multiple accept=".zip,.xlsx,.xls,.csv" onChange={(event) => onFiles(event.target.files)} />
        <strong>{busy ? 'Parsing…' : 'Upload ST03N Evidence'}</strong>
        <small>Excel, CSV, or ZIP evidence pack</small>
        <AcceptedTypes />
      </label>
    </header>
  )
}

function ParseStatusPanel({ analysis, detected }) {
  const cachedFiles = analysis?.files || []
  return (
    <section className="rcaFinalCard">
      <div className="rcaFinalPanelTitle"><h2>Parse Status</h2><span>Required pack</span></div>
      <div className="rcaFinalStatusList">
        {REQUIRED_ST03N.map((required) => {
          const parsed = analysis?.parseStatus?.filter((item) => item.key === required.key) || []
          const okStatus = parsed.find((item) => item.ok)
          const parsedFileStatus = parsed.find((item) => item.fileName)
          const cachedFile = cachedFiles.find((file) => classifySt03nFile(file.name) === required.key)
          const currentFile = detected[required.key]?.[0]
          const hasFile = Boolean(currentFile || cachedFile || parsedFileStatus)
          const state = okStatus ? 'ok' : hasFile ? 'detected' : 'missing'
          const message = currentFile?.name || parsedFileStatus?.fileName || cachedFile?.name || parsed[0]?.message || 'missing'
          return <div key={required.key} className={state}><b>{required.label}</b><span>{okStatus ? 'Ready' : hasFile ? 'Detected' : 'Missing'}</span><small>{message}</small></div>
        })}
      </div>
    </section>
  )
}

function BasisInterpretation({ analysis, status }) {
  const top = analysis?.top
  return (
    <section className="rcaFinalCard rcaFinalInsightBlock">
      <div className="rcaFinalPanelTitle"><h2>Basis Interpretation</h2><span>RCA signal</span></div>
      {top ? <>
        <p><b>{top.label}</b> is the strongest parsed workload signal. Dominant component is <b>{analysis.dominant || top.component}</b>.</p>
        <div className="rcaFinalMetricRows">
          <span>Score<b>{top.score}/100</b></span>
          <span>Response<b>{fmt(top.responseMs, 0)}ms</b></span>
          <span>DB Share<b>{fmt(top.dbShare)}%</b></span>
        </div>
        <p className="rcaFinalAction">{analysis.nextAction}</p>
      </> : <p>{status}</p>}
    </section>
  )
}

function EvidenceSummary({ analysis }) {
  return (
    <section className="rcaFinalCard">
      <div className="rcaFinalPanelTitle"><h2>Evidence Summary</h2><span>Cached / parsed</span></div>
      <div className="rcaFinalMiniFacts">
        <div><span>Rows</span><b>{fmt(analysis?.rows?.length || 0, 0)}</b></div>
        <div><span>Files</span><b>{fmt(analysis?.files?.length || 0, 0)}</b></div>
        <div><span>Created</span><b>{analysis?.createdAt ? new Date(analysis.createdAt).toLocaleString() : '-'}</b></div>
      </div>
    </section>
  )
}

function BreakdownChart({ rows = [] }) {
  const data = graphRows(rows, 7).reverse()
  const option = {
    backgroundColor: 'transparent',
    color: GRAPH_COLORS,
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: '#111827', borderWidth: 0, textStyle: { color: '#fff', fontSize: 12 } },
    legend: { bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: '#475569', fontSize: 11 } },
    grid: { left: 132, right: 24, top: 20, bottom: 42, containLabel: true },
    xAxis: { type: 'value', axisLabel: { color: '#64748b', fontSize: 11 }, splitLine: { lineStyle: { color: '#e2e8f0', type: 'dashed' } } },
    yAxis: { type: 'category', data: data.map((row) => row.name), axisLabel: { color: '#1e293b', fontSize: 11, fontWeight: 700 }, axisTick: { show: false }, axisLine: { show: false } },
    series: [
      { name: 'DB', type: 'bar', stack: 'total', data: data.map((row) => row.db), barWidth: 14 },
      { name: 'Wait', type: 'bar', stack: 'total', data: data.map((row) => row.wait), barWidth: 14 },
      { name: 'CPU', type: 'bar', stack: 'total', data: data.map((row) => row.cpu), barWidth: 14 },
      { name: 'Response', type: 'bar', data: data.map((row) => row.response), barWidth: 8, itemStyle: { opacity: 0.35, borderRadius: [0, 6, 6, 0] } },
    ],
  }
  return <section className="rcaFinalCard rcaFinalChartCard"><div className="rcaFinalPanelTitle"><h2>Response Time Breakdown / Top Offender</h2><span>ms by component</span></div>{data.length ? <ReactECharts option={option} style={{ height: 292, width: '100%' }} notMerge lazyUpdate /> : <p>No parsed metric rows available.</p>}</section>
}

function TopOffenderCompactTable({ rows = [] }) {
  return (
    <section className="rcaFinalCard rcaFinalTableCard">
      <div className="rcaFinalPanelTitle"><h2>Top Offender Table</h2><span>Basis review queue</span></div>
      <St03nOffenderTable rows={rows.slice(0, 10)} />
    </section>
  )
}

function OffenderQueue({ rows = [] }) {
  const items = graphRows(rows, 5)
  return (
    <section className="rcaFinalCard">
      <div className="rcaFinalPanelTitle"><h2>Evidence Summary</h2><span>Top signals</span></div>
      <div className="rcaFinalList">
        {items.map((row, index) => <div key={`${row.name}-${index}`}><b>#{index + 1} {row.name}</b><span>{dominantKind(row)} dominant · Score {row.score}/100</span><small>Response {fmt(row.response, 0)}ms · DB {fmt(row.db, 0)}ms · Wait {fmt(row.wait, 0)}ms · Steps {fmt(row.steps, 0)}</small></div>)}
      </div>
    </section>
  )
}

export default function ToolSt03nDashboardFinal() {
  const [session] = React.useState(latestRcaSession)
  const [files, setFiles] = React.useState([])
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('Upload ST03N pack or ZIP to validate workload impact.')
  const [analysis, setAnalysis] = React.useState(() => loadJson(CACHE_KEY, null))
  const [serverInfo, setServerInfo] = React.useState(null)

  React.useEffect(() => {
    let active = true
    getRecentEvidence({ tool: 'investigation', limit: 5 }).then((response) => { if (active) setServerInfo(response) })
    return () => { active = false }
  }, [])

  const detected = React.useMemo(() => {
    const map = Object.fromEntries(REQUIRED_ST03N.map((item) => [item.key, []]))
    files.forEach((file) => {
      const key = classifySt03nFile(file.name)
      if (key) map[key].push(file)
    })
    return map
  }, [files])

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
      const result = buildSt03nAnalysis(nextFiles.map((file) => ({ name: file.name, size: file.size })), parseStatus, rows, serverInfo)
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
      await analyze(expanded)
    } catch (error) {
      setStatus(error?.message || 'Failed to read upload.')
    } finally {
      setBusy(false)
    }
  }

  const topRows = analysis?.rows?.slice(0, 12) || []
  const displayedFiles = files.length ? files : (analysis?.files || [])

  return (
    <section className="rcaFinalShell st03nImpactShell">
      <FinalHero busy={busy} onFiles={onFiles} />
      <SessionBanner session={session} />
      <EvidenceToolbar analysis={analysis} cacheKey={CACHE_KEY} reportText={buildReportText(analysis)} filenamePrefix="sap-st03n-impact-final" />
      <section className="rcaFinalKpiStrip">
        <DecisionCard label="Impact Verdict" value={analysis?.verdict || 'Pending'} hint={analysis?.nextAction || status} tone={analysis?.verdict === 'Detected' ? 'good' : ''} />
        <DecisionCard label="Dominant Component" value={analysis?.dominant || 'Unknown'} hint="Derived from response, DB, wait, and CPU columns" tone="blue" />
        <DecisionCard label="Confidence" value={`${analysis?.confidence || 0}%`} hint={analysis?.correlation || 'Pending upload'} />
        <DecisionCard label="Completeness" value={`${analysis?.completeness || 0}%`} hint="Required ST03N evidence coverage" />
      </section>
      {analysis ? <div className="rcaFinalMainGrid">
        <main className="rcaFinalMainCol">
          <BreakdownChart rows={topRows} />
          <TopOffenderCompactTable rows={topRows} />
        </main>
        <aside className="rcaFinalInsightCol">
          <BasisInterpretation analysis={analysis} status={status} />
          <ParseStatusPanel analysis={analysis} detected={detected} />
          <EvidenceSummary analysis={analysis} />
          <OffenderQueue rows={topRows} />
        </aside>
      </div> : <EmptyState title="Upload ST03N evidence pack"><p>Upload Time Profile, Workload, Transaction Standard, Top Response, and Top DB evidence. The dashboard uses uploaded files and cache only; no dummy RCA data is generated.</p></EmptyState>}
      <div className="rcaFinalFooterGrid">
        <UploadedFilesPanel files={displayedFiles} />
        <EvidenceServerPanel serverInfo={serverInfo} />
      </div>
    </section>
  )
}
