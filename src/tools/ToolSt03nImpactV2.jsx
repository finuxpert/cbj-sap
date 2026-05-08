import React from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  LabelList,
} from 'recharts'
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

function shortLabel(value = '', max = 24) {
  const text = String(value || '')
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function St03nTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload || {}
  return (
    <div className="evidenceChartTooltip">
      <strong>{row.fullLabel || label}</strong>
      <span>Problem Score: {row.score}/100 · Component: {row.component || '-'}</span>
      <small>Response {fmt(row.response, 0)}ms · DB {fmt(row.db, 0)}ms · Wait {fmt(row.wait, 0)}ms.</small>
      <small>Why this matters: higher score means stronger workload-impact evidence for the incident window.</small>
    </div>
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
  const rankingRows = topRows
    .map((row, index) => ({
      rankLabel: `${index + 1}. ${shortLabel(row.label)}`,
      fullLabel: row.label,
      score: Number(row.score || 0),
      response: Math.round(row.responseMs || 0),
      db: Math.round(row.dbMs || 0),
      wait: Math.round(row.waitMs || 0),
      component: row.component,
      kind: row.kind,
    }))
    .sort((a, b) => b.score - a.score)

  return <section className="evidenceToolShell refinedTool"><header className="evidenceHero compactEvidenceHero"><div><span>ST03N Impact Analyzer V2</span><h1>Workload impact drilldown.</h1><p>Decision-first ST03N analysis: impact verdict, dominant component, completeness, and top workload offender.</p></div><label className="evidenceUpload"><input type="file" multiple accept=".zip,.xlsx,.xls,.csv" onChange={(event) => onFiles(event.target.files)} />{busy ? 'Parsing…' : 'Upload ST03N Pack'}</label></header><SessionBanner session={session} /><EvidenceToolbar analysis={analysis} cacheKey={CACHE_KEY} reportText={buildReportText(analysis)} filenamePrefix="sap-st03n-impact-v2" /><section className="decisionBoard"><DecisionCard label="Impact Verdict" value={analysis?.verdict || 'Pending'} hint={analysis?.nextAction || status} tone={analysis?.verdict === 'Detected' ? 'good' : ''} /><DecisionCard label="Dominant Component" value={analysis?.dominant || 'Unknown'} hint="Derived from response, DB, wait, CPU columns" tone="blue" /><DecisionCard label="Confidence" value={`${analysis?.confidence || 0}%`} hint={analysis?.correlation || 'Pending upload'} /><DecisionCard label="Completeness" value={`${analysis?.completeness || 0}%`} hint="Required ST03N pack coverage" /></section><div className="evidenceGrid"><section className="evidencePanel"><h2>Parse Status</h2><div className="statusList">{REQUIRED_ST03N.map((required) => { const parsed = analysis?.parseStatus?.filter((item) => item.key === required.key) || []; const hasFile = detected[required.key]?.length || parsed.some((item) => item.ok); return <div key={required.key} className={hasFile ? 'ok' : 'missing'}><b>{required.label}</b><span>{detected[required.key]?.[0]?.name || parsed[0]?.message || 'missing'}</span></div> })}</div></section><section className="evidencePanel"><h2>Interpretation</h2>{top ? <><p><b>{top.label}</b> is the strongest parsed ST03N signal. It is classified as <b>{top.component}</b>.</p><div className="confidenceRows"><span>Score<b>{top.score}/100</b></span><span>Response<b>{fmt(top.responseMs, 0)}ms</b></span><span>DB Share<b>{fmt(top.dbShare)}%</b></span></div></> : <p>{status}</p>}</section></div>{analysis ? <div className="evidenceGrid wide"><section className="evidencePanel chartPanel rcaReadableChartPanel"><div className="chartTitleBlock"><h2>Top ST03N problem ranking</h2><p>Yang paling problem adalah bar paling atas. Ranking dihitung dari score workload impact, lalu dikorelasikan dengan response time, DB time, dan wait time.</p></div><ResponsiveContainer width="100%" height={Math.max(320, rankingRows.length * 42)}><BarChart data={rankingRows} layout="vertical" margin={{ top: 8, right: 52, bottom: 12, left: 126 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" domain={[0, 100]} axisLine={false} tickLine={false} label={{ value: 'Problem Score (0-100)', position: 'insideBottom', offset: -6 }} /><YAxis type="category" dataKey="rankLabel" width={126} axisLine={false} tickLine={false} /><Tooltip content={<St03nTooltip />} /><Legend formatter={(value) => value === 'score' ? 'Problem Score' : value} /><Bar dataKey="score" name="Problem Score" radius={[0, 8, 8, 0]} barSize={24}><LabelList dataKey="score" position="right" formatter={(value) => `${value}/100`} /></Bar></BarChart></ResponsiveContainer></section><section className="evidencePanel"><h2>Component Mix</h2><ResponsiveContainer width="100%" height={230}><PieChart><Pie data={analysis.componentRows || []} dataKey="value" nameKey="name" outerRadius={82} label>{(analysis.componentRows || []).map((_, index) => <Cell key={index} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer><div className="evidenceList compact">{topRows.slice(0, 7).map((row) => <div key={`${row.kind}-${row.fileName}-${row.label}`}><b>{row.label}</b><span>{row.kind} · {row.component} · score {row.score}/100</span><small>Response {fmt(row.responseMs, 0)}ms · DB {fmt(row.dbMs, 0)}ms · Wait {fmt(row.waitMs, 0)}ms · Steps {fmt(row.steps, 0)}</small></div>)}</div></section></div> : <EmptyState title="How to use this analyzer"><p>Upload the 5 ST03N Excel files or a ZIP containing them. This page ranks workload impact only from uploaded evidence.</p><ol><li>Upload Time Profile, Workload, Transaction Standard, Top Response, and Top DB.</li><li>Review parse status and completeness.</li><li>Use Top ST03N Evidence to confirm whether workload impact supports the RCA window.</li></ol></EmptyState>}<div className="evidenceGrid"><UploadedFilesPanel files={files} /><EvidenceServerPanel serverInfo={serverInfo} /></div></section>
}
