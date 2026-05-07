import React from 'react'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from 'recharts'
import './ToolEvidenceSpecialist.css'

const REQUIRED = [
  { key: 'timeProfile', label: 'Time Profile', patterns: ['time-profile', 'time_profile', 'time profile'] },
  { key: 'workload', label: 'Workload Overview', patterns: ['workload'] },
  { key: 'transactionStandard', label: 'Transaction Standard', patterns: ['transaction-standard', 'transaction_standard', 'transaction standard', 'txstd'] },
  { key: 'topResponse', label: 'Top Response Time', patterns: ['top-respond', 'top-response', 'top respond', 'top response'] },
  { key: 'topDb', label: 'Top DB Access', patterns: ['top-db', 'top db', 'db-access', 'db access'] },
]

const safe = (v) => String(v ?? '').trim()
const low = (v) => safe(v).toLowerCase()
const ext = (name = '') => name.split('.').pop()?.toLowerCase() || ''
const fmt = (v, d = 1) => Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: d })
const toNum = (value, fallback = 0) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  let s = safe(value).replace(/\u00a0/g, '').replace(/\s+/g, '')
  if (!s) return fallback
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  else s = s.replace(',', '.')
  s = s.replace(/[^0-9.\-]/g, '')
  const n = Number.parseFloat(s)
  return Number.isFinite(n) ? n : fallback
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
  let best = 0; let score = -1
  rows.slice(0, 60).forEach((row, idx) => {
    const line = low((row || []).join(' | '))
    let s = 0
    if (/transaction|report|program|time interval|task type|tcode|dialog/.test(line)) s += 4
    if (/response|database|db time|dialog steps|cpu|wait|average|total/.test(line)) s += 4
    if (/name|user|client|object/.test(line)) s += 1
    if (s > score) { best = idx; score = s }
  })
  return best
}

function rowsToObjects(rows = []) {
  const headerIdx = findHeaderIndex(rows)
  const header = (rows[headerIdx] || []).map((h, i) => safe(h) || `Column ${i + 1}`)
  return rows.slice(headerIdx + 1).map((row) => {
    const o = {}
    header.forEach((h, i) => { o[h] = row[i] })
    return o
  }).filter((o) => Object.values(o).some((v) => safe(v)))
}

function pickCol(keys, patterns) { return keys.find((k) => patterns.some((p) => p.test(low(k)))) || '' }
function labelFromRow(o, cName, fileName, idx) {
  const explicit = safe(o[cName])
  if (explicit && !/^\d+(?:[.,]\d+)?$/.test(explicit)) return explicit
  const keys = Object.keys(o || {})
  const candidate = keys.filter((k) => /transaction|report|program|task|interval|name|tcode|object/i.test(k)).map((k) => safe(o[k])).find((v) => v && !/^\d+(?:[.,]\d+)?$/.test(v))
  return candidate || `${fileName.replace(/\.[^.]+$/, '')} item ${idx + 1}`
}

function summarize(kind, objects, fileName) {
  const keys = Object.keys(objects[0] || {})
  const cName = pickCol(keys, [/transaction/, /report/, /program/, /task type/, /time interval/, /tcode/, /name/])
  const cResp = pickCol(keys, [/response.*ms/, /average.*response/, /dialog step response/, /response time/, /resp/])
  const cDb = pickCol(keys, [/database.*ms/, /db time/, /sequential reads time/, /direct reads time/, /db/])
  const cWait = pickCol(keys, [/wait.*ms/, /roll wait/, /wait/])
  const cSteps = pickCol(keys, [/dialog steps/, /^steps$/, /number.*step/, /count/])
  const rows = objects.map((o, idx) => {
    const label = labelFromRow(o, cName, fileName, idx)
    const responseMs = toNum(o[cResp], 0)
    const dbMs = toNum(o[cDb], 0)
    const waitMs = toNum(o[cWait], 0)
    const steps = toNum(o[cSteps], 0)
    const rawScore = responseMs + dbMs + waitMs + Math.log10(steps + 1) * 100
    const component = dbMs > responseMs * 0.45 ? 'DB-heavy' : waitMs > responseMs * 0.25 ? 'Wait-heavy' : responseMs > 0 ? 'Response-heavy' : 'Workload'
    return { kind, fileName, label, responseMs, dbMs, waitMs, steps, rawScore, component }
  }).filter((r) => r.rawScore > 0)
  const max = Math.max(1, ...rows.map((r) => r.rawScore))
  return rows.map((r) => ({ ...r, score: Math.round((r.rawScore / max) * 100) })).sort((a, b) => b.score - a.score).slice(0, 25)
}

function latestSession() {
  try { return JSON.parse(localStorage.getItem('sap_rca_investigation_sessions_v1') || '[]')[0] || null } catch { return null }
}

