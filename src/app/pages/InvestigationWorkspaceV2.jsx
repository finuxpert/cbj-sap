import React from 'react'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceArea,
  ReferenceLine,
} from 'recharts'
import { uploadEvidence } from '../../evidence-api-client.js'
import './InvestigationWorkspace.css'
import './InvestigationWorkspaceV2.css'
import { GroupPanel, SuspectDetail } from './investigation/InvestigationPanels.jsx'

const REQUIRED_ST03N = [
  { key: 'timeProfile', label: 'Time Profile', patterns: ['time-profile', 'time_profile', 'time profile'] },
  { key: 'workload', label: 'Workload Overview', patterns: ['workload'] },
  { key: 'transactionStandard', label: 'Transaction Standard', patterns: ['transaction-standard', 'transaction_standard', 'transaction standard', 'txstd'] },
  { key: 'topResponse', label: 'Top Response Time', patterns: ['top-respond', 'top-response', 'top respond', 'top response'] },
  { key: 'topDb', label: 'Top DB Access', patterns: ['top-db', 'top db', 'db-access', 'db access'] },
]

const safe = (v) => String(v ?? '').trim()
const low = (v) => safe(v).toLowerCase()
const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, Number(n) || 0))
const fmt = (v, d = 1) => Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: d })
const ext = (name = '') => name.split('.').pop()?.toLowerCase() || ''
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

function ageToMinutes(raw = '') {
  const text = low(raw)
  const d = text.match(/(\d+)\s*d/)
  const h = text.match(/(\d+)\s*h/)
  const m = text.match(/(\d+)\s*m/)
  return (d ? Number(d[1]) * 1440 : 0) + (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0)
}

function isExcel(name = '') { return ['xlsx', 'xls', 'csv'].includes(ext(name)) }
function isLog(name = '') { return ['log', 'txt'].includes(ext(name)) || low(name).includes('work proccess') || low(name).includes('wp') }
function classifySt03nFile(name = '') {
  const n = low(name).replace(/[_()\[\]]/g, '-')
  return REQUIRED_ST03N.find((item) => item.patterns.some((p) => n.includes(p)))?.key || ''
}
function classifyFile(file) {
  const name = file?.name || ''
  const st03nKey = classifySt03nFile(name)
  if (st03nKey && isExcel(name)) return { kind: 'st03n', st03nKey }
  if (isLog(name)) return { kind: 'wpScout' }
  return { kind: 'other' }
}
async function unpackZip(file) {
  const zip = await JSZip.loadAsync(file)
  const out = []
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || entry.name.startsWith('__MACOSX')) continue
    const blob = await entry.async('blob')
    const name = entry.name.split('/').pop() || entry.name
    out.push(new File([blob], name, { type: blob.type || 'application/octet-stream', lastModified: file.lastModified }))
  }
  return out
}
async function expandUploadFiles(fileList) {
  const input = Array.from(fileList || [])
  const out = []
  for (const file of input) {
    if (ext(file.name) === 'zip') out.push(...await unpackZip(file))
    else out.push(file)
  }
  return out
}

