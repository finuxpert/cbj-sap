import React from 'react'
import * as XLSX from 'xlsx'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  Legend,
  ScatterChart,
  Scatter,
  ZAxis,
  ComposedChart,
  Area,
  Brush,
} from 'recharts'
import './ToolAnalyzer.css'

const TOOL_ANALYZER_BUILD_STAMP = 'analyzer-20260501-0602'

// =========================
// URL state (shareable deep-link)
// =========================
const readQs = () => {
  try {
    const u = new URL(window.location.href)
    const q = u.searchParams
    return {
      period: q.get('p') || null,
      tab: q.get('t') || null,
      score: q.get('s') || null,
      db: q.get('db') || null,
      wait: q.get('w') || null,
      only: q.get('only') || null,
      qc: q.get('qc') || null,
      sk: q.get('sk') || null,
      sd: q.get('sd') || null,
      q: q.get('q') || null,
      side: q.get('side') || null,
      aa: q.get('aa') || null,
    }
  } catch {
    return {}
  }
}

const writeQs = (patch) => {
  try {
    const u = new URL(window.location.href)
    const q = u.searchParams
    Object.entries(patch || {}).forEach(([k, v]) => {
      if (v === null || v === undefined || v === '') q.delete(k)
      else q.set(k, String(v))
    })
    const next = u.pathname + (q.toString() ? `?${q.toString()}` : '') + u.hash
    window.history.replaceState({}, '', next)
  } catch {}
}



// =========================
// Saved Views (localStorage)
// =========================
const SAVED_VIEWS_KEY = 'ta_saved_views_v1'
const loadSavedViews = () => {
  try {
    const raw = localStorage.getItem(SAVED_VIEWS_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}
const storeSavedViews = (views) => {
  try { localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(views || [])) } catch {}
}



// =========================
// ST03N pack (sessionStorage)
// =========================
// ToolUploader can store selected files into sessionStorage so Analyzer can auto-load them.
// This avoids re-upload when user refreshes / navigates.
const ST03N_PACK_PREFIX = 'st03n_pack_v1_'
const ST03N_PACK_KEYS = ['time', 'topdb', 'topresp', 'txstd', 'workload']

const readPackEntry = async (kind) => {
  try {
    const raw = sessionStorage.getItem(ST03N_PACK_PREFIX + kind)
    if (!raw) return null
    const obj = JSON.parse(raw)
    if (!obj?.b64 || !obj?.name) return null
    const bstr = atob(obj.b64)
    const len = bstr.length
    const bytes = new Uint8Array(len)
    for (let i = 0; i < len; i++) bytes[i] = bstr.charCodeAt(i)
    const blob = new Blob([bytes], { type: obj.type || 'application/octet-stream' })
    // File constructor is supported in modern browsers.
    return new File([blob], obj.name, { type: obj.type || '', lastModified: obj.lastModified || Date.now() })
  } catch {
    return null
  }
}

const loadPackFromSession = async () => {
  const out = {}
  for (const k of ST03N_PACK_KEYS) out[k] = await readPackEntry(k)
  const hasAny = ST03N_PACK_KEYS.some((k) => !!out[k])
  return hasAny ? out : null
}
/**
 * Tool Analyzer — ST03N (Workbench Edition)
 * Fokus: minim scroll halaman, cepat olah data banyak, table internal scroll + virtual rows.
 *
 * Input exports (ideal): Time Profile, Top DB Accesses, Top Response Time, Transaction Profile (Std), Workload Overview
 * Analyzer join by TCode, scoring, filter offenders, export CSV.
 */

// =========================
// Small utils
// =========================
const clamp = (n, a, b) => Math.min(b, Math.max(a, n))
const toNum = (v, fallback = 0) => {
  if (v == null) return fallback
  if (typeof v === 'number') return Number.isFinite(v) ? v : fallback

  let s = String(v).trim()
  if (!s) return fallback

  // Handle (123) as negative
  let neg = false
  if (s.startsWith('(') && s.endsWith(')')) {
    neg = true
    s = s.slice(1, -1).trim()
  }

  // Normalize spaces (including NBSP)
  s = s.replace(/\u00A0/g, ' ').replace(/\s+/g, '')

  // Keep only digits, separators, sign, and exponent markers
  s = s.replace(/[^0-9.,+\-eE]/g, '')
  if (!s) return fallback

  const hasDot = s.includes('.')
  const hasComma = s.includes(',')

  // Helper: remove all occurrences of a char
  const rmAll = (str, ch) => str.split(ch).join('')

  if (hasDot && hasComma) {
    // Decimal separator is whichever appears last.
    const lastDot = s.lastIndexOf('.')
    const lastComma = s.lastIndexOf(',')
    if (lastComma > lastDot) {
      // 1.234,56  -> 1234.56
      s = rmAll(s, '.').replace(/,/g, '.')
    } else {
      // 1,234.56  -> 1234.56
      s = rmAll(s, ',')
    }
  } else if (hasComma) {
    const parts = s.split(',')
    if (parts.length > 2) {
      // 1,234,567 -> 1234567
      s = parts.join('')
    } else if (parts.length === 2) {
      const a = parts[0].replace(/^[-+]/, '')
      const b = parts[1]
      // If comma looks like thousand grouping (xxx,yyy) where yyy is 3 digits and left part isn't "0"
      if (b.length === 3 && a.length >= 1 && a !== '0') {
        s = parts[0] + parts[1]
      } else {
        // Treat as decimal separator
        s = parts[0] + '.' + parts[1]
      }
    }
  } else if (hasDot) {
    const parts = s.split('.')
    if (parts.length > 2) {
      // 1.234.567 -> 1234567
      s = parts.join('')
    } else if (parts.length === 2) {
      const a = parts[0].replace(/^[-+]/, '')
      const b = parts[1]
      // If dot looks like thousand grouping (xxx.yyy) where yyy is 3 digits and left part isn't "0"
      if (b.length === 3 && a.length >= 1 && a !== '0') {
        s = parts[0] + parts[1]
      }
      // else keep as decimal
    }
  }

  const n = parseFloat(s)
  if (!Number.isFinite(n)) return fallback
  return neg ? -n : n
}
const pct = (part, total) => (total > 0 ? (part / total) * 100 : 0)
const clampPct = (v) => clamp(toNum(v, 0), 0, 100)
const fmtInt = (n) => {
  const x = Math.round(toNum(n, 0))
  return x.toLocaleString('en-US')
}
const fmt1 = (n) => {
  const x = toNum(n, 0)
  if (!Number.isFinite(x)) return '0'
  return x.toLocaleString('en-US', { maximumFractionDigits: 1 })
}

const fmt0 = (n) => {
  const x = Math.round(toNum(n, 0))
  return x.toLocaleString('en-US')
}

// nullable numeric (returns null if empty/invalid)
const toNumN = (v) => {
  const n = toNum(v, NaN)
  return Number.isFinite(n) ? n : null
}

// Some ST03N exports may come as µs; heuristic convert to ms.
const toMs = (v) => {
  const n = toNumN(v)
  if (n == null) return null
  // if value is too large for ms (but sane for µs), treat as µs -> ms
  if (n > 1e6 && n < 1e12) return n / 1000
  return n
}

const fmtMs = (v) => {
  const ms = toMs(v)
  if (ms == null) return '-'
  if (ms < 1000) return `${ms.toFixed(0)} ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(2)} s`
  if (ms < 3600000) return `${(ms / 60000).toFixed(2)} min`
  return `${(ms / 3600000).toFixed(2)} h`
}

// format seconds helper (some UI uses this)
const fmtSec = (v) => {
  const ms = toMs(v)
  if (ms == null) return '-'
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(2)} s`
  const m = s / 60
  if (m < 60) return `${m.toFixed(2)} min`
  const h = m / 60
  return `${h.toFixed(2)} h`
}


const normKey = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()
const normTx = (s) => String(s || '').trim().replace(/\s+/g, '_').toUpperCase()

const pickCol = (keys, patterns) => {
  for (const rx of patterns) {
    const k = keys.find((x) => rx.test(String(x || '')))
    if (k) return k
  }
  return ''
}

const findHeaderRowIdx = (rows, wantedKeywords) => {
  const wanted = wantedKeywords.map((x) => normKey(x))
  let bestIdx = 0
  let bestScore = -1
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const row = rows[i] || []
    const joined = normKey(row.map((c) => String(c || '')).join(' | '))
    let score = 0
    for (const w of wanted) if (joined.includes(w)) score++
    if (score > bestScore) {
      bestScore = score
      bestIdx = i
    }
    if (bestScore >= Math.min(4, wanted.length)) break
  }
  return bestIdx
}

const rowsToObjects = (rows, headerIdx) => {
  const header = (rows[headerIdx] || []).map((h) => String(h || '').trim())
  const out = []
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] || []
    if (row.every((c) => String(c ?? '').trim() === '')) continue
    const o = {}
    header.forEach((h, i) => {
      if (!h) return
      o[h] = row[i]
    })
    out.push(o)
  }
  return out
}

const readXlsxOrCsv = async (file) => {
  const name = String(file?.name || '').toLowerCase()
  const isCsv = name.endsWith('.csv')
  const buf = await file.arrayBuffer()

  // --- CSV: support , ; or tab and quoted cells ---
  if (isCsv) {
    const text = new TextDecoder('utf-8').decode(buf)

    const firstNonEmpty = (text.split(/\r?\n/).find((l) => String(l).trim() !== '') || '')
    const scoreDelim = (d) => (firstNonEmpty.match(new RegExp(`\\${d}`, 'g')) || []).length
    const cand = [',', ';', '\t']
    const delim = cand.map((d) => [d, scoreDelim(d)]).sort((a, b) => b[1] - a[1])[0][0] || ','

    const parseLine = (line) => {
      const out = []
      let cur = ''
      let inQ = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === '"') {
          // escaped quote ""
          if (inQ && line[i + 1] === '"') {
            cur += '"'
            i++
          } else {
            inQ = !inQ
          }
          continue
        }
        if (!inQ && ch === delim) {
          out.push(cur.trim())
          cur = ''
          continue
        }
        cur += ch
      }
      out.push(cur.trim())
      return out
    }

    const rows = text
      .split(/\r?\n/)
      .map((l) => String(l || '').replace(/\uFEFF/g, '').trimEnd())
      .filter((l) => l.trim() !== '')
      .map(parseLine)
      .filter((r) => r.some((c) => String(c ?? '').trim() !== ''))

    return rows
  }

  // --- XLSX (first sheet) ---
  try {
    const rows = await parseXlsxInWorker(buf.slice(0))
    return rows
  } catch (e) {
    // fallback to main-thread XLSX
    const wb = XLSX.read(buf, { type: 'array' })
    const sheetName = wb.SheetNames[0]
    const ws = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true })
    return rows
  }
}



// =========================
// Worker (XLSX parsing) to keep UI responsive
// =========================
let __taWorker = null
const getTaWorker = () => {
  if (__taWorker) return __taWorker
  try {
    __taWorker = new Worker(new URL('./ToolAnalyzerWorker.js', import.meta.url), { type: 'module' })
    return __taWorker
  } catch (e) {
    // Worker not available (older env/build); fallback to main-thread XLSX
    __taWorker = null
    return null
  }
}

const parseXlsxInWorker = (buf) =>
  new Promise((resolve, reject) => {
    const w = getTaWorker()
    if (!w) return reject(new Error('worker_unavailable'))
    const id = Math.random().toString(36).slice(2)
    const onMsg = (ev) => {
      const msg = ev?.data
      if (!msg || msg.id !== id) return
      w.removeEventListener('message', onMsg)
      w.removeEventListener('error', onErr)
      if (msg.ok) resolve(msg.rows || [])
      else reject(new Error(msg.error || 'worker_parse_failed'))
    }
    const onErr = (err) => {
      w.removeEventListener('message', onMsg)
      w.removeEventListener('error', onErr)
      reject(err)
    }
    w.addEventListener('message', onMsg)
    w.addEventListener('error', onErr)
    // transfer arraybuffer
    w.postMessage({ id, kind: 'xlsx', buf }, [buf])
  })

// =========================
// Parsers (ST03N exports)
// =========================
const parseTimeProfile = (rows) => {
  const i = findHeaderRowIdx(rows, ['time interval', 'dialog steps', 'average response'])
  const objs = rowsToObjects(rows, i)
  const keys = Object.keys(objs[0] || {})

  const cTime = pickCol(keys, [/^time interval$/i, /time interval/i, /time|hour|period/i])
  const cSteps = pickCol(keys, [/number of dialog steps/i, /dialog steps/i, /steps/i])

  const cAvgResp = pickCol(keys, [
    /average\s*response.*dialog\s*step.*\(ms\)/i,
    /average\s*response.*\(ms\)/i,
    /avg.*response.*\(ms\)/i,
  ])
  const cAvgDb = pickCol(keys, [/ø\s*db\s*time\s*\(ms\)/i, /db\s*time.*\(ms\)/i])
  const cAvgCpu = pickCol(keys, [/average\s*cpu\s*time\s*\(ms\)/i, /cpu.*\(ms\)/i])
  const cAvgRollWait = pickCol(keys, [/ø\s*roll\s*wait\s*time/i, /average\s*roll\s*wait\s*time\s*\(ms\)/i])
  const cAvgWait = pickCol(keys, [/average\s*wait\s*time.*dialog\s*step.*\(ms\)/i, /average\s*wait\s*time.*\(ms\)/i])

  return objs
    .map((r) => ({
      time: String(r[cTime] || '').trim(),
      steps: toNum(r[cSteps] || 0),
      respMs: toNum(r[cAvgResp] || 0),
      dbMs: toNum(r[cAvgDb] || 0),
      cpuMs: toNum(r[cAvgCpu] || 0),
      rollWaitMs: toNum(r[cAvgRollWait] || 0),
      waitMs: toNum(r[cAvgWait] || 0),
    }))
    .filter((x) => x.time)
}

const parseWorkloadOverview = (rows) => {
  const i = findHeaderRowIdx(rows, ['task type', 'number of dialog steps', 'average response'])
  const objs = rowsToObjects(rows, i)
  const keys = Object.keys(objs[0] || {})

  const cTask = pickCol(keys, [/task type name/i, /^task type$/i])
  const cSteps = pickCol(keys, [/number of dialog steps/i, /dialog steps/i, /steps/i])
  const cAvgResp = pickCol(keys, [/average\s*response.*\(ms\)/i])
  const cAvgDb = pickCol(keys, [/ø\s*db\s*time\s*\(ms\)/i, /db time.*\(ms\)/i])
  const cAvgCpu = pickCol(keys, [/average\s*cpu\s*time\s*\(ms\)/i, /cpu.*\(ms\)/i])
  const cAvgRollWait = pickCol(keys, [/average\s*roll\s*wait\s*time\s*\(ms\)/i, /roll\s*wait/i])
  const cAvgWait = pickCol(keys, [/average\s*wait\s*time.*\(ms\)/i])
  const cFeNet = pickCol(keys, [/average\s*frontend\s*network\s*time\s*\(ms\)/i, /frontend/i])
  const cGui = pickCol(keys, [/average\s*gui\s*time.*\(ms\)/i, /\bgui\b/i])

  const dialogRow =
    objs.find((r) => String(r[cTask] || '').trim().toUpperCase() === 'DIALOG') ||
    objs.find((r) => String(r[cTask] || '').trim().toUpperCase().includes('DIALOG')) ||
    objs[0] ||
    {}

  return {
    task: String(dialogRow[cTask] || 'DIALOG').trim(),
    steps: toNum(dialogRow[cSteps] || 0),
    respMs: toNum(dialogRow[cAvgResp] || 0),
    dbMs: toNum(dialogRow[cAvgDb] || 0),
    cpuMs: toNum(dialogRow[cAvgCpu] || 0),
    rollWaitMs: toNum(dialogRow[cAvgRollWait] || 0),
    waitMs: toNum(dialogRow[cAvgWait] || 0),
    feNetMs: toNum(dialogRow[cFeNet] || 0),
    guiMs: toNum(dialogRow[cGui] || 0),
  }
}

const parseTxProfileStd = (rows) => {
  const i = findHeaderRowIdx(rows, ['report or transaction', 'dialog steps', 'response'])
  const objs = rowsToObjects(rows, i)
  const keys = Object.keys(objs[0] || {})

  const cTcode = pickCol(keys, [/report or transaction name/i, /transaction name/i])
  const cJob = pickCol(keys, [/name of background job/i, /background job/i])
  const cSteps = pickCol(keys, [/number of dialog steps/i, /dialog steps/i, /steps/i])

  const cAvgResp = pickCol(keys, [/average\s*response.*dialog\s*step.*\(ms\)/i, /average\s*response.*\(ms\)/i])
  const cAvgDb = pickCol(keys, [/ø\s*db\s*time\s*\(ms\)/i, /db time.*\(ms\)/i])
  const cAvgCpu = pickCol(keys, [/average\s*cpu\s*time\s*\(ms\)/i, /cpu.*\(ms\)/i])
  const cAvgRollWait = pickCol(keys, [/ø\s*roll\s*wait\s*time/i, /average\s*roll\s*wait.*\(ms\)/i])
  const cAvgWait = pickCol(keys, [/average\s*wait\s*time.*dialog\s*step.*\(ms\)/i, /average\s*wait\s*time.*\(ms\)/i])

  const cTotRespS = pickCol(keys, [/total\s*response\s*time\s*\(s\)/i])
  const cTotDbS = pickCol(keys, [/total\s*database\s*time\s*\(s\)/i])
  const cTotCpuS = pickCol(keys, [/total\s*cpu\s*time\s*\(s\)/i])
  const cTotRollWaitS = pickCol(keys, [/total\s*roll\s*wait\s*time\s*\(s\)/i])
  const cTotWaitS = pickCol(keys, [/total\s*wait\s*time\s*\(s\)/i])

  return objs
    .map((r) => {
      const tcode = normTx(r[cTcode] || '')
      if (!tcode) return null
      const job = String(r[cJob] || '').trim()
      const steps = toNum(r[cSteps] || 0)

      const totRespMs = toNum(r[cTotRespS] || 0) * 1000
      const totDbMs = toNum(r[cTotDbS] || 0) * 1000
      const totCpuMs = toNum(r[cTotCpuS] || 0) * 1000
      const totRollWaitMs = toNum(r[cTotRollWaitS] || 0) * 1000
      const totWaitMs = toNum(r[cTotWaitS] || 0) * 1000

      const avgRespMs = toNum(r[cAvgResp] || 0) || (steps > 0 ? totRespMs / steps : 0)
      const avgDbMs = toNum(r[cAvgDb] || 0) || (steps > 0 ? totDbMs / steps : 0)
      const avgCpuMs = toNum(r[cAvgCpu] || 0) || (steps > 0 ? totCpuMs / steps : 0)
      const avgRollWaitMs = toNum(r[cAvgRollWait] || 0) || (steps > 0 ? totRollWaitMs / steps : 0)
      const avgWaitMs = toNum(r[cAvgWait] || 0) || (steps > 0 ? totWaitMs / steps : 0)

      const safeTotRespMs = totRespMs || (steps > 0 ? avgRespMs * steps : 0)
      const safeTotDbMs = totDbMs || (steps > 0 ? avgDbMs * steps : 0)
      const safeTotCpuMs = totCpuMs || (steps > 0 ? avgCpuMs * steps : 0)
      const safeTotRollWaitMs = totRollWaitMs || (steps > 0 ? avgRollWaitMs * steps : 0)
      const safeTotWaitMs = totWaitMs || (steps > 0 ? avgWaitMs * steps : 0)

      return {
        tcode,
        job,
        steps,
        avgRespMs,
        avgDbMs,
        avgCpuMs,
        avgRollWaitMs,
        avgWaitMs,
        totalRespMs: safeTotRespMs,
        totalDbMs: safeTotDbMs,
        totalCpuMs: safeTotCpuMs,
        totalRollWaitMs: safeTotRollWaitMs,
        totalWaitMs: safeTotWaitMs,
      }
    })
    .filter(Boolean)
}

const parseTopResp = (rows) => {
  const i = findHeaderRowIdx(rows, ['dialog step response', 'transaction'])
  const objs = rowsToObjects(rows, i)
  const keys = Object.keys(objs[0] || {})

  const cTcode = pickCol(keys, [/report or transaction name/i, /transaction name/i])
  const cResp = pickCol(keys, [/dialog step response time\s*\(ms\)/i, /response time.*\(ms\)/i])
  const cDb = pickCol(keys, [/database time per dialog step\s*\(ms\)/i, /database time.*\(ms\)/i])
  const cWait = pickCol(keys, [/wait time for dialog step\s*\(ms\)/i, /wait time.*\(ms\)/i])
  const cRollWait = pickCol(keys, [/roll wait time for dialog step\s*\(ms\)/i, /roll wait.*\(ms\)/i])
  const cCpu = pickCol(keys, [/cpu time per dialog step\s*\(ms\)/i, /cpu time.*\(ms\)/i])

  const cDate = pickCol(keys, [/date stamp/i])
  const cTime = pickCol(keys, [/time stamp/i])
  const cTask = pickCol(keys, [/task type name/i, /task type/i])
  const cUser = pickCol(keys, [/user in abap system/i, /\buser\b/i])

  return objs
    .map((r) => {
      const tcode = normTx(r[cTcode] || '')
      if (!tcode) return null

      const respMs = toNum(r[cResp] || 0)
      const dbMs = toNum(r[cDb] || 0)
      const waitMs = toNum(r[cWait] || 0)
      const rollWaitMs = toNum(r[cRollWait] || 0)
      const mainWaitMs = rollWaitMs || waitMs

      return {
        tcode,
        at: [r[cDate], r[cTime]].filter(Boolean).join(' '),
        task: String(r[cTask] || '').trim(),
        user: String(r[cUser] || '').trim(),
        respMs,
        dbMs,
        waitMs,
        rollWaitMs,
        cpuMs: toNum(r[cCpu] || 0),
        dbPct: pct(dbMs, respMs),
        waitPct: pct(mainWaitMs, respMs),
      }
    })
    .filter(Boolean)
}

const parseTopDB = (rows) => {
  const i = findHeaderRowIdx(rows, ['sequential reads time', 'direct reads', 'transaction'])
  const objs = rowsToObjects(rows, i)
  const keys = Object.keys(objs[0] || {})

  const cTcode = pickCol(keys, [/report or transaction name/i, /transaction name/i, /name of abap program/i])
  const cSeqMs = pickCol(keys, [/sequential reads time\s*\(ms\)/i])
  const cSeqN = pickCol(keys, [/number of sequential reads/i])
  const cDirMs = pickCol(keys, [/time for log\.?\s*direct reads\s*\(ms\)/i, /direct reads time\s*\(ms\)/i])
  const cDirN = pickCol(keys, [/number of direct reads/i])
  const cChgMs = pickCol(keys, [/time for logical database changes\s*\(ms\)/i, /logical database changes.*\(ms\)/i])
  const cChgN = pickCol(keys, [/number of logical database changes/i])
  const cDbCalls = pickCol(keys, [/number of logical database calls/i, /logical database calls/i])

  const map = new Map()
  objs.forEach((r) => {
    const tcode = normTx(r[cTcode] || '')
    if (!tcode) return

    const seqMs = toNum(r[cSeqMs] || 0)
    const dirMs = toNum(r[cDirMs] || 0)
    const chgMs = toNum(r[cChgMs] || 0)

    const o = map.get(tcode) || {
      tcode,
      dbIoMs: 0,
      seqMs: 0,
      dirMs: 0,
      chgMs: 0,
      seqReads: 0,
      dirReads: 0,
      changes: 0,
      dbCalls: 0,
    }
    o.seqMs += seqMs
    o.dirMs += dirMs
    o.chgMs += chgMs
    o.dbIoMs += seqMs + dirMs + chgMs
    o.seqReads += toNum(r[cSeqN] || 0)
    o.dirReads += toNum(r[cDirN] || 0)
    o.changes += toNum(r[cChgN] || 0)
    o.dbCalls += toNum(r[cDbCalls] || 0)
    map.set(tcode, o)
  })
  return [...map.values()]
}

// =========================
// Analyzer (join by TCode)
// =========================
const joinAll = ({ txStd = [], topDb = [], topResp = [] }, scoreMode) => {
  const map = new Map()

  const ensure = (tcode) => {
    if (!map.has(tcode)) {
      map.set(tcode, {
        tcode,
        steps: 0,
        totalRespMs: 0,
        totalDbMs: 0,
        totalCpuMs: 0,
        totalRollWaitMs: 0,
        totalWaitMs: 0,
        respMs: 0,
        dbMs: 0,
        cpuMs: 0,
        rollWaitMs: 0,
        waitMs: 0,
        dbPct: 0,
        waitPct: 0,
        jobNames: new Set(),
        topRespMs: 0,
        topRespAt: '',
        topRespUser: '',
        topRespDbPct: 0,
        topRespWaitPct: 0,
        dbIoMs: 0,
        seqMs: 0,
        dirMs: 0,
        chgMs: 0,
        seqReads: 0,
        dirReads: 0,
        changes: 0,
        dbCalls: 0,
      })
    }
    return map.get(tcode)
  }

  txStd.forEach((r) => {
    const tcode = normTx(r.tcode)
    if (!tcode) return
    const o = ensure(tcode)
    const steps = toNum(r.steps || 0)

    o.steps += steps
    o.totalRespMs += toNum(r.totalRespMs || 0)
    o.totalDbMs += toNum(r.totalDbMs || 0)
    o.totalCpuMs += toNum(r.totalCpuMs || 0)
    o.totalRollWaitMs += toNum(r.totalRollWaitMs || 0)
    o.totalWaitMs += toNum(r.totalWaitMs || 0)

    if (r.job) o.jobNames.add(String(r.job))
  })

  topDb.forEach((r) => {
    const tcode = normTx(r.tcode)
    if (!tcode) return
    const o = ensure(tcode)
    o.dbIoMs += toNum(r.dbIoMs || 0)
    o.seqMs += toNum(r.seqMs || 0)
    o.dirMs += toNum(r.dirMs || 0)
    o.chgMs += toNum(r.chgMs || 0)
    o.seqReads += toNum(r.seqReads || 0)
    o.dirReads += toNum(r.dirReads || 0)
    o.changes += toNum(r.changes || 0)
    o.dbCalls += toNum(r.dbCalls || 0)
  })

  topResp.forEach((r) => {
    const tcode = normTx(r.tcode)
    if (!tcode) return
    const o = ensure(tcode)
    const respMs = toNum(r.respMs || 0)
    if (respMs > o.topRespMs) {
      o.topRespMs = respMs
      o.topRespAt = r.at || ''
      o.topRespUser = r.user || ''
    }
    o.topRespDbPct = Math.max(o.topRespDbPct, toNum(r.dbPct || 0))
    o.topRespWaitPct = Math.max(o.topRespWaitPct, toNum(r.waitPct || 0))
  })

  return [...map.values()].map((o) => {
    const steps = toNum(o.steps || 0)
    const respMs = steps > 0 ? o.totalRespMs / steps : 0
    const dbMs = steps > 0 ? o.totalDbMs / steps : 0
    const cpuMs = steps > 0 ? o.totalCpuMs / steps : 0

    const rollWaitMs = steps > 0 ? o.totalRollWaitMs / steps : 0
    const waitMs = steps > 0 ? o.totalWaitMs / steps : 0
    const mainWaitMs = rollWaitMs || waitMs

    const dbPct = pct(dbMs, respMs)
    const waitPct = pct(mainWaitMs, respMs)

    const totalRespMs = toNum(o.totalRespMs || 0)

    const score =
      scoreMode === 'total'
        ? totalRespMs
        : scoreMode === 'impact'
        ? respMs * Math.log10(steps + 10)
        : respMs

    const cpuPct = pct(cpuMs, respMs)

    const severity = (() => {
      // tuned for SAP dialog steps; adjust as needed
      if (respMs >= 3600000) return 'EXTREME' // >= 1h
      if (respMs >= 300000) return 'SEVERE'   // >= 5m
      if (respMs >= 60000) return 'HIGH'      // >= 1m
      if (respMs >= 10000) return 'ELEVATED'  // >= 10s
      if (respMs >= 2000) return 'MED'        // >= 2s
      return 'LOW'
    })()

    const classKey = (() => {
      const d = clampPct(dbPct)
      const w = clampPct(waitPct)
      const c = clampPct(cpuPct)
      if (respMs <= 0) return 'NONE'
      // Strong dominance
      if (d >= 60 && d >= w && d >= c) return 'DBHEAVY'
      if (w >= 60 && w >= d && w >= c) return 'WAITHEAVY'
      if (c >= 60 && c >= d && c >= w) return 'CPUHEAVY'
      // Leaning
      if (d >= 40 && d >= w && d >= c) return 'DBLEAN'
      if (w >= 40 && w >= d && w >= c) return 'WAITLEAN'
      if (c >= 40 && c >= d && c >= w) return 'CPULEAN'
      return 'MIXED'
    })()

    const hint = (() => {
      if (respMs <= 0) return ''
      if (classKey === 'DBHEAVY') return 'DB-heavy (cek expensive SQL / index / HANA plan)'
      if (classKey === 'WAITHEAVY') return 'Wait-heavy (roll/enqueue/rfc/wp) — cek WP & lock'
      if (classKey === 'CPUHEAVY') return 'CPU-heavy (cek hotspot ABAP / internal table / SAT sample)'
      if (classKey === 'DBLEAN') return 'DB leaning'
      if (classKey === 'WAITLEAN') return 'Wait leaning'
      if (classKey === 'CPULEAN') return 'CPU leaning'
      return 'Mixed / GUI / Network'
    })()

    const scoreLabel =
      scoreMode === 'total' ? 'TotalResp' : scoreMode === 'impact' ? 'Impact' : 'AvgResp'
return {
      ...o,
      steps,
      respMs,
      dbMs,
      cpuMs,
      rollWaitMs,
      waitMs,
      mainWaitMs,
      dbPct,
      waitPct,
      jobNames: [...o.jobNames].filter(Boolean).slice(0, 8).join(', '),
      totalRespMs,
      _score: score,
      scoreLabel,
      cpuPct,
      classKey,
      severity,
      hint,
    }
  })
}

// =========================
// Hooks
// =========================
const useDebounced = (value, ms = 140) => {
  const [v, setV] = React.useState(value)
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

const useElementSize = (ref) => {
  const [size, setSize] = React.useState({ width: 0, height: 0 })
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setSize({ width: el.clientWidth || 0, height: el.clientHeight || 0 })
    update()
    if (!('ResizeObserver' in window)) {
      window.addEventListener('resize', update)
      return () => window.removeEventListener('resize', update)
    }
    const ro = new ResizeObserver(() => update())
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return size
}

// =========================
// UI atoms
// =========================

// =========================
// Command Palette (Ctrl+K)
// =========================
const Palette = ({ open, query, setQuery, items, onClose, onRun }) => {
  const [idx, setIdx] = React.useState(0)
  const inputRef = React.useRef(null)

  React.useEffect(() => {
    if (open) {
      setIdx(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  React.useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setIdx((v) => Math.min(v + 1, Math.max(0, items.length - 1)))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setIdx((v) => Math.max(0, v - 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const it = items[idx]
        if (it) onRun(it)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, items, idx, onClose, onRun])

  if (!open) return null
  return (
    <div className="ta-overlay" onMouseDown={onClose}>
      <div className="ta-palette" onMouseDown={(e) => e.stopPropagation()}>
        <div className="ta-palette__head">
          <input
            ref={inputRef}
            className="ta-input ta-palette__input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ketik untuk cari aksi / tcode / class…"
          />
          <div className="ta-palette__hint">Enter: run • Esc: close</div>
        </div>
        <div className="ta-palette__list">
          {items.length === 0 ? (
            <div className="ta-palette__empty">No results</div>
          ) : (
            items.map((it, i) => (
              <button
                key={it.key}
                className={'ta-palette__item ' + (i === idx ? 'is-active' : '')}
                onMouseEnter={() => setIdx(i)}
                onClick={() => onRun(it)}
              >
                <div className="ta-palette__title">{it.title}</div>
                {it.sub ? <div className="ta-palette__sub">{it.sub}</div> : null}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// =========================
// Evidence Pack Modal
// =========================
const EvidenceModal = ({ open, onClose, text, title }) => {
  if (!open) return null
  const doCopy = async () => {
    try { await navigator.clipboard.writeText(text || '') } catch {}
  }
  const doDownload = (ext = 'md') => {
    try {
      const type = ext === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8'
      const blob = new Blob([text || ''], { type })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${(title || 'evidence').replace(/\s+/g,'_')}.${ext}`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    } catch {}
  }
  return (
    <div className="ta-overlay" onMouseDown={onClose}>
      <div className="ta-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="ta-modal__head">
          <div className="ta-modal__title">{title || 'Evidence pack'}</div>
          <button className="ta-btn ta-btn--ghost" onClick={onClose}>Close</button>
        </div>
        <div className="ta-modal__actions">
          <button className="ta-btn ta-btn--primary" onClick={doCopy}>Copy</button>
          <button className="ta-btn" onClick={() => doDownload('md')}>Download .md</button>
          <button className="ta-btn ta-btn--ghost" onClick={() => doDownload('txt')}>.txt</button>
        </div>
        <pre className="ta-pre">{text || ''}</pre>
      </div>
    </div>
  )
}



