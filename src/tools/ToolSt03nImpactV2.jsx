import React from 'react'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell } from 'recharts'
import { listEvidence } from '../evidence-api-client.js'
import './ToolEvidenceSpecialist.css'

const REQUIRED = [
  { key: 'timeProfile', label: 'Time Profile', patterns: ['time-profile', 'time_profile', 'time profile'] },
  { key: 'workload', label: 'Workload Overview', patterns: ['workload'] },
  { key: 'transactionStandard', label: 'Transaction Standard', patterns: ['transaction-standard', 'transaction_standard', 'transaction standard', 'txstd'] },
  { key: 'topResponse', label: 'Top Response Time', patterns: ['top-respond', 'top-response', 'top respond', 'top response'] },
  { key: 'topDb', label: 'Top DB Access', patterns: ['top-db', 'top db', 'db-access', 'db access'] },
]

const CACHE_KEY = 'sap_st03n_impact_v2_cache'
const safe = (v) => String(v ?? '').trim()
const low = (v) => safe(v).toLowerCase()
const ext = (name = '') => name.split('.').pop()?.toLowerCase() || ''
const fmt = (v, d = 1) => Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: d })
const number = (value, fallback = 0) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  let s = safe(value).replace(/\u00a0/g, '').replace(/\s+/g, '')
  if (!s) return fallback
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  else s = s.replace(',', '.')
  s = s.replace(/[^0-9.\-]/g, '')
  const parsed = Number.parseFloat(s)
  return Number.isFinite(parsed) ? parsed : fallback
}

function loadJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || '') || fallback } catch { return fallback }
}

function saveJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* ignore storage quota */ }
}

function latestSession() {
  return loadJson('sap_rca_investigation_sessions_v1', [])[0] || null
}

function classify(name = '') {
  const n = low(name).replace(/[_()\[\]]/g, '-')
  return REQUIRED.find((item) => item.patterns.some((p) => n.includes(p)))?.key || ''
}

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
      if (['xlsx', 'xls', 'csv'].includes(ext(name))) out.push(new File([blob], name, { type: blob.type || 'application/octet-stream' }))
    }
  }
  return out
}

async function readMatrix(file) {
  const buffer = await file.arrayBuffer()
  if (ext(file.name) === 'csv') {
    const text = new TextDecoder('utf-8').decode(buffer)
    return text.split(/\r?\n/).map((line) => line.split(/[;,\t]/).map(safe)).filter((r) => r.some(Boolean))
  }
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true })
}

function findHeaderIndex(rows = []) {
  let best = 0
  let score = -1
  rows.slice(0, 100).forEach((row, idx) => {
    const line = low((row || []).join(' | '))
    let s = 0
    if (/transaction|report|program|time interval|task type|tcode|dialog|user|name/.test(line)) s += 4
    if (/response|database|db time|dialog steps|cpu|wait|average|total|elapsed|duration|calls|steps/.test(line)) s += 5
    if (/client|object|count|load|workload/.test(line)) s += 1
    if (s > score) { best = idx; score = s }
  })
  return best
}

function rowsToObjects(rows = []) {
  const headerIdx = findHeaderIndex(rows)
  const header = (rows[headerIdx] || []).map((h, i) => safe(h) || `Column ${i + 1}`)
  const objects = rows.slice(headerIdx + 1).map((row) => {
    const o = {}
    header.forEach((h, i) => { o[h] = row[i] })
    return o
  }).filter((o) => Object.values(o).some((v) => safe(v)))
  return { objects, headerIdx, header }
}

function pickCol(keys, patterns) { return keys.find((k) => patterns.some((p) => p.test(low(k)))) || '' }
function labelFromRow(o, cName, fileName, idx) {
  const explicit = safe(o[cName])
  if (explicit && !/^\d+(?:[.,]\d+)?$/.test(explicit)) return explicit
  const candidate = Object.keys(o || {})
    .filter((k) => /transaction|report|program|task|interval|name|tcode|object|user/i.test(k))
    .map((k) => safe(o[k]))
    .find((v) => v && !/^\d+(?:[.,]\d+)?$/.test(v))
  return candidate || `${fileName.replace(/\.[^.]+$/, '')} item ${idx + 1}`
}

