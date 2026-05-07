import React from 'react'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
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
} from 'recharts'
import { uploadEvidence } from '../../evidence-api-client.js'
import './InvestigationWorkspace.css'

const REQUIRED_ST03N = [
  { key: 'timeProfile', label: 'Time Profile', patterns: ['time-profile', 'time_profile', 'time profile'] },
  { key: 'workload', label: 'Workload Overview', patterns: ['workload'] },
  { key: 'transactionStandard', label: 'Transaction Standard', patterns: ['transaction-standard', 'transaction_standard', 'transaction standard', 'txstd'] },
  { key: 'topResponse', label: 'Top Response Time', patterns: ['top-respond', 'top-response', 'top respond', 'top response'] },
  { key: 'topDb', label: 'Top DB Access', patterns: ['top-db', 'top db', 'db-access', 'db access'] },
]

const safe = (v) => String(v ?? '').trim()
const lower = (v) => safe(v).toLowerCase()
const toNum = (v, fallback = 0) => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const raw = safe(v).replace(/,/g, '.').replace(/[^0-9.\-]/g, '')
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) ? n : fallback
}
const fmt = (v, d = 1) => Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: d })
const fileExt = (name = '') => name.split('.').pop()?.toLowerCase() || ''
const isExcel = (name = '') => ['xlsx', 'xls', 'csv'].includes(fileExt(name))
const isLog = (name = '') => ['log', 'txt'].includes(fileExt(name)) || lower(name).includes('work proccess') || lower(name).includes('wp')

function ageToMinutes(raw = '') {
  const text = lower(raw)
  const d = text.match(/(\d+)\s*d/)
  const h = text.match(/(\d+)\s*h/)
  const m = text.match(/(\d+)\s*m/)
  return (d ? Number(d[1]) * 1440 : 0) + (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0)
}

function classifySt03nFile(name = '') {
  const n = lower(name).replace(/[_()\[\]]/g, '-')
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
  const entries = Object.values(zip.files).filter((entry) => !entry.dir && !entry.name.startsWith('__MACOSX'))
  for (const entry of entries) {
    const blob = await entry.async('blob')
    const name = entry.name.split('/').pop() || entry.name
    out.push(new File([blob], name, { type: blob.type || 'application/octet-stream', lastModified: file.lastModified }))
  }
  return out
}

async function expandUploadFiles(fileList) {
  const input = Array.from(fileList || [])
  const expanded = []
  for (const file of input) {
    if (fileExt(file.name) === 'zip') expanded.push(...await unpackZip(file))
    else expanded.push(file)
  }
  return expanded
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
      fileName,
      snapshot: meta.snapshot,
      timeLabel: meta.timeLabel,
      host: meta.host,
      sid: meta.sid,
      pid: m[1],
      inst: m[2],
      wp: m[3],
      type: m[4],
      cpu: toNum(m[5]),
      mem: m[6],
      rssGb: toNum(m[7]),
      state: m[8],
      ageRaw: m[9],
      ageMin: ageToMinutes(m[9]),
      rabax: toNum(m[10]),
      sxpg: toNum(m[11]),
      jobCount: toNum(m[12]),
      rxmsg: toNum(m[13]),
      className: m[14],
      program,
      errorCode,
      jobName,
      raw,
    })
  }
  return { meta, rows }
}

async function readWorkbook(file) {
  const ext = fileExt(file.name)
  const buffer = await file.arrayBuffer()
  if (ext === 'csv') {
    const text = new TextDecoder('utf-8').decode(buffer)
    return text.split(/\r?\n/).map((line) => line.split(/[;,\t]/).map((x) => safe(x))).filter((row) => row.some(Boolean))
  }
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true })
}