const Pill = ({ active, children, onClick, title }) => (
  <button className={`ta-pill ${active ? 'is-active' : ''}`} onClick={onClick} title={title} type="button">
    {children}
  </button>
)

const Stat = ({ label, value, sub, tone, onClick, title }) => (
  <div
    className={`ta-stat ${tone || ''} ${onClick ? 'is-click' : ''}`}
    onClick={onClick}
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
    title={title}
    onKeyDown={(e) => {
      if (!onClick) return
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onClick()
      }
    }}
  >
    <div className="ta-stat__label">{label}</div>
    <div className="ta-stat__value">{value}</div>
    {sub ? <div className="ta-stat__sub">{sub}</div> : null}
  </div>
)

const MiniSpark = ({ data, dataKey = 'v', stroke = '#38bdf8' }) => {
  if (!data || !data.length) return <div className="ta-spark ta-spark--empty">—</div>
  return (
    <div className="ta-spark">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line type="monotone" dataKey={dataKey} stroke={stroke} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

const KpiCard = ({ label, value, sub, delta, tone, spark, onClick, title }) => (
  <div
    className={`ta-kpiCard ${tone || ''} ${onClick ? 'is-click' : ''}`}
    onClick={onClick}
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : -1}
    onKeyDown={(e) => {
      if (!onClick) return
      if (e.key === 'Enter' || e.key === ' ') onClick()
    }}
    title={title}
  >
    <div className="ta-kpiCard__top">
      <div className="ta-kpiCard__label">{label}</div>
      {delta ? <div className="ta-kpiCard__delta">{delta}</div> : null}
    </div>
    <div className="ta-kpiCard__value">{value}</div>
    <div className="ta-kpiCard__subRow">
      <div className="ta-kpiCard__sub">{sub || '—'}</div>
      {spark ? <MiniSpark {...spark} /> : <div className="ta-spark ta-spark--empty">—</div>}
    </div>
  </div>
  );

const FilterChips = ({ items }) => {
  const xs = (items || []).filter(Boolean)
  if (!xs.length) return null
  return (
    <div className="ta-filtersBar" role="region" aria-label="Active filters">
      <div className="ta-filtersBar__label">Active:</div>
      <div className="ta-filtersBar__chips">
        {xs.map((it) => (
          <button
            key={it.key}
            className={`ta-fchip ${it.tone || ''}`}
            type="button"
            title={it.title || it.label}
            onClick={it.onClick}
          >
            <span className="ta-fchip__k">{it.label}</span>
            <span className="ta-fchip__v">{it.value}</span>
            {it.onClear ? (
              <span
                className="ta-fchip__x"
                title="Clear"
              >
                ×
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  )
}

const RiskChip = ({ value, kind }) => {
  const v = value == null ? null : clampPct(value)
  const cls = v == null ? '' : v >= 70 ? 'is-bad' : v >= 40 ? 'is-warn' : v >= 20 ? 'is-ok' : 'is-low'
  const label = v == null ? '—' : `${fmt1(v)}%`
  return <span className={`ta-chip ${cls} ${kind || ''}`}>{label}</span>
}

const ClassChip = ({ classKey, severity }) => {
  const ck = String(classKey || 'MIXED')
  const sev = String(severity || 'LOW')
  const cls =
    ck === 'DBHEAVY' ? 'is-db' :
    ck === 'WAITHEAVY' ? 'is-wait' :
    ck === 'CPUHEAVY' ? 'is-cpu' :
    ck === 'DBLEAN' ? 'is-db' :
    ck === 'WAITLEAN' ? 'is-wait' :
    ck === 'CPULEAN' ? 'is-cpu' :
    ck === 'NONE' ? 'is-none' :
    'is-mixed'

  const sevCls =
    sev === 'EXTREME' ? 'sev-extreme' :
    sev === 'SEVERE' ? 'sev-severe' :
    sev === 'HIGH' ? 'sev-high' :
    sev === 'ELEVATED' ? 'sev-elevated' :
    sev === 'MED' ? 'sev-med' :
    'sev-low'

  const label =
    ck === 'DBHEAVY' ? 'DB-heavy' :
    ck === 'WAITHEAVY' ? 'Wait-heavy' :
    ck === 'CPUHEAVY' ? 'CPU-heavy' :
    ck === 'DBLEAN' ? 'DB-lean' :
    ck === 'WAITLEAN' ? 'Wait-lean' :
    ck === 'CPULEAN' ? 'CPU-lean' :
    ck === 'NONE' ? '—' :
    'Mixed'

  const sevLabel =
    sev === 'EXTREME' ? 'Extreme' :
    sev === 'SEVERE' ? 'Severe' :
    sev === 'HIGH' ? 'High' :
    sev === 'ELEVATED' ? 'Elevated' :
    sev === 'MED' ? 'Med' :
    'Low'

  return (
    <span className={`ta-chip ${cls} ${sevCls}`} title={`${label} • ${sevLabel}`}>
      {label}{sev === 'LOW' ? '' : ` • ${sevLabel}`}
    </span>
  )
}

const DropTile = ({ title, hint, file, meta, required, onPick, onClear }) => {
  const inputRef = React.useRef(null)
  const st = meta?.status || (file ? 'OK' : 'EMPTY')
  const rows = meta?.rows || 0
  const err = meta?.err || ''

  const badge =
    st === 'OK' ? <span className="ta-file__ok">✓</span> :
    st === 'PARSING' ? <span className="ta-file__ok is-parsing">…</span> :
    st === 'ERROR' ? <span className="ta-file__ok is-error">!</span> :
    null

  return (
    <div
      className={`ta-drop ${file ? 'has-file' : ''} ${st === 'PARSING' ? 'is-parsing' : ''} ${st === 'ERROR' ? 'is-error' : ''}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        const f = e.dataTransfer.files?.[0]
        if (f) onPick(f)
      }}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
      }}
    >
      <div className="ta-drop__head">
        <div className="ta-drop__title">
          {title}{required ? <span className="ta-req">*</span> : null}
        </div>
        <div className="ta-drop__hint">{hint}</div>
      </div>

      <div className="ta-drop__body">
        {file ? (
          <div className="ta-file">
            {badge}
            <span className="ta-file__name">{file.name}</span>
            <span className="ta-file__meta">
              {Math.round((file.size || 0) / 1024).toLocaleString('en-US')} KB
              {rows ? ` • ${rows.toLocaleString('en-US')} rows` : ''}
            </span>
            <button
              className="ta-file__clear"
              title="Remove file"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onClear?.()
                // allow re-pick same file name
                if (inputRef.current) inputRef.current.value = ''
              }}
            >
              ×
            </button>
          </div>
        ) : (
          <div className="ta-file ta-file--empty">{st === 'PARSING' ? 'Parsing…' : 'Drop / click file .XLSX/.CSV'}</div>
        )}

        {st === 'ERROR' && err ? <div className="ta-fileErr">{err}</div> : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onPick(f)
        }}
      />
    </div>
  )
}

// =========================
// Virtual table (fast, no DOM bloat)
// =========================
const VirtualTable = ({
  rows,
  rowHeight = 42,
  overscan = 10,
  columns,
  selectedKey,
  onSelect,
  viewportRef,
  titleForRow,
}) => {
  const localRef = React.useRef(null)
  const ref = viewportRef || localRef
  const { height } = useElementSize(ref)
  const [scrollTop, setScrollTop] = React.useState(0)

  const rafRef = React.useRef(0)
  const onScroll = (e) => {
    const st = e.currentTarget.scrollTop
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => setScrollTop(st))
  }

  const total = rows.length
  const visibleCount = Math.max(1, Math.ceil((height || 1) / rowHeight))
  const start = clamp(Math.floor(scrollTop / rowHeight) - overscan, 0, Math.max(0, total - 1))
  const end = clamp(start + visibleCount + overscan * 2, 0, total)
  const slice = rows.slice(start, end)

  const gridTemplate = React.useMemo(
    () =>
      columns
        .map((c) => (c.flex ? '1fr' : `${c.w || 120}px`))
        .join(' '),
    [columns]
  )


  const stickyLeft = React.useMemo(() => {
    let left = 0
    const map = {}
    for (const c of columns) {
      if (c.sticky) {
        map[c.id] = left
        left += c.w || 120
      }
    }
    return map
  }, [columns])

  return (
    <div className="ta-vt">
      <div className="ta-vt-head" style={{ gridTemplateColumns: gridTemplate }}>
        {columns.map((c) => (
          <div key={c.id} className={`ta-vt-th ${c.align === 'r' ? 'r' : ''} ${c.sticky ? 'is-sticky' : ''}`} style={c.sticky ? { left: stickyLeft[c.id] || 0 } : undefined}>
            {c.label}
          </div>
        ))}
      </div>

      <div className="ta-vt-viewport" ref={ref} onScroll={onScroll}>
        <div className="ta-vt-spacer" style={{ height: total * rowHeight }} />
        <div className="ta-vt-slice" style={{ transform: `translateY(${start * rowHeight}px)` }}>
          {slice.map((r, i) => {
            const idx = start + i
            const key = String(r.tcode || idx)
            const isSel = selectedKey && selectedKey === key
            return (
              <div
                key={key}
                className={`ta-vt-row ${isSel ? 'is-selected' : ''}`}
                style={{ height: rowHeight, gridTemplateColumns: gridTemplate }}
                onClick={() => onSelect?.(r, idx)}
                title={titleForRow ? titleForRow(r, idx) : ''}
              >
                {columns.map((c) => {
                  const content = c.render ? c.render(r, idx) : r[c.id]
                  return (
                    <div
                      key={c.id}
                      className={`ta-vt-td ${c.align === 'r' ? 'r' : ''} ${c.mono ? 'mono' : ''} ${c.ellipsis ? 'ellipsis' : ''} ${c.sticky ? 'is-sticky' : ''}`}
                      style={c.sticky ? { left: stickyLeft[c.id] || 0 } : undefined}
                    >
                      {content}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const META0 = { status: 'EMPTY', rows: 0, err: '', name: '', size: 0, updatedAt: 0 }
const makeMetaState = () => ({
  time: { ...META0 },
  topdb: { ...META0 },
  topresp: { ...META0 },
  txstd: { ...META0 },
  workload: { ...META0 },
})

// =========================
// Main component
// =========================
export default function ToolAnalyzer() {
  // files
  const [fTime, setFTime] = React.useState(null)
  const [fTopDb, setFTopDb] = React.useState(null)
  const [fTopResp, setFTopResp] = React.useState(null)
  const [fTxStd, setFTxStd] = React.useState(null)
  const [fWorkload, setFWorkload] = React.useState(null)
  const [fileMeta, setFileMeta] = React.useState(makeMetaState)
  const [copied, setCopied] = React.useState(false)

  // Auto-load pack from ToolUploader (sessionStorage) when opening Analyzer with empty slots.
  React.useEffect(() => {
    const hasPicked = !!(fTime || fTopDb || fTopResp || fTxStd || fWorkload)
    if (hasPicked) return
    ;(async () => {
      const pack = await loadPackFromSession()
      if (!pack) return
      if (pack.time) setFTime(pack.time)
      if (pack.topdb) setFTopDb(pack.topdb)
      if (pack.topresp) setFTopResp(pack.topresp)
      if (pack.txstd) setFTxStd(pack.txstd)
      if (pack.workload) setFWorkload(pack.workload)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


  // parsed
  const [timeSeries, setTimeSeries] = React.useState([])
  const [topDbAgg, setTopDbAgg] = React.useState([])
  const [topRespRows, setTopRespRows] = React.useState([])
  const [txStdRows, setTxStdRows] = React.useState([])
  const [workload, setWorkload] = React.useState(null)

  // UI/workbench
  const [period, setPeriod] = React.useState('WEEK') // DAY|WEEK|MONTH
  const [autoAnalyze, setAutoAnalyze] = React.useState(true)
  const [tab, setTab] = React.useState('DASH') // DASH|OFFENDERS|CHARTS|INSIGHTS
  const [sideCollapsed, setSideCollapsed] = React.useState(false)
  const [detailCollapsed, setDetailCollapsed] = React.useState(false)

  // controls
  const [scoreMode, setScoreMode] = React.useState('avg') // avg|impact|total
  const [dbCutPct, setDbCutPct] = React.useState(40)
  const [waitCutPct, setWaitCutPct] = React.useState(30)
  const [onlyOffenders, setOnlyOffenders] = React.useState(true)
  const [quickClass, setQuickClass] = React.useState('ALL') // ALL|DBHEAVY|WAITHEAVY|CPUHEAVY|DBLEAN|WAITLEAN|CPULEAN|EXTREME

  const [sortKey, setSortKey] = React.useState('score') // score|resp|steps|db|wait|tcode
  const [sortDir, setSortDir] = React.useState('desc')

  const [paletteOpen, setPaletteOpen] = React.useState(false)
  const [paletteQuery, setPaletteQuery] = React.useState('')

  const [savedViews, setSavedViews] = React.useState(() => loadSavedViews())
  const [evOpen, setEvOpen] = React.useState(false)
  const [evMode, setEvMode] = React.useState('mgmt') // mgmt|basis|raw

  const [selectedHour, setSelectedHour] = React.useState(null) // 'HH-HH' or 'HH'
  const [density, setDensity] = React.useState('cozy') // cozy|compact
  const [renderBudget, setRenderBudget] = React.useState('fast') // fast|max
  const [compareKeys, setCompareKeys] = React.useState([]) // tcode list
  const [compareOpen, setCompareOpen] = React.useState(false)
  const [activeDashSection, setActiveDashSection] = React.useState('kpis')

  const [search, setSearch] = React.useState('')
  const searchDeb = useDebounced(search, 120)
  const searchRef = React.useRef(null)

  const [selected, setSelected] = React.useState(null)
  const viewportRef = React.useRef(null)
  const dashViewportRef = React.useRef(null)

  // analysis output
  const [joined, setJoined] = React.useState([])
  const [lastError, setLastError] = React.useState('')


  // apply URL state once (deep-link)
  React.useEffect(() => {
    const qs = readQs()
    if (qs.period) setPeriod(String(qs.period).toUpperCase())
    if (qs.tab) setTab(String(qs.tab).toUpperCase())
    if (qs.score) setScoreMode(String(qs.score))
    if (qs.db) setDbCutPct(toNum(qs.db, 40))
    if (qs.wait) setWaitCutPct(toNum(qs.wait, 30))
    if (qs.only) setOnlyOffenders(String(qs.only) === '1')
    if (qs.qc) setQuickClass(String(qs.qc).toUpperCase())
    if (qs.sk) setSortKey(String(qs.sk))
    if (qs.sd) setSortDir(String(qs.sd))
    if (qs.q) setSearch(String(qs.q))
    if (qs.side) setSideCollapsed(String(qs.side) === '1')
    if (qs.aa) setAutoAnalyze(String(qs.aa) === '1')
  }, [])

  // persist URL state (shareable)
  React.useEffect(() => {
    writeQs({
      p: period,
      t: tab,
      s: scoreMode,
      db: dbCutPct,
      w: waitCutPct,
      only: onlyOffenders ? '1' : '0',
      qc: quickClass,
      sk: sortKey,
      sd: sortDir,
      q: search ? search : '',
      side: sideCollapsed ? '1' : '0',
      aa: autoAnalyze ? '1' : '0',
    })
  }, [period, tab, scoreMode, dbCutPct, waitCutPct, onlyOffenders, quickClass, sortKey, sortDir, search, sideCollapsed, autoAnalyze])

  const filesOk = [fTime, fTopDb, fTopResp, fTxStd, fWorkload].filter(Boolean).length
  const parsedOk = ['time','topdb','topresp','txstd','workload'].filter((k)=> fileMeta?.[k]?.status === 'OK').length
  const canAnalyze = (txStdRows?.length || 0) > 0 && fileMeta?.txstd?.status === 'OK'
  const allFilesOk = filesOk === 5 


const setMetaKind = React.useCallback((kind, patch) => {
  setFileMeta((m) => ({
    ...m,
    [kind]: { ...(m?.[kind] || META0), ...patch, updatedAt: Date.now() },
  }))
}, [])

const clearSlot = React.useCallback((kind) => {
  if (kind === 'time') { setFTime(null); setTimeSeries([]) }
  if (kind === 'topdb') { setFTopDb(null); setTopDbAgg([]) }
  if (kind === 'topresp') { setFTopResp(null); setTopRespRows([]) }
  if (kind === 'txstd') { setFTxStd(null); setTxStdRows([]) }
  if (kind === 'workload') { setFWorkload(null); setWorkload(null) }
  setMetaKind(kind, { ...META0 })
}, [setMetaKind])

  const parseOne = async (file, kind) => {
    if (!file) return
    setMetaKind(kind, { status: 'PARSING', err: '', name: file.name || '', size: file.size || 0, rows: 0 })
    try {
      const rows2d = await readXlsxOrCsv(file)

      if (kind === 'time') {
        const parsed = parseTimeProfile(rows2d)
        setTimeSeries(parsed)
        setMetaKind(kind, { status: 'OK', rows: parsed.length })
      }
      if (kind === 'topdb') {
        const parsed = parseTopDB(rows2d)
        setTopDbAgg(parsed)
        setMetaKind(kind, { status: 'OK', rows: parsed.length })
      }
      if (kind === 'topresp') {
        const parsed = parseTopResp(rows2d)
        setTopRespRows(parsed)
        setMetaKind(kind, { status: 'OK', rows: parsed.length })
      }
      if (kind === 'txstd') {
        const parsed = parseTxProfileStd(rows2d)
        setTxStdRows(parsed)
        setMetaKind(kind, { status: 'OK', rows: parsed.length })
      }
      if (kind === 'workload') {
        const parsed = parseWorkloadOverview(rows2d)
        setWorkload(parsed)
        setMetaKind(kind, { status: 'OK', rows: parsed ? 1 : 0 })
      }

      setLastError('')
    } catch (e) {
      const msg = String(e?.message || e)
      setLastError(msg)
      setMetaKind(kind, { status: 'ERROR', err: msg, rows: 0 })
      // clear parsed outputs to avoid stale data
      if (kind === 'time') setTimeSeries([])
      if (kind === 'topdb') setTopDbAgg([])
      if (kind === 'topresp') setTopRespRows([])
      if (kind === 'txstd') setTxStdRows([])
      if (kind === 'workload') setWorkload(null)
      console.error(e)
    }
  }

  // parse on pick
  React.useEffect(() => {
    if (fTime) parseOne(fTime, 'time')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fTime])
  React.useEffect(() => {
    if (fTopDb) parseOne(fTopDb, 'topdb')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fTopDb])
  React.useEffect(() => {
    if (fTopResp) parseOne(fTopResp, 'topresp')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fTopResp])
  React.useEffect(() => {
    if (fTxStd) parseOne(fTxStd, 'txstd')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fTxStd])
  React.useEffect(() => {
    if (fWorkload) parseOne(fWorkload, 'workload')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fWorkload])

  const doAnalyze = React.useCallback(() => {
    try {
      const rows = joinAll(
        { txStd: txStdRows, topDb: topDbAgg, topResp: topRespRows },
        scoreMode
      )
      setJoined(rows)
      setLastError('')
    } catch (e) {
      setLastError(String(e?.message || e))
    }
  }, [txStdRows, topDbAgg, topRespRows, scoreMode])

  React.useEffect(() => {
    if (!autoAnalyze) return
    if (!canAnalyze) return
    doAnalyze()
  }, [autoAnalyze, canAnalyze, doAnalyze])

  // keyboard: Ctrl+K focus search
  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
      }
      if (e.key === 'Escape' && paletteOpen) {
        e.preventDefault()
        setPaletteOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paletteOpen])

  const filtered = React.useMemo(() => {
    const s = String(searchDeb || '').trim().toUpperCase()
    const dbCut = toNum(dbCutPct, 0)
    const waitCut = toNum(waitCutPct, 0)

    let arr = joined

    if (s) {
      arr = arr.filter(
        (r) =>
          (r.tcode || '').includes(s) ||
          (r.jobNames || '').toUpperCase().includes(s)
      )
    }

    // quick class filter
    if (quickClass !== 'ALL') {
      arr = arr.filter((r) => {
        const ck = String(r.classKey || '')
        const sev = String(r.severity || '')
        if (quickClass === 'EXTREME') return sev === 'EXTREME' || sev === 'SEVERE'
        if (quickClass === 'DBHEAVY') return ck === 'DBHEAVY'
        if (quickClass === 'WAITHEAVY') return ck === 'WAITHEAVY'
        if (quickClass === 'CPUHEAVY') return ck === 'CPUHEAVY'
        if (quickClass === 'DBLEAN') return ck === 'DBLEAN'
        if (quickClass === 'WAITLEAN') return ck === 'WAITLEAN'
        if (quickClass === 'CPULEAN') return ck === 'CPULEAN'
        return true
      })
    }

    if (onlyOffenders) {
      arr = arr.filter((r) => clampPct(r.dbPct) >= dbCut || clampPct(r.waitPct) >= waitCut)
    }

    const dir = sortDir === 'asc' ? 1 : -1
    const get = (r) => {
      if (sortKey === 'tcode') return String(r.tcode || '')
      if (sortKey === 'steps') return toNum(r.steps || 0)
      if (sortKey === 'resp') return toNum(r.respMs || 0)
      if (sortKey === 'db') return toNum(r.dbPct || 0)
      if (sortKey === 'wait') return toNum(r.waitPct || 0)
      return toNum(r._score || 0)
    }

    return [...arr].sort((a, b) => {
      const va = get(a)
      const vb = get(b)
      if (typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb)) * dir
      return (va - vb) * dir
    })
  }, [joined, searchDeb, onlyOffenders, dbCutPct, waitCutPct, sortKey, sortDir, quickClass])

  const deferredFiltered = React.useDeferredValue(filtered)
  const visualRows = React.useMemo(() => {
    if (renderBudget === 'max') return deferredFiltered
    return deferredFiltered.slice(0, 1200)
  }, [deferredFiltered, renderBudget])

  const top10 = React.useMemo(() => visualRows.slice(0, 10), [visualRows])

  const summary = React.useMemo(() => {
    const wl = workload
    return {
      period,
      filesOk,
      parsedOk,
      dialogSteps: wl?.steps || 0,
      avgResp: wl?.respMs || 0,
      avgDb: wl?.dbMs || 0,
      avgRollWait: wl?.rollWaitMs || 0,
      avgCpu: wl?.cpuMs || 0,
      fe: wl?.feNetMs || 0,
      gui: wl?.guiMs || 0,
      offenders: filtered.length,
      totalTcodes: joined.length,
    }
  }, [workload, period, filesOk, parsedOk, filtered.length, joined.length])

  const timeChart = React.useMemo(() => {
    const order = (s) => {
      const m = String(s || '').match(/^(\d{2})/)
      return m ? parseInt(m[1], 10) : 99
    }
    return [...timeSeries]
      .sort((a, b) => order(a.time) - order(b.time))
      .map((r) => ({
        time: String(r.time || '').replace('--', '-'),
        Resp: toNum(r.respMs, 0),
        DB: toNum(r.dbMs, 0),
        RollWait: toNum(r.rollWaitMs, 0),
      }))
  }, [timeSeries])

  const peakHours = React.useMemo(() => {
    const xs = (timeChart || []).filter((r) => r && Number.isFinite(r.Resp))
    if (!xs.length) return []
    return [...xs]
      .sort((a, b) => (b.Resp || 0) - (a.Resp || 0))
      .slice(0, 4)
      .map((r) => {
        const resp = +r.Resp || 0
        const db = +r.DB || 0
        const wait = +r.RollWait || 0
        return {
          label: r.time,
          resp,
          dbPct: resp > 0 ? (db / resp) * 100 : 0,
          waitPct: resp > 0 ? (wait / resp) * 100 : 0,
        }
      })
  }, [timeChart])

  React.useEffect(() => {
    if (tab !== 'DASH') return undefined
    const ids = ['kpis', 'response', 'top10', 'classification', 'samples', 'preview']
    const nodes = ids.map((id) => document.getElementById(`ta-dash-${id}`)).filter(Boolean)
    if (!nodes.length || typeof IntersectionObserver === 'undefined') return undefined

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible?.target?.id) setActiveDashSection(visible.target.id.replace('ta-dash-', ''))
      },
      { root: null, rootMargin: '-165px 0px -55% 0px', threshold: [0.08, 0.18, 0.32] },
    )

    nodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [tab, sideCollapsed, filtered.length, timeChart.length])

  const topImpact = React.useMemo(() => {
    const xs = (visualRows || []).filter(Boolean)
    if (!xs.length) return []
    return xs
      .map((r) => {
        const t = r.tcode || r.TCode || ''
        const resp = toNum(r.respMs, 0)
        const steps = toNum(r.steps, 0)
        const total = toNum(r.totalRespMs, 0) || resp * steps
        return { t, total, resp, steps, r }
      })
      .sort((a, b) => (b.total || 0) - (a.total || 0))
      .slice(0, 8)
  }, [visualRows])

  // Pareto: cumulative impact by Total Response time (ms)
  const pareto = React.useMemo(() => {
    const arr = [...(visualRows || [])]
      .filter((r) => toNum(r.totalRespMs, 0) > 0)
      .sort((a, b) => toNum(b.totalRespMs, 0) - toNum(a.totalRespMs, 0))
      .slice(0, 30)
    const total = arr.reduce((s, r) => s + toNum(r.totalRespMs, 0), 0)
    let run = 0
    return arr.map((r, i) => {
      const v = toNum(r.totalRespMs, 0)
      run += v
      return {
        i: i + 1,
        TCode: r.tcode,
        Total: v,
        CumPct: total > 0 ? (run / total) * 100 : 0,
      }
    })
  }, [visualRows])

  // Impact scatter (trimmed for perf)
  const impact = React.useMemo(() => {
    const arr = [...(visualRows || [])]
      .filter((r) => toNum(r.respMs, 0) > 0 && toNum(r.steps, 0) > 0)
      .sort((a, b) => toNum(b.totalRespMs, 0) - toNum(a.totalRespMs, 0))
      .slice(0, 220)
    return arr.map((r) => ({
      tcode: r.tcode,
      Resp: toNum(r.respMs, 0),
      Steps: toNum(r.steps, 0),
      Impact: toNum(r.totalRespMs, 0),
      cls: r.classKey || '—',
      _raw: r,
    }))
  }, [visualRows])

  const dash = React.useMemo(() => {
    const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0)
    const last = timeChart.length ? timeChart[timeChart.length - 1] : null
    const peak = timeChart.reduce(
      (p, r) => (toNum(r.Resp, 0) > toNum(p.Resp, 0) ? r : p),
      timeChart[0] || { time: '', Resp: 0, DB: 0, RollWait: 0 }
    )

    const respVals = timeChart.map((r) => toNum(r.Resp, 0)).filter((n) => n > 0)
    const avgHourResp = mean(respVals)
    const lastResp = last ? toNum(last.Resp, 0) : 0
    const respDelta = avgHourResp > 0 ? ((lastResp - avgHourResp) / avgHourResp) * 100 : 0

    const overallDbPct = pct(summary.avgDb, summary.avgResp)
    const overallRwPct = pct(summary.avgRollWait, summary.avgResp)
    const lastDbPct = last ? pct(toNum(last.DB, 0), toNum(last.Resp, 0)) : 0
    const lastRwPct = last ? pct(toNum(last.RollWait, 0), toNum(last.Resp, 0)) : 0

    const offShare = joined.length ? (filtered.length / joined.length) * 100 : 0
    const top = filtered[0] || null

    const sparkResp = timeChart.map((r) => ({ t: r.time, v: toNum(r.Resp, 0) }))
    const sparkDbPct = timeChart.map((r) => ({ t: r.time, v: pct(toNum(r.DB, 0), toNum(r.Resp, 0)) }))
    const sparkRwPct = timeChart.map((r) => ({ t: r.time, v: pct(toNum(r.RollWait, 0), toNum(r.Resp, 0)) }))

    return {
      lastTime: last?.time || '',
      peakTime: peak?.time || '',
      peakResp: toNum(peak?.Resp, 0),

      avgHourResp,
      lastResp,
      respDelta,

      overallDbPct,
      overallRwPct,
      lastDbPct,
      lastRwPct,

      offShare,
      top,

      sparkResp,
      sparkDbPct,
      sparkRwPct,
    }
  }, [timeChart, summary.avgDb, summary.avgResp, summary.avgRollWait, joined.length, filtered])

  const parseHourRange = (v) => {
    if (!v) return null
    const t = String(v)
    const parts = t.split('-').map((x) => x.trim()).filter(Boolean)
    const toH = (x) => {
      const mm = String(x).match(/(\d{1,2})/)
      if (!mm) return null
      const n = Math.max(0, Math.min(23, parseInt(mm[1], 10)))
      return n
    }
    const a = toH(parts[0])
    const b = toH(parts[parts.length - 1] || parts[0])
    if (a == null) return null
    const lo = Math.min(a, b == null ? a : b)
    const hi = Math.max(a, b == null ? a : b)
    return { lo, hi }
  }

  const topRespScoped = React.useMemo(() => {
    const arr = [...(topRespRows || [])]
    const rg = parseHourRange(selectedHour)
    if (!rg) return arr
    return arr.filter((r) => {
      const mm = String(r.at || '').match(/\b(\d{2}):/)
      if (!mm) return false
      const hh = parseInt(mm[1], 10)
      return hh >= rg.lo && hh <= rg.hi
    })
  }, [topRespRows, selectedHour])

  const topResp10 = React.useMemo(() => {
    const arr = [...(topRespScoped || [])]
      .sort((a, b) => toNum(b.respMs, 0) - toNum(a.respMs, 0))
      .slice(0, 10)
    return arr
  }, [topRespScoped])

  const exportOffendersCsv = () => {
    const rows = filtered.map((r) => ({
      TCode: r.tcode,
      Steps: Math.round(r.steps || 0),
      AvgRespMs: Math.round(r.respMs || 0),
      AvgDbMs: Math.round(r.dbMs || 0),
      AvgRollWaitMs: Math.round(r.rollWaitMs || r.mainWaitMs || 0),
      AvgCpuMs: Math.round(r.cpuMs || 0),
      DbPct: clampPct(r.dbPct).toFixed(1),
      WaitPct: clampPct(r.waitPct).toFixed(1),
      Hint: r.hint || '',
      JobNames: r.jobNames || '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Offenders')
    XLSX.writeFile(wb, `offenders-${period.toLowerCase()}.csv`, { bookType: 'csv' })
  }

const buildEvidenceText = React.useCallback(() => {
  const now = new Date()
  const lines = []
  lines.push(`ST03N Analyzer (${period}) — ${now.toLocaleString()}`)
  lines.push(`Files: picked ${filesOk}/5 • parsed ${parsedOk}/5`)
  if (fTxStd?.name) lines.push(`Core: ${fTxStd.name}`)
  if (workload) {
    lines.push(
      `Workload(DIALOG): steps=${fmtInt(summary.dialogSteps)} avgResp=${fmtMs(summary.avgResp)} db=${fmtMs(summary.avgDb)} rollWait=${fmtMs(summary.avgRollWait)} cpu=${fmtMs(summary.avgCpu)}`
    )
  }
  lines.push(`Filters: onlyOffenders=${onlyOffenders ? 'Y' : 'N'} dbCut=${dbCutPct}% waitCut=${waitCutPct}% class=${quickClass} sort=${sortKey}/${sortDir}`)
  if (searchDeb) lines.push(`Search: ${searchDeb}`)
  lines.push(`Offenders: ${fmtInt(filtered.length)} of ${fmtInt(joined.length)} tcodes`)
  lines.push('---')
  const top = filtered.slice(0, 10)
  if (!top.length) {
    lines.push('No offenders (or core file missing).')
    return lines.join('\n')
  }
  lines.push(`Top ${top.length}:`)
  top.forEach((r, i) => {
    const parts = [
      `${i + 1}. ${r.tcode}`,
      `score=${fmt1(r._score)}`,
      `resp=${fmtMs(r.respMs)}`,
      `steps=${fmtInt(r.steps)}`,
      `DB%=${fmt1(r.dbPct)}`,
      `Wait%=${fmt1(r.waitPct)}`,
    ]
    if (r.hint) parts.push(`hint=${r.hint}`)
    lines.push(parts.join(' • '))
  })
  return lines.join('\n')
}, [period, filesOk, parsedOk, fTxStd, workload, summary, onlyOffenders, dbCutPct, waitCutPct, quickClass, sortKey, sortDir, searchDeb, filtered, joined])


const buildEvidencePack = React.useCallback(() => {
  const top5 = (filtered || []).slice(0, 5)
  const top10 = (filtered || []).slice(0, 10)
  const safeAvgRespSec = (Number.isFinite(dash?.avgRespSec) && dash.avgRespSec > 0)
    ? dash.avgRespSec
    : (summary?.avgResp ? summary.avgResp / 1000 : 0)

  const safeDialogSteps = (Number.isFinite(dash?.dialogSteps) && dash.dialogSteps > 0)
    ? dash.dialogSteps
    : (summary?.dialogSteps || 0)

  const safeDbPct = (Number.isFinite(dash?.overallDbPct) && dash.overallDbPct > 0)
    ? dash.overallDbPct
    : (summary?.avgResp ? pct(summary.avgDb, summary.avgResp) : 0)

  const safeRollWaitPct = (Number.isFinite(dash?.overallRwPct) && dash.overallRwPct > 0)
    ? dash.overallRwPct
    : (summary?.avgResp ? pct(summary.avgRollWait, summary.avgResp) : 0)

  const clsFromHint = (hint) => String(hint || '').split('(')[0].trim() || '-'

  const spike = (timeSeries || []).reduce((best, r) => {
    if (!r) return best
    const v = toNum(r.respMs, 0)
    return !best || v > best.v ? { h: r.hour, v } : best
  }, null)

  const kpi = [
    `Period: ${period}`,
    `Files: ${filesOk}/5 (parsed ${parsedOk}/5)`,
    `Dialog steps: ${fmtInt(workload?.dialogSteps || 0)}`,
    `Avg resp: ${fmtSec(workload?.avgRespSec || 0)}`,
    `DB%: ${fmt1(workload?.dbPct || 0)}%`,
    `RollWait%: ${fmt1(workload?.rollWaitPct || 0)}%`,
    spike?.h ? `Peak hour: ${spike.h}` : null,
  ].filter(Boolean)

  const topLine = (r) =>
    `${r.tcode} • resp=${fmtMs(r.respMs)} • steps=${fmtInt(r.steps)} • DB%=${fmt1(r.dbPct)} • Wait%=${fmt1(r.waitPct)} • class=${clsFromHint(r.hint)}${r.hint ? ` • hint=${r.hint}` : ''}`

  if (evMode === 'raw') {
    return buildEvidenceText()
  }

  if (evMode === 'mgmt') {
    return [
      'ST03N Performance Evidence (Mgmt)',
      ...kpi,
      '',
      'Top offenders (Top 5):',
      ...top5.map((r, i) => `${i + 1}. ${topLine(r)}`),
      '',
      'Suggested next actions:',
      '• Jika DB% dominan: cek ST04 / expensive SQL / missing index / HANA plan cache',
      '• Jika Wait dominan: cek SM12 (lock), SM50/SM66 (WP), SMGW (RFC), SM21 (syslog)',
      '• Jika CPU dominan: cek ST12/SAT, hotspot ABAP/program',
    ].join('\n')
  }

  // basis
  const dbHeavy = top10.filter((r) => String(r.class || '').toLowerCase().includes('db'))
  const waitHeavy = top10.filter((r) => String(r.class || '').toLowerCase().includes('wait'))
  const cpuHeavy = top10.filter((r) => String(r.class || '').toLowerCase().includes('cpu'))

  return [
    'ST03N Performance Evidence (Basis checklist)',
    ...kpi,
    '',
    'Top 10 offenders:',
    ...top10.map((r, i) => `${i + 1}. ${topLine(r)}`),
    '',
    'Checklist (runbook):',
    dbHeavy.length ? '- DB focus: ST04 (Top SQL), DBACOCKPIT, PlanViz, cek missing index, cek table growth' : null,
    waitHeavy.length ? '- Wait focus: SM12 (lock), SM50/SM66 (WP), SMGW (RFC), enqueues/locks analysis' : null,
    cpuHeavy.length ? '- CPU focus: ST12/SAT trace, cek top programs, cek expensive ABAP' : null,
    '- Cross-check: SM37 (batch job), SM21 (syslog), ST22 (dump), workload spikes vs job window',
  ].filter(Boolean).join('\n')
}, [evMode, filtered, timeSeries, period, filesOk, parsedOk, workload, buildEvidenceText])

const copyEvidence = React.useCallback(async () => {
  const text = buildEvidenceText()
  try {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
    return
  } catch (e) {
    // HTTP / insecure context fallback
    try {
      const el = document.createElement('textarea')
      el.value = text
      el.setAttribute('readonly', '')
      el.style.position = 'fixed'
      el.style.left = '-9999px'
      document.body.appendChild(el)
      el.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(el)
      if (ok) {
        setCopied(true)
        setTimeout(() => setCopied(false), 1400)
        return
      }
    } catch (e2) {
      console.error(e2)
    }
    setLastError('Gagal copy (browser block). Coba pakai HTTPS atau export CSV.')
    console.error(e)
  }
}, [buildEvidenceText])

  const resetAll = () => {
    setFTime(null)
    setFTopDb(null)
    setFTopResp(null)
    setFTxStd(null)
    setFWorkload(null)

    setTimeSeries([])
    setTopDbAgg([])
    setTopRespRows([])
    setTxStdRows([])
    setWorkload(null)

    setJoined([])
    setSelected(null)
    setSearch('')
    setLastError('')
    setFileMeta(makeMetaState())
    setCopied(false)
  }

  const pickSort = (k) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(k)
      setSortDir('desc')
    }
  }

  const selectedKey = selected?.tcode ? String(selected.tcode) : null

  // scroll to selected row (if visible in filtered)
  React.useEffect(() => {
    if (!selected?.tcode) return
    const idx = filtered.findIndex((r) => r.tcode === selected.tcode)
    if (idx < 0) return
    const el = viewportRef.current
    if (!el) return
    const rowH = 42
    const target = idx * rowH
    const pad = rowH * 2
    if (target < el.scrollTop + pad || target > el.scrollTop + el.clientHeight - pad) {
      el.scrollTop = Math.max(0, target - el.clientHeight * 0.25)
    }
  }, [selected?.tcode, filtered])

  const insightCounts = React.useMemo(() => {
    const counts = { DBheavy: 0, Waitheavy: 0, CPUheavy: 0, DBlean: 0, Waitlean: 0, CPUlean: 0, Mixed: 0 }
    for (const r of filtered) {
      const ck = String(r.classKey || '')
      if (ck === 'DBHEAVY') counts.DBheavy++
      else if (ck === 'WAITHEAVY') counts.Waitheavy++
      else if (ck === 'CPUHEAVY') counts.CPUheavy++
      else if (ck === 'DBLEAN') counts.DBlean++
      else if (ck === 'WAITLEAN') counts.Waitlean++
      else if (ck === 'CPULEAN') counts.CPUlean++
      else counts.Mixed++
    }
    return counts
  }, [filtered])


  const topByClass = React.useMemo(() => {
    const by = {
      DBHEAVY: [],
      WAITHEAVY: [],
      CPUHEAVY: [],
      MIXED: [],
      EXTREME: [],
    }
    for (const r of filtered) {
      if (r.severity === 'EXTREME' || r.severity === 'SEVERE') by.EXTREME.push(r)
      const ck = String(r.classKey || 'MIXED')
      if (!by[ck]) by[ck] = []
      by[ck].push(r)
    }
    const sortDesc = (a, b) => (b._score || 0) - (a._score || 0)
    for (const k of Object.keys(by)) by[k] = by[k].slice().sort(sortDesc).slice(0, 6)
    return by
  }, [filtered])

  const actionHints = React.useMemo(() => {
    const total = Math.max(1, filtered.length)
    const db = insightCounts.DBheavy + insightCounts.DBlean
    const wt = insightCounts.Waitheavy + insightCounts.Waitlean
    const cpu = insightCounts.CPUheavy + insightCounts.CPUlean
    const mixed = insightCounts.Mixed
    const top = [
      { k: 'DB focus', v: db, sub: 'ST04 / expensive SQL / missing index / plan cache' },
      { k: 'Wait focus', v: wt, sub: 'SM12 lock / SM50 WP / RFC / enqueue' },
      { k: 'CPU focus', v: cpu, sub: 'SAT/SE30 sampling / code hotspots / internal table' },
      { k: 'Mixed', v: mixed, sub: 'GUI/network/others — validate per row detail' },
    ].sort((a,b)=>b.v-a.v)
    const pick = top.slice(0,3).map(x => ({...x, pct: Math.round((x.v/total)*100)}))
    return pick
  }, [filtered, insightCounts])

  const cols = React.useMemo(
    () => [
      { id: 'idx', label: '#', w: 54, sticky: true, align: 'r', render: (_r, idx) => idx + 1 },
      { id: 'tcode', label: 'TCode', w: 210, sticky: true, mono: true, render: (r) => r.tcode },
      { id: 'steps', label: 'Steps', w: 96, align: 'r', render: (r) => fmtInt(r.steps) },
      { id: 'score', label: 'Score', w: 120, align: 'r', render: (r) => <span title={r.scoreLabel ? `${r.scoreLabel}: ${fmtMs(r._score)}` : ''}>{fmtMs(r._score)}</span> },
      { id: 'resp', label: 'AvgResp', w: 110, align: 'r', render: (r) => { const ms = toMs(r.respMs); return <span title={ms != null ? `${fmtMs(ms)}` : ''}>{fmtMs(r.respMs)}</span>; } },
      { id: 'db', label: 'DB', w: 110, align: 'r', render: (r) => { const ms = toMs(r.dbMs); return <span title={ms != null ? `${fmtMs(ms)}` : ''}>{fmtMs(r.dbMs)}</span>; } },
      { id: 'rw', label: 'RollWait', w: 120, align: 'r', render: (r) => { const v = (r.rollWaitMs || r.mainWaitMs); const ms = toMs(v); return <span title={ms != null ? `${fmtMs(ms)}` : ''}>{fmtMs(v)}</span>; } },
      { id: 'cpu', label: 'CPU', w: 100, align: 'r', render: (r) => { const ms = toMs(r.cpuMs); return <span title={ms != null ? `${fmtMs(ms)}` : ''}>{fmtMs(r.cpuMs)}</span>; } },
      { id: 'dbpct', label: 'DB%', w: 92, render: (r) => <RiskChip value={r.dbPct} kind="db" /> },
      { id: 'waitpct', label: 'RollWait%', w: 112, render: (r) => <RiskChip value={r.waitPct} kind="wait" /> },
      { id: 'class', label: 'Class', w: 180, render: (r) => <ClassChip classKey={r.classKey} severity={r.severity} /> },
      { id: 'hint', label: 'Hint', flex: 1, ellipsis: true, render: (r) => r.hint || '' },
    ],
    []
  )


  const dashCols = React.useMemo(
    () => [
      { id: 'idx', label: '#', w: 54, sticky: true, align: 'r', render: (_r, idx) => idx + 1 },
      { id: 'tcode', label: 'TCode', w: 220, sticky: true, mono: true, render: (r) => r.tcode },
      { id: 'resp', label: 'AvgResp', w: 120, align: 'r', render: (r) => { const ms = toMs(r.respMs); return <span title={ms != null ? `${fmtMs(ms)}` : ''}>{fmtMs(r.respMs)}</span>; } },
      { id: 'score', label: 'Score', w: 120, align: 'r', render: (r) => <span title={r.scoreLabel ? `${r.scoreLabel}: ${fmtMs(r._score)}` : ''}>{fmtMs(r._score)}</span> },
      { id: 'dbpct', label: 'DB%', w: 92, render: (r) => <RiskChip value={r.dbPct} kind="db" /> },
      { id: 'waitpct', label: 'RollWait%', w: 112, render: (r) => <RiskChip value={r.waitPct} kind="wait" /> },
      { id: 'class', label: 'Class', w: 180, render: (r) => <ClassChip classKey={r.classKey} severity={r.severity} /> },
      { id: 'steps', label: 'Steps', w: 96, align: 'r', render: (r) => fmtInt(r.steps) },
      { id: 'score', label: 'Score', w: 120, align: 'r', render: (r) => <span title={r.scoreLabel ? `${r.scoreLabel}: ${fmtMs(r._score)}` : ''}>{fmtMs(r._score)}</span> },
      { id: 'hint', label: 'Hint', flex: 1, ellipsis: true, render: (r) => r.hint || '' },
    ],
    []
  );

  const missingCore = !canAnalyze ? 'Upload "Transaction Profile (Std)" dulu (ini core untuk ranking).' : ''



  const paletteItems = React.useMemo(() => {
    const q = String(paletteQuery || '').trim().toLowerCase()
    const base = [
      { key: 'tab_dash', title: 'Go: Dashboard', sub: 'Tab', run: () => setTab('DASH') },
      { key: 'tab_off', title: 'Go: Offenders', sub: 'Tab', run: () => setTab('OFFENDERS') },
      { key: 'tab_charts', title: 'Go: Charts', sub: 'Tab', run: () => setTab('CHARTS') },
      { key: 'tab_ins', title: 'Go: Insights', sub: 'Tab', run: () => setTab('INSIGHTS') },

      { key: 'p_day', title: 'Period: DAY', sub: 'Filter', run: () => setPeriod('DAY') },
      { key: 'p_week', title: 'Period: WEEK', sub: 'Filter', run: () => setPeriod('WEEK') },
      { key: 'p_month', title: 'Period: MONTH', sub: 'Filter', run: () => setPeriod('MONTH') },

      { key: 'qc_all', title: 'Quick class: All', sub: 'Filter', run: () => setQuickClass('ALL') },
      { key: 'qc_ext', title: 'Quick class: Extreme/Severe', sub: 'Filter', run: () => setQuickClass('EXTREME') },
      { key: 'qc_db', title: 'Quick class: DB-heavy', sub: 'Filter', run: () => setQuickClass('DBHEAVY') },
      { key: 'qc_wait', title: 'Quick class: Wait-heavy', sub: 'Filter', run: () => setQuickClass('WAITHEAVY') },
      { key: 'qc_cpu', title: 'Quick class: CPU-heavy', sub: 'Filter', run: () => setQuickClass('CPUHEAVY') },

      { key: 'toggle_side', title: sideCollapsed ? 'Show panel' : 'Hide panel', sub: 'UI', run: () => setSideCollapsed((v) => !v) },
      { key: 'toggle_aa', title: autoAnalyze ? 'Auto analyze: OFF' : 'Auto analyze: ON', sub: 'UI', run: () => setAutoAnalyze((v) => !v) },

      { key: 'ev_mgmt', title: 'Evidence pack: Mgmt', sub: 'Export', run: () => { setEvMode('mgmt'); setEvOpen(true) } },
      { key: 'ev_basis', title: 'Evidence pack: Basis', sub: 'Export', run: () => { setEvMode('basis'); setEvOpen(true) } },
      { key: 'ev_raw', title: 'Evidence: Raw', sub: 'Export', run: () => { setEvMode('raw'); setEvOpen(true) } },

      { key: 'export_csv', title: 'Export CSV (offenders)', sub: 'Export', run: () => exportOffendersCsv() },
      { key: 'reset', title: 'Reset', sub: 'Action', run: () => resetAll() },
      { key: 'focus_search', title: 'Focus search', sub: 'Action', run: () => searchRef.current?.focus() },
      { key: 'clear_search', title: 'Clear search', sub: 'Action', run: () => setSearch('') },
    ]

    const dyn = q && q.length >= 2
      ? [{ key: 'search:' + q, title: `Search: ${q.toUpperCase()}`, sub: 'Set search filter', run: () => { setSearch(q.toUpperCase()); setTab('OFFENDERS') } }]
      : []

    const all = [...dyn, ...base]
    if (!q) return all
    return all.filter((it) => (it.title + ' ' + (it.sub || '')).toLowerCase().includes(q))
  }, [paletteQuery, sideCollapsed, autoAnalyze, exportOffendersCsv, resetAll])

  return (
    <div className="tool-analyzer" data-build={TOOL_ANALYZER_BUILD_STAMP}>
      <div className={`ta-app ${sideCollapsed ? 'is-side-collapsed' : ''}`}>
        {/* Topbar (always visible) */}
        <div className="ta-topbar">
          <div className="ta-topbar__left">
            <div className="ta-brand">
              <div className="ta-brand__title">Tool Analyzer — ST03N</div>
              <div className="ta-brand__sub">
                Workbench mode • Table internal scroll • Virtual rows • Ctrl+K search
              </div>
            </div>
          </div>

          <div className="ta-topbar__mid">
            <div className="ta-topPills">
              {['DAY', 'WEEK', 'MONTH'].map((p) => (
                <Pill key={p} active={period === p} onClick={() => setPeriod(p)}>
                  {p}
                </Pill>
              ))}
              <Pill
                active={autoAnalyze}
                onClick={() => setAutoAnalyze((v) => !v)}
                title="Auto analyze ketika file berubah"
              >
                Auto {autoAnalyze ? 'ON' : 'OFF'}
              </Pill>
              <Pill
                active={!sideCollapsed}
                onClick={() => setSideCollapsed((v) => !v)}
                title="Hide/show sidebar"
              >
                {sideCollapsed ? 'Show panel' : 'Hide panel'}
              </Pill>
              <Pill
                active={renderBudget === 'max'}
                onClick={() => setRenderBudget((v) => (v === 'fast' ? 'max' : 'fast'))}
                title="Fast limits heavy charts; Max keeps the virtual table full and lets visuals inspect more rows"
              >
                Render {renderBudget === 'fast' ? 'Fast' : 'Max'}
              </Pill>
            </div>
          </div>

          <div className="ta-topbar__right">
            <button className="ta-btn ta-btn--primary" onClick={doAnalyze} disabled={!canAnalyze}>
              Analyze
            </button>
            <button className="ta-btn" onClick={exportOffendersCsv} disabled={!filtered.length}>
              Export CSV
            </button>
            <button className="ta-btn" onClick={() => setEvOpen(true)} disabled={!filtered.length}>
              Evidence pack
            </button>
            <button className="ta-btn ta-btn--ghost" onClick={resetAll}>
              Reset
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="ta-body">
          {/* Sidebar */}
          <aside className="ta-side">
            <div className="ta-panel">
              <div className="ta-panel__head">
                <div>
                  <div className="ta-panel__title">Snapshot</div>
                  <div className="ta-panel__sub">
                    KPI cepat (Workload DIALOG kalau ada).
                  </div>
                </div>
              </div>

              <div className="ta-panel__body ta-kpiStack">
                <div className="ta-kpiRow">
                  <Stat label="Files" value={`${filesOk}/5`} sub={`parsed ${parsedOk}/5 • time, db, resp, tx, wl`} />
                  <Stat label="Offenders" value={fmtInt(summary.offenders)} sub={`of ${fmtInt(summary.totalTcodes)} tcodes`} tone="warn" />
                </div>
                <div className="ta-kpiRow">
                  <Stat label="Avg Resp" value={fmtMs(summary.avgResp)} sub={`${fmtInt(summary.dialogSteps)} steps`} />
                  <Stat label="DB %" value={`${fmt1(pct(summary.avgDb, summary.avgResp))}%`} sub={fmtMs(summary.avgDb)} />
                </div>
                <div className="ta-kpiRow">
                  <Stat label="RollWait %" value={`${fmt1(pct(summary.avgRollWait, summary.avgResp))}%`} sub={fmtMs(summary.avgRollWait)} tone="warn" />
                  <Stat label="CPU" value={fmtMs(summary.avgCpu)} sub="avg cpu/step" />
                </div>
              </div>
            </div>

            {lastError ? (
              <div className="ta-alert">
                <div className="ta-alert__title">Parse / analyze error</div>
                <div className="ta-alert__msg">{lastError}</div>
              </div>
            ) : null}

            {missingCore ? (
              <div className="ta-alert ta-alert--info">
                <div className="ta-alert__title">Core file required</div>
                <div className="ta-alert__msg">{missingCore}</div>
              </div>
            ) : null}

            <div className="ta-panel">
              <div className="ta-panel__head">
                <div>
                  <div className="ta-panel__title">Upload exports</div>
                  <div className="ta-panel__sub">Click / drop file. (XLSX English header recommended)</div>
                </div>
              </div>
              <div className="ta-panel__body">
                <div className="ta-dropGrid">
                  <DropTile title="1) Time Profile" hint="Chart per jam" file={fTime} meta={fileMeta.time} onPick={setFTime} onClear={() => clearSlot('time')} />
                  <DropTile title="2) Top DB Accesses" hint="IO proxy" file={fTopDb} meta={fileMeta.topdb} onPick={setFTopDb} onClear={() => clearSlot('topdb')} />
                  <DropTile title="3) Top Response Time" hint="sample peak" file={fTopResp} meta={fileMeta.topresp} onPick={setFTopResp} onClear={() => clearSlot('topresp')} />
                  <DropTile title="4) Transaction Profile (Std)" hint="weighted avg (core)" required file={fTxStd} meta={fileMeta.txstd} onPick={setFTxStd} onClear={() => clearSlot('txstd')} />
                  <DropTile title="5) Workload Overview" hint="headline KPI" file={fWorkload} meta={fileMeta.workload} onPick={setFWorkload} onClear={() => clearSlot('workload')} />
                </div>
              </div>
            </div>

            <div className="ta-panel">
              <div className="ta-panel__head">
                <div>
                  <div className="ta-panel__title">Filters & scoring</div>
                  <div className="ta-panel__sub">Cepat highlight pain point.</div>
                </div>
              </div>

              <div className="ta-panel__body ta-form">
                <div className="ta-field">
                  <label>Score mode</label>
                  <div className="ta-fieldRow ta-fieldRow--tight">
                    <span className="ta-muted">Density</span>
                    <div className="ta-chipRow">
                      <Pill active={density === 'cozy'} onClick={() => setDensity('cozy')}>Cozy</Pill>
                      <Pill active={density === 'compact'} onClick={() => setDensity('compact')}>Compact</Pill>
                    </div>
                  </div>
                  <select value={scoreMode} onChange={(e) => setScoreMode(e.target.value)} className="ta-select">
                    <option value="avg">AvgResp (ms)</option>
                    <option value="impact">Impact (AvgResp × logSteps)</option>
                    <option value="total">TotalResp (ms)</option>
                  </select>
                </div>

                <div className="ta-fieldRow">
                  <div className="ta-field">
                    <label>DB ≥ (%)</label>
                    <input
                      className="ta-input"
                      value={dbCutPct}
                      onChange={(e) => setDbCutPct(toNum(e.target.value, 0))}
                      inputMode="decimal"
                    />
                  </div>
                  <div className="ta-field">
                    <label>RollWait ≥ (%)</label>
                    <input
                      className="ta-input"
                      value={waitCutPct}
                      onChange={(e) => setWaitCutPct(toNum(e.target.value, 0))}
                      inputMode="decimal"
                    />
                  </div>
                </div>

                <div className="ta-field">
                  <label>Search (TCode / Job) — Ctrl+K</label>
                  <input
                    ref={searchRef}
                    className="ta-input"
                    placeholder="VA02, /SCWM/, Z* ..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>

                <div className="ta-field">
                  <label>Quick class</label>
                  <div className="ta-chipRow">
                    {[
                      ['ALL', 'All'],
                      ['EXTREME', 'Extreme/Severe'],
                      ['DBHEAVY', 'DB-heavy'],
                      ['WAITHEAVY', 'Wait-heavy'],
                      ['CPUHEAVY', 'CPU-heavy'],
                      ['DBLEAN', 'DB leaning'],
                      ['WAITLEAN', 'Wait leaning'],
                      ['CPULEAN', 'CPU leaning'],
                    ].map(([k, t]) => (
                      <Pill key={k} active={quickClass === k} onClick={() => setQuickClass(k)}>
                        {t}
                      </Pill>
                    ))}
                  </div>
                </div>

                <div className="ta-fieldRow">
                  <label className="ta-check">
                    <input
                      type="checkbox"
                      checked={onlyOffenders}
                      onChange={(e) => setOnlyOffenders(e.target.checked)}
                    />
                    <span>Only offenders (threshold)</span>
                  </label>

                  <div className="ta-mini">
                    <span className="ta-mini__k">Tcodes</span>
                    <span className="ta-mini__v">{fmtInt(summary.totalTcodes)}</span>
                  </div>
                </div>

                <div className="ta-fieldRow">
                  <button className="ta-btn ta-btn--primary" onClick={doAnalyze} disabled={!canAnalyze}>
                    Analyze now
                  </button>
                  <button className="ta-btn" onClick={exportOffendersCsv} disabled={!filtered.length}>
                    Export CSV
                  </button>
                </div>

                <div className="ta-divider" />

                <div className="ta-field">
                  <label>Saved views</label>
                  <div className="ta-fieldRow">
                    <button
                      className="ta-btn"
                      onClick={() => {
                        const name = window.prompt('Nama view (mis. DB-heavy severe):')
                        if (!name) return
                        const payload = {
                          name,
                          state: {
                            period,
                            tab,
                            scoreMode,
                            dbCutPct,
                            waitCutPct,
                            onlyOffenders,
                            quickClass,
                            sortKey,
                            sortDir,
                            search,
                            sideCollapsed,
                            autoAnalyze,
                          },
                          savedAt: Date.now(),
                        }
                        const next = [payload, ...savedViews.filter((v) => v.name !== name)].slice(0, 30)
                        setSavedViews(next)
                        storeSavedViews(next)
                      }}
                    >
                      Save current
                    </button>
                    <button
                      className="ta-btn"
                      disabled={!savedViews.length}
                      onClick={() => {
                        const name = window.prompt(
                          'Ketik nama view yang mau dipakai:\n' + savedViews.map((v) => `- ${v.name}`).join('\n')
                        )
                        if (!name) return
                        const found = savedViews.find((v) => v.name === name)
                        if (!found) return
                        const s = found.state || {}
                        if (s.period) setPeriod(s.period)
                        if (s.tab) setTab(s.tab)
                        if (s.scoreMode) setScoreMode(s.scoreMode)
                        if (s.dbCutPct != null) setDbCutPct(s.dbCutPct)
                        if (s.waitCutPct != null) setWaitCutPct(s.waitCutPct)
                        if (s.onlyOffenders != null) setOnlyOffenders(!!s.onlyOffenders)
                        if (s.quickClass) setQuickClass(s.quickClass)
                        if (s.sortKey) setSortKey(s.sortKey)
                        if (s.sortDir) setSortDir(s.sortDir)
                        if (s.search != null) setSearch(s.search)
                        if (s.sideCollapsed != null) setSideCollapsed(!!s.sideCollapsed)
                        if (s.autoAnalyze != null) setAutoAnalyze(!!s.autoAnalyze)
                      }}
                    >
                      Load…
                    </button>
                    <button
                      className="ta-btn ta-btn--ghost"
                      disabled={!savedViews.length}
                      onClick={() => {
                        const name = window.prompt(
                          'Ketik nama view yang mau dihapus:\n' + savedViews.map((v) => `- ${v.name}`).join('\n')
                        )
                        if (!name) return
                        const next = savedViews.filter((v) => v.name !== name)
                        setSavedViews(next)
                        storeSavedViews(next)
                      }}
                    >
                      Delete…
                    </button>
                  </div>
                  <div className="ta-help">Tip: view juga kebawa URL (copy link untuk share).</div>
                </div>

              </div>
            </div>
          </aside>

          {/* Main */}
          <main className="ta-main">
            <div className="ta-mainHead">
              <div className="ta-tabs">
                <button className={`ta-tab ${tab === 'DASH' ? 'is-active' : ''}`} onClick={() => setTab('DASH')}>
                  Dashboard
                </button>
                <button className={`ta-tab ${tab === 'OFFENDERS' ? 'is-active' : ''}`} onClick={() => setTab('OFFENDERS')}>
                  Offenders
                </button>
                <button className={`ta-tab ${tab === 'CHARTS' ? 'is-active' : ''}`} onClick={() => setTab('CHARTS')}>
                  Charts
                </button>
                <button className={`ta-tab ${tab === 'INSIGHTS' ? 'is-active' : ''}`} onClick={() => setTab('INSIGHTS')}>
                  Insights
                </button>
              </div>

              <div className="ta-mainMeta">
                <span className="ta-badge">Period: {period}</span>
                <span className="ta-badge">Files: {filesOk}/5</span>
                <span className="ta-badge">Parsed: {parsedOk}/5</span>
                <span className="ta-badge warn">Offenders: {fmtInt(summary.offenders)}</span>
                <span className="ta-badge">Sort: {sortKey} {sortDir === 'asc' ? '↑' : '↓'}</span>
              </div>
            </div>


            <FilterChips
              items={[
                quickClass && quickClass !== 'ALL'
                  ? { key: 'qc', label: 'Class', value: quickClass, tone: 'is-warn', onClear: () => setQuickClass('ALL') }
                  : null,
                search
                  ? { key: 'q', label: 'Search', value: search, onClear: () => setSearch('') }
                  : null,
                onlyOffenders
                  ? { key: 'only', label: 'Only', value: 'threshold', tone: 'is-warn', onClear: () => setOnlyOffenders(false) }
                  : null,
                dbCutPct != null
                  ? { key: 'dbcut', label: 'DB≥', value: `${dbCutPct}%`, onClick: () => setTab('OFFENDERS') }
                  : null,
                waitCutPct != null
                  ? { key: 'wcut', label: 'Wait≥', value: `${waitCutPct}%`, onClick: () => setTab('OFFENDERS') }
                  : null,
                selectedHour
                  ? { key: 'hr', label: 'Hour', value: selectedHour, tone: 'is-ok', onClear: () => setSelectedHour(null) }
                  : null,
              ]}
            />


            {/* DASHBOARD TAB */}
            {tab === 'DASH' ? (
              <div className="ta-fill ta-dash">
                {canAnalyze ? (
                  <nav className="ta-dashNav" aria-label="Dashboard sections">
                    {[
                      ['kpis', 'KPI'],
                      ['response', 'Response'],
                      ['top10', 'Top 10'],
                      ['classification', 'Class'],
                      ['samples', 'Samples'],
                      ['preview', 'Preview'],
                    ].map(([id, label]) => (
                      <a key={id} className={activeDashSection === id ? 'is-active' : ''} href={`#ta-dash-${id}`}>
                        {label}
                      </a>
                    ))}
                  </nav>
                ) : null}

                {!canAnalyze ? (
                  <section className="ta-panel ta-emptyWorkbench">
                    <div className="ta-emptyWorkbench__hero">
                      <div>
                        <div className="ta-emptyWorkbench__eyebrow">ST03N Analyzer</div>
                        <h2>Upload Transaction Profile untuk mulai ranking offender.</h2>
                        <p>
                          Dashboard akan aktif setelah file core terbaca. File lain bisa ditambahkan untuk memperkaya grafik,
                          evidence pack, DB profile, dan peak response sample.
                        </p>
                      </div>
                      <div className="ta-emptyWorkbench__actions">
                        {sideCollapsed ? (
                          <button className="ta-btn ta-btn--primary" type="button" onClick={() => setSideCollapsed(false)}>
                            Show upload panel
                          </button>
                        ) : null}
                        <button className="ta-btn" type="button" onClick={() => setAutoAnalyze(true)}>
                          Auto analyze ON
                        </button>
                        <button className="ta-btn ta-btn--ghost" type="button" onClick={() => setTab('INSIGHTS')}>
                          View insights guide
                        </button>
                      </div>
                    </div>

                    <div className="ta-emptyWorkbench__grid">
                      {[
                        ['txstd', 'Transaction Profile (Std)', 'Required core ranking', true],
                        ['time', 'Time Profile', 'Response trend by hour', false],
                        ['topdb', 'Top DB Accesses', 'DB expensive access proxy', false],
                        ['topresp', 'Top Response Time', 'Peak response evidence', false],
                        ['workload', 'Workload Overview', 'Headline KPI baseline', false],
                      ].map(([kind, title, hint, required]) => {
                        const meta = fileMeta?.[kind] || META0
                        const ok = meta.status === 'OK'
                        const parsing = meta.status === 'PARSING'
                        const error = meta.status === 'ERROR'
                        return (
                          <div key={kind} className={`ta-emptySlot ${ok ? 'is-ok' : ''} ${parsing ? 'is-parsing' : ''} ${error ? 'is-error' : ''}`}>
                            <div className="ta-emptySlot__status">{ok ? 'OK' : parsing ? 'Parsing' : error ? 'Error' : required ? 'Required' : 'Optional'}</div>
                            <div className="ta-emptySlot__title">{title}</div>
                            <div className="ta-emptySlot__hint">{hint}</div>
                            <div className="ta-emptySlot__meta">
                              {ok ? `${fmtInt(meta.rows || 0)} rows` : error ? meta.err || 'Parse failed' : 'Drop/click file di panel kiri'}
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <div className="ta-emptyWorkbench__flow">
                      <div className="ta-emptyStep">
                        <span>1</span>
                        <div>
                          <b>Upload core</b>
                          <p>Transaction Profile (Std) wajib untuk membentuk daftar TCode dan skor.</p>
                        </div>
                      </div>
                      <div className="ta-emptyStep">
                        <span>2</span>
                        <div>
                          <b>Tambah context</b>
                          <p>Time, Top DB, Top Response, dan Workload akan mengisi trend, sample, dan KPI.</p>
                        </div>
                      </div>
                      <div className="ta-emptyStep">
                        <span>3</span>
                        <div>
                          <b>Analyze & export</b>
                          <p>Setelah parsed, dashboard, offenders table, CSV, dan evidence pack siap dipakai.</p>
                        </div>
                      </div>
                    </div>
                  </section>
                ) : (
                  <>
                <div className="ta-dashKpis" id="ta-dash-kpis">
                  <KpiCard
                    label="Avg Resp"
                    value={fmtMs(summary.avgResp)}
                    sub={dash.peakTime ? `Peak ${dash.peakTime}: ${fmtMs(dash.peakResp)}` : `${fmtInt(summary.dialogSteps)} steps`}
                    delta={
                      dash.respDelta
                        ? `Δ ${dash.respDelta >= 0 ? '+' : ''}${fmt1(dash.respDelta)}% vs avg hour`
                        : null
                    }
                    spark={{ data: dash.sparkResp, dataKey: 'v', stroke: 'var(--c-primary)' }}
                  />
                  <KpiCard
                    label="DB %"
                    value={`${fmt1(dash.overallDbPct)}%`}
                    sub={dash.lastTime ? `Last ${dash.lastTime}: ${fmt1(dash.lastDbPct)}%` : `${fmtMs(summary.avgDb)}`}
                    delta={dash.lastTime ? `Δ ${fmt1(dash.lastDbPct - dash.overallDbPct)}%pt` : null}
                    spark={{ data: dash.sparkDbPct, dataKey: 'v', stroke: 'var(--c-db)' }}
                    tone={dash.overallDbPct >= 40 ? 'warn' : ''}
                  />
                  <KpiCard
                    label="RollWait %"
                    value={`${fmt1(dash.overallRwPct)}%`}
                    sub={dash.lastTime ? `Last ${dash.lastTime}: ${fmt1(dash.lastRwPct)}%` : `${fmtMs(summary.avgRollWait)}`}
                    delta={dash.lastTime ? `Δ ${fmt1(dash.lastRwPct - dash.overallRwPct)}%pt` : null}
                    spark={{ data: dash.sparkRwPct, dataKey: 'v', stroke: 'var(--c-wait)' }}
                    tone={dash.overallRwPct >= 30 ? 'warn' : ''}
                  />
                  <KpiCard
                    label="Offenders"
                    value={fmtInt(filtered.length)}
                    sub={`Share ${fmt1(dash.offShare)}% • of ${fmtInt(joined.length)} tcodes`}
                    spark={{ data: dash.sparkResp, dataKey: 'v', stroke: 'rgba(226,232,240,.55)' }}
                    onClick={() => setTab('OFFENDERS')}
                    title="Open offenders table"
                  />
                  <KpiCard
                    label="Dialog steps"
                    value={fmtInt(summary.dialogSteps)}
                    sub={`Avg CPU/step: ${fmtMs(summary.avgCpu)}`}
                    spark={{ data: dash.sparkResp, dataKey: 'v', stroke: 'rgba(226,232,240,.55)' }}
                  />
                  <KpiCard
                    label="Top offender"
                    value={dash.top?.tcode ? <span className="mono">{dash.top.tcode}</span> : '—'}
                    sub={
                      dash.top
                        ? `AvgResp ${fmtMs(dash.top.respMs)} • DB ${fmt1(clampPct(dash.top.dbPct))}% • Wait ${fmt1(clampPct(dash.top.waitPct))}%`
                        : '—'
                    }
                    onClick={() => {
                      if (!dash.top) return
                      setSearch(dash.top.tcode)
                      setTab('OFFENDERS')
                      setSelected(dash.top)
                    }}
                    title="Jump to the top offender"
                  />
                </div>

                <div className="ta-dashGrid">
                  <section className="ta-panel ta-panel--fill ta-dashWide" id="ta-dash-response">
                    <div className="ta-panel__head">
                      <div className="ta-panel__title">Response time by hour</div>
                      <div className="ta-panel__sub">Compare Resp vs DB vs RollWait (Time Profile).</div>
                    </div>
                    <div className="ta-panel__body ta-chartBody">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={timeChart} onClick={(e) => { if (e?.activeLabel) { setSelectedHour(String(e.activeLabel)); setTab('DASH'); } }}>
                          <CartesianGrid stroke="rgba(148,163,184,.18)" strokeDasharray="4 4" />
                          <XAxis dataKey="time" tick={{ fill: 'rgba(226,232,240,.75)', fontSize: 11 }} />
                          <YAxis tick={{ fill: 'rgba(226,232,240,.75)', fontSize: 11 }} />
                          <Tooltip
                            contentStyle={{ background: 'rgba(2,6,23,.95)', border: '1px solid rgba(148,163,184,.28)' }}
                            labelStyle={{ color: 'rgba(226,232,240,.9)' }}
                          />
                          <Legend />
                          <Line type="monotone" dataKey="Resp" stroke="#38bdf8" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="DB" stroke="#a78bfa" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="RollWait" stroke="#fb7185" strokeWidth={2} dot={false} />
                          <Brush
                            dataKey="time"
                            height={18}
                            stroke="rgba(148,163,184,.45)"
                            travellerWidth={10}
                            onChange={(r) => {
                              if (!r) return
                              const a = timeChart?.[r.startIndex]?.time
                              const b = timeChart?.[r.endIndex]?.time
                              if (a && b) setSelectedHour(`${String(a).slice(0,2)}-${String(b).slice(0,2)}`)
                            }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </section>

                  <section className="ta-panel ta-panel--fill" id="ta-dash-top10">
                    <div className="ta-panel__head">
                      <div className="ta-panel__title">Top 10 offenders</div>
                      <div className="ta-panel__sub">Based on current filter/sort.</div>
                    </div>
                    <div className="ta-panel__body ta-chartBody">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={top10.map((r) => ({
                            TCode: r.tcode,
                            Resp: r.respMs,
                            DBpct: clampPct(r.dbPct),
                            Waitpct: clampPct(r.waitPct),
                          }))}                        >
                          <CartesianGrid stroke="rgba(148,163,184,.18)" strokeDasharray="4 4" />
                          <XAxis
                            dataKey="TCode"
                            tick={{ fill: 'rgba(226,232,240,.75)', fontSize: 10 }}
                            interval={0}
                            angle={-20}
                            textAnchor="end"
                            height={60}
                          />
                          <YAxis tick={{ fill: 'rgba(226,232,240,.75)', fontSize: 11 }} />
                          <Tooltip
                            contentStyle={{ background: 'rgba(2,6,23,.95)', border: '1px solid rgba(148,163,184,.28)' }}
                            labelStyle={{ color: 'rgba(226,232,240,.9)' }}
                          />
                          <Legend />
                          <Bar dataKey="Resp" fill="#38bdf8" name="AvgResp (ms)" />
                          <Bar dataKey="DBpct" fill="#a78bfa" name="DB%" />
                          <Bar dataKey="Waitpct" fill="#fb7185" name="RollWait%" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </section>

                  <section className="ta-panel ta-panel--fill" id="ta-dash-classification">
                    <div className="ta-panel__head">
                      <div className="ta-panel__title">Classification</div>
                      <div className="ta-panel__sub">Rows after filter (hint buckets).</div>
                    </div>
                    <div className="ta-panel__body ta-chartBody">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={[
                            { k: 'DB-heavy', v: insightCounts.DBheavy },
                            { k: 'Wait-heavy', v: insightCounts.Waitheavy },
                            { k: 'CPU-heavy', v: insightCounts.CPUheavy },
                            { k: 'DB lean', v: insightCounts.DBlean },
                            { k: 'Wait lean', v: insightCounts.Waitlean },
                            { k: 'CPU lean', v: insightCounts.CPUlean },
                            { k: 'Mixed', v: insightCounts.Mixed },
                          ]}
                        >
                          <CartesianGrid stroke="rgba(148,163,184,.18)" strokeDasharray="4 4" />
                          <XAxis dataKey="k" tick={{ fill: 'rgba(226,232,240,.75)', fontSize: 11 }} interval={0} />
                          <YAxis tick={{ fill: 'rgba(226,232,240,.75)', fontSize: 11 }} />
                          <Tooltip
                            contentStyle={{ background: 'rgba(2,6,23,.95)', border: '1px solid rgba(148,163,184,.28)' }}
                            labelStyle={{ color: 'rgba(226,232,240,.9)' }}
                          />
                          <Bar dataKey="v" fill="#38bdf8" name="Count" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </section>

                  <section className="ta-panel ta-panel--fill" id="ta-dash-samples">
                    <div className="ta-panel__head ta-panel__head--row">
                      <div>
                        <div className="ta-panel__title">Top Response samples</div>
                        <div className="ta-panel__sub">From "Top Response Time" export (peak evidence). {selectedHour ? (<><span className="ta-badge">Hour: {selectedHour}</span> <button className="ta-btn ta-btn--ghost ta-btn--xs" onClick={() => setSelectedHour(null)}>Clear</button></>) : null}</div>
                      </div>
                      <button
                        className="ta-btn ta-btn--ghost"
                        onClick={() => {
                          if (!topResp10.length) return
                          const t = topResp10[0].tcode
                          if (t) {
                            setSearch(t)
                            setTab('OFFENDERS')
                          }
                        }}
                        disabled={!topResp10.length}
                        title="Jump to #1 Top Response sample"
                      >
                        Jump
                      </button>
                    </div>
                    <div className="ta-panel__body ta-miniList">
                      {topResp10.length ? (
                        topResp10.map((r, i) => (
                          <div key={`${r.tcode}-${r.at}-${i}`} className="ta-miniRow">
                            <div className="ta-miniRow__main">
                              <div className="ta-miniRow__title">
                                <span className="mono">{r.tcode}</span>
                                <span className="ta-muted"> • {r.at || r.task || '—'}</span>
                              </div>
                              <div className="ta-miniRow__sub ta-muted">
                                Resp <b>{fmtMs(r.respMs)}</b> • DB <b>{fmt1(clampPct(r.dbPct))}%</b> • Wait <b>{fmt1(clampPct(r.waitPct))}%</b>
                                {r.user ? <span> • user {r.user}</span> : null}
                              </div>
                            </div>
                            <div className="ta-miniRow__chips">
                              <RiskChip value={r.dbPct} kind="db" />
                              <RiskChip value={r.waitPct} kind="wait" />
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="ta-empty">Upload "Top Response Time" untuk melihat sample peak.</div>
                      )}
                    </div>
                  </section>

                  <section className="ta-panel ta-panel--fill ta-dashSpan2" id="ta-dash-preview">
                    <div className="ta-panel__head ta-panel__head--row">
                      <div>
                        <div className="ta-panel__title">Offenders table (preview)</div>
                        <div className="ta-panel__sub">Top 40 rows (klik row → detail). Untuk full, buka tab Offenders.</div>
                      </div>
                      <div className="ta-rowBtns">
                        <button className="ta-btn ta-btn--ghost" onClick={() => setTab('OFFENDERS')}>
                          Open full table
                        </button>
                      </div>
                      <div className="ta-rowBtns">
                        <button className="ta-btn ta-btn--ghost" disabled={!compareKeys.length} onClick={() => setCompareOpen(true)}>
                          Compare {compareKeys.length ? `(${compareKeys.length})` : ''}
                        </button>
                        <button className="ta-btn ta-btn--ghost" disabled={!compareKeys.length} onClick={() => setCompareKeys([])}>
                          Clear compare
                        </button>
                      </div>
                    </div>

                    <div className="ta-panel__body ta-panel__body--fill">
                      {filtered.length ? (
                        <VirtualTable
                          viewportRef={dashViewportRef}
                          rows={filtered.slice(0, 40)}
                          rowHeight={density === 'compact' ? 34 : 40}
                          columns={dashCols}
                          selectedKey={selectedKey}
                          onSelect={(r) => setSelected(r)}
                          titleForRow={(r) => (r.jobNames ? `Jobs: ${r.jobNames}` : '')}
                        />
                      ) : (
                        <div className="ta-empty">{canAnalyze ? 'Tidak ada data / filter terlalu ketat.' : 'Upload Transaction Profile (Std) dulu.'}</div>
                      )}
                    </div>
                  </section>
                </div>
                  </>
                )}
              </div>
            ) : null}

            {/* OFFENDERS TAB */}
            {tab === 'OFFENDERS' ? (
              <div className="ta-fill">
                <div className={`ta-offSplit ${detailCollapsed ? 'is-detail-collapsed' : ''}`}>
                  <section className="ta-panel ta-panel--fill">
                    <div className="ta-panel__head ta-panel__head--row">
                      <div>
                        <div className="ta-panel__title">Offenders (fast table)</div>
                        <div className="ta-panel__sub">
                          Klik row → detail di kanan. Ini internal scroll (nggak scroll halaman).
                        </div>
                      </div>

                      <div className="ta-sortRow">
                        <span className="ta-muted">Sort:</span>
                        <Pill active={sortKey === 'score'} onClick={() => pickSort('score')}>Score</Pill>
                        <Pill active={sortKey === 'resp'} onClick={() => pickSort('resp')}>Resp</Pill>
                        <Pill active={sortKey === 'steps'} onClick={() => pickSort('steps')}>Steps</Pill>
                        <Pill active={sortKey === 'db'} onClick={() => pickSort('db')}>DB%</Pill>
                        <Pill active={sortKey === 'wait'} onClick={() => pickSort('wait')}>RollWait%</Pill>
                        <Pill active={sortKey === 'tcode'} onClick={() => pickSort('tcode')}>TCode</Pill>
                      </div>
                    </div>

                    <div className="ta-panel__body ta-panel__body--fill">
                      {filtered.length ? (
                        <VirtualTable
                          viewportRef={viewportRef}
                          rows={filtered}
                          rowHeight={density === 'compact' ? 34 : 42}
                          columns={cols}
                          selectedKey={selectedKey}
                          onSelect={(r) => setSelected(r)}
                          titleForRow={(r) => (r.jobNames ? `Jobs: ${r.jobNames}` : '')}
                        />
                      ) : (
                        <div className="ta-empty">
                          {canAnalyze ? 'Tidak ada data / filter terlalu ketat.' : 'Upload Transaction Profile (Std) dulu.'}
                        </div>
                      )}
                    </div>

                    <div className="ta-panel__foot">
                      <div className="ta-footLeft">
                        <span className="ta-muted">
                          Showing <b>{fmtInt(filtered.length)}</b> rows
                        </span>
                      </div>
                      <div className="ta-footRight">
                        <button
                          className="ta-btn ta-btn--ghost"
                          onClick={() => {
                            const el = viewportRef.current
                            if (el) el.scrollTop = 0
                          }}
                        >
                          Top
                        </button>
                        <button
                          className="ta-btn ta-btn--ghost"
                          onClick={() => {
                            const el = viewportRef.current
                            if (el) el.scrollTop = el.scrollHeight
                          }}
                        >
                          Bottom
                        </button>
                      </div>
                    </div>
                  </section>

                  {detailCollapsed ? (
                    <div className="ta-detailRestore">
                      <button className="ta-btn ta-btn--ghost" type="button" onClick={() => setDetailCollapsed(false)}>
                        Show detail
                      </button>
                    </div>
                  ) : null}
                  <aside className="ta-panel ta-panel--fill ta-detailPanel">
                    <div className="ta-panel__head ta-panel__head--row">
                      <div>
                        <div className="ta-panel__title">Detail</div>
                        <div className="ta-panel__sub">Focused view (tanpa scroll panjang).</div>
                      </div>
                      <div className="ta-rowBtns">
                        {selected ? (
                          <button className="ta-btn ta-btn--ghost" onClick={() => setSelected(null)}>
                            Clear
                          </button>
                        ) : null}
                        <button className="ta-btn ta-btn--ghost" type="button" onClick={() => setDetailCollapsed(true)}>
                          Hide
                        </button>
                      </div>
                    </div>

                    <div className="ta-panel__body ta-panel__body--fill">
                      {!selected ? (
                        <div className="ta-empty">
                          Pilih 1 row di table untuk lihat detail.
                        </div>
                      ) : (
                        <div className="ta-detailCard">
                          <div className="ta-detailTitleRow">
                            <div className="ta-detailTitle">
                              <span className="mono">{selected.tcode}</span>
                              <span className="ta-muted"> • {selected.hint}</span>
                            </div>
                            <button
                              className="ta-btn ta-btn--ghost"
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(String(selected.tcode || ''))
                                } catch {
                                  // ignore
                                }
                              }}
                              title="Copy TCode"
                            >
                              Copy
                            </button>
                            <button
                              className="ta-btn ta-btn--ghost"
                              onClick={() => {
                                const k = String(selected.tcode || '')
                                if (!k) return
                                setCompareKeys((prev) => {
                                  const has = prev.includes(k)
                                  const next = has ? prev.filter((x) => x !== k) : [...prev, k].slice(0, 3)
                                  return next
                                })
                              }}
                              title="Add/remove to compare (max 3)"
                            >
                              {compareKeys.includes(String(selected.tcode || '')) ? 'Remove' : 'Compare'}
                            </button>
                          </div>

                          <div className="ta-detailGrid">
                            <Stat label="Steps" value={fmtInt(selected.steps)} sub={selected.jobNames ? `Jobs: ${selected.jobNames}` : '—'} />
                            <Stat label="Avg Resp" value={fmtMs(selected.respMs)} sub={`TotalResp: ${fmtMs(selected.totalRespMs)}`} />
                            <Stat label="DB" value={fmtMs(selected.dbMs)} sub={<span>DB% <b>{fmt1(clampPct(selected.dbPct))}%</b></span>} />
                            <Stat
                              label="Roll Wait"
                              value={fmtMs(selected.rollWaitMs || selected.mainWaitMs)}
                              sub={<span>RollWait% <b>{fmt1(clampPct(selected.waitPct))}%</b></span>}
                              tone="warn"
                            />
                            <Stat label="CPU" value={fmtMs(selected.cpuMs)} sub="Avg CPU per step" />
                            <Stat
                              label="DB IO proxy"
                              value={fmtMs(selected.dbIoMs)}
                              sub={`seq:${fmtMs(selected.seqMs)} dir:${fmtMs(selected.dirMs)} chg:${fmtMs(selected.chgMs)}`}
                            />
                          </div>

                          <div className="ta-detailBreak">
                            <div className="ta-detailBreak__head">
                              <div className="ta-muted"><b>Time breakdown (avg)</b> • Resp = DB + Wait + CPU + Other</div>
                              <div className="row" style={{gap:8}}>
                                <button
                                  className="ta-btn ta-btn--ghost"
                                  onClick={() => {
                                    setSearch(String(selected.tcode || ''))
                                    setQuickClass('ALL')
                                  }}
                                  title="Filter table by this TCode"
                                >
                                  Filter
                                </button>
                                <button
                                  className="ta-btn ta-btn--ghost"
                                  onClick={async () => {
                                    const waitMs = toNum(selected.rollWaitMs || selected.mainWaitMs, 0)
                                    const other = Math.max(0, toNum(selected.respMs, 0) - (toNum(selected.dbMs, 0) + waitMs + toNum(selected.cpuMs, 0)))
                                    const txt = [
                                      `TCode: ${selected.tcode}`,
                                      `Steps: ${fmtInt(selected.steps)}`,
                                      `AvgResp: ${fmtMs(selected.respMs)} (TotalResp: ${fmtMs(selected.totalRespMs)})`,
                                      `DB: ${fmtMs(selected.dbMs)} (${fmt1(clampPct(selected.dbPct))}%)`,
                                      `Wait: ${fmtMs(waitMs)} (${fmt1(clampPct(selected.waitPct))}%)`,
                                      `CPU: ${fmtMs(selected.cpuMs)}`,
                                      `Other: ${fmtMs(other)}`,
                                      `Class: ${selected.hint || selected.classKey || '-'}`,
                                    ].join('\n')
                                    try { await navigator.clipboard.writeText(txt) } catch {}
                                  }}
                                  title="Copy evidence snippet"
                                >
                                  Copy evidence
                                </button>
                              </div>
                            </div>
                            <div className="ta-detailBreak__chart">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                  layout="vertical"
                                  data={[(() => {
                                    const waitMs = toNum(selected.rollWaitMs || selected.mainWaitMs, 0)
                                    const db = toNum(selected.dbMs, 0)
                                    const cpu = toNum(selected.cpuMs, 0)
                                    const other = Math.max(0, toNum(selected.respMs, 0) - (db + waitMs + cpu))
                                    return { name: 'Avg', DB: db, Wait: waitMs, CPU: cpu, Other: other }
                                  })()]}
                                >
                                  <CartesianGrid stroke="rgba(148,163,184,.18)" strokeDasharray="4 4" />
                                  <XAxis type="number" tick={{ fill: 'rgba(226,232,240,.75)', fontSize: 11 }} />
                                  <YAxis type="category" dataKey="name" tick={{ fill: 'rgba(226,232,240,.75)', fontSize: 11 }} width={40} />
                                  <Tooltip
                                    contentStyle={{ background: 'rgba(2,6,23,.95)', border: '1px solid rgba(148,163,184,.28)' }}
                                    labelStyle={{ color: 'rgba(226,232,240,.9)' }}
                                    formatter={(v, k) => [fmtMs(v), k]}
                                  />
                                  <Legend />
                                  <Bar dataKey="DB" stackId="a" fill="#a78bfa" />
                                  <Bar dataKey="Wait" stackId="a" fill="#fb7185" />
                                  <Bar dataKey="CPU" stackId="a" fill="#fbbf24" />
                                  <Bar dataKey="Other" stackId="a" fill="#38bdf8" />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>

                          <div className="ta-detailNote">
                            <b>Top Response sample:</b>{' '}
                            {selected.topRespMs ? (
                              <>
                                {fmtMs(selected.topRespMs)} • DB {fmt1(selected.topRespDbPct)}% • Wait {fmt1(selected.topRespWaitPct)}%{' '}
                                <span className="ta-muted">
                                  ({selected.topRespAt}
                                  {selected.topRespUser ? `, user ${selected.topRespUser}` : ''})
                                </span>
                              </>
                            ) : (
                              <span className="ta-muted">— (tidak ada di export Top Response)</span>
                            )}
                          </div>

                          <div className="ta-detailNote">
                            <b>Recommended next check:</b>{' '}
                            {String(selected.hint || '').includes('DB') ? (
                              <span>ST05 / SQL trace, HANA expensive statements, cek index & plan cache (tcode/job ini).</span>
                            ) : String(selected.hint || '').includes('Wait') ? (
                              <span>Cek WP saturation (DIA/UPD), enqueue/lock (SM12), RFC queue, dan concurrency.</span>
                            ) : (
                              <span>Cek GUI/FE latency, CPU bound, atau mix. Korelasi dengan chart per jam.</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </aside>
                </div>
              </div>
            ) : null}

            {/* CHARTS TAB */}
            {tab === 'CHARTS' ? (
              <div className="ta-fill ta-chartsGrid2">
                <section className="ta-panel ta-panel--fill">
                  <div className="ta-panel__head">
                    <div className="ta-panel__title">Response time by hour</div>
                    <div className="ta-panel__sub">Time Profile (avg ms). Compare Resp vs DB vs RollWait.</div>
                  </div>
                  <div className="ta-panel__body ta-chartBody">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={timeChart} onClick={(e) => { if (e?.activeLabel) { setSelectedHour(String(e.activeLabel)); setTab('DASH'); } }}>
                        <CartesianGrid stroke="rgba(148,163,184,.18)" strokeDasharray="4 4" />
                        <XAxis dataKey="time" tick={{ fill: 'rgba(226,232,240,.75)', fontSize: 11 }} />
                        <YAxis tick={{ fill: 'rgba(226,232,240,.75)', fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{ background: 'rgba(2,6,23,.95)', border: '1px solid rgba(148,163,184,.28)' }}
                          labelStyle={{ color: 'rgba(226,232,240,.9)' }}
                        />
                        <Legend />
                        <Line type="monotone" dataKey="Resp" stroke="#38bdf8" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="DB" stroke="#a78bfa" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="RollWait" stroke="#fb7185" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </section>

                <section className="ta-panel ta-panel--fill">
                  <div className="ta-panel__head">
                    <div className="ta-panel__title">Top 10 offenders</div>
                    <div className="ta-panel__sub">Based on current filter/sort.</div>
                  </div>
                  <div className="ta-panel__body ta-chartBody">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={top10.map((r) => ({
                          TCode: r.tcode,
                          Resp: r.respMs,
                          DBpct: clampPct(r.dbPct),
                          Waitpct: clampPct(r.waitPct),
                        }))}
                      >
                        <CartesianGrid stroke="rgba(148,163,184,.18)" strokeDasharray="4 4" />
                        <XAxis
                          dataKey="TCode"
                          tick={{ fill: 'rgba(226,232,240,.75)', fontSize: 10 }}
                          interval={0}
                          angle={-20}
                          textAnchor="end"
                          height={60}
                        />
                        <YAxis tick={{ fill: 'rgba(226,232,240,.75)', fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{ background: 'rgba(2,6,23,.95)', border: '1px solid rgba(148,163,184,.28)' }}
                          labelStyle={{ color: 'rgba(226,232,240,.9)' }}
                        />
                        <Legend />
                        <Bar dataKey="Resp" fill="#38bdf8" name="AvgResp (ms)" />
                        <Bar dataKey="DBpct" fill="#a78bfa" name="DB%" />
                        <Bar dataKey="Waitpct" fill="#fb7185" name="RollWait%" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>

                <section className="ta-panel ta-panel--fill">
                  <div className="ta-panel__head">
                    <div className="ta-panel__title">Pareto (Top impact)</div>
                    <div className="ta-panel__sub">Top 30 by Total Response time, with cumulative %.</div>
                  </div>
                  <div className="ta-panel__body ta-chartBody">
                    {pareto.length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={pareto}>
                          <CartesianGrid stroke="rgba(148,163,184,.18)" strokeDasharray="4 4" />
                          <XAxis dataKey="i" tick={{ fill: 'rgba(226,232,240,.75)', fontSize: 11 }} />
                          <YAxis yAxisId="left" tick={{ fill: 'rgba(226,232,240,.75)', fontSize: 11 }} />
                          <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fill: 'rgba(226,232,240,.75)', fontSize: 11 }} />
                          <Tooltip
                            contentStyle={{ background: 'rgba(2,6,23,.95)', border: '1px solid rgba(148,163,184,.28)' }}
                            labelStyle={{ color: 'rgba(226,232,240,.9)' }}
                            formatter={(v, k, p) => {
                              if (k === 'Total') return [fmtMs(v), 'TotalResp']
                              if (k === 'CumPct') return [`${fmt1(v)}%`, 'Cum%']
                              return [v, k]
                            }}
                            labelFormatter={(lbl) => {
                              const row = pareto.find((x) => x.i === lbl)
                              return row?.TCode ? `#${lbl} • ${row.TCode}` : `#${lbl}`
                            }}
                          />
                          <Legend />
                          <Bar yAxisId="left" dataKey="Total" fill="#38bdf8" name="TotalResp (ms)" />
                          <Line yAxisId="right" type="monotone" dataKey="CumPct" stroke="#a78bfa" strokeWidth={2} dot={false} name="Cumulative %" />
                        </ComposedChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="ta-empty">Tidak ada data Pareto untuk filter saat ini.</div>
                    )}
                  </div>
                </section>

                <section className="ta-panel ta-panel--fill">
                  <div className="ta-panel__head">
                    <div className="ta-panel__title">Impact matrix</div>
                    <div className="ta-panel__sub">Resp (x) vs Steps (y) • bubble = Total impact. Click a point to open detail.</div>
                  </div>
                  <div className="ta-panel__body ta-chartBody">
                    {impact.length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart>
                          <CartesianGrid stroke="rgba(148,163,184,.18)" strokeDasharray="4 4" />
                          <XAxis dataKey="Resp" name="AvgResp (ms)" tick={{ fill: 'rgba(226,232,240,.75)', fontSize: 11 }} />
                          <YAxis dataKey="Steps" name="Steps" tick={{ fill: 'rgba(226,232,240,.75)', fontSize: 11 }} />
                          <ZAxis dataKey="Impact" range={[60, 520]} name="Impact" />
                          <Tooltip
                            cursor={{ strokeDasharray: '3 3' }}
                            contentStyle={{ background: 'rgba(2,6,23,.95)', border: '1px solid rgba(148,163,184,.28)' }}
                            labelStyle={{ color: 'rgba(226,232,240,.9)' }}
                            formatter={(v, k, p) => {
                              if (k === 'Resp') return [fmtMs(v), 'AvgResp']
                              if (k === 'Steps') return [fmtInt(v), 'Steps']
                              if (k === 'Impact') return [fmtMs(v), 'TotalResp']
                              return [v, k]
                            }}
                            labelFormatter={(_, payload) => {
                              const pp = payload?.[0]?.payload
                              return pp?.tcode ? `${pp.tcode} • ${pp.cls}` : 'Point'
                            }}
                          />
                          <Legend />
                          <Scatter
                            name="Offenders"
                            data={impact}
                            fill="#38bdf8"
                            onClick={(p) => {
                              const row = p?._raw
                              if (row) {
                                setSelected(row)
                                setTab('OFFENDERS')
                              }
                            }}
                          />
                        </ScatterChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="ta-empty">Tidak ada data untuk impact matrix.</div>
                    )}
                  </div>
                </section>
              </div>
            ) : null}

            {/* INSIGHTS TAB */}
            {tab === 'INSIGHTS' ? (
              <div className="ta-fill ta-insights">
                <div className="ta-insightsGrid2">
                  <section className="ta-panel ta-panel--fill">
                    <div className="ta-panel__head">
                      <div className="ta-panel__title">Classification summary</div>
                      <div className="ta-panel__sub">Distribusi offenders berdasarkan hint (after filter).</div>
                    </div>
                    <div className="ta-panel__body">
                      <div className="ta-insightGrid">
                        <Stat
                          label="DB-heavy"
                          value={fmtInt(insightCounts.DBheavy)}
                          sub="expensive SQL/index/plan"
                          title="Click to open Offenders (DB-heavy)"
                          onClick={() => {
                            setQuickClass('DBHEAVY')
                            setTab('OFFENDERS')
                          }}
                        />
                        <Stat
                          label="Wait-heavy"
                          value={fmtInt(insightCounts.Waitheavy)}
                          sub="WP/enqueue/RFC/lock"
                          tone="warn"
                          title="Click to open Offenders (Wait-heavy)"
                          onClick={() => {
                            setQuickClass('WAITHEAVY')
                            setTab('OFFENDERS')
                          }}
                        />
                        <Stat
                          label="CPU-heavy"
                          value={fmtInt(insightCounts.CPUheavy)}
                          sub="hotspot ABAP / calc heavy"
                          tone="warn"
                          title="Click to open Offenders (CPU-heavy)"
                          onClick={() => {
                            setQuickClass('CPUHEAVY')
                            setTab('OFFENDERS')
                          }}
                        />
                        <Stat
                          label="DB leaning"
                          value={fmtInt(insightCounts.DBlean)}
                          sub="DB tends dominant"
                          title="Click to open Offenders (DB leaning)"
                          onClick={() => {
                            setQuickClass('DBLEAN')
                            setTab('OFFENDERS')
                          }}
                        />
                        <Stat
                          label="Wait leaning"
                          value={fmtInt(insightCounts.Waitlean)}
                          sub="wait tends dominant"
                          tone="warn"
                          title="Click to open Offenders (Wait leaning)"
                          onClick={() => {
                            setQuickClass('WAITLEAN')
                            setTab('OFFENDERS')
                          }}
                        />
                        <Stat
                          label="CPU leaning"
                          value={fmtInt(insightCounts.CPUlean)}
                          sub="cpu tends dominant"
                          title="Click to open Offenders (CPU leaning)"
                          onClick={() => {
                            setQuickClass('CPULEAN')
                            setTab('OFFENDERS')
                          }}
                        />
                        <Stat label="Mixed" value={fmtInt(insightCounts.Mixed)} sub="CPU/GUI/other mix" />
                        <Stat label="Total" value={fmtInt(filtered.length)} sub="rows after filter" />
                      </div>

                      <div className="ta-insightNote">
                        Tip: pakai Quick class + threshold untuk fokus ke pain point, lalu klik row untuk detail & next-check.
                      </div>
                    </div>
                  </section>

                  <section className="ta-insightPanel">
                    <div className="ta-insightPanel__head">
                      <div>
                        <div className="ta-insightPanel__title">Next actions</div>
                        <div className="ta-insightPanel__sub">3 fokus utama berdasarkan distribusi class.</div>
                      </div>
                      <span className="ta-badge">Mode: {scoreMode}</span>
                    </div>
                    <div className="ta-actionGrid">
                      {actionHints.map((a) => (
                        <div key={a.k} className="ta-action">
                          <div className="row" style={{justifyContent:'space-between', gap:10}}>
                            <div className="ta-action__k">{a.k}</div>
                            <span className="ta-badge">{a.pct}%</span>
                          </div>
                          <div className="ta-action__v">{a.sub}</div>
                        </div>
                      ))}
                      <div className="ta-action">
                        <div className="ta-action__k">Evidence</div>
                        <div className="ta-action__v">
                          Gunakan <b>Copy evidence</b> untuk ringkasan, dan klik row untuk ambil “why” (DB/Wait/CPU).
                        </div>
                      </div>

                      <div className="ta-divider" />

                      <div className="ta-action">
                        <div className="row" style={{ justifyContent: 'space-between', gap: 10 }}>
                          <div className="ta-action__k">Hot windows (by hour)</div>
                          <button
                            type="button"
                            className="ta-btn ta-btn--ghost"
                            title="Copy peak hours"
                            onClick={() => {
                              const lines = (peakHours || [])
                                .map(
                                  (p, i) =>
                                    `${i + 1}. ${p.label} | Resp ${(p.resp / 1000).toFixed(2)}s | DB ${p.dbPct.toFixed(
                                      1
                                    )}% | Wait ${p.waitPct.toFixed(1)}%`
                                )
                                .join('\n')
                              const txt = `Peak hours (period=${period}):\n${lines}`
                              navigator.clipboard?.writeText(txt)
                            }}
                          >
                            Copy
                          </button>
                        </div>
                        <div className="ta-miniList">
                          {peakHours?.length ? (
                            peakHours.map((p) => (
                              <div key={p.label} className="ta-miniRow">
                                <div className="ta-miniRow__k">{p.label}</div>
                                <div className="ta-miniRow__v">{(p.resp / 1000).toFixed(2)}s</div>
                                <div className="ta-miniRow__tag">DB {p.dbPct.toFixed(0)}%</div>
                                <div className="ta-miniRow__tag">Wait {p.waitPct.toFixed(0)}%</div>
                              </div>
                            ))
                          ) : (
                            <div className="ta-muted">(no time profile)</div>
                          )}
                        </div>
                      </div>

                      <div className="ta-action">
                        <div className="row" style={{ justifyContent: 'space-between', gap: 10 }}>
                          <div className="ta-action__k">Top impact (TotalResp)</div>
                          <button
                            type="button"
                            className="ta-btn ta-btn--ghost"
                            title="Open Offenders"
                            onClick={() => setTab('OFFENDERS')}
                          >
                            Open
                          </button>
                        </div>
                        <div className="ta-miniList">
                          {topImpact?.length ? (
                            topImpact.map((x) => (
                              <button
                                key={x.t}
                                type="button"
                                className="ta-miniRow ta-miniRow--btn"
                                title="Filter by TCode"
                                onClick={() => {
                                  setSearch(String(x.t || ''))
                                  setTab('OFFENDERS')
                                }}
                              >
                                <div className="ta-miniRow__k">{String(x.t).slice(0, 28)}</div>
                                <div className="ta-miniRow__v">{(x.total / 1000 / 60).toFixed(1)}m</div>
                                <div className="ta-miniRow__tag">{(x.resp / 1000).toFixed(2)}s</div>
                                <div className="ta-miniRow__tag">{x.steps} steps</div>
                              </button>
                            ))
                          ) : (
                            <div className="ta-muted">(no data)</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </section>
                </div>

                <div className="ta-insightsGrid2" style={{marginTop:12}}>
                  <section className="ta-insightPanel">
                    <div className="ta-insightPanel__head">
                      <div>
                        <div className="ta-insightPanel__title">Extreme / Severe suspects</div>
                        <div className="ta-insightPanel__sub">Top yang paling urgent (by score).</div>
                      </div>
                      <button className="ta-btn ta-btn--ghost" onClick={() => { setQuickClass('EXTREME'); setTab('OFFENDERS') }}>
                        Open in table
                      </button>
                    </div>
                    <div className="ta-list">
                      {topByClass.EXTREME?.length ? topByClass.EXTREME.map((r) => (
                        <div
                          key={r.tcode}
                          className="ta-li"
                          onClick={() => { setSelected(r); setTab('OFFENDERS') }}
                          title="Click to open detail"
                        >
                          <div className={`ta-sev is-${r.severity}`}>{r.severity}</div>
                          <div className="ta-li__main">
                            <div className="ta-li__title"><span className="mono">{r.tcode}</span></div>
                            <div className="ta-li__meta">
                              <span>Resp: <b>{fmtMs(r.respMs)}</b></span>
                              <span>DB: {fmt1(clampPct(r.dbPct))}%</span>
                              <span>Wait: {fmt1(clampPct(r.waitPct))}%</span>
                              <span>Steps: {fmtInt(r.steps)}</span>
                            </div>
                          </div>
                        </div>
                      )) : <div className="ta-muted" style={{padding:10}}>Tidak ada item EXTREME/SEVERE di filter saat ini.</div>}
                    </div>
                  </section>

                  <section className="ta-insightPanel">
                    <div className="ta-insightPanel__head">
                      <div>
                        <div className="ta-insightPanel__title">Top by class</div>
                        <div className="ta-insightPanel__sub">DB-heavy / Wait-heavy / CPU-heavy (by score).</div>
                      </div>
                      <button className="ta-btn ta-btn--ghost" onClick={() => setTab('OFFENDERS')}>
                        Open table
                      </button>
                    </div>
                    <div className="ta-list">
                      {(['DBHEAVY','WAITHEAVY','CPUHEAVY'] ).map((k) => (
                        <div key={k} className="ta-action" style={{margin: '0 8px'}}>
                          <div className="row" style={{justifyContent:'space-between', gap:10}}>
                            <div className="ta-action__k">{k === 'DBHEAVY' ? 'DB-heavy' : k === 'WAITHEAVY' ? 'Wait-heavy' : 'CPU-heavy'}</div>
                            <span className="ta-badge">{fmtInt((k==='DBHEAVY'?insightCounts.DBheavy: k==='WAITHEAVY'?insightCounts.Waitheavy: insightCounts.CPUheavy))}</span>
                          </div>
                          <div className="ta-list" style={{padding:8}}>
                            {(topByClass[k] || []).slice(0,3).map((r) => (
                              <div key={r.tcode} className="ta-li" onClick={() => { setSelected(r); setTab('OFFENDERS') }}>
                                <div className={`ta-sev is-${r.severity}`}>{r.severity}</div>
                                <div className="ta-li__main">
                                  <div className="ta-li__title"><span className="mono">{r.tcode}</span></div>
                                  <div className="ta-li__meta">
                                    <span>Resp: <b>{fmtMs(r.respMs)}</b></span>
                                    <span>Score: {fmtMs(r._score)}</span>
                                    <span>Steps: {fmtInt(r.steps)}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                            {!(topByClass[k] || []).length ? <div className="ta-muted" style={{padding:6}}>Tidak ada item pada class ini di filter.</div> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </div>
            ) : null}
          </main>
        </div>
      </div>

      <Palette
        open={paletteOpen}
        query={paletteQuery}
        setQuery={setPaletteQuery}
        items={paletteItems}
        onClose={() => { setPaletteOpen(false); setPaletteQuery('') }}
        onRun={(it) => { it?.run?.(); setPaletteOpen(false); setPaletteQuery('') }}
      />

      <EvidenceModal
        open={evOpen}
        onClose={() => setEvOpen(false)}
        title={evMode === 'mgmt' ? 'Evidence pack (Mgmt)' : evMode === 'basis' ? 'Evidence pack (Basis)' : 'Evidence (Raw)'}
        text={buildEvidencePack()}
      />
      {compareOpen ? (
        <div className="ta-modalWrap" onMouseDown={() => setCompareOpen(false)}>
          <div className="ta-modal ta-compare" onMouseDown={(e) => e.stopPropagation()}>
            <div className="ta-modal__head">
              <div className="ta-modal__title">Compare offenders</div>
              <button className="ta-btn ta-btn--ghost" onClick={() => setCompareOpen(false)}>Close</button>
            </div>
            <div className="ta-modal__actions">
              <span className="ta-muted">Selected: {compareKeys.join(', ') || '—'}</span>
              <button className="ta-btn ta-btn--ghost" onClick={() => setCompareKeys([])}>Clear</button>
            </div>
            <div className="ta-compareGrid">
              {compareKeys.map((k) => {
                const r = filtered.find((x) => String(x.tcode) === String(k)) || joined.find((x) => String(x.tcode) === String(k))
                if (!r) return null
                const other = Math.max(0, toNum(r.respMs, 0) - toNum(r.dbMs, 0) - toNum(r.rollWaitMs || r.mainWaitMs, 0) - toNum(r.cpuMs, 0))
                const parts = [
                  { k: 'DB', v: toNum(r.dbMs, 0), cls: 'db' },
                  { k: 'Wait', v: toNum(r.rollWaitMs || r.mainWaitMs, 0), cls: 'wait' },
                  { k: 'CPU', v: toNum(r.cpuMs, 0), cls: 'cpu' },
                  { k: 'Other', v: other, cls: 'other' },
                ]
                const total = parts.reduce((a, b) => a + b.v, 0) || 1
                return (
                  <div key={k} className="ta-compareCard">
                    <div className="ta-compareCard__head">
                      <div className="ta-compareCard__title mono">{k}</div>
                      <ClassChip classKey={r.classKey} severity={r.severity} />
                    </div>
                    <div className="ta-compareCard__kpis">
                      <Stat label="AvgResp" value={fmtMs(r.respMs)} sub={`Steps ${fmtInt(r.steps)}`} />
                      <Stat label="DB%" value={`${fmt1(clampPct(r.dbPct))}%`} sub={fmtMs(r.dbMs)} tone="db" />
                      <Stat label="Wait%" value={`${fmt1(clampPct(r.waitPct))}%`} sub={fmtMs(r.rollWaitMs || r.mainWaitMs)} tone="wait" />
                    </div>
                    <div className="ta-breakRow">
                      {parts.map((p) => (
                        <div key={p.k} className={`ta-breakSeg ${p.cls}`} style={{ width: `${(p.v / total) * 100}%` }} title={`${p.k}: ${fmtMs(p.v)}`} />
                      ))}
                    </div>
                    <div className="ta-muted ta-compareHint">{r.hint || '—'}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ) : null}


    </div>
  )
}
