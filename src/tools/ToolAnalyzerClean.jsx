import React, { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
} from 'recharts'
import './ToolAnalyzerClean.css'

const BUILD = 'st03n-clean-20260507-01'

const safeText = (v) => String(v ?? '').trim()
const norm = (v) => safeText(v).toLowerCase().replace(/\s+/g, ' ')
const normTx = (v) => safeText(v).replace(/\s+/g, '_').toUpperCase()

const toNum = (value, fallback = 0) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  let s = safeText(value)
  if (!s) return fallback
  let negative = false
  if (s.startsWith('(') && s.endsWith(')')) {
    negative = true
    s = s.slice(1, -1)
  }
  s = s.replace(/\u00A0/g, '').replace(/\s+/g, '')
  s = s.replace(/[^0-9.,+\-]/g, '')
  if (!s) return fallback
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma > -1 && lastDot > -1) {
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else if (lastComma > -1) {
    const parts = s.split(',')
    s = parts.length === 2 && parts[1].length !== 3 ? `${parts[0]}.${parts[1]}` : parts.join('')
  } else if ((s.match(/\./g) || []).length > 1) {
    s = s.replace(/\./g, '')
  }
  const n = Number.parseFloat(s)
  if (!Number.isFinite(n)) return fallback
  return negative ? -n : n
}

const fmtInt = (v) => Math.round(toNum(v)).toLocaleString('en-US')
const fmtMs = (v) => {
  const ms = toNum(v)
  if (!ms) return '-'
  if (ms < 1000) return `${ms.toFixed(0)} ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(2)} s`
  if (ms < 3600000) return `${(ms / 60000).toFixed(2)} min`
  return `${(ms / 3600000).toFixed(2)} h`
}
const fmtPct = (v) => `${toNum(v).toFixed(1)}%`

const findCol = (keys, patterns) => {
  for (const pattern of patterns) {
    const match = keys.find((key) => pattern.test(norm(key)))
    if (match) return match
  }
  return ''
}

const parseCsv = (text) => {
  const first = text.split(/\r?\n/).find((line) => safeText(line)) || ''
  const delimiter = [';', '\t', ',']
    .map((d) => [d, (first.match(new RegExp(d === '\t' ? '\\t' : `\\${d}`, 'g')) || []).length])
    .sort((a, b) => b[1] - a[1])[0][0]

  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"'
        i += 1
      } else quoted = !quoted
      continue
    }
    if (!quoted && ch === delimiter) {
      row.push(cell.trim())
      cell = ''
      continue
    }
    if (!quoted && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && text[i + 1] === '\n') i += 1
      row.push(cell.trim())
      if (row.some((x) => safeText(x))) rows.push(row)
      row = []
      cell = ''
      continue
    }
    cell += ch
  }
  row.push(cell.trim())
  if (row.some((x) => safeText(x))) rows.push(row)
  return rows
}

const sheetToRows = async (file) => {
  const lower = safeText(file.name).toLowerCase()
  const buffer = await file.arrayBuffer()
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    return parseCsv(new TextDecoder('utf-8').decode(buffer).replace(/^\uFEFF/, ''))
  }
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true })
}

const scoreHeader = (row) => {
  const line = norm((row || []).join(' | '))
  let score = 0
  if (/transaction|tcode|report or transaction|program/.test(line)) score += 4
  if (/dialog steps|number of dialog steps|steps/.test(line)) score += 2
  if (/response/.test(line)) score += 2
  if (/database|db time/.test(line)) score += 1
  return score
}

const rowsToObjects = (rows) => {
  let headerIdx = 0
  let best = -1
  rows.slice(0, 40).forEach((row, idx) => {
    const score = scoreHeader(row)
    if (score > best) {
      best = score
      headerIdx = idx
    }
  })
  const header = (rows[headerIdx] || []).map((h, idx) => safeText(h) || `Column ${idx + 1}`)
  return rows.slice(headerIdx + 1).map((row) => {
    const o = {}
    header.forEach((h, idx) => {
      o[h] = row[idx]
    })
    return o
  }).filter((o) => Object.values(o).some((v) => safeText(v)))
}

