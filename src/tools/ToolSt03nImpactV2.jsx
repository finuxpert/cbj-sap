import React from 'react'
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell, LineChart, Line } from 'recharts'
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
  workload: '#22c55e',
  warn: '#f97316',
  muted: '#64748b',
}
const PIE_COLORS = ['#38bdf8', '#a78bfa', '#fbbf24', '#2dd4bf', '#22c55e', '#f97316']

function compactLabel(value = '', max = 18) {
  const label = String(value || 'Unknown').trim() || 'Unknown'
  return label.length > max ? `${label.slice(0, Math.max(8, max - 1))}…` : label
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
  return (
    <section className="evidencePanel parsePanel">
      <div className="panelTitleRow">
        <h2>Parse Status</h2>
        <span>Required ST03N pack</span>
      </div>
      <div className="statusList finalStatusList">
        {REQUIRED_ST03N.map((required) => {
          const parsed = analysis?.parseStatus?.filter((item) => item.key === required.key) || []
          const hasFile = detected[required.key]?.length || parsed.some((item) => item.ok)
          return (
            <div key={required.key} className={hasFile ? 'ok' : 'missing'}>
              <b>{required.label}</b>
              <span>{detected[required.key]?.[0]?.name || parsed[0]?.message || 'missing'}</span>
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

function HorizontalMetricChart({ title, tag, data = [], metric, color, unit = '', xDomain }) {
  return (
    <section className="evidencePanel miniChartPanel">
      <div className="panelTitleRow">
        <h2>{title}</h2>
        <span>{tag}</span>
      </div>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart layout="vertical" data={data} margin={{ top: 6, right: 22, left: 6, bottom: 6 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" domain={xDomain} tickFormatter={(value) => `${fmt(value, 0)}${unit}`} />
          <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(value) => [`${fmt(value, 0)}${unit}`, metric]} />
          <Legend />
          <Bar dataKey={metric} name={metric} fill={color} radius={[0, 9, 9, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </section>
  )
}

function BreakdownChart({ data = [] }) {
  return (
    <section className="evidencePanel chartPanel">
      <div className="panelTitleRow">
        <h2>Response / DB / Wait Breakdown</h2>
        <span>Top workload split</span>
      </div>
      <ResponsiveContainer width="100%" height={330}>
        <BarChart layout="vertical" data={data} margin={{ top: 6, right: 24, left: 8, bottom: 6 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tickFormatter={(value) => `${fmt(value, 0)}ms`} />
          <YAxis type="category" dataKey="name" width={165} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(value) => [`${fmt(value, 0)}ms`, '']} />
          <Legend />
          <Bar dataKey="response" name="Response ms" stackId="workload" fill={CHART_COLORS.response} radius={[0, 0, 0, 0]} />
          <Bar dataKey="db" name="DB ms" stackId="workload" fill={CHART_COLORS.db} radius={[0, 0, 0, 0]} />
          <Bar dataKey="wait" name="Wait ms" stackId="workload" fill={CHART_COLORS.wait} radius={[0, 9, 9, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </section>
  )
}

function TrendChart({ data = [] }) {
  return (
    <section className="evidencePanel miniChartPanel">
      <div className="panelTitleRow">
        <h2>Workload Trend by Rank</h2>
        <span>Score / response / DB</span>
      </div>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={data} margin={{ top: 6, right: 22, left: 0, bottom: 6 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="rank" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line dataKey="score" name="Score" stroke={CHART_COLORS.score} strokeWidth={3} dot={false} />
          <Line dataKey="responseK" name="Response sec" stroke={CHART_COLORS.response} strokeWidth={3} dot={false} />
          <Line dataKey="dbK" name="DB sec" stroke={CHART_COLORS.db} strokeWidth={3} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </section>
  )
}

function ComponentPie({ analysis, topRows }) {
  const componentRows = analysis.componentRows?.length ? analysis.componentRows : [
    { name: 'Response', value: topRows.reduce((sum, row) => sum + (row.responseMs || 0), 0) },
    { name: 'DB', value: topRows.reduce((sum, row) => sum + (row.dbMs || 0), 0) },
    { name: 'Wait', value: topRows.reduce((sum, row) => sum + (row.waitMs || 0), 0) },
  ].filter((item) => item.value > 0)

  return (
    <section className="evidencePanel">
      <div className="panelTitleRow">
        <h2>Component Mix</h2>
        <span>Response / DB / wait</span>
      </div>
      <ResponsiveContainer width="100%" height={230}>
        <PieChart>
          <Pie data={componentRows} dataKey="value" nameKey="name" outerRadius={82} label>
            {componentRows.map((_, index) => <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(value) => fmt(value, 0)} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
      <div className="evidenceList compact finalEvidenceList">
        {topRows.slice(0, 7).map((row) => (
          <div key={`${row.kind}-${row.fileName}-${row.label}`}>
            <b>{row.label}</b>
            <span>{row.kind} · {row.component} · score {row.score}/100</span>
            <small>Response {fmt(row.responseMs, 0)}ms · DB {fmt(row.dbMs, 0)}ms · Wait {fmt(row.waitMs, 0)}ms · Steps {fmt(row.steps, 0)}</small>
          </div>
        ))}
      </div>
    </section>
  )
}

function BottleneckMixChart({ data = [] }) {
  return (
    <section className="evidencePanel miniChartPanel">
      <div className="panelTitleRow">
        <h2>Bottleneck Mix</h2>
        <span>Classified component</span>
      </div>
      <ResponsiveContainer width="100%" height={250}>
        <PieChart>
          <Pie data={data} dataKey="hits" nameKey="name" outerRadius={86} label>
            {data.map((_, index) => <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />)}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </section>
  )
}

function EvidenceCharts({ analysis, topRows }) {
  const chartRows = topRows.slice(0, 10).map((row, index) => ({
    name: compactLabel(row.label, 22),
    rank: `#${index + 1}`,
    score: row.score || 0,
    response: Math.round(row.responseMs || 0),
    db: Math.round(row.dbMs || 0),
    wait: Math.round(row.waitMs || 0),
    steps: Math.round(row.steps || 0),
    responseK: Number(((row.responseMs || 0) / 1000).toFixed(1)),
    dbK: Number(((row.dbMs || 0) / 1000).toFixed(1)),
  }))
  const topResponseRows = [...chartRows].sort((a, b) => b.response - a.response).slice(0, 7)
  const topDbRows = [...chartRows].sort((a, b) => b.db - a.db).slice(0, 7)
  const topStepRows = [...chartRows].sort((a, b) => b.steps - a.steps).slice(0, 7)
  const bottleneckRows = Array.from(
    topRows.reduce((map, row) => {
      const name = row.component || 'Unknown'
      const current = map.get(name) || { name, hits: 0 }
      current.hits += 1
      map.set(name, current)
      return map
    }, new Map()).values()
  ).sort((a, b) => b.hits - a.hits)

  return (
    <>
      <div className="evidenceGrid wide">
        <section className="evidencePanel chartPanel">
          <div className="panelTitleRow">
            <h2>Top ST03N Evidence</h2>
            <span>Horizontal ranking</span>
          </div>
          <ResponsiveContainer width="100%" height={330}>
            <BarChart layout="vertical" data={chartRows} margin={{ top: 6, right: 22, left: 8, bottom: 6 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} />
              <YAxis type="category" dataKey="name" width={165} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="score" name="Score" fill={CHART_COLORS.score} radius={[0, 9, 9, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <ComponentPie analysis={analysis} topRows={topRows} />
      </div>

      <div className="evidenceGrid wide chartMiniGrid">
        <BreakdownChart data={chartRows.slice(0, 7)} />
        <TrendChart data={chartRows} />
      </div>

      <div className="evidenceGrid triple chartMiniGrid">
        <HorizontalMetricChart title="Top Response Time" tag="Highest dialog impact" data={topResponseRows} metric="response" color={CHART_COLORS.response} unit="ms" />
        <HorizontalMetricChart title="Top DB Time" tag="Database pressure" data={topDbRows} metric="db" color={CHART_COLORS.db} unit="ms" />
        <HorizontalMetricChart title="Steps Volume" tag="Execution volume" data={topStepRows} metric="steps" color={CHART_COLORS.steps} />
      </div>

      <div className="evidenceGrid wide chartMiniGrid">
        <BottleneckMixChart data={bottleneckRows} />
        <section className="evidencePanel">
          <div className="panelTitleRow">
            <h2>ST03N Offender Ranking</h2>
            <span>Basis review list</span>
          </div>
          <div className="evidenceList finalEvidenceList">
            {topRows.slice(0, 10).map((row) => (
              <div key={`${row.kind}-${row.fileName}-${row.label}-ranking`}>
                <b>{row.label}</b>
                <span>{row.kind} · {row.component} · score {row.score}/100</span>
                <small>Response {fmt(row.responseMs, 0)}ms · DB {fmt(row.dbMs, 0)}ms · Wait {fmt(row.waitMs, 0)}ms · Steps {fmt(row.steps, 0)}</small>
              </div>
            ))}
          </div>
        </section>
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
    <section className="evidenceToolShell refinedTool finalRcaTool">
      <ToolHero busy={busy} onFiles={onFiles} />
      <SessionBanner session={session} />
      <EvidenceToolbar analysis={analysis} cacheKey={CACHE_KEY} reportText={buildReportText(analysis)} filenamePrefix="sap-st03n-impact-v2" />

      <section className="decisionBoard finalDecisionBoard">
        <DecisionCard label="Impact Verdict" value={analysis?.verdict || 'Pending'} hint={analysis?.nextAction || status} tone={analysis?.verdict === 'Detected' ? 'good' : ''} />
        <DecisionCard label="Dominant Component" value={analysis?.dominant || 'Unknown'} hint="Derived from response, DB, wait, CPU columns" tone="blue" />
        <DecisionCard label="Confidence" value={`${analysis?.confidence || 0}%`} hint={analysis?.correlation || 'Pending upload'} />
        <DecisionCard label="Completeness" value={`${analysis?.completeness || 0}%`} hint="Required ST03N pack coverage" />
      </section>

      <div className="evidenceGrid">
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

      <div className="evidenceGrid">
        <UploadedFilesPanel files={files} />
        <EvidenceServerPanel serverInfo={serverInfo} />
      </div>
    </section>
  )
}
