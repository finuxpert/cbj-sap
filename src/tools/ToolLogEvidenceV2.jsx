import React from 'react'
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend, LineChart, Line } from 'recharts'
import {
  buildOwnerAction,
  classifySapError,
  expandZipAwareFiles,
  fileExt,
  fmt,
  latestRcaSession,
  loadJson,
  safe,
  saveJson,
} from './evidence-utils.js'
import { KNOWN_SAP_ERROR_CODES } from './log-evidence-constants.js'
import {
  DecisionCard,
  EmptyState,
  EvidenceServerPanel,
  EvidenceToolbar,
  SessionBanner,
  UploadedFilesPanel,
} from './EvidenceDecisionKit.jsx'
import './ToolEvidenceSpecialist.css'

const CACHE_KEY = 'sap_log_evidence_v2_cache'

async function expandFiles(fileList) {
  const expanded = await expandZipAwareFiles(fileList, ['log', 'txt', 'csv'])
  return expanded.filter((file) => ['log', 'txt', 'csv'].includes(fileExt(file.name)))
}

function parseWpRows(text = '', fileName = '') {
  const snapshot = text.match(/snapshot\s*@\s*([^\n]+)/i)?.[1]?.trim() || ''
  const timeLabel = snapshot.split(' ')[1]?.slice(0, 5) || snapshot || fileName
  const host = text.match(/Hostname\s*:\s*(\S+)/i)?.[1]?.trim() || text.match(/##\s*WP-SCOUT\s*@\s*(\S+)/i)?.[1]?.trim() || 'UNKNOWN'
  const rows = []
  const rx = /^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+([\d.]+)\s+([\d.]+G)\s+([\d.]+)\s+([RS])\s+(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(CRIT|WARN|OK)\s+(\S+)\s+(\S+)\s+(.*)$/
  String(text || '').replace(/\r/g, '').split('\n').forEach((line) => {
    const m = safe(line).match(rx)
    if (!m) return
    const rest = safe(m[17])
    const pathIdx = rest.lastIndexOf(' /')
    const noPath = pathIdx >= 0 ? rest.slice(0, pathIdx).trim() : rest
    const parts = noPath.split(/\s+/).filter(Boolean)
    const jobName = parts.pop() || '?'
    const errorCode = parts.pop() || '?'
    const program = parts.join(' ') || '?'
    rows.push({
      fileName,
      snapshot,
      timeLabel,
      host,
      pid: m[1],
      wp: m[3],
      type: m[4],
      cpu: Number(m[5]) || 0,
      rssGb: Number(m[7]) || 0,
      state: m[8],
      className: m[14],
      program,
      errorCode,
      jobName,
      lineNo: 0,
      source: 'WP-SCOUT',
    })
  })
  return rows
}

function parseGenericErrors(text = '', fileName = '') {
  const rows = []
  String(text || '').replace(/\r/g, '').split('\n').forEach((line, idx) => {
    const errorCode = KNOWN_SAP_ERROR_CODES.find((error) => line.includes(error))
    if (!errorCode) return
    const hhmm = line.match(/\b(\d{2}:\d{2})(?::\d{2})?\b/)?.[1] || ''
    const severity = /CRIT|ERROR|\bE\b|dump|abend|failed|exception/i.test(line) ? 'CRIT' : 'WARN'
    rows.push({
      fileName,
      timeLabel: hhmm,
      host: 'UNKNOWN',
      pid: '',
      wp: '',
      type: '',
      cpu: 0,
      rssGb: 0,
      state: '',
      className: severity,
      program: safe(line).slice(0, 140),
      errorCode,
      jobName: '?',
      lineNo: idx + 1,
      source: 'generic-log',
    })
  })
  return rows
}

function group(rows, key) {
  const map = new Map()
  rows.forEach((row) => {
    const name = safe(row[key]) || '?'
    const family = classifySapError(key === 'errorCode' ? name : row.errorCode)
    const current = map.get(name) || {
      name,
      hits: 0,
      critHits: 0,
      warnHits: 0,
      maxCpu: 0,
      examples: new Set(),
      jobs: new Set(),
      programs: new Set(),
      times: new Set(),
      files: new Set(),
      sources: new Set(),
      family: family.family,
      owner: family.owner,
      meaning: family.meaning,
    }
    current.hits += 1
    current.critHits += row.className === 'CRIT' ? 1 : 0
    current.warnHits += row.className === 'WARN' ? 1 : 0
    current.maxCpu = Math.max(current.maxCpu, row.cpu || 0)
    if (row.program && key !== 'program') current.examples.add(row.program)
    if (row.jobName && key !== 'jobName') current.examples.add(row.jobName)
    if (row.program) current.programs.add(row.program)
    if (row.jobName) current.jobs.add(row.jobName)
    if (row.timeLabel) current.times.add(row.timeLabel)
    if (row.fileName) current.files.add(row.fileName)
    if (row.source) current.sources.add(row.source)
    map.set(name, current)
  })
  return Array.from(map.values())
    .map((item) => ({
      ...item,
      examples: Array.from(item.examples).slice(0, 3),
      jobs: Array.from(item.jobs).filter((value) => value !== '?').slice(0, 5),
      programs: Array.from(item.programs).filter((value) => value !== '?').slice(0, 5),
      times: Array.from(item.times).slice(0, 10),
      files: Array.from(item.files).slice(0, 5),
      sources: Array.from(item.sources).slice(0, 5),
    }))
    .sort((a, b) => b.critHits - a.critHits || b.hits - a.hits)
}

function buildTimeline(rows = []) {
  const timelineMap = new Map()
  rows.forEach((row) => {
    if (!row.timeLabel) return
    const current = timelineMap.get(row.timeLabel) || { time: row.timeLabel, hits: 0, crit: 0, warn: 0 }
    current.hits += 1
    current.crit += row.className === 'CRIT' ? 1 : 0
    current.warn += row.className === 'WARN' ? 1 : 0
    timelineMap.set(row.timeLabel, current)
  })
  return Array.from(timelineMap.values()).sort((a, b) => String(a.time).localeCompare(String(b.time)))
}

function confidenceLabel(confidence, rows, primary) {
  if (!primary) return 'No classified error pattern found.'
  if (rows.length < 3) return 'Low sample size; treat as initial clue, not final RCA.'
  if (confidence >= 75) return 'Strong pattern from uploaded log evidence.'
  if (confidence >= 45) return 'Moderate pattern; verify with ST03N/WP-SCOUT timeline.'
  return 'Weak pattern; evidence is partial.'
}

function buildAnalysis(files, rows, evidenceServer) {
  const errorGroups = group(rows, 'errorCode')
  const jobGroups = group(rows, 'jobName')
  const programGroups = group(rows, 'program')
  const primary = errorGroups[0]
  const timeline = buildTimeline(rows)
  const sourceCount = new Set(rows.map((row) => row.source)).size
  const fileCount = new Set(rows.map((row) => row.fileName)).size
  const repeatedSignal = primary?.hits > 1 ? 16 : 0
  const criticalSignal = Math.min(36, (primary?.critHits || 0) * 9)
  const volumeSignal = Math.min(24, rows.length * 2)
  const coverageSignal = Math.min(14, fileCount * 4 + sourceCount * 3)
  const timelineSignal = Math.min(10, timeline.length * 2)
  const confidence = primary ? Math.min(100, Math.round(criticalSignal + repeatedSignal + volumeSignal + coverageSignal + timelineSignal)) : 0
  const verdict = primary ? 'Detected' : 'Not confirmed'
  const nextAction = primary ? buildOwnerAction(primary) : 'Upload WP-SCOUT, SM21, ST22, dev_w, or job logs containing SAP error patterns.'
  const summary = primary
    ? `${primary.name} is strongest: ${primary.hits} hit(s), ${primary.critHits} CRIT, owner ${primary.owner}.`
    : 'No known SAP error patterns detected from uploaded logs.'

  return {
    files,
    rows,
    errorGroups,
    jobGroups,
    programGroups,
    primary,
    timeline,
    confidence,
    confidenceText: confidenceLabel(confidence, rows, primary),
    verdict,
    nextAction,
    summary,
    evidenceServer,
    createdAt: new Date().toISOString(),
  }
}

function Group({ title, rows = [] }) {
  return <section className="evidencePanel"><h2>{title}</h2><div className="evidenceList compact">{rows.slice(0, 8).map((item) => <div key={item.name}><b>{item.name}</b><span>hits {item.hits} · CRIT {item.critHits}</span><small>{item.family || ''} {item.examples?.join(' · ')}</small></div>)}</div></section>
}

function buildReportText(analysis) {
  if (!analysis) return ''
  const primary = analysis.primary
  return [
    'SAP Log Evidence RCA Summary',
    `Verdict: ${analysis.verdict}`,
    `Confidence: ${analysis.confidence}% - ${analysis.confidenceText}`,
    primary ? `Primary Error: ${primary.name}` : 'Primary Error: -',
    primary ? `Error Family: ${primary.family}` : 'Error Family: -',
    primary ? `Owner Direction: ${primary.owner}` : 'Owner Direction: -',
    `Next Action: ${analysis.nextAction}`,
    `Parsed Rows: ${analysis.rows?.length || 0}`,
  ].join('\n')
}

export default function ToolLogEvidenceV2() {
  const [session] = React.useState(latestRcaSession)
  const [files, setFiles] = React.useState([])
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('Upload WP-SCOUT/SM21/ST22/dev_w/job logs or ZIP to validate error evidence.')
  const [analysis, setAnalysis] = React.useState(() => loadJson(CACHE_KEY, null))
  const [serverInfo, setServerInfo] = React.useState(null)

  React.useEffect(() => {
    let active = true
    import('../evidence-api-client.js')
      .then(({ listEvidence }) => listEvidence({ tool: 'investigation', limit: 5 }))
      .then((response) => { if (active) setServerInfo(response) })
      .catch(() => { if (active) setServerInfo({ ok: false }) })
    return () => { active = false }
  }, [])

  const analyze = async (nextFiles = files) => {
    setBusy(true)
    setStatus('Parsing log evidence…')
    try {
      const rows = []
      for (const file of nextFiles) {
        const text = await file.text()
        const wpRows = parseWpRows(text, file.name)
        rows.push(...(wpRows.length ? wpRows : parseGenericErrors(text, file.name)))
      }
      const result = buildAnalysis(nextFiles.map((file) => ({ name: file.name, size: file.size })), rows, serverInfo)
      setAnalysis(result)
      saveJson(CACHE_KEY, result)
      setStatus('Log evidence analysis complete.')
    } catch (error) {
      setStatus(error?.message || 'Failed to parse logs.')
    } finally {
      setBusy(false)
    }
  }

  const onFiles = async (fileList) => {
    setBusy(true)
    try {
      const expanded = await expandFiles(fileList)
      setFiles(expanded)
      await analyze(expanded)
    } catch (error) {
      setStatus(error?.message || 'Failed to read upload.')
    } finally {
      setBusy(false)
    }
  }

  const primary = analysis?.primary
  const chartData = analysis?.errorGroups?.slice(0, 10).map((item) => ({ name: item.name.slice(0, 16), hits: item.hits, crit: item.critHits })) || []

  return <section className="evidenceToolShell refinedTool"><header className="evidenceHero compactEvidenceHero"><div><span>Log Evidence Analyzer V2</span><h1>Error pattern drilldown.</h1><p>Decision-first log analysis: primary error, family, owner direction, job/program mapping, and occurrence timeline.</p></div><label className="evidenceUpload"><input type="file" multiple accept=".zip,.log,.txt,.csv" onChange={(event) => onFiles(event.target.files)} />{busy ? 'Parsing…' : 'Upload Log Evidence'}</label></header><SessionBanner session={session} /><EvidenceToolbar analysis={analysis} cacheKey={CACHE_KEY} reportText={buildReportText(analysis)} filenamePrefix="sap-log-evidence-v2" /><section className="decisionBoard"><DecisionCard label="Primary Error" value={primary?.name || 'Pending'} hint={analysis?.summary || status} tone={primary ? 'good' : ''} /><DecisionCard label="Error Family" value={primary?.family || 'Unknown'} hint={primary?.meaning || 'Upload logs to classify error family'} tone="blue" /><DecisionCard label="Owner Direction" value={primary?.owner || 'Pending'} hint={analysis?.nextAction || 'Based only on uploaded evidence pattern'} /><DecisionCard label="Confidence" value={`${analysis?.confidence || 0}%`} hint={analysis?.confidenceText || `${analysis?.rows?.length || 0} parsed rows`} /></section><div className="evidenceGrid"><section className="evidencePanel"><h2>Primary Error Explanation</h2>{primary ? <><p><b>{primary.name}</b> points to <b>{primary.family}</b>.</p><p>{primary.meaning}</p><div className="confidenceRows"><span>Hits<b>{primary.hits}</b></span><span>CRIT<b>{primary.critHits}</b></span><span>Files<b>{primary.files?.length || 0}</b></span></div></> : <p>{status}</p>}</section><section className="evidencePanel"><h2>Error → Job / Program Mapping</h2>{primary ? <div className="evidenceList compact"><div><b>Jobs</b><span>{primary.jobs?.join(' · ') || 'No job extracted'}</span></div><div><b>Programs</b><span>{primary.programs?.join(' · ') || 'No program extracted'}</span></div><div><b>Seen at</b><span>{primary.times?.join(', ') || 'No timestamp extracted'}</span></div></div> : <p>Upload logs to map errors to jobs and programs.</p>}</section></div>{analysis ? <div className="evidenceGrid wide"><section className="evidencePanel chartPanel"><h2>Top ErrorCode</h2><ResponsiveContainer width="100%" height={300}><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" /><YAxis /><Tooltip /><Legend /><Bar dataKey="hits" radius={[8, 8, 0, 0]} /><Bar dataKey="crit" radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer>{analysis.timeline?.length ? <ResponsiveContainer width="100%" height={180}><LineChart data={analysis.timeline}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="time" /><YAxis /><Tooltip /><Legend /><Line dataKey="hits" strokeWidth={3} /><Line dataKey="crit" strokeWidth={3} /></LineChart></ResponsiveContainer> : null}</section><section className="evidencePanel"><h2>Error Evidence Ranking</h2><div className="evidenceList">{analysis.errorGroups.slice(0, 12).map((item) => <div key={item.name}><b>{item.name}</b><span>{item.family} · owner {item.owner}</span><small>hits {item.hits} · CRIT {item.critHits} · max CPU {fmt(item.maxCpu)}% · {item.examples.join(' · ')}</small></div>)}</div></section></div> : <EmptyState title="How to use this analyzer"><p>Upload WP-SCOUT logs, SM21/ST22 text, dev_w trace, job log text, or a ZIP containing logs.</p><ol><li>Find strongest ErrorCode.</li><li>Map error to job/program.</li><li>Use owner direction to route action.</li></ol></EmptyState>}{analysis && <div className="evidenceGrid triple"><Group title="Top JobName" rows={analysis.jobGroups} /><Group title="Top Program" rows={analysis.programGroups} /><Group title="Recommended Action" rows={(analysis.errorGroups || []).slice(0, 8).map((item) => ({ name: item.name, hits: item.hits, critHits: item.critHits, family: `Focus ${item.owner}`, examples: [buildOwnerAction(item)] }))} /></div>}<div className="evidenceGrid"><UploadedFilesPanel files={files} /><EvidenceServerPanel serverInfo={serverInfo} /></div></section>
}
