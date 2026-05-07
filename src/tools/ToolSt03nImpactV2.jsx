import React from 'react'
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell } from 'recharts'
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

  return <section className="evidenceToolShell refinedTool"><header className="evidenceHero compactEvidenceHero"><div><span>ST03N Impact Analyzer V2</span><h1>Workload impact drilldown.</h1><p>Decision-first ST03N analysis: impact verdict, dominant component, completeness, and top workload offender.</p></div><label className="evidenceUpload"><input type="file" multiple accept=".zip,.xlsx,.xls,.csv" onChange={(event) => onFiles(event.target.files)} />{busy ? 'Parsing…' : 'Upload ST03N Pack'}</label></header><SessionBanner session={session} /><EvidenceToolbar analysis={analysis} cacheKey={CACHE_KEY} reportText={buildReportText(analysis)} filenamePrefix="sap-st03n-impact-v2" /><section className="decisionBoard"><DecisionCard label="Impact Verdict" value={analysis?.verdict || 'Pending'} hint={analysis?.nextAction || status} tone={analysis?.verdict === 'Detected' ? 'good' : ''} /><DecisionCard label="Dominant Component" value={analysis?.dominant || 'Unknown'} hint="Derived from response, DB, wait, CPU columns" tone="blue" /><DecisionCard label="Confidence" value={`${analysis?.confidence || 0}%`} hint={analysis?.correlation || 'Pending upload'} /><DecisionCard label="Completeness" value={`${analysis?.completeness || 0}%`} hint="Required ST03N pack coverage" /></section><div className="evidenceGrid"><section className="evidencePanel"><h2>Parse Status</h2><div className="statusList">{REQUIRED_ST03N.map((required) => { const parsed = analysis?.parseStatus?.filter((item) => item.key === required.key) || []; const hasFile = detected[required.key]?.length || parsed.some((item) => item.ok); return <div key={required.key} className={hasFile ? 'ok' : 'missing'}><b>{required.label}</b><span>{detected[required.key]?.[0]?.name || parsed[0]?.message || 'missing'}</span></div> })}</div></section><section className="evidencePanel"><h2>Interpretation</h2>{top ? <><p><b>{top.label}</b> is the strongest parsed ST03N signal. It is classified as <b>{top.component}</b>.</p><div className="confidenceRows"><span>Score<b>{top.score}/100</b></span><span>Response<b>{fmt(top.responseMs, 0)}ms</b></span><span>DB Share<b>{fmt(top.dbShare)}%</b></span></div></> : <p>{status}</p>}</section></div>{analysis ? <div className="evidenceGrid wide"><section className="evidencePanel chartPanel"><h2>Top ST03N Evidence</h2><ResponsiveContainer width="100%" height={320}><BarChart data={topRows.map((row) => ({ name: row.label.slice(0, 18), score: row.score, response: Math.round(row.responseMs), db: Math.round(row.dbMs), wait: Math.round(row.waitMs) }))}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" /><YAxis domain={[0, 100]} /><Tooltip /><Legend /><Bar dataKey="score" radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer></section><section className="evidencePanel"><h2>Component Mix</h2><ResponsiveContainer width="100%" height={230}><PieChart><Pie data={analysis.componentRows || []} dataKey="value" nameKey="name" outerRadius={82} label>{(analysis.componentRows || []).map((_, index) => <Cell key={index} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer><div className="evidenceList compact">{topRows.slice(0, 7).map((row) => <div key={`${row.kind}-${row.fileName}-${row.label}`}><b>{row.label}</b><span>{row.kind} · {row.component} · score {row.score}/100</span><small>Response {fmt(row.responseMs, 0)}ms · DB {fmt(row.dbMs, 0)}ms · Wait {fmt(row.waitMs, 0)}ms · Steps {fmt(row.steps, 0)}</small></div>)}</div></section></div> : <EmptyState title="How to use this analyzer"><p>Upload the 5 ST03N Excel files or a ZIP containing them. This page ranks workload impact only from uploaded evidence.</p><ol><li>Upload Time Profile, Workload, Transaction Standard, Top Response, and Top DB.</li><li>Review parse status and completeness.</li><li>Use Top ST03N Evidence to confirm whether workload impact supports the RCA window.</li></ol></EmptyState>}<div className="evidenceGrid"><UploadedFilesPanel files={files} /><EvidenceServerPanel serverInfo={serverInfo} /></div></section>
}