function findHeaderIndex(rows = []) {
  let best = 0
  let score = -1
  rows.slice(0, 40).forEach((row, idx) => {
    const line = lower((row || []).join(' | '))
    let s = 0
    if (/transaction|report|program|time interval|task type/.test(line)) s += 3
    if (/response|database|db time|dialog steps|cpu|wait/.test(line)) s += 3
    if (/total|average|number/.test(line)) s += 1
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

function pickCol(keys, patterns) {
  return keys.find((k) => patterns.some((p) => p.test(lower(k)))) || ''
}

function summarizeSt03nObjects(kind, objects = [], fileName = '') {
  const keys = Object.keys(objects[0] || {})
  const cName = pickCol(keys, [/transaction/, /report/, /program/, /task type/, /time interval/, /name/])
  const cResp = pickCol(keys, [/response.*ms/, /average.*response/, /dialog step response/, /response time/])
  const cDb = pickCol(keys, [/database.*ms/, /db time/, /sequential reads time/, /direct reads time/])
  const cWait = pickCol(keys, [/wait.*ms/, /roll wait/])
  const cSteps = pickCol(keys, [/dialog steps/, /^steps$/, /number/])
  const rows = objects.map((o, idx) => {
    const label = safe(o[cName]) || `${fileName} row ${idx + 1}`
    const responseMs = toNum(o[cResp], 0)
    const dbMs = toNum(o[cDb], 0)
    const waitMs = toNum(o[cWait], 0)
    const steps = toNum(o[cSteps], 0)
    const score = responseMs + dbMs + waitMs + Math.log10(steps + 1) * 100
    return { kind, fileName, label, responseMs, dbMs, waitMs, steps, score, raw: o }
  }).filter((r) => r.label && r.score > 0)
  return rows.sort((a, b) => b.score - a.score).slice(0, 20)
}

function buildSuspects(wpRows = [], timeline = []) {
  const spikeTimes = new Set(timeline.filter((t) => t.critical > 0 || t.running >= 5 || t.cpu >= 20).map((t) => t.timeLabel))
  const map = new Map()
  for (const row of wpRows) {
    const key = `${row.host}|${row.pid}|${row.wp}|${row.program}|${row.errorCode}|${row.jobName}`
    const cur = map.get(key) || {
      key,
      host: row.host,
      sid: row.sid,
      pid: row.pid,
      wp: row.wp,
      type: row.type,
      program: row.program,
      errorCode: row.errorCode,
      jobName: row.jobName,
      hits: 0,
      critHits: 0,
      warnHits: 0,
      runningHits: 0,
      spikeHits: 0,
      maxCpu: 0,
      maxRssGb: 0,
      maxAgeMin: 0,
      firstSeen: row.timeLabel,
      lastSeen: row.timeLabel,
      timeline: [],
    }
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
  return Array.from(map.values()).map((s) => {
    const score =
      s.critHits * 32 +
      s.warnHits * 9 +
      s.runningHits * 10 +
      s.spikeHits * 14 +
      Math.min(28, s.maxCpu * 1.4) +
      Math.min(22, s.maxRssGb * 4) +
      Math.min(18, Math.log1p(s.maxAgeMin) * 2) +
      Math.min(22, s.hits * 3)
    const severity = s.critHits > 0 || score >= 75 ? 'CRIT' : score >= 42 ? 'WARN' : 'INFO'
    return { ...s, score: Math.round(score), severity }
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
  const confidence = Math.min(96, Math.max(35,
    (top?.critHits || 0) * 14 +
    (top?.hits || 0) * 6 +
    (timeline.filter((t) => t.critical > 0).length * 8) +
    (stTop ? 16 : 0) +
    (timeline.length >= 3 ? 10 : 0)
  ))
  return {
    window,
    peak,
    top,
    stTop,
    confidence,
    summary: top
      ? `Most likely suspect is PID ${top.pid} / WP ${top.wp} / ${top.type} with ${top.errorCode}, recurring ${top.hits} time(s) across uploaded WP-SCOUT snapshots.`
      : 'No strong WP suspect found from uploaded evidence.',
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
      const res = await uploadEvidence(file, {
        tool: 'investigation',
        sid: session.sid || '',
        title: `${session.sessionId}/${file.name}`,
        note: session.summary || '',
        tags: ['sap-rca', session.sessionId, 'evidence-pack'],
      })
      result.push({ name: file.name, ok: true, response: res })
    } catch (e) {
      result.push({ name: file.name, ok: false, error: e?.message || String(e) })
    }
  }
  return result
}

function exportReport(session) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const margin = 44
  let y = 48
  const line = (text, size = 10, gap = 15) => {
    doc.setFontSize(size)
    const chunks = doc.splitTextToSize(String(text || '-'), 510)
    doc.text(chunks, margin, y)
    y += chunks.length * gap
    if (y > 760) { doc.addPage(); y = 48 }
  }
  doc.setFont('helvetica', 'bold')
  line('SAP RCA Evidence Report', 18, 20)
  doc.setFont('helvetica', 'normal')
  line(`Session: ${session.sessionId}`)
  line(`SID: ${session.sid || '-'} | Host: ${session.host || '-'}`)
  line(`Incident Window: ${session.window?.start || '-'} - ${session.window?.end || '-'}`)
  line(`Confidence: ${session.confidence}%`)
  y += 6
  doc.setFont('helvetica', 'bold'); line('Executive Summary', 13, 17); doc.setFont('helvetica', 'normal')
  line(session.summary)
  y += 4
  doc.setFont('helvetica', 'bold'); line('Primary Suspect', 13, 17); doc.setFont('helvetica', 'normal')
  if (session.top) {
    line(`PID ${session.top.pid} / WP ${session.top.wp} / ${session.top.type}`)
    line(`Program: ${session.top.program}`)
    line(`ErrorCode: ${session.top.errorCode}`)
    line(`JobName: ${session.top.jobName}`)
    line(`Hits: ${session.top.hits} | CRIT: ${session.top.critHits} | Max CPU: ${fmt(session.top.maxCpu)}% | Max RSS: ${fmt(session.top.maxRssGb)} GB`)
  } else line('No primary suspect found.')
  y += 4
  doc.setFont('helvetica', 'bold'); line('Timeline Evidence', 13, 17); doc.setFont('helvetica', 'normal')
  session.timeline.slice(0, 12).forEach((t) => line(`${t.timeLabel} | CPU ${fmt(t.cpu)}% | Mem ${fmt(t.memoryPct)}% | WP Running ${t.running} | Critical ${t.critical}`))
  y += 4
  doc.setFont('helvetica', 'bold'); line('Action Checklist', 13, 17); doc.setFont('helvetica', 'normal')
  const action = session.top ? [
    `Validate PID ${session.top.pid} / WP ${session.top.wp} in uploaded WP-SCOUT timeline.`,
    `Review program ${session.top.program} and job ${session.top.jobName}.`,
    `Correlate ErrorCode ${session.top.errorCode} with uploaded logs and ST03N window.`,
    'Attach this report to incident record with the original evidence pack.',
  ] : ['Review uploaded evidence and rerun analysis with additional snapshots.']
  action.forEach((a) => line(`□ ${a}`))
  doc.save(`SAP-RCA-${session.sessionId}.pdf`)
}

export default function InvestigationWorkspace() {
  const [files, setFiles] = React.useState([])
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('')
  const [step, setStep] = React.useState('upload')
  const [analysis, setAnalysis] = React.useState(null)
  const [tab, setTab] = React.useState('overview')
  const [persistStatus, setPersistStatus] = React.useState('')

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
    setBusy(true)
    setStatus('Reading evidence pack…')
    try {
      const expanded = await expandUploadFiles(fileList)
      setFiles(expanded)
      setStep('validate')
      setStatus(`${expanded.length} file(s) detected.`)
    } catch (e) {
      setStatus(e?.message || 'Failed to read evidence pack.')
    } finally {
      setBusy(false)
    }
  }

  const analyze = async () => {
    setBusy(true)
    setStatus('Analyzing uploaded evidence only…')
    try {
      const logParsed = []
      for (const file of detected.wpScout) {
        const text = await file.text()
        logParsed.push(parseWpRows(text, file.name))
      }
      const timeline = logParsed.map((p) => p.meta).sort((a, b) => String(a.snapshot).localeCompare(String(b.snapshot)))
      const wpRows = logParsed.flatMap((p) => p.rows)
      const suspects = buildSuspects(wpRows, timeline)

      const st03n = {}
      for (const req of REQUIRED_ST03N) {
        st03n[req.key] = []
        for (const file of detected.st03n[req.key] || []) {
          const matrix = await readWorkbook(file)
          const objects = rowsToObjects(matrix)
          st03n[req.key].push(...summarizeSt03nObjects(req.key, objects, file.name))
        }
      }

      const conclusion = buildConclusion({ timeline, suspects, st03n })
      const sessionId = makeSessionId({ sid: timeline[0]?.sid }, timeline)
      const session = {
        sessionId,
        sid: timeline[0]?.sid || 'UNKNOWN',
        host: timeline[0]?.host || 'UNKNOWN',
        createdAt: new Date().toISOString(),
        files: files.map((f) => ({ name: f.name, size: f.size, kind: classifyFile(f) })),
        timeline,
        wpRows,
        suspects,
        st03n,
        ...conclusion,
      }
      saveLocalSession({
        sessionId: session.sessionId,
        sid: session.sid,
        host: session.host,
        createdAt: session.createdAt,
        window: session.window,
        summary: session.summary,
        confidence: session.confidence,
        top: session.top,
      })
      setAnalysis(session)
      setStep('result')
      setStatus('Analysis complete.')
      setPersistStatus('Saving raw evidence to server…')
      const persisted = await persistFilesToServer(files, session)
      setAnalysis((cur) => cur ? { ...cur, persisted } : cur)
      setPersistStatus(`${persisted.filter((x) => x.ok).length}/${persisted.length} file(s) saved through Evidence API.`)
    } catch (e) {
      setStatus(e?.message || 'Analysis failed.')
    } finally {
      setBusy(false)
    }
  }

  const timelineData = analysis?.timeline || []
  const topSuspects = analysis?.suspects?.slice(0, 10) || []
  const st03nTop = analysis ? [...(analysis.st03n.topResponse || []), ...(analysis.st03n.topDb || []), ...(analysis.st03n.transactionStandard || [])].sort((a, b) => b.score - a.score).slice(0, 10) : []

  return (
    <section className="investigationShell">
      <header className="investHero">
        <div>
          <span className="investKicker">SAP Slowdown Investigation</span>
          <h1>Upload evidence pack. Detect the incident window. Rank the real suspect.</h1>
          <p>Focused only on your uploaded ST03N Excel files and WP-SCOUT logs. No extra TCode suggestions, no guessing outside the evidence.</p>
        </div>
        <div className="investSteps">
          {['upload', 'validate', 'result'].map((s, idx) => <span key={s} data-active={step === s || (idx < ['upload', 'validate', 'result'].indexOf(step))}>{idx + 1}. {s}</span>)}
        </div>
      </header>

      {step === 'upload' && (
        <div className="uploadZone">
          <label className="bigDrop">
            <input type="file" multiple accept=".zip,.xlsx,.xls,.csv,.log,.txt" onChange={(e) => onFiles(e.target.files)} />
            <strong>Upload Evidence ZIP or files</strong>
            <span>ZIP may contain 5 ST03N Excel files + WP-SCOUT logs generated every 10 minutes.</span>
          </label>
        </div>
      )}

      {step === 'validate' && (
        <div className="validateGrid">
          <section className="validatePanel">
            <h2>Evidence Detected</h2>
            <div className="detectList">
              {REQUIRED_ST03N.map((req) => (
                <div key={req.key} className={detected.st03n[req.key].length ? 'ok' : 'missing'}>
                  <span>{detected.st03n[req.key].length ? '✅' : '⚠️'}</span>
                  <strong>{req.label}</strong>
                  <small>{detected.st03n[req.key][0]?.name || 'missing'}</small>
                </div>
              ))}
              <div className={detected.wpScout.length >= 2 ? 'ok' : 'missing'}>
                <span>{detected.wpScout.length >= 2 ? '✅' : '⚠️'}</span>
                <strong>WP-SCOUT snapshots</strong>
                <small>{detected.wpScout.length} log file(s)</small>
              </div>
            </div>
          </section>
          <section className="validatePanel">
            <h2>Ready to Analyze</h2>
            <p>Analysis will use only these uploaded files. Missing ST03N files lower confidence but do not block RCA.</p>
            <button className="investPrimary" onClick={analyze} disabled={busy || !files.length}>{busy ? 'Analyzing…' : 'Analyze Incident'}</button>
            <button className="investSecondary" onClick={() => setStep('upload')}>Replace Evidence</button>
          </section>
        </div>
      )}

      {step === 'result' && analysis && (
        <div className="resultShell">
          <section className="overviewCard">
            <div>
              <span className="investKicker">RCA Overview</span>
              <h2>{analysis.summary}</h2>
              <p>Incident window: <b>{analysis.window.start} - {analysis.window.end}</b> · SID <b>{analysis.sid}</b> · Host <b>{analysis.host}</b></p>
            </div>
            <div className="confidenceBox"><span>Confidence</span><strong>{analysis.confidence}%</strong><small>{analysis.window.reason}</small></div>
          </section>

          <nav className="resultTabs">
            {['overview', 'timeline', 'st03n', 'wp-scout', 'report'].map((x) => <button key={x} data-active={tab === x} onClick={() => setTab(x)}>{x}</button>)}
          </nav>

          {tab === 'overview' && (
            <div className="overviewGrid">
              <section className="resultPanel mainSuspect">
                <h3>Primary Suspect</h3>
                {analysis.top ? <>
                  <strong>PID {analysis.top.pid} / WP {analysis.top.wp} / {analysis.top.type}</strong>
                  <p>{analysis.top.program}</p>
                  <div className="factsGrid">
                    <span>ErrorCode<b>{analysis.top.errorCode}</b></span>
                    <span>JobName<b>{analysis.top.jobName}</b></span>
                    <span>Hits<b>{analysis.top.hits}</b></span>
                    <span>CRIT Hits<b>{analysis.top.critHits}</b></span>
                    <span>Max CPU<b>{fmt(analysis.top.maxCpu)}%</b></span>
                    <span>Max RSS<b>{fmt(analysis.top.maxRssGb)} GB</b></span>
                  </div>
                </> : <p>No primary suspect found.</p>}
              </section>
              <section className="resultPanel">
                <h3>Evidence Strength</h3>
                <ul className="strengthList">
                  <li>WP-SCOUT snapshots: <b>{analysis.timeline.length}</b></li>
                  <li>Suspects ranked: <b>{analysis.suspects.length}</b></li>
                  <li>ST03N files detected: <b>{REQUIRED_ST03N.length - detected.missing.length}/5</b></li>
                  <li>{persistStatus || 'Server storage pending.'}</li>
                </ul>
              </section>
            </div>
          )}

          {tab === 'timeline' && (
            <section className="resultPanel chartBig">
              <h3>Incident Timeline</h3>
              <ResponsiveContainer width="100%" height={340}>
                <LineChart data={timelineData} margin={{ top: 20, right: 24, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="timeLabel" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="cpu" name="CPU %" strokeWidth={3} dot />
                  <Line yAxisId="left" type="monotone" dataKey="memoryPct" name="Memory %" strokeWidth={2} dot />
                  <Line yAxisId="right" type="monotone" dataKey="running" name="WP Running" strokeWidth={3} dot />
                  <Line yAxisId="right" type="monotone" dataKey="critical" name="WP Critical" strokeWidth={3} dot />
                </LineChart>
              </ResponsiveContainer>
            </section>
          )}

          {tab === 'st03n' && (
            <section className="resultPanel">
              <h3>ST03N Evidence Ranking</h3>
              <div className="rankGrid">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={st03nTop.map((r) => ({ name: r.label.slice(0, 18), score: Math.round(r.score), response: Math.round(r.responseMs), db: Math.round(r.dbMs), wait: Math.round(r.waitMs) }))}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="score" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="miniTable">
                  {st03nTop.map((r) => <div key={`${r.kind}-${r.fileName}-${r.label}`}><b>{r.label}</b><span>{r.kind} · score {Math.round(r.score)}</span></div>)}
                </div>
              </div>
            </section>
          )}

          {tab === 'wp-scout' && (
            <section className="resultPanel">
              <h3>WP-SCOUT Suspect Ranking</h3>
              <div className="rankGrid">
                <ResponsiveContainer width="100%" height={330}>
                  <BarChart data={topSuspects.map((s) => ({ name: `${s.pid}/${s.wp}`, score: s.score, crit: s.critHits, hits: s.hits }))}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="score" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="suspectList">
                  {topSuspects.map((s) => <div key={s.key} className={s.severity.toLowerCase()}><b>{s.pid} / WP{s.wp} / {s.errorCode}</b><span>{s.program} · {s.jobName} · hits {s.hits}</span></div>)}
                </div>
              </div>
            </section>
          )}

          {tab === 'report' && (
            <section className="resultPanel reportPanel">
              <h3>Structured Report Preview</h3>
              <ol>
                <li>Executive Summary: {analysis.summary}</li>
                <li>Incident Timeline: {analysis.window.start} - {analysis.window.end}</li>
                <li>Main Suspect: {analysis.top ? `PID ${analysis.top.pid} / ${analysis.top.errorCode}` : '-'}</li>
                <li>ST03N Findings: {st03nTop.length} ranked rows</li>
                <li>WP-SCOUT Findings: {analysis.suspects.length} ranked suspects</li>
                <li>Evidence Files: {analysis.files.length} file(s)</li>
              </ol>
              <button className="investPrimary" onClick={() => exportReport(analysis)}>Export PDF Report</button>
            </section>
          )}
        </div>
      )}

      {(status || busy) && <div className="investStatus">{busy ? 'Working… ' : ''}{status}</div>}
    </section>
  )
}