function summarize(kind, objects, fileName) {
  const keys = Object.keys(objects[0] || {})
  const cName = pickCol(keys, [/transaction/, /report/, /program/, /task type/, /time interval/, /tcode/, /name/, /user/])
  const cResp = pickCol(keys, [/response.*ms/, /average.*response/, /dialog step response/, /response time/, /resp/, /elapsed/])
  const cDb = pickCol(keys, [/database.*ms/, /db time/, /sequential reads time/, /direct reads time/, /^db$/, /database/])
  const cWait = pickCol(keys, [/wait.*ms/, /roll wait/, /^wait$/])
  const cSteps = pickCol(keys, [/dialog steps/, /^steps$/, /number.*step/, /count/, /calls/])
  const cCpu = pickCol(keys, [/cpu/])
  const rawRows = objects.map((o, idx) => {
    const label = labelFromRow(o, cName, fileName, idx)
    const responseMs = number(o[cResp], 0)
    const dbMs = number(o[cDb], 0)
    const waitMs = number(o[cWait], 0)
    const cpuMs = number(o[cCpu], 0)
    const steps = number(o[cSteps], 0)
    const rawScore = responseMs + dbMs + waitMs + cpuMs + Math.log10(steps + 1) * 100
    const dbShare = responseMs > 0 ? (dbMs / responseMs) * 100 : 0
    const waitShare = responseMs > 0 ? (waitMs / responseMs) * 100 : 0
    const component = dbShare >= 45 ? 'DB-heavy' : waitShare >= 25 ? 'Wait-heavy' : cpuMs > responseMs * 0.35 ? 'CPU-heavy' : responseMs > 0 ? 'Response-heavy' : 'Workload'
    return { kind, fileName, label, responseMs, dbMs, waitMs, cpuMs, steps, rawScore, dbShare, waitShare, component, columns: { cName, cResp, cDb, cWait, cSteps, cCpu } }
  }).filter((r) => r.rawScore > 0)
  const maxScore = Math.max(1, ...rawRows.map((r) => r.rawScore))
  return rawRows.map((r) => ({ ...r, score: Math.round((r.rawScore / maxScore) * 100) })).sort((a, b) => b.score - a.score).slice(0, 30)
}

function buildAnalysis(files, parseStatus, rows, evidenceServer) {
  const top = rows[0]
  const parsedFiles = parseStatus.filter((x) => x.ok).length
  const completeness = Math.round((parsedFiles / REQUIRED.length) * 100)
  const counts = rows.reduce((acc, row) => {
    acc[row.component] = (acc[row.component] || 0) + 1
    return acc
  }, {})
  const componentRows = Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
  const dominant = componentRows[0]?.name || 'Unknown'
  const verdict = top ? 'Detected' : 'Not confirmed'
  const confidence = Math.min(100, Math.round((top?.score || 0) * 0.55 + completeness * 0.30 + Math.min(rows.length, 20) * 0.75))
  const correlation = top ? (completeness >= 80 ? 'Strong workload evidence' : 'Partial workload evidence') : 'Weak workload evidence'
  const nextAction = top
    ? `Use ${top.label} as ST03N impact reference. Dominant component: ${top.component}.`
    : 'Upload complete ST03N pack or verify file naming/header format.'
  return { files, parseStatus, rows, top, completeness, componentRows, dominant, verdict, confidence, correlation, nextAction, evidenceServer, createdAt: new Date().toISOString() }
}

function DecisionCard({ label, value, hint, tone = '' }) {
  return <div className={`decisionCard ${tone}`}><span>{label}</span><b>{value}</b><small>{hint}</small></div>
}

function EmptyState() {
  return <section className="evidencePanel emptyState"><h2>How to use this analyzer</h2><p>Upload the 5 ST03N Excel files or a ZIP containing them. This page will rank workload impact only from uploaded evidence.</p><ol><li>Upload Time Profile, Workload, Transaction Standard, Top Response, and Top DB.</li><li>Review parse status and completeness.</li><li>Use Top ST03N Evidence to confirm whether workload impact supports the RCA window.</li></ol></section>
}