const extractRows = (objects, source) => {
  const keys = Object.keys(objects[0] || {})
  const cTcode = findCol(keys, [/report.*transaction/, /transaction.*name/, /^transaction$/, /^tcode$/, /abap program/, /program name/])
  const cTask = findCol(keys, [/task type/])
  const cUser = findCol(keys, [/user/])
  const cSteps = findCol(keys, [/number.*dialog steps/, /dialog steps/, /^steps$/])
  const cRespAvg = findCol(keys, [/average.*response.*ms/, /avg.*response.*ms/, /dialog step response.*ms/, /response time.*ms/])
  const cRespTotalSec = findCol(keys, [/total.*response.*\(s\)/, /response.*time.*\(s\)/])
  const cDbAvg = findCol(keys, [/database time.*dialog step.*ms/, /average.*db.*ms/, /db time.*ms/, /database.*ms/])
  const cDbTotalSec = findCol(keys, [/total.*database.*\(s\)/, /db.*time.*\(s\)/])
  const cCpuAvg = findCol(keys, [/average.*cpu.*ms/, /cpu time.*ms/])
  const cWaitAvg = findCol(keys, [/roll wait.*ms/, /average.*wait.*ms/, /wait time.*ms/])
  const cCalls = findCol(keys, [/logical database calls/, /db calls/])
  const cDate = findCol(keys, [/date stamp/, /^date$/])
  const cTime = findCol(keys, [/time stamp/, /^time$/])

  return objects.map((r) => {
    const tcode = normTx(cTcode ? r[cTcode] : '')
    if (!tcode || ['TOTAL', 'SUM', 'OVERALL'].includes(tcode)) return null
    const steps = Math.max(0, toNum(cSteps ? r[cSteps] : 0))
    const avgRespMs = Math.max(0, toNum(cRespAvg ? r[cRespAvg] : 0))
    const totalRespMs = Math.max(0, toNum(cRespTotalSec ? r[cRespTotalSec] : 0) * 1000 || (steps > 0 ? avgRespMs * steps : avgRespMs))
    const avgDbMs = Math.max(0, toNum(cDbAvg ? r[cDbAvg] : 0))
    const totalDbMs = Math.max(0, toNum(cDbTotalSec ? r[cDbTotalSec] : 0) * 1000 || (steps > 0 ? avgDbMs * steps : avgDbMs))
    const avgCpuMs = Math.max(0, toNum(cCpuAvg ? r[cCpuAvg] : 0))
    const avgWaitMs = Math.max(0, toNum(cWaitAvg ? r[cWaitAvg] : 0))
    return {
      source,
      tcode,
      task: safeText(cTask ? r[cTask] : ''),
      user: safeText(cUser ? r[cUser] : ''),
      at: [cDate ? r[cDate] : '', cTime ? r[cTime] : ''].map(safeText).filter(Boolean).join(' '),
      steps,
      avgRespMs,
      totalRespMs,
      avgDbMs,
      totalDbMs,
      avgCpuMs,
      avgWaitMs,
      dbCalls: Math.max(0, toNum(cCalls ? r[cCalls] : 0)),
    }
  }).filter(Boolean)
}

const severityOf = (row) => {
  if (row.score >= 900 || row.avgRespMs >= 3000 || row.dbPct >= 70 || row.waitPct >= 45) return 'BAD'
  if (row.score >= 450 || row.avgRespMs >= 1500 || row.dbPct >= 45 || row.waitPct >= 25) return 'CRIT'
  if (row.score >= 180 || row.avgRespMs >= 800 || row.dbPct >= 25 || row.waitPct >= 10) return 'WARN'
  return 'OK'
}

const buildAnalysis = (rows) => {
  const map = new Map()
  rows.forEach((r) => {
    const cur = map.get(r.tcode) || {
      tcode: r.tcode,
      hits: 0,
      steps: 0,
      totalRespMs: 0,
      totalDbMs: 0,
      dbCalls: 0,
      avgRespMs: 0,
      avgDbMs: 0,
      avgCpuMs: 0,
      avgWaitMs: 0,
      users: new Set(),
      tasks: new Set(),
      sources: new Set(),
    }
    cur.hits += 1
    cur.steps += r.steps
    cur.totalRespMs += r.totalRespMs
    cur.totalDbMs += r.totalDbMs
    cur.dbCalls += r.dbCalls
    cur.avgRespMs = Math.max(cur.avgRespMs, r.avgRespMs)
    cur.avgDbMs = Math.max(cur.avgDbMs, r.avgDbMs)
    cur.avgCpuMs = Math.max(cur.avgCpuMs, r.avgCpuMs)
    cur.avgWaitMs = Math.max(cur.avgWaitMs, r.avgWaitMs)
    if (r.user) cur.users.add(r.user)
    if (r.task) cur.tasks.add(r.task)
    if (r.source) cur.sources.add(r.source)
    map.set(r.tcode, cur)
  })

  return [...map.values()].map((r) => {
    const dbPct = r.totalRespMs > 0 ? (r.totalDbMs / r.totalRespMs) * 100 : (r.avgRespMs > 0 ? (r.avgDbMs / r.avgRespMs) * 100 : 0)
    const waitPct = r.avgRespMs > 0 ? (r.avgWaitMs / r.avgRespMs) * 100 : 0
    const score = Math.round(
      (r.avgRespMs / 10) +
      (r.avgDbMs / 8) +
      (r.avgWaitMs / 6) +
      Math.log10(r.steps + 1) * 80 +
      Math.min(250, dbPct * 3) +
      Math.min(200, waitPct * 4)
    )
    const enriched = {
      ...r,
      dbPct,
      waitPct,
      score,
      usersText: [...r.users].slice(0, 4).join(', ') || '-',
      tasksText: [...r.tasks].slice(0, 3).join(', ') || '-',
      sourcesText: [...r.sources].slice(0, 3).join(', ') || '-',
    }
    return { ...enriched, severity: severityOf(enriched) }
  }).sort((a, b) => b.score - a.score)
}

