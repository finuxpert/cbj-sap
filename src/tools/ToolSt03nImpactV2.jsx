import React from 'react'
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend, LineChart, Line } from 'recharts'
import { getRecentEvidence, fmt, latestRcaSession, loadJson, saveJson } from './evidence-utils.js'
import {
  DecisionCard,
  EmptyState,
  EvidenceServerPanel,
  EvidenceToolbar,
  SessionBanner,
  UploadedFilesPanel,
} from './EvidenceDecisionKit.jsx'
import {
  buildSt03nAnalysis,
  classifySt03nFile,
  expandSt03nFiles,
  parseSt03nFile,
  REQUIRED_ST03N,
} from './parsers/st03nParser.js'
import './ToolEvidenceSpecialist.css'

const CACHE_KEY = 'sap_st03n_impact_v2_cache'
const ACCEPTED_TYPES = ['.xlsx', '.xls', '.csv', '.zip']
const CHART_COLORS = {
  score: '#38bdf8',
  response: '#60a5fa',
  db: '#a78bfa',
  wait: '#fbbf24',
  steps: '#2dd4bf',
}

const dashboardGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
  gap: 14,
  alignItems: 'start',
  marginTop: 14,
}

const span = (cols) => ({ gridColumn: `span ${cols}` })

function compactLabel(value = '', max = 16) {
  const label = String(value || 'Unknown').trim() || 'Unknown'
  return label.length > max ? `${label.slice(0, Math.max(8, max - 1))}…` : label
}

function valueLabel(value, unit = '') {
  return `${fmt(value, 0)}${unit}`
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
    top ? `Component: ${top.component}` : 'Component: -',
    top ? `Response: ${fmt(top.responseMs, 0)}ms | DB: ${fmt(top.dbMs, 0)}ms | Wait: ${fmt(top.waitMs, 0)}ms` : '',
    `Next Action: ${analysis.nextAction}`,
  ].filter(Boolean).join('\n')
}

function AcceptedTypes({ items }) {
  return <div className="acceptedTypes">{items.map((item) => <span key={item}>{item}</span>)}</div>
}

function ToolHero({ busy, onFiles }) {
  return (
    <header className="evidenceHero compactEvidenceHero finalHero">
      <div className="heroCopyBlock">
        <span>ST03N Impact Analyzer</span>
        <h1>Workload impact drilldown.</h1>
        <p>Validate SAP workload impact from uploaded ST03N evidence: verdict, dominant component, parse completeness, and top offender.</p>
      </div>
      <label className="evidenceUpload finalUpload">
        <input type="file" multiple accept=".zip,.xlsx,.xls,.csv" onChange={(event) => onFiles(event.target.files)} />
        <strong>{busy ? 'Parsing…' : 'Upload ST03N Evidence'}</strong>
        <small>Accepted files</small>
        <AcceptedTypes items={ACCEPTED_TYPES} />
      </label>
    </header>
  )
}