export default function ToolSt03nImpactV2() {
  const [session] = React.useState(latestSession)
  const [files, setFiles] = React.useState([])
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('Upload ST03N pack or ZIP to validate workload impact.')
  const [analysis, setAnalysis] = React.useState(() => loadJson(CACHE_KEY, null))
  const [serverInfo, setServerInfo] = React.useState(null)

  React.useEffect(() => {
    let active = true
    listEvidence({ tool: 'investigation', limit: 5 }).then((res) => { if (active) setServerInfo(res) }).catch(() => {})
    return () => { active = false }
  }, [])

  const detected = React.useMemo(() => {
    const map = Object.fromEntries(REQUIRED.map((r) => [r.key, []]))
    files.forEach((f) => { const k = classify(f.name); if (k) map[k].push(f) })
    return map
  }, [files])

  const analyze = async (nextFiles = files) => {
    setBusy(true)
    setStatus('Parsing ST03N evidence…')
    try {
      const rows = []
      const parseStatus = []
      for (const req of REQUIRED) {
        const group = nextFiles.filter((f) => classify(f.name) === req.key)
        if (!group.length) parseStatus.push({ key: req.key, label: req.label, ok: false, rows: 0, message: 'missing' })
        for (const file of group) {
          const { objects, headerIdx, header } = rowsToObjects(await readMatrix(file))
          const summary = summarize(req.key, objects, file.name)
          rows.push(...summary)
          parseStatus.push({ key: req.key, label: req.label, ok: summary.length > 0, rows: summary.length, message: summary.length ? `parsed header row ${headerIdx + 1}` : 'no valid metric rows', fileName: file.name, columns: header.slice(0, 10) })
        }
      }
      rows.sort((a, b) => b.score - a.score)
      const result = buildAnalysis(nextFiles.map((f) => ({ name: f.name, size: f.size })), parseStatus, rows, serverInfo)
      setAnalysis(result)
      saveJson(CACHE_KEY, result)
      setStatus('ST03N analysis complete.')
    } catch (e) { setStatus(e?.message || 'Failed to analyze ST03N files.') }
    finally { setBusy(false) }
  }

  const onFiles = async (fileList) => {
    setBusy(true)
    try { const expanded = await expandFiles(fileList); setFiles(expanded); await analyze(expanded) }
    catch (e) { setStatus(e?.message || 'Failed to read upload.') }
    finally { setBusy(false) }
  }

  const topRows = analysis?.rows?.slice(0, 12) || []
  const top = analysis?.top
  return <section className="evidenceToolShell refinedTool"><header className="evidenceHero compactEvidenceHero"><div><span>ST03N Impact Analyzer V2</span><h1>Workload impact drilldown.</h1><p>Decision-first ST03N analysis: impact verdict, dominant component, completeness, and top workload offender.</p></div><label className="evidenceUpload"><input type="file" multiple accept=".zip,.xlsx,.xls,.csv" onChange={(e) => onFiles(e.target.files)} />{busy ? 'Parsing…' : 'Upload ST03N Pack'}</label></header>{session && <section className="sessionBanner"><b>Latest RCA session</b><span>{session.sid} • {session.host} • {session.window?.start} - {session.window?.end}</span><small>{session.summary}</small></section>}<section className="decisionBoard"><DecisionCard label="Impact Verdict" value={analysis?.verdict || 'Pending'} hint={analysis?.nextAction || status} tone={analysis?.verdict === 'Detected' ? 'good' : ''} /><DecisionCard label="Dominant Component" value={analysis?.dominant || 'Unknown'} hint="Derived from response, DB, wait, CPU columns" tone="blue" /><DecisionCard label="Confidence" value={`${analysis?.confidence || 0}%`} hint={analysis?.correlation || 'Pending upload'} /><DecisionCard label="Completeness" value={`${analysis?.completeness || 0}%`} hint="Required ST03N pack coverage" /></section><div className="evidenceGrid"><section className="evidencePanel"><h2>Parse Status</h2><div className="statusList">{REQUIRED.map((req) => { const parsed = analysis?.parseStatus?.filter((x) => x.key === req.key) || []; const hasFile = detected[req.key]?.length || parsed.some((x) => x.ok); return <div key={req.key} className={hasFile ? 'ok' : 'missing'}><b>{req.label}</b><span>{detected[req.key]?.[0]?.name || parsed[0]?.message || 'missing'}</span></div> })}</div></section><section className="evidencePanel"><h2>Interpretation</h2>{top ? <><p><b>{top.label}</b> is the strongest parsed ST03N signal. It is classified as <b>{top.component}</b>.</p><div className="confidenceRows"><span>Score<b>{top.score}/100</b></span><span>Response<b>{fmt(top.responseMs, 0)}ms</b></span><span>DB Share<b>{fmt(top.dbShare)}%</b></span></div></> : <p>{status}</p>}</section></div>{analysis ? <div className="evidenceGrid wide"><section className="evidencePanel chartPanel"><h2>Top ST03N Evidence</h2><ResponsiveContainer width="100%" height={320}><BarChart data={topRows.map((r) => ({ name: r.label.slice(0, 18), score: r.score, response: Math.round(r.responseMs), db: Math.round(r.dbMs), wait: Math.round(r.waitMs) }))}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" /><YAxis domain={[0, 100]} /><Tooltip /><Legend /><Bar dataKey="score" radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer></section><section className="evidencePanel"><h2>Component Mix</h2><ResponsiveContainer width="100%" height={230}><PieChart><Pie data={analysis.componentRows || []} dataKey="value" nameKey="name" outerRadius={82} label>{(analysis.componentRows || []).map((_, idx) => <Cell key={idx} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer><div className="evidenceList compact">{topRows.slice(0, 7).map((r) => <div key={`${r.kind}-${r.fileName}-${r.label}`}><b>{r.label}</b><span>{r.kind} · {r.component} · score {r.score}/100</span><small>Response {fmt(r.responseMs, 0)}ms · DB {fmt(r.dbMs, 0)}ms · Wait {fmt(r.waitMs, 0)}ms · Steps {fmt(r.steps, 0)}</small></div>)}</div></section></div> : <EmptyState />}</section>
}