const recommendation = (top) => {
  if (!top) return 'Upload ST03N workload exports to generate RCA recommendation.'
  if (top.dbPct >= 45) return `Prioritaskan SQL/DB trace untuk ${top.tcode}: DB share ${fmtPct(top.dbPct)}, cek expensive SQL, missing index, table growth, dan ST05/SAT.`
  if (top.waitPct >= 25) return `Prioritaskan wait/queue analysis untuk ${top.tcode}: wait share ${fmtPct(top.waitPct)}, cek dialog/background WP capacity, enqueue, RFC, dan SM50/SM66.`
  if (top.avgRespMs >= 1500) return `Prioritaskan runtime profiling untuk ${top.tcode}: response ${fmtMs(top.avgRespMs)}, cek SAT, ST12, user variant, dan custom ABAP path.`
  return `Tidak ada blocker ekstrem; review top score ${top.tcode} dan bandingkan dengan baseline ST03N periode normal.`
}

export default function ToolAnalyzerClean() {
  const [files, setFiles] = useState([])
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [severity, setSeverity] = useState('BAD')
  const [limit, setLimit] = useState(80)

  const analysis = useMemo(() => buildAnalysis(rows), [rows])
  const filtered = useMemo(() => {
    const q = norm(query)
    return analysis.filter((r) => {
      const severityOk = severity === 'ALL' || r.severity === severity
      const queryOk = !q || norm(`${r.tcode} ${r.usersText} ${r.tasksText} ${r.sourcesText}`).includes(q)
      return severityOk && queryOk
    }).slice(0, limit)
  }, [analysis, query, severity, limit])

  const kpi = useMemo(() => {
    const bad = analysis.filter((r) => r.severity === 'BAD').length
    const crit = analysis.filter((r) => r.severity === 'CRIT').length
    const warn = analysis.filter((r) => r.severity === 'WARN').length
    const maxResp = analysis.reduce((m, r) => Math.max(m, r.avgRespMs), 0)
    const totalSteps = analysis.reduce((s, r) => s + r.steps, 0)
    return { tx: analysis.length, rows: rows.length, bad, crit, warn, maxResp, totalSteps }
  }, [analysis, rows])

  const top = filtered[0] || analysis[0]
  const chartData = filtered.slice(0, 10).map((r) => ({
    tcode: r.tcode,
    score: r.score,
    response: Math.round(r.avgRespMs),
    db: Math.round(r.avgDbMs),
    wait: Math.round(r.avgWaitMs),
  }))

  const onAnalyze = async () => {
    setBusy(true)
    setError('')
    try {
      const allRows = []
      for (const file of files) {
        const matrix = await sheetToRows(file)
        const objects = rowsToObjects(matrix)
        allRows.push(...extractRows(objects, file.name))
      }
      setRows(allRows)
      if (!allRows.length) setError('File terbaca, tapi kolom TCode/Response/Steps tidak terdeteksi. Export ST03N standar atau CSV dari ALV.')
    } catch (e) {
      setError(e?.message || 'Failed to parse ST03N file')
    } finally {
      setBusy(false)
    }
  }

  const exportCsv = () => {
    const header = ['severity', 'tcode', 'score', 'hits', 'steps', 'avg_resp_ms', 'avg_db_ms', 'avg_wait_ms', 'db_pct', 'wait_pct', 'users', 'tasks', 'sources']
    const body = filtered.map((r) => [r.severity, r.tcode, r.score, r.hits, r.steps, Math.round(r.avgRespMs), Math.round(r.avgDbMs), Math.round(r.avgWaitMs), r.dbPct.toFixed(1), r.waitPct.toFixed(1), r.usersText, r.tasksText, r.sourcesText])
    const csv = [header, ...body].map((line) => line.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `st03n-offenders-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="st03n-clean" data-build={BUILD}>
      <section className="st03n-hero">
        <div>
          <p className="eyebrow">ST03N Workload</p>
          <h1>Clean workload offender analyzer</h1>
          <p className="hero-copy">Upload ST03N XLSX/CSV exports, rank expensive transactions, and separate DB-heavy, wait-heavy, and response-time offenders.</p>
        </div>
        <div className="upload-card">
          <label className="file-drop">
            <input type="file" multiple accept=".xlsx,.xls,.csv,.txt" onChange={(e) => setFiles([...e.target.files])} />
            <span>{files.length ? `${files.length} file selected` : 'Drop / select ST03N files'}</span>
            <small>Workload overview, transaction profile, top response, top DB access</small>
          </label>
          <button className="primary-btn" onClick={onAnalyze} disabled={busy || !files.length}>{busy ? 'Analyzing…' : 'Upload & Analyze'}</button>
        </div>
      </section>

      {error && <div className="st03n-alert">{error}</div>}

      <section className="kpi-grid">
        <div><span>Transactions</span><strong>{fmtInt(kpi.tx)}</strong></div>
        <div><span>Rows</span><strong>{fmtInt(kpi.rows)}</strong></div>
        <div className="bad"><span>Bad</span><strong>{fmtInt(kpi.bad)}</strong></div>
        <div className="crit"><span>Critical</span><strong>{fmtInt(kpi.crit)}</strong></div>
        <div className="warn"><span>Warning</span><strong>{fmtInt(kpi.warn)}</strong></div>
        <div><span>Total Steps</span><strong>{fmtInt(kpi.totalSteps)}</strong></div>
        <div><span>Max Response</span><strong>{fmtMs(kpi.maxResp)}</strong></div>
      </section>

      <section className="finding-card">
        <p className="eyebrow">RCA Finding</p>
        <h2>{top ? `${top.severity} offender: ${top.tcode}` : 'No workload analyzed yet'}</h2>
        <p>{recommendation(top)}</p>
      </section>

      <section className="workspace-grid">
        <div className="panel offender-panel">
          <div className="panel-head">
            <div>
              <h3>Workload Offender Queue</h3>
              <p>Sorted by RCA score. Use filters before exporting action notes.</p>
            </div>
            <div className="controls">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search TCode, user, source…" />
              {['BAD', 'CRIT', 'WARN', 'ALL'].map((s) => <button key={s} className={severity === s ? 'active' : ''} onClick={() => setSeverity(s)}>{s}</button>)}
              <button onClick={exportCsv} disabled={!filtered.length}>CSV</button>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>SEV</th><th>TCODE</th><th>SCORE</th><th>HITS</th><th>STEPS</th><th>RESP</th><th>DB</th><th>WAIT</th><th>DB%</th><th>SOURCE</th></tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={`${r.tcode}-${r.score}-${r.sourcesText}`}>
                    <td><span className={`pill ${r.severity.toLowerCase()}`}>{r.severity}</span></td>
                    <td>{r.tcode}</td>
                    <td>{fmtInt(r.score)}</td>
                    <td>{fmtInt(r.hits)}</td>
                    <td>{fmtInt(r.steps)}</td>
                    <td>{fmtMs(r.avgRespMs)}</td>
                    <td>{fmtMs(r.avgDbMs)}</td>
                    <td>{fmtMs(r.avgWaitMs)}</td>
                    <td>{fmtPct(r.dbPct)}</td>
                    <td>{r.sourcesText}</td>
                  </tr>
                ))}
                {!filtered.length && <tr><td colSpan="10" className="empty">No offenders for current filter.</td></tr>}
              </tbody>
            </table>
          </div>
          {analysis.length > limit && <button className="load-more" onClick={() => setLimit((v) => v + 80)}>Load more</button>}
        </div>

        <aside className="side-stack">
          <div className="panel chart-panel">
            <h3>Top Score</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="tcode" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="score" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="panel chart-panel">
            <h3>Response / DB / Wait</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="tcode" />
                <YAxis />
                <Tooltip formatter={(v) => fmtMs(v)} />
                <Line dataKey="response" strokeWidth={2} dot />
                <Line dataKey="db" strokeWidth={2} dot />
                <Line dataKey="wait" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="panel checks-panel">
            <h3>Recommended Checks</h3>
            <ol>
              <li>Validate time range and workload task type in ST03N.</li>
              <li>For DB-heavy offenders, run ST05 / SQLM / DBACOCKPIT expensive SQL.</li>
              <li>For wait-heavy offenders, inspect SM50/SM66, enqueue, RFC, and background WP capacity.</li>
              <li>For custom programs, capture SAT/ST12 trace on the exact TCode/report.</li>
            </ol>
          </div>
        </aside>
      </section>
    </div>
  )
}
