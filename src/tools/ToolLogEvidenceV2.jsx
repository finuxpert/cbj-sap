import React from 'react'
import JSZip from 'jszip'
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend, LineChart, Line } from 'recharts'
import { listEvidence } from '../evidence-api-client.js'
import './ToolEvidenceSpecialist.css'

const CACHE_KEY = 'sap_log_evidence_v2_cache'
const safe = (v) => String(v ?? '').trim()
const ext = (name = '') => name.split('.').pop()?.toLowerCase() || ''
const fmt = (v, d = 1) => Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: d })
const ERROR_FAMILY = [
  { pattern: /CONVT_NO_NUMBER/i, family: 'ABAP conversion / data format issue', owner: 'ABAP / Functional data owner', meaning: 'Numeric conversion failed. Focus on input values, formatting, and job data source.' },
  { pattern: /DBSQL|DUPLICATE_KEY|SQL/i, family: 'Database/application data consistency issue', owner: 'ABAP / Functional / Data owner', meaning: 'Duplicate key or SQL issue. Focus on data consistency and insert/update logic.' },
  { pattern: /TIME_OUT/i, family: 'Timeout / long-running processing', owner: 'ABAP / Basis', meaning: 'Processing exceeded runtime threshold. Focus on runtime, loops, SQL, or batch size.' },
  { pattern: /CALL_FUNCTION|RFC|SEND_ERR/i, family: 'RFC / communication function error', owner: 'Basis / Integration', meaning: 'Remote/function call failed. Focus on destination, network, target system, or payload.' },
  { pattern: /SYNTAX|LOAD_PROGRAM|PROGRAM/i, family: 'ABAP program load/runtime issue', owner: 'ABAP', meaning: 'Program/load issue. Focus on transport, generation, syntax, or runtime load state.' },
  { pattern: /UNCAUGHT_EXCEPTION|EXCEPTION/i, family: 'Unhandled ABAP exception', owner: 'ABAP', meaning: 'Exception was not handled. Focus on exception path and input condition.' },
]
const KNOWN_ERRORS = ['CONVT_NO_NUMBER', 'DBSQL_DUPLICATE_KEY_ER', 'ITAB_DUPLICATE_KEY', 'LOAD_PROGRAM_TABLE_MIS', 'UNCAUGHT_EXCEPTION', 'SYNTAX_ERROR', 'CALL_FUNCTION_SEND_ERR', 'TIME_OUT', 'IMPORT_WRONG_END_POS']

function loadJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || '') || fallback } catch { return fallback } }
function saveJson(key, value) { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* ignore */ } }
function latestSession() { return loadJson('sap_rca_investigation_sessions_v1', [])[0] || null }
function classifyError(errorCode = '') { return ERROR_FAMILY.find((x) => x.pattern.test(errorCode)) || { family: 'Unclassified SAP runtime/log pattern', owner: 'Basis triage', meaning: 'Pattern detected but not classified. Continue with raw evidence review.' } }

async function expandFiles(fileList) {
  const input = Array.from(fileList || [])
  const out = []
  for (const file of input) {
    if (ext(file.name) !== 'zip') { out.push(file); continue }
    const zip = await JSZip.loadAsync(file)
    for (const entry of Object.values(zip.files)) {
      if (entry.dir || entry.name.startsWith('__MACOSX')) continue
      const blob = await entry.async('blob')
      const name = entry.name.split('/').pop() || entry.name
      if (['log', 'txt', 'csv'].includes(ext(name))) out.push(new File([blob], name, { type: blob.type || 'text/plain' }))
    }
  }
  return out
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
    rows.push({ fileName, snapshot, timeLabel, host, pid: m[1], wp: m[3], type: m[4], cpu: Number(m[5]) || 0, rssGb: Number(m[7]) || 0, state: m[8], className: m[14], program, errorCode, jobName, source: 'WP-SCOUT' })
  })
  return rows
}

function parseGenericErrors(text = '', fileName = '') {
  const rows = []
  String(text || '').replace(/\r/g, '').split('\n').forEach((line, idx) => {
    const errorCode = KNOWN_ERRORS.find((e) => line.includes(e))
    if (!errorCode) return
    const hhmm = line.match(/\b(\d{2}:\d{2})(?::\d{2})?\b/)?.[1] || ''
    rows.push({ fileName, timeLabel: hhmm, host: 'UNKNOWN', pid: '', wp: '', type: '', cpu: 0, rssGb: 0, state: '', className: /CRIT|ERROR|\bE\b|dump/i.test(line) ? 'CRIT' : 'WARN', program: safe(line).slice(0, 120), errorCode, jobName: '?', lineNo: idx + 1, source: 'generic-log' })
  })
  return rows
}