export default function ToolSt03nImpact() {
  const [session] = React.useState(latestSession)
  const [files, setFiles] = React.useState([])
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('Upload ST03N pack or ZIP to validate workload impact.')
  const [analysis, setAnalysis] = React.useState(null)

  const detected = React.useMemo(() => {
    const map = Object.fromEntries(REQUIRED.map((r) => [r.key, []]))
    files.forEach((f) => { const k = classify(f.name); if (k) map[k].push(f) })
    return map
  }, [files])

  const analyze = async (nextFiles = files) => {
    setBusy(true)
    setStatus('Parsing ST03N evidence…')
    try {
      const result = { rows: [], detected: {}, parseStatus: [] }
      for (const req of REQUIRED) {
        const group = nextFiles.filter((f) => classify(f.name) === req.key)
        result.detected[req.key] = group.map((f) => f.name)
        if (!group.length) result.parseStatus.push({ key: req.key, label: req.label, ok: false, rows: 0, message: 'missing' })
        for (const file of group) {
          const matrix = await readMatrix(file)
          const objects = rowsToObjects(matrix)
          const summary = summarize(req.key, objects, file.name)
          result.rows.push(...summary)
          result.parseStatus.push({ key: req.key, label: req.label, ok: summary.length > 0, rows: summary.length, message: summary.length ? 'parsed' : 'no valid metric rows' })
        }
      }
      result.rows.sort((a, b) => b.score - a.score)
      const top = result.rows[0]
      const dbRows = result.rows.filter((r) => r.component === 'DB-heavy').length
      const waitRows = result.rows.filter((r) => r.component === 'Wait-heavy').length
      const responseRows = result.rows.filter((r) => r.component === 'Response-heavy').length
      result.impact = top ? 'Detected' : 'Not confirmed'
      result.correlation = top && session ? 'Partial: ST03N evidence is available, compare manually with RCA window.' : top ? 'Standalone ST03N impact only' : 'Weak: no readable ST03N metrics'
      result.summary = top ? `Top ST03N signal is ${top.label} (${top.component}) with score ${top.score}/100.` : 'No ST03N workload impact could be parsed from the uploaded files.'
      result.components = [
        { name: 'Response-heavy', value: responseRows },
        { name: 'DB-heavy', value: dbRows },
        { name: 'Wait-heavy', value: waitRows },
      ]
      setAnalysis(result)
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
  return <section className="evidenceToolShell"><header className="evidenceHero"><div><span>ST03N Impact Analyzer</span><h1>Validate workload impact from uploaded ST03N evidence.</h1><p>This page answers: is slowdown visible from workload/transaction perspective, which object is highest, and whether impact is response, DB, or wait dominated.</p></div><label className="evidenceUpload"><input type="file" multiple accept=".zip,.xlsx,.xls,.csv" onChange={(e) => onFiles(e.target.files)} />Upload ST03N Pack</label></header>{session && <section className="sessionBanner"><b>Latest RCA session</b><span>{session.sid} • {session.host} • {session.window?.start} - {session.window?.end}</span><small>{session.summary}</small></section>}<div className="evidenceGrid"><section className="evidencePanel"><h2>Parse Status</h2><div className="statusList">{REQUIRED.map((req) => <div key={req.key} className={detected[req.key]?.length ? 'ok' : 'missing'}><b>{req.label}</b><span>{detected[req.key]?.[0]?.name || analysis?.parseStatus?.find((x) => x.key === req.key)?.message || 'missing'}</span></div>)}</div></section><section className="evidencePanel"><h2>Impact Summary</h2><p>{analysis?.summary || status}</p><div className="confidenceRows"><span>ST03N Impact<b>{analysis?.impact || 'Pending'}</b></span><span>Correlation Status<b>{analysis?.correlation || 'Pending upload'}</b></span><span>Readable Rows<b>{analysis?.rows?.length || 0}</b></span></div></section></div>{analysis && <div className="evidenceGrid wide"><section className="evidencePanel chartPanel"><h2>Top ST03N Evidence</h2><ResponsiveContainer width="100%" height={320}><BarChart data={topRows.map((r) => ({ name: r.label.slice(0, 18), score: r.score, response: Math.round(r.responseMs), db: Math.round(r.dbMs), wait: Math.round(r.waitMs) }))}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" /><YAxis domain={[0, 100]} /><Tooltip /><Legend /><Bar dataKey="score" radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer></section><section className="evidencePanel"><h2>Top Offenders</h2><div className="evidenceList">{topRows.map((r) => <div key={`${r.kind}-${r.fileName}-${r.label}`}><b>{r.label}</b><span>{r.kind} · {r.component} · score {r.score}/100</span><small>Response {fmt(r.responseMs, 0)}ms · DB {fmt(r.dbMs, 0)}ms · Wait {fmt(r.waitMs, 0)}ms · Steps {fmt(r.steps, 0)}</small></div>)}</div></section></div>}</section>
}