function parseHostMetrics(text = '', fileName = '') {
  const snapshot = text.match(/snapshot\s*@\s*([^\n]+)/i)?.[1]?.trim() || ''
  const host = text.match(/Hostname\s*:\s*(\S+)/i)?.[1]?.trim() || text.match(/##\s*WP-SCOUT\s*@\s*(\S+)/i)?.[1]?.trim() || 'UNKNOWN'
  const sid = text.match(/\bSID=(\S+)/i)?.[1]?.trim() || 'UNKNOWN'
  const cpu = toNum(text.match(/CPU usage\s*:\s*([\d.]+)%\s*used/i)?.[1], 0)
  const mem = text.match(/Memory\s*:\s*used\s+([\d.]+)G\s*\(([\d.]+)%\)/i)
  const memoryUsedGb = toNum(mem?.[1], 0)
  const memoryPct = toNum(mem?.[2], 0)
  const running = toNum(text.match(/Total WP Running\s*:\s*(\d+)/i)?.[1], 0)
  const standby = toNum(text.match(/Total WP Standby\s*:\s*(\d+)/i)?.[1], 0)
  const critical = toNum(text.match(/Total WP Critical\s*:\s*(\d+)/i)?.[1], 0)
  const ok = toNum(text.match(/Total WP OK\s*:\s*(\d+)/i)?.[1], 0)
  return { fileName, snapshot, timeLabel: snapshot.split(' ')[1]?.slice(0, 5) || snapshot || fileName, host, sid, cpu, memoryUsedGb, memoryPct, running, standby, critical, ok }
}

function parseWpRows(text = '', fileName = '') {
  const meta = parseHostMetrics(text, fileName)
  const rows = []
  const lines = String(text || '').replace(/\r/g, '').split('\n')
  const rowRx = /^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+([\d.]+)\s+([\d.]+G)\s+([\d.]+)\s+([RS])\s+(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(CRIT|WARN|OK)\s+(\S+)\s+(\S+)\s+(.*)$/
  for (const raw of lines) {
    const m = raw.match(rowRx)
    if (!m) continue
    const rest = safe(m[17])
    const pathIdx = rest.lastIndexOf(' /')
    const noPath = pathIdx >= 0 ? rest.slice(0, pathIdx).trim() : rest
    const parts = noPath.split(/\s+/).filter(Boolean)
    const jobName = parts.pop() || '?'
    const errorCode = parts.pop() || '?'
    const program = parts.join(' ') || '?'
    rows.push({
      fileName, snapshot: meta.snapshot, timeLabel: meta.timeLabel, host: meta.host, sid: meta.sid,
      pid: m[1], inst: m[2], wp: m[3], type: m[4], cpu: toNum(m[5]), mem: m[6], rssGb: toNum(m[7]),
      state: m[8], ageRaw: m[9], ageMin: ageToMinutes(m[9]), rabax: toNum(m[10]), sxpg: toNum(m[11]),
      jobCount: toNum(m[12]), rxmsg: toNum(m[13]), className: m[14], program, errorCode, jobName, raw,
    })
  }
  return { meta, rows }
}

async function readWorkbook(file) {
  const buffer = await file.arrayBuffer()
  if (ext(file.name) === 'csv') {
    const text = new TextDecoder('utf-8').decode(buffer)
    return text.split(/\r?\n/).map((line) => line.split(/[;,\t]/).map(safe)).filter((row) => row.some(Boolean))
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
    if (/transaction|report|program|time interval|task type|tcode|step|dialog/.test(line)) s += 3
    if (/response|database|db time|dialog steps|cpu|wait|average|total/.test(line)) s += 3
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
function bestLabelFromRow(o, cName, fileName, idx) {
  const keys = Object.keys(o || {})
  const explicit = safe(o[cName])
  if (explicit && !/^\d+(?:[.,]\d+)?$/.test(explicit)) return explicit
  const candidates = keys
    .filter((k) => /transaction|report|program|task|interval|name|tcode|object/i.test(k))
    .map((k) => safe(o[k]))
    .filter((v) => v && !/^\d+(?:[.,]\d+)?$/.test(v))
  return candidates[0] || `${fileName.replace(/\.[^.]+$/, '')} item ${idx + 1}`
}
function summarizeSt03nObjects(kind, objects = [], fileName = '') {
  const keys = Object.keys(objects[0] || {})
  const cName = pickCol(keys, [/transaction/, /report/, /program/, /task type/, /time interval/, /tcode/, /name/])
  const cResp = pickCol(keys, [/response.*ms/, /average.*response/, /dialog step response/, /response time/, /resp/])
  const cDb = pickCol(keys, [/database.*ms/, /db time/, /sequential reads time/, /direct reads time/, /db/])
  const cWait = pickCol(keys, [/wait.*ms/, /roll wait/, /wait/])
  const cSteps = pickCol(keys, [/dialog steps/, /^steps$/, /number.*step/, /count/])
  const rawRows = objects.map((o, idx) => {
    const label = bestLabelFromRow(o, cName, fileName, idx)
    const responseMs = toNum(o[cResp], 0)
    const dbMs = toNum(o[cDb], 0)
    const waitMs = toNum(o[cWait], 0)
    const steps = toNum(o[cSteps], 0)
    const rawScore = responseMs + dbMs + waitMs + Math.log10(steps + 1) * 100
    return { kind, fileName, label, responseMs, dbMs, waitMs, steps, rawScore, raw: o }
  }).filter((r) => r.label && r.rawScore > 0)
  const maxScore = Math.max(1, ...rawRows.map((r) => r.rawScore))
  return rawRows.map((r) => ({ ...r, score: Math.round((r.rawScore / maxScore) * 100) })).sort((a, b) => b.score - a.score).slice(0, 20)
}

function groupCount(items, keyName) {
  const map = new Map()
  for (const item of items) {
    const key = safe(item[keyName]) || '?'
    const cur = map.get(key) || { name: key, hits: 0, critHits: 0, warnHits: 0, maxCpu: 0, maxRssGb: 0, examples: new Set() }
    cur.hits += item.hits || 1
    cur.critHits += item.critHits || (item.className === 'CRIT' ? 1 : 0)
    cur.warnHits += item.warnHits || (item.className === 'WARN' ? 1 : 0)
    cur.maxCpu = Math.max(cur.maxCpu, item.maxCpu || item.cpu || 0)
    cur.maxRssGb = Math.max(cur.maxRssGb, item.maxRssGb || item.rssGb || 0)
    if (item.program && keyName !== 'program') cur.examples.add(item.program)
    if (item.jobName && keyName !== 'jobName') cur.examples.add(item.jobName)
    map.set(key, cur)
  }
  return Array.from(map.values()).map((g) => ({ ...g, examples: Array.from(g.examples).slice(0, 2) })).sort((a, b) => b.critHits - a.critHits || b.hits - a.hits)
}
function suspectWhy(s) {
  if (!s) return []
  return [
    s.critHits ? `CRIT ${s.critHits}x` : '',
    s.hits ? `recurring ${s.hits}x` : '',
    s.spikeHits ? `incident-window match ${s.spikeHits}x` : '',
    s.runningHits ? `running ${s.runningHits}x` : '',
    s.maxCpu ? `max CPU ${fmt(s.maxCpu)}%` : '',
    s.maxRssGb ? `max RSS ${fmt(s.maxRssGb)} GB` : '',
  ].filter(Boolean)
}
function suspectEvidence(s, analysisLike = {}) {
  const avgMem = (analysisLike.timeline || []).length ? analysisLike.timeline.reduce((sum, t) => sum + (t.memoryPct || 0), 0) / analysisLike.timeline.length : 0
  const evidenceFor = [
    s.critHits ? `Appears as CRIT ${s.critHits} time(s).` : '',
    s.hits ? `Appears ${s.hits} time(s) across uploaded WP-SCOUT snapshots.` : '',
    s.spikeHits ? `Matches incident window ${s.spikeHits} time(s).` : '',
    `Same Program + ErrorCode + JobName repeated: ${s.program} / ${s.errorCode} / ${s.jobName}.`,
    s.maxCpu ? `CPU activity reached ${fmt(s.maxCpu)}%.` : '',
  ].filter(Boolean)
  const evidenceAgainst = [
    s.maxRssGb < 8 ? `RSS is only ${fmt(s.maxRssGb)} GB, so this is not a memory-exhaustion proof.` : '',
    avgMem && avgMem < 75 ? `Host memory average is around ${fmt(avgMem)}%, not saturated in uploaded snapshots.` : '',
    analysisLike.st03nConfidence < 60 ? 'ST03N correlation is partial; WP-SCOUT evidence is stronger than workload correlation.' : '',
  ].filter(Boolean)
  return { evidenceFor, evidenceAgainst }
}
function classifyProblemType(s, timeline = []) {
  if (!s) return { primary: 'Unknown', secondary: 'Insufficient evidence' }
  const avgMem = timeline.length ? timeline.reduce((sum, t) => sum + (t.memoryPct || 0), 0) / timeline.length : 0
  if (s.type === 'BTC' && s.critHits > 0 && s.errorCode !== '?') return { primary: 'Recurring BTC / ABAP error pattern', secondary: avgMem < 75 ? 'Not host memory saturation' : 'Memory pressure also present' }
  if (/DBSQL|SQL|DUPLICATE/i.test(s.errorCode)) return { primary: 'Database/application data error pattern', secondary: 'Check repeated job/program evidence' }
  if (/TIME_OUT/i.test(s.errorCode)) return { primary: 'Timeout / long-running work process', secondary: 'Validate recurrence and incident-window match' }
  if (s.maxRssGb >= 16) return { primary: 'High RSS work process', secondary: 'Validate whether it matches the incident window' }
  return { primary: 'Recurring work process anomaly', secondary: 'Evidence comes from uploaded WP-SCOUT snapshots' }
}
function buildSuspects(wpRows = [], timeline = []) {
  const spikeTimes = new Set(timeline.filter((t) => t.critical > 0 || t.running >= 5 || t.cpu >= 20).map((t) => t.timeLabel))
  const map = new Map()
  for (const row of wpRows) {
    const key = `${row.host}|${row.pid}|${row.wp}|${row.program}|${row.errorCode}|${row.jobName}`
    const cur = map.get(key) || { key, host: row.host, sid: row.sid, pid: row.pid, wp: row.wp, type: row.type, program: row.program, errorCode: row.errorCode, jobName: row.jobName, hits: 0, critHits: 0, warnHits: 0, runningHits: 0, spikeHits: 0, maxCpu: 0, maxRssGb: 0, maxAgeMin: 0, firstSeen: row.timeLabel, lastSeen: row.timeLabel, timeline: [] }
    cur.hits += 1
    cur.critHits += row.className === 'CRIT' ? 1 : 0
    cur.warnHits += row.className === 'WARN' ? 1 : 0
    cur.runningHits += row.state === 'R' ? 1 : 0
    cur.spikeHits += spikeTimes.has(row.timeLabel) ? 1 : 0
    cur.maxCpu = Math.max(cur.maxCpu, row.cpu)
    cur.maxRssGb = Math.max(cur.maxRssGb, row.rssGb)
    cur.maxAgeMin = Math.max(cur.maxAgeMin, row.ageMin)
    cur.lastSeen = row.timeLabel
    cur.timeline.push({ timeLabel: row.timeLabel, className: row.className, cpu: row.cpu, rssGb: row.rssGb, state: row.state })
    map.set(key, cur)
  }
  const raw = Array.from(map.values()).map((s) => ({ ...s, rawScore: s.critHits * 32 + s.warnHits * 9 + s.runningHits * 10 + s.spikeHits * 14 + Math.min(28, s.maxCpu * 1.4) + Math.min(22, s.maxRssGb * 4) + Math.min(18, Math.log1p(s.maxAgeMin) * 2) + Math.min(22, s.hits * 3) }))
  const maxRaw = Math.max(1, ...raw.map((s) => s.rawScore))
  return raw.map((s) => {
    const score = Math.round((s.rawScore / maxRaw) * 100)
    const severity = s.critHits > 0 || score >= 75 ? 'CRIT' : score >= 42 ? 'WARN' : 'INFO'
    const why = suspectWhy(s)
    return { ...s, score, severity, why, whyText: why.join(', ') }
  }).sort((a, b) => b.score - a.score)
}
function detectIncidentWindow(timeline = []) {
  const significant = timeline.filter((t) => t.critical > 0 || t.running >= 5 || t.cpu >= 20)
  if (!significant.length) return { start: timeline[0]?.timeLabel || '-', end: timeline.at(-1)?.timeLabel || '-', reason: 'No major spike detected; using full evidence window.' }
  return { start: significant[0].timeLabel, end: significant.at(-1).timeLabel, reason: 'Detected from WP Critical, WP Running, or CPU spike markers.' }
}
function buildConclusion({ timeline, suspects, st03n }) {
  const top = suspects[0]
  const window = detectIncidentWindow(timeline)
  const peak = timeline.reduce((best, row) => (row.cpu + row.running * 3 + row.critical * 12 > (best.cpu || 0) + (best.running || 0) * 3 + (best.critical || 0) * 12 ? row : best), timeline[0] || {})
  const stTop = [...(st03n.topResponse || []), ...(st03n.topDb || []), ...(st03n.transactionStandard || [])].sort((a, b) => b.score - a.score)[0]
  const wpConfidence = clamp((top?.score || 0) * 0.75 + (top?.critHits || 0) * 3 + (timeline.length >= 3 ? 8 : 0))
  const st03nRows = Object.values(st03n || {}).flat().length
  const st03nConfidence = clamp(st03nRows ? 35 + Math.min(45, st03nRows * 3) + (stTop?.score || 0) * 0.15 : 10)
  const correlationConfidence = clamp(((top?.spikeHits || 0) * 18) + (timeline.filter((t) => t.critical > 0).length * 8) + (stTop ? 12 : 0))
  const confidence = Math.round((wpConfidence * 0.55) + (st03nConfidence * 0.20) + (correlationConfidence * 0.25))
  const type = classifyProblemType(top, timeline)
  return {
    window, peak, top, stTop, confidence, wpConfidence: Math.round(wpConfidence), st03nConfidence: Math.round(st03nConfidence), correlationConfidence: Math.round(correlationConfidence), problemType: type,
    summary: top ? `Most likely suspect is PID ${top.pid} / WP ${top.wp} / ${top.type} with ${top.errorCode}, recurring ${top.hits} time(s) across uploaded WP-SCOUT snapshots.` : 'No strong WP suspect found from uploaded evidence.',
    managementSummary: top ? `During the slowdown window, the strongest uploaded evidence points to a recurring ${top.type} work process/job error pattern. Host memory is not the dominant signal in the uploaded timeline.` : 'Uploaded evidence does not show a strong recurring work process suspect yet.',
    technicalSummary: top ? `PID ${top.pid} / WP ${top.wp} / ${top.type} repeatedly appears with ${top.errorCode} under program ${top.program} and job ${top.jobName}. Evidence strength comes from recurrence, CRIT frequency, and incident-window match.` : 'No technical suspect generated from uploaded logs.',
  }
}
function makeSessionId(meta = {}, timeline = []) {
  const sid = meta.sid || timeline[0]?.sid || 'SAP'
  const start = (timeline[0]?.snapshot || new Date().toISOString()).replace(/[^0-9]/g, '').slice(0, 12)
  return `${sid}-${start || Date.now()}`
}
function saveLocalSession(session) {
  const key = 'sap_rca_investigation_sessions_v1'
  const list = JSON.parse(localStorage.getItem(key) || '[]')
  const next = [session, ...list.filter((s) => s.sessionId !== session.sessionId)].slice(0, 20)
  localStorage.setItem(key, JSON.stringify(next))
}
async function persistFilesToServer(files, session) {
  const result = []
  for (const file of files) {
    try {
      const res = await uploadEvidence(file, { tool: 'investigation', sid: session.sid || '', title: `${session.sessionId}/${file.name}`, note: session.summary || '', tags: ['sap-rca', session.sessionId, 'evidence-pack'] })
      result.push({ name: file.name, ok: true, response: res })
    } catch (e) { result.push({ name: file.name, ok: false, error: e?.message || String(e) }) }
  }
  return result
}
async function exportReport(session) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const margin = 44
  let y = 48
  const page = () => { if (y > 760) { doc.addPage(); y = 48 } }
  const line = (text, size = 10, gap = 14, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(size)
    const chunks = doc.splitTextToSize(String(text || '-'), 510)
    doc.text(chunks, margin, y)
    y += chunks.length * gap
    page()
  }
  const tableLine = (values) => line(values.join(' | '), 8, 11)
  line('SAP RCA Evidence Report', 18, 20, true)
  line(`Session: ${session.sessionId}`)
  line(`SID: ${session.sid || '-'} | Host: ${session.host || '-'}`)
  line(`Incident Window: ${session.window?.start || '-'} - ${session.window?.end || '-'}`)
  line(`Overall Confidence: ${session.confidence}% | WP-SCOUT: ${session.wpConfidence}% | ST03N: ${session.st03nConfidence}% | Correlation: ${session.correlationConfidence}%`)
  y += 6
  line('1. Executive Summary', 13, 17, true)
  line(session.managementSummary)
  line(session.technicalSummary)
  y += 4
  line('2. Primary Suspect', 13, 17, true)
  if (session.top) {
    line(`PID ${session.top.pid} / WP ${session.top.wp} / ${session.top.type}`)
    line(`Program: ${session.top.program}`)
    line(`ErrorCode: ${session.top.errorCode}`)
    line(`JobName: ${session.top.jobName}`)
    line(`Score: ${session.top.score}/100 | Hits: ${session.top.hits} | CRIT: ${session.top.critHits} | Max CPU: ${fmt(session.top.maxCpu)}% | Max RSS: ${fmt(session.top.maxRssGb)} GB`)
    line(`Why: ${session.top.whyText}`)
  } else line('No primary suspect found.')
  y += 4
  line('3. Evidence For / Against', 13, 17, true)
  const ev = session.top ? suspectEvidence(session.top, session) : { evidenceFor: [], evidenceAgainst: [] }
  line('Evidence For:', 10, 14, true)
  ev.evidenceFor.forEach((a) => line(`[+] ${a}`))
  line('Evidence Against / Limits:', 10, 14, true)
  ev.evidenceAgainst.forEach((a) => line(`[!] ${a}`))
  y += 4
  line('4. Timeline Evidence', 13, 17, true)
  session.timeline.slice(0, 20).forEach((t) => tableLine([t.timeLabel, `CPU ${fmt(t.cpu)}%`, `Mem ${fmt(t.memoryPct)}%`, `Run ${t.running}`, `Crit ${t.critical}`]))
  y += 4
  line('5. Top WP-SCOUT Suspects', 13, 17, true)
  ;(session.suspects || []).slice(0, 8).forEach((s) => tableLine([`${s.score}/100`, `PID ${s.pid}/WP${s.wp}`, s.errorCode, s.jobName, `CRIT ${s.critHits}`, `hits ${s.hits}`]))
  y += 4
  line('6. Top ST03N Evidence', 13, 17, true)
  const stTop = [...(session.st03n.topResponse || []), ...(session.st03n.topDb || []), ...(session.st03n.transactionStandard || [])].sort((a, b) => b.score - a.score).slice(0, 8)
  stTop.forEach((r) => tableLine([`${r.score}/100`, r.kind, r.label, `Resp ${fmt(r.responseMs, 0)}ms`, `DB ${fmt(r.dbMs, 0)}ms`, `Wait ${fmt(r.waitMs, 0)}ms`]))
  y += 4
  line('7. Action Checklist', 13, 17, true)
  const action = session.top ? [`Review job ${session.top.jobName}.`, `Review program ${session.top.program}.`, `Focus on ErrorCode ${session.top.errorCode}.`, `Compare critical occurrence during ${session.window.start} - ${session.window.end}.`, 'Attach this report to the incident record with the original evidence pack.'] : ['Review uploaded evidence and rerun analysis with additional snapshots.']
  action.forEach((a) => line(`[ ] ${a}`))
  doc.save(`SAP-RCA-${session.sessionId}.pdf`)
}

export default function InvestigationWorkspaceV2() {
  const [files, setFiles] = React.useState([])
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('')
  const [step, setStep] = React.useState('upload')
  const [analysis, setAnalysis] = React.useState(null)
  const [tab, setTab] = React.useState('overview')
  const [persistStatus, setPersistStatus] = React.useState('')
  const [selectedKey, setSelectedKey] = React.useState('')
  const detected = React.useMemo(() => {
    const st03n = Object.fromEntries(REQUIRED_ST03N.map((x) => [x.key, []]))
    const wpScout = []
    const other = []
    files.forEach((file) => {
      const c = classifyFile(file)
      if (c.kind === 'st03n') st03n[c.st03nKey].push(file)
      else if (c.kind === 'wpScout') wpScout.push(file)
      else other.push(file)
    })
    const missing = REQUIRED_ST03N.filter((x) => !st03n[x.key].length)
    return { st03n, wpScout, other, missing }
  }, [files])
  const onFiles = async (fileList) => {
    setBusy(true); setStatus('Reading evidence pack…')
    try { const expanded = await expandUploadFiles(fileList); setFiles(expanded); setStep('validate'); setStatus(`${expanded.length} file(s) detected.`) }
    catch (e) { setStatus(e?.message || 'Failed to read evidence pack.') }
    finally { setBusy(false) }
  }
  const analyze = async () => {
    setBusy(true); setStatus('Analyzing uploaded evidence only…')
    try {
      const logParsed = []
      for (const file of detected.wpScout) logParsed.push(parseWpRows(await file.text(), file.name))
      const timeline = logParsed.map((p) => p.meta).sort((a, b) => String(a.snapshot).localeCompare(String(b.snapshot)))
      const wpRows = logParsed.flatMap((p) => p.rows)
      const suspects = buildSuspects(wpRows, timeline)
      const st03n = {}
      for (const req of REQUIRED_ST03N) {
        st03n[req.key] = []
        for (const file of detected.st03n[req.key] || []) st03n[req.key].push(...summarizeSt03nObjects(req.key, rowsToObjects(await readWorkbook(file)), file.name))
      }
      const conclusion = buildConclusion({ timeline, suspects, st03n })
      const sessionId = makeSessionId({ sid: timeline[0]?.sid }, timeline)
      const session = { sessionId, sid: timeline[0]?.sid || 'UNKNOWN', host: timeline[0]?.host || 'UNKNOWN', createdAt: new Date().toISOString(), files: files.map((f) => ({ name: f.name, size: f.size, kind: classifyFile(f) })), timeline, wpRows, suspects, st03n, errorGroups: groupCount(suspects, 'errorCode'), jobGroups: groupCount(suspects, 'jobName'), programGroups: groupCount(suspects, 'program'), ...conclusion }
      saveLocalSession({ sessionId: session.sessionId, sid: session.sid, host: session.host, createdAt: session.createdAt, window: session.window, summary: session.summary, confidence: session.confidence, top: session.top })
      setAnalysis(session); setSelectedKey(session.top?.key || ''); setStep('result'); setStatus('Analysis complete.'); setPersistStatus('Saving raw evidence to server…')
      const persisted = await persistFilesToServer(files, session)
      setAnalysis((cur) => cur ? { ...cur, persisted } : cur)
      setPersistStatus(`${persisted.filter((x) => x.ok).length}/${persisted.length} file(s) saved through Evidence API.`)
    } catch (e) { setStatus(e?.message || 'Analysis failed.') }
    finally { setBusy(false) }
  }
  const timelineData = analysis?.timeline || []
  const topSuspects = analysis?.suspects?.slice(0, 10) || []
  const selectedSuspect = analysis?.suspects?.find((s) => s.key === selectedKey) || analysis?.top
  const st03nTop = analysis ? [...(analysis.st03n.topResponse || []), ...(analysis.st03n.topDb || []), ...(analysis.st03n.transactionStandard || [])].sort((a, b) => b.score - a.score).slice(0, 10) : []
  return <section className="investigationShell"><header className={`investHero ${step === 'result' ? 'compactResult' : ''}`}><div><span className="investKicker">SAP Slowdown Investigation</span><h1>{step === 'result' && analysis ? `${analysis.sid} • ${analysis.host} • ${analysis.window.start} - ${analysis.window.end}` : 'Upload evidence pack. Detect the incident window. Rank the real suspect.'}</h1><p>{step === 'result' && analysis ? `Primary suspect: ${analysis.top ? `PID ${analysis.top.pid} / ${analysis.top.errorCode}` : 'not detected'} · Overall confidence ${analysis.confidence}%` : 'Focused only on your uploaded ST03N Excel files and WP-SCOUT logs. No extra TCode suggestions, no guessing outside the evidence.'}</p></div><div className="investSteps">{['upload', 'validate', 'result'].map((s, idx) => <span key={s} data-active={step === s || (idx < ['upload', 'validate', 'result'].indexOf(step))}>{idx + 1}. {s}</span>)}</div></header>{step === 'upload' && <div className="uploadZone"><label className="bigDrop"><input type="file" multiple accept=".zip,.xlsx,.xls,.csv,.log,.txt" onChange={(e) => onFiles(e.target.files)} /><strong>Upload Evidence ZIP or files</strong><span>ZIP may contain 5 ST03N Excel files + WP-SCOUT logs generated every 10 minutes.</span></label></div>}{step === 'validate' && <div className="validateGrid"><section className="validatePanel"><h2>Evidence Detected</h2><div className="detectList">{REQUIRED_ST03N.map((req) => <div key={req.key} className={detected.st03n[req.key].length ? 'ok' : 'missing'}><span>{detected.st03n[req.key].length ? '✅' : '⚠️'}</span><strong>{req.label}</strong><small>{detected.st03n[req.key][0]?.name || 'missing'}</small></div>)}<div className={detected.wpScout.length >= 2 ? 'ok' : 'missing'}><span>{detected.wpScout.length >= 2 ? '✅' : '⚠️'}</span><strong>WP-SCOUT snapshots</strong><small>{detected.wpScout.length} log file(s)</small></div></div></section><section className="validatePanel"><h2>Ready to Analyze</h2><p>Analysis will use only these uploaded files. Missing ST03N files lower confidence but do not block RCA.</p><button className="investPrimary" onClick={analyze} disabled={busy || !files.length}>{busy ? 'Analyzing…' : 'Analyze Incident'}</button><button className="investSecondary" onClick={() => setStep('upload')}>Replace Evidence</button></section></div>}{step === 'result' && analysis && <div className="resultShell"><section className="overviewCard"><div><span className="investKicker">RCA Overview</span><h2>{analysis.summary}</h2><p>Incident window: <b>{analysis.window.start} - {analysis.window.end}</b> · Problem type: <b>{analysis.problemType.primary}</b></p></div><div className="confidenceBox"><span>Overall</span><strong>{analysis.confidence}%</strong><small>WP {analysis.wpConfidence}% · ST03N {analysis.st03nConfidence}% · Correlation {analysis.correlationConfidence}%</small></div></section><nav className="resultTabs">{['overview', 'timeline', 'st03n', 'wp-scout', 'report'].map((x) => <button key={x} data-active={tab === x} onClick={() => setTab(x)}>{x}</button>)}</nav>{tab === 'overview' && <div className="overviewStack"><div className="overviewGrid"><SuspectDetail suspect={analysis.top} analysis={analysis} /><section className="resultPanel"><h3>Management Summary</h3><p>{analysis.managementSummary}</p><h3>Technical Summary</h3><p>{analysis.technicalSummary}</p><h3>Evidence Strength</h3><ul className="strengthList"><li>WP-SCOUT snapshots: <b>{analysis.timeline.length}</b></li><li>Suspects ranked: <b>{analysis.suspects.length}</b></li><li>ST03N files detected: <b>{REQUIRED_ST03N.length - detected.missing.length}/5</b></li><li>{persistStatus || 'Server storage pending.'}</li></ul></section></div><div className="groupGrid"><GroupPanel title="Top ErrorCode" rows={analysis.errorGroups || []} /><GroupPanel title="Top JobName" rows={analysis.jobGroups || []} /><GroupPanel title="Top Program" rows={analysis.programGroups || []} /></div></div>}{tab === 'timeline' && <section className="resultPanel chartBig"><h3>Incident Timeline</h3><ResponsiveContainer width="100%" height={340}><LineChart data={timelineData} margin={{ top: 20, right: 24, left: 0, bottom: 10 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="timeLabel" /><YAxis yAxisId="left" /><YAxis yAxisId="right" orientation="right" /><Tooltip /><Legend />{analysis.window?.start !== '-' && <ReferenceArea x1={analysis.window.start} x2={analysis.window.end} yAxisId="left" fillOpacity={0.12} />}{analysis.peak?.timeLabel && <ReferenceLine x={analysis.peak.timeLabel} yAxisId="left" label="Spike" />}<Line yAxisId="left" type="monotone" dataKey="cpu" name="CPU %" strokeWidth={3} dot /><Line yAxisId="left" type="monotone" dataKey="memoryPct" name="Memory %" strokeWidth={2} dot /><Line yAxisId="right" type="monotone" dataKey="running" name="WP Running" strokeWidth={3} dot /><Line yAxisId="right" type="monotone" dataKey="critical" name="WP Critical" strokeWidth={3} dot /></LineChart></ResponsiveContainer></section>}{tab === 'st03n' && <section className="resultPanel"><h3>ST03N Evidence Ranking</h3><div className="rankGrid"><ResponsiveContainer width="100%" height={300}><BarChart data={st03nTop.map((r) => ({ name: r.label.slice(0, 18), score: Math.round(r.score), response: Math.round(r.responseMs), db: Math.round(r.dbMs), wait: Math.round(r.waitMs) }))}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" /><YAxis domain={[0, 100]} /><Tooltip /><Bar dataKey="score" radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer><div className="miniTable">{st03nTop.map((r) => <div key={`${r.kind}-${r.fileName}-${r.label}`}><b>{r.label}</b><span>{r.kind} · score {Math.round(r.score)}/100 · resp {fmt(r.responseMs, 0)}ms · db {fmt(r.dbMs, 0)}ms · wait {fmt(r.waitMs, 0)}ms</span></div>)}</div></div></section>}{tab === 'wp-scout' && <div className="overviewGrid"><section className="resultPanel"><h3>WP-SCOUT Suspect Ranking</h3><div className="rankGrid oneWide"><ResponsiveContainer width="100%" height={330}><BarChart data={topSuspects.map((s) => ({ name: `${s.pid}/${s.wp}`, score: s.score, crit: s.critHits, hits: s.hits }))}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" /><YAxis domain={[0, 100]} /><Tooltip /><Legend /><Bar dataKey="score" radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer><div className="suspectList">{topSuspects.map((s) => <button type="button" key={s.key} className={s.severity.toLowerCase()} data-active={selectedSuspect?.key === s.key} onClick={() => setSelectedKey(s.key)}><b>{s.pid} / WP{s.wp} / {s.errorCode}</b><span>{s.program} · {s.jobName} · score {s.score}/100 · {s.whyText}</span></button>)}</div></div></section><SuspectDetail suspect={selectedSuspect} analysis={analysis} /></div>}{tab === 'report' && <section className="resultPanel reportPanel"><h3>Structured Report Preview</h3><ol><li>Executive Summary: {analysis.managementSummary}</li><li>Technical Summary: {analysis.technicalSummary}</li><li>Incident Timeline: {analysis.window.start} - {analysis.window.end}</li><li>Main Suspect: {analysis.top ? `PID ${analysis.top.pid} / ${analysis.top.errorCode}` : '-'}</li><li>Why: {analysis.top?.whyText || '-'}</li><li>ST03N Findings: {st03nTop.length} ranked rows</li><li>WP-SCOUT Findings: {analysis.suspects.length} ranked suspects</li><li>Evidence Files: {analysis.files.length} file(s)</li></ol><button className="investPrimary" onClick={() => exportReport(analysis)}>Export PDF Report</button></section>}</div>}{(status || busy) && <div className="investStatus">{busy ? 'Working… ' : ''}{status}</div>}</section>
}