function group(rows, key) {
  const map = new Map()
  rows.forEach((r) => {
    const name = safe(r[key]) || '?'
    const family = classifyError(key === 'errorCode' ? name : r.errorCode)
    const cur = map.get(name) || { name, hits: 0, critHits: 0, warnHits: 0, maxCpu: 0, examples: new Set(), jobs: new Set(), programs: new Set(), times: new Set(), files: new Set(), family: family.family, owner: family.owner, meaning: family.meaning }
    cur.hits += 1
    cur.critHits += r.className === 'CRIT' ? 1 : 0
    cur.warnHits += r.className === 'WARN' ? 1 : 0
    cur.maxCpu = Math.max(cur.maxCpu, r.cpu || 0)
    if (r.program && key !== 'program') cur.examples.add(r.program)
    if (r.jobName && key !== 'jobName') cur.examples.add(r.jobName)
    if (r.program) cur.programs.add(r.program)
    if (r.jobName) cur.jobs.add(r.jobName)
    if (r.timeLabel) cur.times.add(r.timeLabel)
    if (r.fileName) cur.files.add(r.fileName)
    map.set(name, cur)
  })
  return Array.from(map.values()).map((x) => ({ ...x, examples: Array.from(x.examples).slice(0, 3), jobs: Array.from(x.jobs).filter((v) => v !== '?').slice(0, 5), programs: Array.from(x.programs).filter((v) => v !== '?').slice(0, 5), times: Array.from(x.times).slice(0, 10), files: Array.from(x.files).slice(0, 5) })).sort((a, b) => b.critHits - a.critHits || b.hits - a.hits)
}

function buildAnalysis(files, rows, evidenceServer) {
  const errorGroups = group(rows, 'errorCode')
  const jobGroups = group(rows, 'jobName')
  const programGroups = group(rows, 'program')
  const primary = errorGroups[0]
  const timelineMap = new Map()
  rows.forEach((r) => {
    if (!r.timeLabel) return
    const cur = timelineMap.get(r.timeLabel) || { time: r.timeLabel, hits: 0, crit: 0 }
    cur.hits += 1
    cur.crit += r.className === 'CRIT' ? 1 : 0
    timelineMap.set(r.timeLabel, cur)
  })
  const timeline = Array.from(timelineMap.values()).sort((a, b) => String(a.time).localeCompare(String(b.time)))
  const confidence = Math.min(100, Math.round((primary?.critHits || 0) * 8 + (primary?.hits || 0) * 2 + Math.min(rows.length, 40)))
  const verdict = primary ? 'Detected' : 'Not confirmed'
  const nextAction = primary ? `Focus ${primary.owner}: ${primary.name} → ${primary.family}.` : 'Upload WP-SCOUT, SM21, ST22, dev_w, or job logs containing SAP error patterns.'
  const summary = primary ? `${primary.name} is strongest: ${primary.hits} hit(s), ${primary.critHits} CRIT, owner ${primary.owner}.` : 'No known SAP error patterns detected from uploaded logs.'
  return { files, rows, errorGroups, jobGroups, programGroups, primary, timeline, confidence, verdict, nextAction, summary, evidenceServer, createdAt: new Date().toISOString() }
}

function DecisionCard({ label, value, hint, tone = '' }) { return <div className={`decisionCard ${tone}`}><span>{label}</span><b>{value}</b><small>{hint}</small></div> }
function Group({ title, rows = [] }) { return <section className="evidencePanel"><h2>{title}</h2><div className="evidenceList compact">{rows.slice(0, 8).map((g) => <div key={g.name}><b>{g.name}</b><span>hits {g.hits} · CRIT {g.critHits}</span><small>{g.family || ''} {g.examples?.join(' · ')}</small></div>)}</div></section> }
function EmptyState() { return <section className="evidencePanel emptyState"><h2>How to use this analyzer</h2><p>Upload WP-SCOUT logs, SM21/ST22 text, dev_w trace, job log text, or a ZIP containing logs.</p><ol><li>Find strongest ErrorCode.</li><li>Map error to job/program.</li><li>Use owner direction to route action.</li></ol></section> }