function ParseStatusPanel({ analysis, detected }) {
  const cachedFiles = analysis?.files || []

  return (
    <section className="evidencePanel parsePanel">
      <div className="panelTitleRow">
        <h2>Parse Status</h2>
        <span>Required ST03N pack</span>
      </div>
      <div className="statusList finalStatusList">
        {REQUIRED_ST03N.map((required) => {
          const parsed = analysis?.parseStatus?.filter((item) => item.key === required.key) || []
          const okStatus = parsed.find((item) => item.ok)
          const parsedFileStatus = parsed.find((item) => item.fileName)
          const cachedFile = cachedFiles.find((file) => classifySt03nFile(file.name) === required.key)
          const currentFile = detected[required.key]?.[0]
          const hasRecognizedFile = Boolean(currentFile || cachedFile || parsedFileStatus)
          const statusClass = okStatus ? 'ok' : hasRecognizedFile ? 'detected' : 'missing'
          const badge = okStatus ? 'Ready' : hasRecognizedFile ? 'Detected' : 'Missing'
          const message = currentFile?.name
            || parsedFileStatus?.fileName
            || cachedFile?.name
            || parsed[0]?.message
            || 'missing'
          const subMessage = !okStatus && hasRecognizedFile && parsed[0]?.message && parsed[0]?.message !== 'missing'
            ? parsed[0].message
            : message

          return (
            <div key={required.key} className={statusClass}>
              <em>{badge}</em>
              <b>{required.label}</b>
              <span>{subMessage}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function InterpretationPanel({ top, status }) {
  return (
    <section className="evidencePanel interpretationPanel">
      <div className="panelTitleRow">
        <h2>Interpretation</h2>
        <span>Basis RCA signal</span>
      </div>
      {top ? (
        <>
          <p><b>{top.label}</b> is the strongest parsed ST03N signal and is classified as <b>{top.component}</b>.</p>
          <div className="confidenceRows finalMetricRows">
            <span>Score<b>{top.score}/100</b></span>
            <span>Response<b>{fmt(top.responseMs, 0)}ms</b></span>
            <span>DB Share<b>{fmt(top.dbShare)}%</b></span>
          </div>
        </>
      ) : <p>{status}</p>}
    </section>
  )
}

function KpiCard({ label, value, hint }) {
  return (
    <div className="st03nKpiCard">
      <span>{label}</span>
      <b>{value}</b>
      <small>{hint}</small>
    </div>
  )
}

function KpiStrip({ topRows }) {
  const topProgram = topRows[0]
  const highResp = [...topRows].sort((a, b) => b.responseMs - a.responseMs)[0]
  const highDb = [...topRows].sort((a, b) => b.dbMs - a.dbMs)[0]
  const highSteps = [...topRows].sort((a, b) => b.steps - a.steps)[0]

  return (
    <section className="st03nKpiStrip">
      <KpiCard label="Top Program" value={compactLabel(topProgram?.label, 22)} hint={topProgram ? `${topProgram.kind} · ${topProgram.component}` : 'No data'} />
      <KpiCard label="Highest Response" value={highResp ? `${fmt(highResp.responseMs, 0)}ms` : '-'} hint={compactLabel(highResp?.label, 24)} />
      <KpiCard label="Highest DB Time" value={highDb ? `${fmt(highDb.dbMs, 0)}ms` : '-'} hint={compactLabel(highDb?.label, 24)} />
      <KpiCard label="Highest Steps" value={highSteps ? fmt(highSteps.steps, 0) : '-'} hint={compactLabel(highSteps?.label, 24)} />
    </section>
  )
}

function ChartList({ rows = [], metric, unit = '' }) {
  return (
    <div className="st03nChartList">
      {rows.slice(0, 4).map((row) => (
        <div key={`${row.name}-${metric}`}>
          <b>{row.name}</b>
          <span>{valueLabel(row[metric], unit)}</span>
        </div>
      ))}
    </div>
  )
}

function HorizontalMetricChart({ title, tag, data = [], metric, color, unit = '' }) {
  return (
    <section className="evidencePanel miniChartPanel st03nMetricPanel">
      <div className="panelTitleRow">
        <h2>{title}</h2>
        <span>{tag}</span>
      </div>
      <ResponsiveContainer width="100%" height={158}>
        <BarChart layout="vertical" data={data} margin={{ top: 2, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tickFormatter={(value) => `${fmt(value, 0)}${unit}`} tick={{ fontSize: 10 }} />
          <YAxis type="category" dataKey="name" width={112} tick={{ fontSize: 10 }} />
          <Tooltip formatter={(value) => [`${fmt(value, 0)}${unit}`, metric]} />
          <Bar dataKey={metric} name={metric} fill={color} radius={[0, 8, 8, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <ChartList rows={data} metric={metric} unit={unit} />
    </section>
  )
}

function BreakdownChart({ data = [] }) {
  return (
    <section className="evidencePanel chartPanel st03nChartPanel">
      <div className="panelTitleRow">
        <h2>Response / DB / Wait Breakdown</h2>
        <span>Top workload split</span>
      </div>
      <ResponsiveContainer width="100%" height={184}>
        <BarChart layout="vertical" data={data} margin={{ top: 2, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tickFormatter={(value) => `${fmt(value, 0)}ms`} tick={{ fontSize: 10 }} />
          <YAxis type="category" dataKey="name" width={118} tick={{ fontSize: 10 }} />
          <Tooltip formatter={(value) => [`${fmt(value, 0)}ms`, '']} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="response" name="Response ms" stackId="workload" fill={CHART_COLORS.response} />
          <Bar dataKey="db" name="DB ms" stackId="workload" fill={CHART_COLORS.db} />
          <Bar dataKey="wait" name="Wait ms" stackId="workload" fill={CHART_COLORS.wait} radius={[0, 8, 8, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <ChartList rows={data} metric="response" unit="ms" />
    </section>
  )
}

function TrendChart({ data = [] }) {
  return (
    <section className="evidencePanel miniChartPanel st03nChartPanel">
      <div className="panelTitleRow">
        <h2>Workload Trend by Rank</h2>
        <span>Score / response / DB</span>
      </div>
      <ResponsiveContainer width="100%" height={184}>
        <LineChart data={data} margin={{ top: 4, right: 14, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="rank" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line dataKey="score" name="Score" stroke={CHART_COLORS.score} strokeWidth={3} dot={false} />
          <Line dataKey="responseK" name="Response sec" stroke={CHART_COLORS.response} strokeWidth={3} dot={false} />
          <Line dataKey="dbK" name="DB sec" stroke={CHART_COLORS.db} strokeWidth={3} dot={false} />
        </LineChart>
      </ResponsiveContainer>
      <ChartList rows={data} metric="score" />
    </section>
  )
}

function ComponentMix({ analysis, topRows }) {
  const rows = analysis.componentRows?.length ? analysis.componentRows : []
  return (
    <section className="evidencePanel st03nComponentPanel">
      <div className="panelTitleRow">
        <h2>Component Mix</h2>
        <span>Classified rows</span>
      </div>
      <div className="st03nComponentRows">
        {rows.map((row) => (
          <div key={row.name}>
            <b>{row.name}</b>
            <span>{row.value} hits</span>
          </div>
        ))}
      </div>
      <div className="evidenceList compact finalEvidenceList st03nCompactList">
        {topRows.slice(0, 3).map((row) => (
          <div key={`${row.kind}-${row.fileName}-${row.label}`}>
            <b>{row.label}</b>
            <span>{row.kind} · {row.component} · score {row.score}/100</span>
            <small>Response {fmt(row.responseMs, 0)}ms · DB {fmt(row.dbMs, 0)}ms · Wait {fmt(row.waitMs, 0)}ms</small>
          </div>
        ))}
      </div>
    </section>
  )
}

function TopEvidenceChart({ chartRows }) {
  return (
    <section className="evidencePanel chartPanel st03nChartPanel">
      <div className="panelTitleRow">
        <h2>Top ST03N Evidence</h2>
        <span>Horizontal ranking</span>
      </div>
      <ResponsiveContainer width="100%" height={190}>
        <BarChart layout="vertical" data={chartRows} margin={{ top: 2, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
          <YAxis type="category" dataKey="name" width={118} tick={{ fontSize: 10 }} />
          <Tooltip />
          <Bar dataKey="score" name="Score" fill={CHART_COLORS.score} radius={[0, 8, 8, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <ChartList rows={chartRows} metric="score" />
    </section>
  )
}

function OffenderRanking({ topRows }) {
  return (
    <section className="evidencePanel st03nOffenderPanel">
      <div className="panelTitleRow">
        <h2>ST03N Offender Ranking</h2>
        <span>Basis review list</span>
      </div>
      <div className="evidenceList finalEvidenceList st03nCompactList">
        {topRows.slice(0, 6).map((row) => (
          <div key={`${row.kind}-${row.fileName}-${row.label}-ranking`}>
            <b>{row.label}</b>
            <span>{row.kind} · {row.component} · score {row.score}/100</span>
            <small>Response {fmt(row.responseMs, 0)}ms · DB {fmt(row.dbMs, 0)}ms · Wait {fmt(row.waitMs, 0)}ms · Steps {fmt(row.steps, 0)}</small>
          </div>
        ))}
      </div>
    </section>
  )
}

function EvidenceCharts({ analysis, topRows }) {
  const chartRows = topRows.slice(0, 8).map((row, index) => ({
    name: compactLabel(row.label, 16),
    rank: `#${index + 1}`,
    score: row.score || 0,
    response: Math.round(row.responseMs || 0),
    db: Math.round(row.dbMs || 0),
    wait: Math.round(row.waitMs || 0),
    steps: Math.round(row.steps || 0),
    responseK: Number(((row.responseMs || 0) / 1000).toFixed(1)),
    dbK: Number(((row.dbMs || 0) / 1000).toFixed(1)),
  }))
  const topResponseRows = [...chartRows].sort((a, b) => b.response - a.response).slice(0, 5)
  const topDbRows = [...chartRows].sort((a, b) => b.db - a.db).slice(0, 5)
  const topStepRows = [...chartRows].sort((a, b) => b.steps - a.steps).slice(0, 5)

  return (
    <>
      <KpiStrip topRows={topRows} />
      <div className="st03nDashboardBoard" style={dashboardGridStyle}>
        <div style={span(7)}><TopEvidenceChart chartRows={chartRows} /></div>
        <div style={span(5)}><ComponentMix analysis={analysis} topRows={topRows} /></div>
        <div style={span(6)}><BreakdownChart data={chartRows.slice(0, 5)} /></div>
        <div style={span(6)}><TrendChart data={chartRows} /></div>
        <div style={span(4)}><HorizontalMetricChart title="Top Response Time" tag="Dialog impact" data={topResponseRows} metric="response" color={CHART_COLORS.response} unit="ms" /></div>
        <div style={span(4)}><HorizontalMetricChart title="Top DB Time" tag="Database pressure" data={topDbRows} metric="db" color={CHART_COLORS.db} unit="ms" /></div>
        <div style={span(4)}><HorizontalMetricChart title="Steps Volume" tag="Execution volume" data={topStepRows} metric="steps" color={CHART_COLORS.steps} /></div>
        <div style={span(12)}><OffenderRanking topRows={topRows} /></div>
      </div>
    </>
  )
}

export default function ToolSt03nImpactV2() {
  const [session] = React.useState(latestRcaSession)
  const [files, setFiles] = React.useState([])
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('Upload ST03N pack or ZIP to validate workload impact.')
  const [analysis, setAnalysis] = React.useState(() => loadJson(CACHE_KEY, null))
  const [serverInfo, setServerInfo] = React.useState(null)

  React.useEffect(() => {
    let active = true
    getRecentEvidence({ tool: 'investigation', limit: 5 }).then((response) => {
      if (active) setServerInfo(response)
    })
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
  const top = analysis?.top

  return (
    <section className="evidenceToolShell refinedTool finalRcaTool st03nImpactShell">
      <ToolHero busy={busy} onFiles={onFiles} />
      <SessionBanner session={session} />
      <EvidenceToolbar analysis={analysis} cacheKey={CACHE_KEY} reportText={buildReportText(analysis)} filenamePrefix="sap-st03n-impact-v2" />

      <section className="decisionBoard finalDecisionBoard">
        <DecisionCard label="Impact Verdict" value={analysis?.verdict || 'Pending'} hint={analysis?.nextAction || status} tone={analysis?.verdict === 'Detected' ? 'good' : ''} />
        <DecisionCard label="Dominant Component" value={analysis?.dominant || 'Unknown'} hint="Derived from response, DB, wait, CPU columns" tone="blue" />
        <DecisionCard label="Confidence" value={`${analysis?.confidence || 0}%`} hint={analysis?.correlation || 'Pending upload'} />
        <DecisionCard label="Completeness" value={`${analysis?.completeness || 0}%`} hint="Required ST03N pack coverage" />
      </section>

      <div className="evidenceGrid st03nSummaryGrid">
        <ParseStatusPanel analysis={analysis} detected={detected} />
        <InterpretationPanel top={top} status={status} />
      </div>

      {analysis ? (
        <EvidenceCharts analysis={analysis} topRows={topRows} />
      ) : (
        <EmptyState title="Upload ST03N evidence pack">
          <p>Upload the required ST03N Excel, CSV, or ZIP evidence. This analyzer ranks workload impact only from uploaded files.</p>
          <ol>
            <li>Upload Time Profile, Workload, Transaction Standard, Top Response, and Top DB.</li>
            <li>Review parse status and completeness.</li>
            <li>Use Top ST03N Evidence to confirm whether workload impact supports the RCA window.</li>
          </ol>
        </EmptyState>
      )}

      <div className="evidenceGrid st03nFooterGrid">
        <UploadedFilesPanel files={files} />
        <EvidenceServerPanel serverInfo={serverInfo} />
      </div>
    </section>
  )
}