export default function ToolLogEvidenceV2() {
  const [session] = React.useState(latestSession)
  const [files, setFiles] = React.useState([])
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('Upload WP-SCOUT/SM21/ST22/dev_w/job logs or ZIP to validate error evidence.')
  const [analysis, setAnalysis] = React.useState(() => loadJson(CACHE_KEY, null))
  const [serverInfo, setServerInfo] = React.useState(null)

  React.useEffect(() => {
    let active = true
    listEvidence({ tool: 'investigation', limit: 5 }).then((res) => { if (active) setServerInfo(res) }).catch(() => {})
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
      const result = buildAnalysis(nextFiles.map((f) => ({ name: f.name, size: f.size })), rows, serverInfo)
      setAnalysis(result)
      saveJson(CACHE_KEY, result)
      setStatus('Log evidence analysis complete.')
    } catch (e) { setStatus(e?.message || 'Failed to parse logs.') }
    finally { setBusy(false) }
  }

  const onFiles = async (fileList) => {
    setBusy(true)
    try { const expanded = await expandFiles(fileList); setFiles(expanded); await analyze(expanded) }
    catch (e) { setStatus(e?.message || 'Failed to read upload.') }
    finally { setBusy(false) }
  }

  const p = analysis?.primary
  const chartData = analysis?.errorGroups?.slice(0, 10).map((g) => ({ name: g.name.slice(0, 16), hits: g.hits, crit: g.critHits })) || []
  return <section className="evidenceToolShell refinedTool"><header className="evidenceHero compactEvidenceHero"><div><span>Log Evidence Analyzer V2</span><h1>Error pattern drilldown.</h1><p>Decision-first log analysis: primary error, family, owner direction, job/program mapping, and occurrence timeline.</p></div><label className="evidenceUpload"><input type="file" multiple accept=".zip,.log,.txt,.csv" onChange={(e) => onFiles(e.target.files)} />{busy ? 'Parsing…' : 'Upload Log Evidence'}</label></header>{session && <section className="sessionBanner"><b>Latest RCA session</b><span>{session.sid} • {session.host} • {session.window?.start} - {session.window?.end}</span><small>{session.summary}</small></section>}<section className="decisionBoard"><DecisionCard label="Primary Error" value={p?.name || 'Pending'} hint={analysis?.summary || status} tone={p ? 'good' : ''} /><DecisionCard label="Error Family" value={p?.family || 'Unknown'} hint={p?.meaning || 'Upload logs to classify error family'} tone="blue" /><DecisionCard label="Owner Direction" value={p?.owner || 'Pending'} hint={analysis?.nextAction || 'Based only on uploaded evidence pattern'} /><DecisionCard label="Confidence" value={`${analysis?.confidence || 0}%`} hint={`${analysis?.rows?.length || 0} parsed rows`} /></section><div className="evidenceGrid"><section className="evidencePanel"><h2>Primary Error Explanation</h2>{p ? <><p><b>{p.name}</b> points to <b>{p.family}</b>.</p><p>{p.meaning}</p><div className="confidenceRows"><span>Hits<b>{p.hits}</b></span><span>CRIT<b>{p.critHits}</b></span><span>Files<b>{p.files?.length || 0}</b></span></div></> : <p>{status}</p>}</section><section className="evidencePanel"><h2>Error → Job / Program Mapping</h2>{p ? <div className="evidenceList compact"><div><b>Jobs</b><span>{p.jobs?.join(' · ') || 'No job extracted'}</span></div><div><b>Programs</b><span>{p.programs?.join(' · ') || 'No program extracted'}</span></div><div><b>Seen at</b><span>{p.times?.join(', ') || 'No timestamp extracted'}</span></div></div> : <p>Upload logs to map errors to jobs and programs.</p>}</section></div>{analysis ? <div className="evidenceGrid wide"><section className="evidencePanel chartPanel"><h2>Top ErrorCode</h2><ResponsiveContainer width="100%" height={300}><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" /><YAxis /><Tooltip /><Legend /><Bar dataKey="hits" radius={[8, 8, 0, 0]} /><Bar dataKey="crit" radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer>{analysis.timeline?.length ? <ResponsiveContainer width="100%" height={180}><LineChart data={analysis.timeline}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="time" /><YAxis /><Tooltip /><Legend /><Line dataKey="hits" strokeWidth={3} /><Line dataKey="crit" strokeWidth={3} /></LineChart></ResponsiveContainer> : null}</section><section className="evidencePanel"><h2>Error Evidence Ranking</h2><div className="evidenceList">{analysis.errorGroups.slice(0, 12).map((g) => <div key={g.name}><b>{g.name}</b><span>{g.family} · owner {g.owner}</span><small>hits {g.hits} · CRIT {g.critHits} · max CPU {fmt(g.maxCpu)}% · {g.examples.join(' · ')}</small></div>)}</div></section></div> : <EmptyState />} {analysis && <div className="evidenceGrid triple"><Group title="Top JobName" rows={analysis.jobGroups} /><Group title="Top Program" rows={analysis.programGroups} /><Group title="Recommended Action" rows={(analysis.errorGroups || []).slice(0, 8).map((g) => ({ name: g.name, hits: g.hits, critHits: g.critHits, family: `Focus ${g.owner}`, examples: [`Review ${g.jobs?.[0] || g.programs?.[0] || 'uploaded evidence'} around ${g.times.join(', ') || 'uploaded window'}`] }))} /></div>}</section>
}
