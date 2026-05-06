import React, { useMemo, useRef, useState, useEffect } from 'react'
import './ToolComparer.css'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ReferenceLine,
  BarChart,
  Bar,
} from 'recharts'

/**
 * ==========================================================
 * SAP Comparer – Daily Check / WP-SCOUT Log Analyzer
 * Re-layout v2:
 * - Workspace full-height (no long page scroll). Each panel scrolls internally.
 * - Faster parsing for many logs + lower memory footprint (raw text not kept).
 * - Quick actions: click snapshot/offender -> langsung ke proses (Top WP).
 * ==========================================================
 */

// =======================
// Config
// =======================
const KEEP_RAW = false
const MAX_WP_PER_SNAPSHOT = 5000
const CMP_ROW_HEIGHT = 32

// =======================
// Threshold & weighting
// =======================
const TH = {
  cpuWarn: 70,
  cpuCrit: 90,
  memWarn: 80,
  memCrit: 92,
  swapWarn: 1, // any si > 0 = suspicious
  rssWarn: 10, // GB
  rssCrit: 18, // GB
  ageWarn: 24, // hours
  ageCrit: 72, // hours
}

const WEIGHT = {
  cpu: 20,
  mem: 25,
  swap: 20,
  rss: 20,
  age: 15,
}

const CHART_COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#fb7185', '#a78bfa', '#22d3ee']
const GRID_STROKE = 'rgba(220,245,244,.075)'
const AXIS_TICK = { fontSize: 11, fill: 'rgba(220,238,238,.70)' }
const CHART_MARGIN = { top: 12, right: 16, bottom: 4, left: 0 }
const LEGEND_PROPS = {
  verticalAlign: 'bottom',
  height: 28,
  wrapperStyle: { fontSize: 11, color: 'rgba(220,238,238,.72)' },
}

function renderAnomalyDot(dataKey, threshold, color) {
  return function AnomalyDot({ cx, cy, payload }) {
    const value = safeNum(payload?.[dataKey], 0)
    if (!Number.isFinite(cx) || !Number.isFinite(cy) || value < threshold) {
      return <circle cx={cx} cy={cy} r={0} />
    }
    return (
      <g>
        <circle cx={cx} cy={cy} r={8} fill={color} opacity={0.18} />
        <circle cx={cx} cy={cy} r={4.5} fill={color} stroke="rgba(255,255,255,.88)" strokeWidth={1.4} />
      </g>
    )
  }
}

function renderSwapDot({ cx, cy, payload }) {
  const value = safeNum(payload?.swapSi, 0)
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || value <= 0) return <circle cx={cx} cy={cy} r={0} />
  return (
    <g>
      <circle cx={cx} cy={cy} r={8} fill="#fb7185" opacity={0.20} />
      <circle cx={cx} cy={cy} r={5} fill="#fb7185" stroke="#fecaca" strokeWidth={1.4} />
    </g>
  )
}


// =======================
// Helpers
// =======================
function safeNum(v, fb = 0) {
  const n = parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : fb
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n))
}

function hoursToAge(h) {
  const hh = safeNum(h, 0)
  const d = Math.floor(hh / 24)
  const r = hh - d * 24
  const hr = Math.floor(r)
  const m = Math.floor((r - hr) * 60)
  if (d > 0) return `${d}d${hr}h`
  if (hr > 0) return `${hr}h${m}m`
  return `${m}m`
}

function ageToHours(ageStr) {
  if (!ageStr) return 0
  const s = String(ageStr).trim()
  const m = s.match(/(?:(\d+)\s*d)?\s*(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?/i)
  if (!m) return 0
  const d = parseInt(m[1] || '0', 10)
  const h = parseInt(m[2] || '0', 10)
  const mm = parseInt(m[3] || '0', 10)
  return d * 24 + h + mm / 60
}

function normalizeAgeToken(tok) {
  if (!tok) return ''
  const s = String(tok).trim()
  const m = s.match(/^\s*((?:\d+\s*d)?\s*(?:\d+\s*h)?\s*(?:\d+\s*m)?)/i)
  return m ? m[1].replace(/\s+/g, '') : s
}

function wpKey(host, job) {
  const h = (host || 'UNKNOWN').trim() || 'UNKNOWN'
  const j = (job || '?').trim() || '?'
  return `${h}::${j}`
}

function extractTimeFromFilename(name) {
  const m = String(name || '').match(/-(\d{4})\.log$/)
  if (!m) return null
  const hh = parseInt(m[1].slice(0, 2), 10)
  const mm = parseInt(m[1].slice(2, 4), 10)
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

function detectSnapshotTime(name, text) {
  const fromName = extractTimeFromFilename(name)
  if (fromName) return fromName

  const t = String(text || '')
  const mSnap = t.match(/^\s*snapshot\s*@\s*(?:\d{4}-\d{2}-\d{2}\s+)?(\d{2}):(\d{2})(?::\d{2})?/im)
  if (mSnap) return `${mSnap[1]}:${mSnap[2]}`

  const mTS = t.match(/\bTS\s*=\s*\d{4}-\d{2}-\d{2}\s+(\d{2}):(\d{2})(?::\d{2})?/i)
  if (mTS) return `${mTS[1]}:${mTS[2]}`

  const mAny = t.match(/\b(\d{2}):(\d{2}):\d{2}\b/)
  if (mAny) return `${mAny[1]}:${mAny[2]}`

  return '--:--'
}

function parseSnapshotFullTime(text) {
  const m = String(text || '').match(/^\s*snapshot\s*@\s*(.+)$/im)
  return m ? String(m[1]).trim() : ''
}

// =======================
// Severity / Status
// =======================
function computeWpStatus({ rssGB, ageH }) {
  const r = safeNum(rssGB, 0)
  const a = safeNum(ageH, 0)
  if (r >= TH.rssCrit || a >= TH.ageCrit) return 'CRIT'
  if (r >= TH.rssWarn || a >= TH.ageWarn) return 'WARN'
  return 'OK'
}

function scorePart(val, warn, crit, weight) {
  const v = safeNum(val, 0)
  if (v >= crit) return weight
  if (v >= warn) return weight * 0.6
  return 0
}

function computeSeverity({ cpuPct, memPct, swapSi, maxRssGB, maxAgeH }) {
  let s = 0
  s += scorePart(cpuPct, TH.cpuWarn, TH.cpuCrit, WEIGHT.cpu)
  s += scorePart(memPct, TH.memWarn, TH.memCrit, WEIGHT.mem)
  if (safeNum(swapSi, 0) >= TH.swapWarn) s += WEIGHT.swap * 0.6
  if (safeNum(swapSi, 0) >= 10) s += WEIGHT.swap
  s += scorePart(maxRssGB, TH.rssWarn, TH.rssCrit, WEIGHT.rss)
  s += scorePart(maxAgeH, TH.ageWarn, TH.ageCrit, WEIGHT.age)
  return Math.round(clamp(s, 0, 100))
}

function classStatus(s) {
  const up = String(s || '').toUpperCase()
  if (up === 'CRIT') return 'badge b-crit'
  if (up === 'WARN') return 'badge b-warn'
  return 'badge'
}

// =======================
// Parse log blocks
// =======================
function splitSnapshotBlocks(text) {
  const t = String(text || '')
  const lines = t.split(/\r?\n/)
  const starts = []
  for (let i = 0; i < lines.length; i++) {
    const s = (lines[i] || '').trim().toLowerCase()
    if (s.startsWith('snapshot @')) starts.push(i)
  }
  if (starts.length === 0) return [{ blockText: t }]

  const blocks = []
  for (let i = 0; i < starts.length; i++) {
    const a = starts[i]
    const b = i + 1 < starts.length ? starts[i + 1] : lines.length
    blocks.push({ blockText: lines.slice(a, b).join('\n') })
  }
  return blocks
}

function parseWpRowLine(line, { host, instHint, section }) {
  const ln = String(line || '').trim()
  if (!ln) return null
  if (!/^\d{2,7}\b/.test(ln)) return null
  if (ln.startsWith('PID ')) return null

  const parts = ln.split(/\s+/)
  if (parts.length < 6) return null

  const pid = parts[0]
  const inst = parts[1] || instHint || ''
  const wpNo = parts[2] || ''
  const type = parts[3] || '-'

  let rssGB = 0
  let ageStr = ''
  let ageH = 0
  let state = ''

  for (let i = 5; i < parts.length; i++) {
    const p = parts[i]
    if (!p) continue
    if (!ageStr && /(?:\d+d|\d+h|\d+m)/i.test(p)) {
      ageStr = normalizeAgeToken(p)
      ageH = ageToHours(ageStr)
      continue
    }
    if (!rssGB && /^(\d+(?:[.,]\d+)?)(?:G)?$/i.test(p)) {
      const v = safeNum(p.replace(/G/i, ''), 0)
      if (v > 0 && v < 9999) rssGB = v
    }
    if (!state && /^[A-Z]{1,3}$/i.test(p) && p.length <= 3) state = p.toUpperCase()
  }

  // job + path
  let path = ''
  let job = '?'
  let errorCode = ''
  let pathIndex = -1
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]
    if (p && p.startsWith('/')) {
      pathIndex = i
      break
    }
  }
  const looksLikeJob = (x) => /^[A-Z][A-Z0-9_]{2,}$/i.test(x || '')
  if (pathIndex >= 0) {
    path = parts.slice(pathIndex).join(' ')
    const c1 = parts[pathIndex - 1] || ''
    const c2 = parts[pathIndex - 2] || ''
    if (looksLikeJob(c1)) {
      job = c1
      errorCode = c2 && !looksLikeJob(c2) ? c2 : ''
    } else if (looksLikeJob(c2)) {
      job = c2
      errorCode = c1 && !looksLikeJob(c1) ? c1 : ''
    } else {
      job = c1 || c2 || '?'
    }
  } else {
    for (let i = parts.length - 1; i >= 0; i--) {
      if (looksLikeJob(parts[i])) {
        job = parts[i]
        break
      }
    }
  }

  const focusKey = wpKey(host, job)
  const status = computeWpStatus({ rssGB, ageH })

  return {
    focusKey,
    host: host || 'UNKNOWN',
    inst,
    wpNo,
    section: section || '',
    pid,
    type,
    state,
    rssGB,
    ageStr,
    ageH,
    status,
    job,
    errorCode,
    path,
    raw: ln, // keep line only (for evidence / CSV)
  }
}

function parseWpTablesFromBlock(blockText, { host, instHint }) {
  const lines = String(blockText || '').split(/\r?\n/)
  const SECTION_HEADS = new Set([
    'CPU Tertinggi',
    'Memory Tertinggi (RSS)',
    'Running Terlama',
    'RABAX Terbanyak',
    'Blocked Terbanyak',
    'SUMP Terbanyak',
  ])

  const out = []
  let section = ''
  let inTable = false

  for (let i = 0; i < lines.length; i++) {
    const t = (lines[i] || '').trim()
    if (SECTION_HEADS.has(t)) {
      section = t
      inTable = false
      continue
    }
    if (!section) continue

    if (!inTable) {
      if (/^PID\b/i.test(t) && /AGE/i.test(t) && /RSS/i.test(t)) {
        inTable = true
      }
      continue
    }

    if (!t || SECTION_HEADS.has(t) || /^#/.test(t)) {
      section = ''
      inTable = false
      continue
    }

    if (/^-{3,}$/.test(t)) continue

    const row = parseWpRowLine(t, { host, instHint, section })
    if (row) out.push(row)
  }

  // Dedup per host by PID+JOB
  const map = new Map()
  for (const r of out) {
    const k = `${r.host}::${r.pid}::${r.job}`
    const prev = map.get(k)
    if (!prev) map.set(k, r)
    else {
      const better =
        safeNum(r.rssGB, 0) > safeNum(prev.rssGB, 0) ||
        (safeNum(r.rssGB, 0) === safeNum(prev.rssGB, 0) && safeNum(r.ageH, 0) > safeNum(prev.ageH, 0))
      if (better) map.set(k, r)
    }
  }

  const dedup = Array.from(map.values())
  dedup.sort((a, b) => safeNum(b.rssGB, 0) - safeNum(a.rssGB, 0) || safeNum(b.ageH, 0) - safeNum(a.ageH, 0))
  return dedup
}

function parseHostBlocks(text) {
  const blocks = splitSnapshotBlocks(text)
  const out = []

  for (const b of blocks) {
    const t = String(b.blockText || '')

    const timeFull = parseSnapshotFullTime(t)
    const host = (
      t.match(/Hostname\s*:\s*(\S+)/i)?.[1] ||
      t.match(/##\s*WP-SCOUT\s*@\s*(\S+)/i)?.[1] ||
      ''
    ).trim()

    const instHint = (t.match(/\bINSTS?\s*=\s*([0-9]{2})\b/i)?.[1] || '').trim()

    const cpuPct = safeNum(t.match(/CPU\s*usage\s*:\s*([0-9]+(?:[.,][0-9]+)?)\s*%\s*used/i)?.[1], 0)

    const memMatch = t.match(/Memory\s*:\s*used\s*([0-9]+(?:[.,][0-9]+)?)G\s*\(\s*([0-9]+(?:[.,][0-9]+)?)\s*%\s*\)/i)
    const memGB = memMatch ? safeNum(memMatch[1], 0) : 0
    const memPct = memMatch ? safeNum(memMatch[2], 0) : 0

    const swapMatch = t.match(/Swap\s*IO\s*:\s*si\/so\s*([0-9]+(?:[.,][0-9]+)?)\s*\/\s*([0-9]+(?:[.,][0-9]+)?)/i)
    const swapSi = swapMatch ? safeNum(swapMatch[1], 0) : 0
    const swapSo = swapMatch ? safeNum(swapMatch[2], 0) : 0

    const topWp = parseWpTablesFromBlock(t, { host: host || 'UNKNOWN', instHint })

    out.push({
      host: host || 'UNKNOWN',
      instHint,
      timeFull,
      cpuPct,
      memPct,
      memGB,
      swapSi,
      swapSo,
      topWp,
      ...(KEEP_RAW ? { raw: t } : {}),
    })
  }

  return out
}

function parseSnapshotFromText(filename, text) {
  const name = String(filename || 'log')
  const t = String(text || '')

  const time = detectSnapshotTime(name, t)
  const snapshotTimeFull = parseSnapshotFullTime(t)

  const hostBlocks = parseHostBlocks(t)

  const cpuPct = hostBlocks.length ? Math.max(...hostBlocks.map((h) => safeNum(h.cpuPct, 0))) : 0
  const memPct = hostBlocks.length ? Math.max(...hostBlocks.map((h) => safeNum(h.memPct, 0))) : 0
  const memGB = hostBlocks.length ? Math.max(...hostBlocks.map((h) => safeNum(h.memGB, 0))) : 0
  const swapSi = hostBlocks.length ? Math.max(...hostBlocks.map((h) => safeNum(h.swapSi, 0))) : 0
  const swapSo = hostBlocks.length ? Math.max(...hostBlocks.map((h) => safeNum(h.swapSo, 0))) : 0

  // combine + keep only top N (reduce memory when many logs)
  let topWp = hostBlocks.flatMap((hb) => hb.topWp || [])
  topWp.sort((a, b) => safeNum(b.rssGB, 0) - safeNum(a.rssGB, 0) || safeNum(b.ageH, 0) - safeNum(a.ageH, 0))
  if (topWp.length > MAX_WP_PER_SNAPSHOT) topWp = topWp.slice(0, MAX_WP_PER_SNAPSHOT)

  const maxRssGB = topWp.length ? Math.max(...topWp.map((x) => safeNum(x.rssGB, 0))) : 0
  const maxAgeH = topWp.length ? Math.max(...topWp.map((x) => safeNum(x.ageH, 0))) : 0

  let wpWarn = 0
  let wpCrit = 0
  for (const wp of topWp) {
    const st = String(wp.status || computeWpStatus(wp)).toUpperCase()
    if (st === 'CRIT') wpCrit++
    else if (st === 'WARN') wpWarn++
  }

  const severity = computeSeverity({ cpuPct, memPct, swapSi, maxRssGB, maxAgeH })
  const status = severity >= 60 ? 'CRIT' : severity >= 35 ? 'WARN' : 'OK'

  return {
    id: `${name}__${time}__${Math.random().toString(16).slice(2)}`,
    file: name,
    time,
    snapshotTimeFull,
    hosts: hostBlocks.map((h) => h.host),
    hostBlocks,
    cpuPct,
    memPct,
    memGB,
    swapSi,
    swapSo,
    maxRssGB,
    maxAgeH,
    wpWarn,
    wpCrit,
    severity,
    status,
    topWp,
  }
}

// =======================
// CSV utils
// =======================
function toCSV(rows, cols) {
  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`
  const head = cols.map((c) => esc(c.header)).join(',')
  const body = rows.map((r) => cols.map((c) => esc(c.value(r))).join(',')).join('\n')
  return `${head}\n${body}`
}

function downloadText(fileName, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = fileName
  a.click()
  URL.revokeObjectURL(a.href)
}

function useElementHeight(ref) {
  const [height, setHeight] = useState(0)

  useEffect(() => {
    const node = ref.current
    if (!node) return undefined

    const update = () => setHeight(node.clientHeight || 0)
    update()

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update)
      return () => window.removeEventListener('resize', update)
    }

    const ro = new ResizeObserver(update)
    ro.observe(node)
    return () => ro.disconnect()
  }, [ref])

  return height
}

function CmpVirtualTable({ rows, columns, rowKey, rowClass, onRowClick, emptyText, rowHeight = CMP_ROW_HEIGHT }) {
  const viewportRef = useRef(null)
  const height = useElementHeight(viewportRef)
  const [scrollTop, setScrollTop] = useState(0)
  const rafRef = useRef(0)
  const total = rows.length
  const overscan = 10
  const visibleCount = Math.max(1, Math.ceil((height || 1) / rowHeight))
  const start = clamp(Math.floor(scrollTop / rowHeight) - overscan, 0, Math.max(0, total - 1))
  const end = clamp(start + visibleCount + overscan * 2, 0, total)
  const slice = rows.slice(start, end)
  const gridTemplate = columns.map((c) => (c.flex ? '1fr' : `${c.w || 100}px`)).join(' ')

  const onScroll = (event) => {
    const next = event.currentTarget.scrollTop
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => setScrollTop(next))
  }

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
  }, [])

  return (
    <div className="cmpVt">
      <div className="cmpVtHead" style={{ gridTemplateColumns: gridTemplate }}>
        {columns.map((c) => <div key={c.id}>{c.label}</div>)}
      </div>
      <div className="cmpVtViewport" ref={viewportRef} onScroll={onScroll}>
        <div className="cmpVtSpacer" style={{ height: total * rowHeight }} />
        <div className="cmpVtSlice" style={{ transform: `translateY(${start * rowHeight}px)` }}>
          {slice.map((row, i) => {
            const idx = start + i
            return (
              <button
                type="button"
                key={rowKey(row, idx)}
                className={`cmpVtRow ${rowClass ? rowClass(row, idx) : ''}`}
                style={{ height: rowHeight, gridTemplateColumns: gridTemplate }}
                onClick={() => onRowClick?.(row, idx)}
              >
                {columns.map((c) => (
                  <span key={c.id} className={c.wrap ? 'cellWrap' : ''} title={c.title ? c.title(row, idx) : ''}>
                    {c.render ? c.render(row, idx) : row[c.id]}
                  </span>
                ))}
              </button>
            )
          })}
          {!total ? <div className="cmpVtEmpty">{emptyText}</div> : null}
        </div>
      </div>
    </div>
  )
}

function sleep0() {
  return new Promise((r) => setTimeout(r, 0))
}

function sortByTimeAsc(arr) {
  return arr.slice().sort((a, b) => String(a.time).localeCompare(String(b.time)) || String(a.file).localeCompare(String(b.file)))
}

function pickDefaultSnapshotId(arr) {
  if (!arr.length) return null
  // default = worst severity (tie: latest time)
  const best = arr.reduce((acc, s) => {
    if (!acc) return s
    if (safeNum(s.severity, 0) > safeNum(acc.severity, 0)) return s
    if (safeNum(s.severity, 0) < safeNum(acc.severity, 0)) return acc
    return String(s.time).localeCompare(String(acc.time)) > 0 ? s : acc
  }, null)
  return best?.id || arr[0].id
}
function formatChartValue(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return String(value ?? '—')

  // Normalize floating point artifacts like 103.32000000000002 -> 103.32
  const rounded = Math.round((n + Number.EPSILON) * 100) / 100
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(rounded)
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null

  const items = payload
    .filter((p) => p && p.value !== null && p.value !== undefined)
    .slice(0, 8)

  if (!items.length) return null

  return (
    <div className="cmpTooltip">
      <div className="cmpTooltipTitle">{label}</div>
      <div className="cmpTooltipList">
        {items.map((p, i) => (
          <div key={`${p.dataKey || p.name}-${i}`} className="cmpTooltipRow">
            <span className="cmpTooltipName" title={String(p.name || p.dataKey || '')}>
              <i style={{ background: p.color || p.stroke || 'currentColor' }} />
              <span>{p.name || p.dataKey}</span>
            </span>
            <strong>{formatChartValue(p.value)}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}



// =======================
// Tool UI
// =======================

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    console.error('[ToolComparer] crashed:', error, info)
  }
  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div style={{ padding: 16 }}>
        <div className="cmpPanel" style={{ padding: 14 }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>ToolComparer crash (handled)</div>
          <div style={{ opacity: 0.8, marginBottom: 10 }}>
            Ada error saat proses data log. Cek banner / console untuk detail.
          </div>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.4 }}>
{String(this.state.error?.stack || this.state.error || 'Unknown error')}
          </pre>
          <button className="btn" onClick={() => location.reload()} type="button">Reload</button>
        </div>
      </div>
    )
  }
}

export default function ToolComparer() {
  const inputRef = useRef(null)

  const [snapshots, setSnapshots] = useState([])
  const [selectedId, setSelectedId] = useState(null)

  const [snapSearch, setSnapSearch] = useState('')
  const [onlyBadSnapshots, setOnlyBadSnapshots] = useState(false)
  const [snapOrder, setSnapOrder] = useState('time') // time | severity

  const [offSearch, setOffSearch] = useState('')

  const [wpSearch, setWpSearch] = useState('')
  const [wpHost, setWpHost] = useState('ALL')
  const [wpOnlyBad, setWpOnlyBad] = useState(true)
  const [wpRunaway, setWpRunaway] = useState(false)
  const [wpLimit, setWpLimit] = useState(250)
  const [showRssChart, setShowRssChart] = useState(true)
  const [showTrend, setShowTrend] = useState(true)
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [centerCollapsed, setCenterCollapsed] = useState(false)
  const [activeSection, setActiveSection] = useState('snapshots')

  const [focusKey, setFocusKey] = useState('')
  const [focusedMode, setFocusedMode] = useState(false)

  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [uiError, setUiError] = useState('')
  const deferredSnapSearch = React.useDeferredValue(snapSearch)
  const deferredOffSearch = React.useDeferredValue(offSearch)
  const deferredWpSearch = React.useDeferredValue(wpSearch)

  const selected = useMemo(() => snapshots.find((s) => s.id === selectedId) || null, [snapshots, selectedId])

  const hostOptions = useMemo(() => {
    const set = new Set()
    for (const wp of selected?.topWp || []) set.add((wp.host || 'UNKNOWN').trim() || 'UNKNOWN')
    return ['ALL', ...Array.from(set).sort()]
  }, [selected])

  // drag & drop
  const [dragOver, setDragOver] = useState(false)

  function ensureSelected(nextSnaps) {
    if (!nextSnaps.length) {
      setSelectedId(null)
      return
    }
    if (selectedId && nextSnaps.some((s) => s.id === selectedId)) return
    setSelectedId(pickDefaultSnapshotId(nextSnaps))
  }

    async function readFiles(files) {
    if (!files?.length) return
    setUiError('')
    setLoading(true)
    setLoadingMsg('Reading files…')
    try {
      const good = []
      const bad = []
      const list = Array.from(files).filter(Boolean)
      for (let i = 0; i < list.length; i++) {
        const f = list[i]
        try {
          if (i % 4 === 0) {
            setLoadingMsg(`Reading ${i + 1}/${list.length}…`)
            await sleep0()
          }
          const text = await f.text()
          setLoadingMsg(`Parsing ${i + 1}/${list.length}…`)
          const snap = parseSnapshotFromText(f.name, text)
          if (snap) good.push(snap)
          else bad.push(`${f.name}: empty/unknown format`)
        } catch (e) {
          console.error('[ToolComparer] parse failed:', f?.name, e)
          bad.push(`${f?.name || 'file'}: ${e?.message || String(e)}`)
        }
        // yield to UI (important for large batches)
        await sleep0()
      }

      const sorted = sortByTimeAsc(good)
      setSnapshots(sorted)
      ensureSelected(sorted)
      setWpHost('ALL')

      if (bad.length) {
        const head = bad.slice(0, 10)
        setUiError(
          `Ada ${bad.length} file gagal diparse. Contoh:\n- ` +
            head.join('\n- ') +
            (bad.length > head.length ? `\n... dan ${bad.length - head.length} lainnya` : '')
        )
      }
    } catch (e) {
      console.error('[ToolComparer] readFiles crash:', e)
      setUiError(`Upload/parse crash: ${e?.message || String(e)}`)
    } finally {
      setLoading(false)
      setLoadingMsg('')
    }
  }

  function clearAll() {
    setSnapshots([])
    setSelectedId(null)
    setSnapSearch('')
    setOnlyBadSnapshots(false)
    setOffSearch('')
    setWpSearch('')
    setWpHost('ALL')
    setWpOnlyBad(true)
    setWpRunaway(false)
    setWpLimit(250)
    setFocusedMode(false)
    setFocusKey('')
  }

  const filteredSnapshots = useMemo(() => {
    const q = deferredSnapSearch.trim().toLowerCase()
    let arr = snapshots.slice()

    // focus mode: keep only snapshots containing focusKey
    if (focusedMode && focusKey) {
      arr = arr.filter((s) => (s.topWp || []).some((wp) => (wp.focusKey || wpKey(wp.host, wp.job)) === focusKey))
    }

    if (onlyBadSnapshots) arr = arr.filter((s) => s.status === 'WARN' || s.status === 'CRIT')

    if (q) {
      arr = arr.filter((s) => `${s.file} ${s.time} ${s.status} ${s.severity}`.toLowerCase().includes(q))
    }

    // ordering
    if (snapOrder === 'severity') {
      arr.sort((a, b) => safeNum(b.severity, 0) - safeNum(a.severity, 0) || String(b.time).localeCompare(String(a.time)))
    } else {
      arr = sortByTimeAsc(arr)
    }

    return arr
  }, [snapshots, deferredSnapSearch, onlyBadSnapshots, focusedMode, focusKey, snapOrder])

  const trendData = useMemo(() => {
    // trend should always be time-sorted
    const arr = sortByTimeAsc(filteredSnapshots)

    const quantile = (vals, q) => {
      const a = (vals || []).filter((x) => Number.isFinite(x)).slice().sort((x, y) => x - y)
      if (!a.length) return 0
      const pos = (a.length - 1) * q
      const base = Math.floor(pos)
      const rest = pos - base
      const v0 = a[base]
      const v1 = a[Math.min(base + 1, a.length - 1)]
      return v0 + (v1 - v0) * rest
    }

    return arr.map((s) => {
      const top = s.topWp || []
      const rssVals = top.map((x) => safeNum(x.rssGB, 0)).filter((x) => Number.isFinite(x))
      const totalRssGB = rssVals.reduce((a, b) => a + b, 0)
      const p95RssGB = quantile(rssVals, 0.95)

      const badWpCount = safeNum(s.wpWarn, 0) + safeNum(s.wpCrit, 0)
      const runawayCount = top.filter((x) => safeNum(x.ageH, 0) >= TH.ageWarn).length

      // offenders = unique focusKey (HOST::JOB) in this snapshot
      const offenderCount = (() => {
        const set = new Set()
        for (const wp of top) set.add(wp.focusKey || wpKey(wp.host, wp.job))
        return set.size
      })()

      return {
        ...s,
        hasSwap: safeNum(s.swapSi, 0) > 0,
        cpuAnomaly: safeNum(s.cpuPct, 0) >= TH.cpuWarn,
        memAnomaly: safeNum(s.memPct, 0) >= TH.memWarn,
        swapAnomaly: safeNum(s.swapSi, 0) >= TH.swapWarn,
        severityAnomaly: safeNum(s.severity, 0) >= 35,
        rssAnomaly: safeNum(s.maxRssGB, 0) >= TH.rssWarn,
        badWpCount,
        runawayCount,
        runawayAnomaly: runawayCount > 0,
        badWpAnomaly: badWpCount > 0,
        offenderCount,
        totalRssGB,
        p95RssGB,
      }
    })
  }, [filteredSnapshots])
  const hostRssTrend = useMemo(() => {
    // Build series: each point includes host totals (RSS GB sum) for top-N hosts globally
    const snaps = sortByTimeAsc(filteredSnapshots)

    const hostTotals = new Map()
    for (const s of snaps) {
      for (const hb of s.hostBlocks || []) {
        const h = (hb.host || 'UNKNOWN').trim() || 'UNKNOWN'
        const rss = (hb.topWp || []).reduce((a, w) => a + safeNum(w.rssGB, 0), 0)
        hostTotals.set(h, (hostTotals.get(h) || 0) + rss)
      }
    }

    const topHosts = Array.from(hostTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([h]) => h)

    const data = snaps.map((s) => {
      const point = { time: s.time }
      for (const h of topHosts) point[h] = 0

      for (const hb of s.hostBlocks || []) {
        const h = (hb.host || 'UNKNOWN').trim() || 'UNKNOWN'
        if (!topHosts.includes(h)) continue
        const rss = (hb.topWp || []).reduce((a, w) => a + safeNum(w.rssGB, 0), 0)
        point[h] += rss
      }
      return point
    })

    return { topHosts, data }
  }, [filteredSnapshots])


  const baseOffenders = useMemo(() => {
    // Group by HOST::JOB across all snapshots (NO merge host)
    const map = new Map()
    for (const snap of snapshots) {
      for (const wp of snap.topWp || []) {
        const key = wp.focusKey || wpKey(wp.host, wp.job)

        const host = (wp.host || 'UNKNOWN').trim() || 'UNKNOWN'
        const job = (wp.job || '?').trim() || '?'
        const rssGB = safeNum(wp.rssGB, 0)
        const ageH = safeNum(wp.ageH, 0)
        const st = String(wp.status || computeWpStatus(wp)).toUpperCase()

        const prev = map.get(key) || {
          key,
          host,
          job,
          count: 0,
          maxRssGB: 0,
          maxAgeH: 0,
          warn: 0,
          crit: 0,
          worst: 'OK',
          bestSnapId: null,
          bestSnapTime: '',
          bestSnapFile: '',
          bestRssGB: 0,
          bestAgeH: 0,
        }

        prev.count += 1
        prev.maxRssGB = Math.max(prev.maxRssGB, rssGB)
        prev.maxAgeH = Math.max(prev.maxAgeH, ageH)
        if (st === 'CRIT') prev.crit += 1
        else if (st === 'WARN') prev.warn += 1
        prev.worst = prev.crit > 0 ? 'CRIT' : prev.warn > 0 ? 'WARN' : 'OK'

        // remember best snapshot for quick jump
        const better =
          rssGB > prev.bestRssGB ||
          (rssGB === prev.bestRssGB && ageH > prev.bestAgeH) ||
          (rssGB === prev.bestRssGB && ageH === prev.bestAgeH && String(snap.time).localeCompare(String(prev.bestSnapTime)) > 0)
        if (better) {
          prev.bestRssGB = rssGB
          prev.bestAgeH = ageH
          prev.bestSnapId = snap.id
          prev.bestSnapTime = snap.time
          prev.bestSnapFile = snap.file
        }

        map.set(key, prev)
      }
    }

    const weight = (x) => (x.worst === 'CRIT' ? 2 : x.worst === 'WARN' ? 1 : 0)
    return Array.from(map.values()).sort((a, b) => {
      const dw = weight(b) - weight(a)
      if (dw) return dw
      const dr = b.maxRssGB - a.maxRssGB
      if (dr) return dr
      const da = b.maxAgeH - a.maxAgeH
      if (da) return da
      return b.count - a.count
    })
  }, [snapshots])

  const offenders = useMemo(() => {
    let arr = baseOffenders
    if (focusedMode && focusKey) arr = arr.filter((o) => o.key === focusKey)
    const q = deferredOffSearch.trim().toLowerCase()
    if (q) {
      arr = arr.filter((o) => `${o.host} ${o.job} ${o.key}`.toLowerCase().includes(q))
    }
    return arr
  }, [baseOffenders, focusedMode, focusKey, deferredOffSearch])

  const wpRows = useMemo(() => {
    if (!selected) return []
    const q = deferredWpSearch.trim().toLowerCase()

    let rows = (selected.topWp || []).map((wp) => ({
      ...wp,
      rssGB: safeNum(wp.rssGB, 0),
      ageH: safeNum(wp.ageH, 0),
      status: String(wp.status || computeWpStatus(wp)).toUpperCase(),
    }))

    if (focusedMode && focusKey) rows = rows.filter((r) => (r.focusKey || wpKey(r.host, r.job)) === focusKey)
    if (wpHost && wpHost !== 'ALL') rows = rows.filter((r) => (r.host || 'UNKNOWN') === wpHost)
    if (wpOnlyBad) rows = rows.filter((r) => r.status === 'WARN' || r.status === 'CRIT')
    if (wpRunaway) rows = rows.filter((r) => r.ageH >= TH.ageWarn)

    if (q) {
      rows = rows.filter((r) => `${r.host} ${r.pid} ${r.type} ${r.status} ${r.job} ${r.rssGB} ${r.ageStr}`.toLowerCase().includes(q))
    }

    rows.sort((a, b) => b.rssGB - a.rssGB || b.ageH - a.ageH)
    const limit = String(wpLimit) === 'ALL' ? rows.length : Math.max(50, safeNum(wpLimit, 250))
    return rows.slice(0, limit)
  }, [selected, deferredWpSearch, wpHost, wpOnlyBad, wpRunaway, focusedMode, focusKey, wpLimit])

  const barTopRSS = useMemo(() => {
    const rows = wpRows.slice(0, 10).slice().reverse()
    return rows.map((r, i) => {
      const hostShort = String(r.host || 'UNKNOWN').split('.')[0]
      const label = `${hostShort}:${r.job || '?'}`
      return { name: label.length > 24 ? `${label.slice(0, 24)}…` : label, RSS: r.rssGB, idx: i }
    })
  }, [wpRows])

const distType = useMemo(() => {
  const rows = selected?.topWp || []
  const map = new Map()
  for (const r of rows) {
    const k = String(r.type || '?').toUpperCase()
    map.set(k, (map.get(k) || 0) + 1)
  }
  return Array.from(map.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
}, [selected])

const distAge = useMemo(() => {
  const rows = selected?.topWp || []
  const buckets = [
    { label: '0-1h', min: 0, max: 1 },
    { label: '1-6h', min: 1, max: 6 },
    { label: '6-24h', min: 6, max: 24 },
    { label: '24-72h', min: 24, max: 72 },
    { label: '>72h', min: 72, max: 1e9 },
  ]
  return buckets.map((b) => ({
    bucket: b.label,
    count: rows.filter((r) => {
      const h = safeNum(r.ageH, 0)
      return h >= b.min && h < b.max
    }).length,
  }))
}, [selected])

const distRss = useMemo(() => {
  const rows = selected?.topWp || []
  const buckets = [
    { label: '0-1G', min: 0, max: 1 },
    { label: '1-2G', min: 1, max: 2 },
    { label: '2-4G', min: 2, max: 4 },
    { label: '4-8G', min: 4, max: 8 },
    { label: '>8G', min: 8, max: 1e9 },
  ]
  return buckets.map((b) => ({
    bucket: b.label,
    count: rows.filter((r) => {
      const g = safeNum(r.rssGB, 0)
      return g >= b.min && g < b.max
    }).length,
  }))
}, [selected])


  function buildEvidenceText() {
    if (!selected) return 'No snapshot selected.'
    const s = selected
    const lines = []
    lines.push(`=== SAP Comparer Evidence (Basis Focus) ===`)
    lines.push(`Snapshot file: ${s.file}`)
    lines.push(`Time: ${s.time}${s.snapshotTimeFull ? ` (${s.snapshotTimeFull})` : ''}`)
    lines.push(`Hosts: ${(s.hosts || []).join(', ')}`)
    lines.push(`Status: ${s.status} | Severity: ${s.severity}`)
    lines.push(
      `CPU%: ${safeNum(s.cpuPct).toFixed(2)} | Mem%: ${safeNum(s.memPct).toFixed(2)} | Swap si/so: ${safeNum(s.swapSi)}/${safeNum(s.swapSo)}`
    )
    lines.push(`MaxRSS: ${safeNum(s.maxRssGB).toFixed(2)} GB | MaxAge: ${hoursToAge(s.maxAgeH)}`)
    if (focusKey) lines.push(`Focus offender: ${focusKey}`)
    lines.push(`Top WP (filtered):`)
    for (const r of wpRows.slice(0, 20)) {
      lines.push(
        `- [${r.host}] PID ${r.pid} | ${r.type} | RSS ${r.rssGB.toFixed(2)} GB | Age ${hoursToAge(r.ageH)} | ${r.status} | Job ${r.job}${r.inst ? ` | Inst ${r.inst}` : ''}${r.section ? ` | ${r.section}` : ''}${r.path ? ` | ${r.path}` : ''}`
      )
    }
    return lines.join('\n')
  }

  function exportOffendersCSV() {
    const csv = toCSV(offenders, [
      { header: 'key', value: (r) => r.key },
      { header: 'host', value: (r) => r.host },
      { header: 'job', value: (r) => r.job },
      { header: 'count', value: (r) => r.count },
      { header: 'maxRssGB', value: (r) => r.maxRssGB },
      { header: 'maxAgeH', value: (r) => r.maxAgeH },
      { header: 'warn', value: (r) => r.warn },
      { header: 'crit', value: (r) => r.crit },
      { header: 'worst', value: (r) => r.worst },
      { header: 'bestSnapTime', value: (r) => r.bestSnapTime },
      { header: 'bestSnapFile', value: (r) => r.bestSnapFile },
    ])
    downloadText('recurring_offenders.csv', csv)
  }

  function exportWpCSV() {
    const csv = toCSV(wpRows, [
      { header: 'focusKey', value: (r) => r.focusKey || wpKey(r.host, r.job) },
      { header: 'host', value: (r) => r.host },
      { header: 'inst', value: (r) => r.inst || '' },
      { header: 'pid', value: (r) => r.pid },
      { header: 'type', value: (r) => r.type },
      { header: 'rssGB', value: (r) => r.rssGB },
      { header: 'ageH', value: (r) => r.ageH },
      { header: 'status', value: (r) => r.status },
      { header: 'job', value: (r) => r.job },
      { header: 'errorCode', value: (r) => r.errorCode || '' },
      { header: 'path', value: (r) => r.path || '' },
      { header: 'raw', value: (r) => r.raw },
    ])
    downloadText('top_wp_selected_snapshot.csv', csv)
  }

  async function copyEvidence() {
    const text = buildEvidenceText()
    try {
      await navigator.clipboard.writeText(text)
      alert('Copied ✅')
    } catch {
      window.prompt('Clipboard gagal (HTTP / Not secure). Copy manual:', text)
    }
  }

  function applyFocus(val, opts = { jumpToBest: false }) {
    const v = String(val || '').trim()
    if (!v) return
    setFocusKey(v)
    setFocusedMode(true)

    if (opts?.jumpToBest) {
      const hit = baseOffenders.find((o) => o.key === v)
      if (hit?.bestSnapId) setSelectedId(hit.bestSnapId)
    }
  }

  function clearFocus() {
    setFocusedMode(false)
    setFocusKey('')
  }

  // keep selection valid when filters change & current selected disappears
  useEffect(() => {
    if (!snapshots.length) return
    if (selectedId && snapshots.some((s) => s.id === selectedId)) return
    ensureSelected(snapshots)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshots])

  useEffect(() => {
    const ids = ['snapshots', 'offenders', 'summary', 'charts', 'top-wp']
    const nodes = ids.map((id) => document.getElementById(`cmp-${id}`)).filter(Boolean)
    if (!nodes.length || typeof IntersectionObserver === 'undefined') return undefined

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (visible?.target?.id) setActiveSection(visible.target.id.replace('cmp-', ''))
      },
      { root: null, rootMargin: '-140px 0px -55% 0px', threshold: [0.08, 0.18, 0.32] },
    )

    nodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [showTrend, leftCollapsed, centerCollapsed, snapshots.length])

  function jumpToSection(sectionId) {
    if (sectionId === 'top') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    const node = document.getElementById(`cmp-${sectionId}`)
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  useEffect(() => {
    const onKeyDown = (event) => {
      const shortcutEnabled = event.altKey || event.ctrlKey
      if (!shortcutEnabled || event.shiftKey || event.metaKey) return

      const key = String(event.key || '').toLowerCase()
      const target = {
        '1': 'snapshots',
        '2': 'offenders',
        '3': 'summary',
        '4': 'charts',
        '5': 'top-wp',
        t: 'top',
      }[key]

      if (!target) return
      event.preventDefault()
      jumpToSection(target)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div
      className={`cmpWrap cmpV2 ${dragOver ? 'dragOver' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const files = Array.from(e.dataTransfer?.files || []).filter((f) => /\.(log|txt)$/i.test(f.name))
        readFiles(files)
      }}
    >
      {/* Top bar (sticky) */}
      <div className="cmpTopbar">
        <div className="cmpTopbarRow">
          <div className="cmpTitleBlock">
            <div className="cmpTitle">Comparer – SAP Daily Check / WP-SCOUT Analyzer</div>
            <div className="cmpSub">
              Upload log batch → klik snapshot / offender → langsung lihat <b>Top WP</b>. (Drag &amp; drop juga bisa)
            </div>
          </div>

          <div className="cmpActions">
            <button className="btn btn-primary" onClick={() => inputRef.current?.click()} type="button" disabled={loading}>
              Upload log…
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".log,.txt"
              multiple
              className="hidden"
              onChange={(e) => readFiles(Array.from(e.target.files || []))}
            />
            <button className="btn" onClick={clearAll} type="button" disabled={loading && !snapshots.length}>
              Clear
            </button>
          </div>
        </div>

        <div className="cmpTopbarRow cmpTopbarRow2">
          <div className="kpiStrip">
            <div className="kpiMini">
              <div className="kpiMiniLabel">Snapshots</div>
              <div className="kpiMiniValue">{snapshots.length}</div>
            </div>
            <div className="kpiMini">
              <div className="kpiMiniLabel">Bad</div>
              <div className="kpiMiniValue">{snapshots.filter((s) => s.status !== 'OK').length}</div>
            </div>
            <div className="kpiMini">
              <div className="kpiMiniLabel">Highest Sev</div>
              <div className="kpiMiniValue">{snapshots.length ? Math.max(...snapshots.map((s) => safeNum(s.severity, 0))) : 0}</div>
            </div>
            <div className="kpiMini">
              <div className="kpiMiniLabel">Offenders</div>
              <div className="kpiMiniValue">{baseOffenders.length}</div>
            </div>
            <div className="kpiMini kpiMiniWide">
              <div className="kpiMiniLabel">Mode</div>
              <div className="kpiMiniValue">
                <span className={`badge ${focusedMode ? 'b-warn' : ''}`}>{focusedMode ? 'FOCUS' : 'NORMAL'}</span>
                {focusedMode && focusKey ? <span className="pill pill-muted mono">{focusKey}</span> : null}
              </div>
            </div>
          </div>

          <div className="cmpInlineControls">
            <div className="row gap">
              <input
                className="input"
                placeholder="Focus offender (HOST::JOB)…"
                value={focusKey}
                onChange={(e) => setFocusKey(e.target.value)}
                disabled={loading}
              />
              <button className="btn" type="button" onClick={() => applyFocus(focusKey, { jumpToBest: true })} disabled={!focusKey || loading}>
                Apply
              </button>
              <button className="btn" type="button" onClick={clearFocus} disabled={!focusedMode && !focusKey}>
                Clear focus
              </button>
            </div>

            <div className="row gap">
              <label className="toggle">
                <input type="checkbox" checked={showTrend} onChange={(e) => setShowTrend(e.target.checked)} />
                <span>Trend</span>
              </label>
              <label className="toggle">
                <input type="checkbox" checked={showRssChart} onChange={(e) => setShowRssChart(e.target.checked)} />
                <span>RSS chart</span>
              </label>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="cmpLoading">
            <span className="spinner" aria-hidden="true" />
            <span>{loadingMsg || 'Working…'}</span>
          </div>
        ) : null}
        {uiError ? <div className="cmpError">{uiError}</div> : null}

        <nav className="cmpSectionNav" aria-label="Comparer sections">
          {[
            ['snapshots', 'Snapshots'],
            ['offenders', 'Offenders'],
            ['summary', 'Summary'],
            ['charts', 'Charts'],
            ['top-wp', 'Top WP'],
          ].map(([id, label]) => (
            <a key={id} className={activeSection === id ? 'is-active' : ''} href={`#cmp-${id}`}>
              {label}
            </a>
          ))}
        </nav>
      </div>

      <div className="cmpQuickJump" aria-label="Quick jump navigation">
        {[
          ['snapshots', 'Snapshots', '1'],
          ['offenders', 'Offenders', '2'],
          ['summary', 'Summary', '3'],
          ['charts', 'Charts', '4'],
          ['top-wp', 'Top WP', '5'],
        ].map(([id, label, key]) => (
          <button
            key={id}
            type="button"
            className={activeSection === id ? 'is-active' : ''}
            onClick={() => jumpToSection(id)}
            title={`Jump to ${label} (${key})`}
          >
            <span>{label}</span>
            <kbd>{key}</kbd>
          </button>
        ))}
        <button type="button" onClick={() => jumpToSection('top')} title="Back to top (T)">
          <span>Top</span>
          <kbd>T</kbd>
        </button>
      </div>

      {/* Workspace */}
      <div className={`cmpMain ${leftCollapsed ? 'is-left-collapsed' : ''} ${centerCollapsed ? 'is-center-collapsed' : ''}`}>
        {/* LEFT column: snapshots + offenders */}
        <div className="cmpCol cmpColLeft">
          <section className="panel" id="cmp-snapshots">
            <div className="panelHead">
              <div>
                <div className="panelTitle">Snapshots</div>
                <div className="panelSub">Klik baris → langsung update Top WP • virtual rows {filteredSnapshots.length}</div>
              </div>

              <div className="row gap">
                <button className="btn btn-mini" type="button" onClick={() => setLeftCollapsed(true)}>
                  Hide
                </button>
                <select className="input inputSm" value={snapOrder} onChange={(e) => setSnapOrder(e.target.value)} title="Sort">
                  <option value="time">Sort: time</option>
                  <option value="severity">Sort: severity</option>
                </select>
                <label className="toggle">
                  <input type="checkbox" checked={onlyBadSnapshots} onChange={(e) => setOnlyBadSnapshots(e.target.checked)} />
                  <span>Only bad</span>
                </label>
              </div>
            </div>

            <div className="panelTools">
              <input
                className="input"
                placeholder="Search file / time / status…"
                value={snapSearch}
                onChange={(e) => setSnapSearch(e.target.value)}
              />
            </div>

            <div className="panelBody panelBodyFill">
              <CmpVirtualTable
                rows={filteredSnapshots}
                emptyText="Tidak ada snapshot (atau ter-filter habis)."
                rowKey={(s) => s.id}
                rowClass={(s) => `${s.id === selectedId ? 'rowActive' : ''} ${s.status === 'CRIT' ? 'rowCrit' : s.status === 'WARN' ? 'rowWarn' : ''}`}
                onRowClick={(s) => {
                  setSelectedId(s.id)
                  setWpHost('ALL')
                }}
                columns={[
                  { id: 'time', label: 'Time', w: 58, render: (s) => <span className="pill pill-muted">{s.time}</span> },
                  { id: 'severity', label: 'Sev', w: 58, render: (s) => <span className="pill pill-info">{safeNum(s.severity, 0)}</span> },
                  { id: 'cpu', label: 'CPU', w: 74, render: (s) => <span className="pill pill-muted">{safeNum(s.cpuPct).toFixed(1)}%</span> },
                  { id: 'mem', label: 'Mem', w: 74, render: (s) => <span className="pill pill-muted">{safeNum(s.memPct).toFixed(1)}%</span> },
                  { id: 'swap', label: 'Swap', w: 66, render: (s) => <span className={`pill ${safeNum(s.swapSi) > 0 ? 'pill-warn' : 'pill-muted'}`}>{safeNum(s.swapSi)}</span> },
                  { id: 'rss', label: 'RSS', w: 66, render: (s) => <span className="pill pill-muted">{safeNum(s.maxRssGB).toFixed(1)}</span> },
                  { id: 'age', label: 'Age', w: 70, render: (s) => <span className="pill pill-age">{hoursToAge(s.maxAgeH)}</span> },
                  { id: 'status', label: 'Status', w: 72, render: (s) => <span className={classStatus(s.status)}>{s.status}</span> },
                  { id: 'file', label: 'File', flex: true, title: (s) => s.file, render: (s) => s.file },
                ]}
              />
            </div>
          </section>

          <section className="panel panelTight" id="cmp-offenders">
            <div className="panelHead">
              <div>
                <div className="panelTitle">Recurring offenders (HOST::JOB)</div>
                <div className="panelSub">Klik Focus / Jump untuk cepat analisa • virtual rows {offenders.length}</div>
              </div>

              <button className="btn" onClick={exportOffendersCSV} type="button" disabled={!offenders.length}>
                Export CSV
              </button>
            </div>

            <div className="panelTools">
              <input
                className="input"
                placeholder="Search offender (host/job)…"
                value={offSearch}
                onChange={(e) => setOffSearch(e.target.value)}
              />
            </div>

            <div className="panelBody panelBodyFill">
              <CmpVirtualTable
                rows={offenders}
                emptyText="Belum ada data offender."
                rowKey={(o) => o.key}
                rowClass={(o) => (focusKey && o.key === focusKey ? 'rowActive' : '')}
                columns={[
                  { id: 'worst', label: 'Worst', w: 76, render: (o) => <span className={classStatus(o.worst)}>{o.worst}</span> },
                  { id: 'count', label: 'Cnt', w: 60, render: (o) => <span className="pill pill-muted">{o.count}</span> },
                  { id: 'rss', label: 'RSS', w: 74, render: (o) => <span className="pill pill-muted">{o.maxRssGB.toFixed(1)}</span> },
                  { id: 'age', label: 'Age', w: 74, render: (o) => <span className="pill pill-age">{hoursToAge(o.maxAgeH)}</span> },
                  { id: 'host', label: 'Host', w: 120, title: (o) => o.host, render: (o) => o.host },
                  { id: 'job', label: 'Job', flex: true, title: (o) => o.job, render: (o) => o.job },
                  {
                    id: 'action',
                    label: 'Action',
                    w: 118,
                    render: (o) => (
                      <div className="row gap">
                        <button className="btn btn-mini" type="button" onClick={(e) => { e.stopPropagation(); applyFocus(o.key) }}>Focus</button>
                        <button
                          className="btn btn-mini"
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            if (o.bestSnapId) setSelectedId(o.bestSnapId)
                            applyFocus(o.key)
                          }}
                          title={o.bestSnapId ? `Jump to ${o.bestSnapTime}` : 'Jump'}
                          disabled={!o.bestSnapId}
                        >
                          Jump
                        </button>
                      </div>
                    ),
                  },
                ]}
              />
            </div>
          </section>
        </div>

        {/* CENTER column: selected summary + trend */}
        <div className="cmpCol cmpColCenter">
          <section className="panel" id="cmp-summary">
            <div className="panelHead">
              <div>
                <div className="panelTitle">Selected snapshot</div>
                <div className="panelSub">{selected ? selected.file : '—'}</div>
              </div>
              <div className="row gap">
                <button className="btn btn-mini" type="button" onClick={() => setCenterCollapsed(true)}>
                  Hide
                </button>
                <span className={classStatus(selected?.status)}>{selected?.status || '—'}</span>
              </div>
            </div>

            <div className="panelBody">
              {selected ? (
                <div className="summaryGrid summaryGrid--ops">
                  <div className={`summaryCard summaryCard--status ${String(selected.status || '').toLowerCase()}`}>
                    <div className="summaryLabel">Severity</div>
                    <div className="summaryValue">{selected.severity}</div>
                    <div className="summaryHint">{selected.status || '—'}</div>
                  </div>
                  <div className="summaryCard">
                    <div className="summaryLabel">CPU</div>
                    <div className="summaryValue">{safeNum(selected.cpuPct).toFixed(2)}%</div>
                    <div className="summaryHint">host utilization</div>
                  </div>
                  <div className="summaryCard">
                    <div className="summaryLabel">Mem</div>
                    <div className="summaryValue">{safeNum(selected.memPct).toFixed(1)}%</div>
                    <div className="summaryHint">memory usage</div>
                  </div>
                  <div className="summaryCard">
                    <div className="summaryLabel">Swap si/so</div>
                    <div className="summaryValue">
                      {safeNum(selected.swapSi)}/{safeNum(selected.swapSo)}
                    </div>
                    <div className="summaryHint">paging pressure</div>
                  </div>
                  <div className="summaryCard">
                    <div className="summaryLabel">Max RSS</div>
                    <div className="summaryValue">{safeNum(selected.maxRssGB).toFixed(2)} GB</div>
                    <div className="summaryHint">largest work process</div>
                  </div>
                  <div className="summaryCard">
                    <div className="summaryLabel">Max Age</div>
                    <div className="summaryValue">{hoursToAge(selected.maxAgeH)}</div>
                    <div className="summaryHint">longest runtime</div>
                  </div>
                  <div className="summaryCard summaryCardWide">
                    <div className="summaryLabel">Hosts</div>
                    <div className="summaryValueSmall">{(selected.hosts || []).join(', ') || '-'}</div>
                    <div className="summaryHint">systems present in snapshot</div>
                  </div>
                </div>
              ) : (
                <div className="hint">Klik snapshot di kiri untuk melihat detail.</div>
              )}
            </div>
          </section>

          {showTrend ? (
            <section className="panel panelTight" id="cmp-charts">
              <div className="panelHead">
                <div>
                  <div className="panelTitle">Trend & Distributions</div>
                  <div className="panelSub">CPU/Mem/Swap • Severity/Bad WP • RSS • Runaway/Offenders • Top hosts (RSS)</div>
                </div>
              </div>

              <div className="panelBody panelBodyNoPad">
                <div className="trendGrid cmpChartReportGrid">
                  {/* CPU / Mem / Swap */}
                  <div className="chartBox chartDock" style={{ height: 220 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendData} margin={CHART_MARGIN}>
                        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                        <XAxis dataKey="time" interval="preserveStartEnd" minTickGap={18} tick={AXIS_TICK} />
                        <YAxis yAxisId="left" domain={[0, 100]} tick={AXIS_TICK} />
                        <YAxis yAxisId="right" orientation="right" tick={AXIS_TICK} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend {...LEGEND_PROPS} />
                        <ReferenceLine yAxisId="left" y={TH.cpuWarn} stroke="#fbbf24" strokeDasharray="4 4" strokeOpacity={0.45} />
                        <ReferenceLine yAxisId="left" y={TH.cpuCrit} stroke="#fb7185" strokeDasharray="4 4" strokeOpacity={0.45} />
                        <ReferenceLine yAxisId="left" y={TH.memWarn} stroke="#a78bfa" strokeDasharray="2 5" strokeOpacity={0.30} />
                        <Line yAxisId="left" type="monotone" dataKey="cpuPct" name="CPU %" stroke="#60a5fa" strokeWidth={2.8} dot={renderAnomalyDot('cpuPct', TH.cpuWarn, '#60a5fa')} activeDot={{ r: 6 }} />
                        <Line yAxisId="left" type="monotone" dataKey="memPct" name="Mem %" stroke="#a78bfa" strokeWidth={2.8} dot={renderAnomalyDot('memPct', TH.memWarn, '#a78bfa')} activeDot={{ r: 6 }} />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="swapSi"
                          name="Swap si"
                          stroke="#fb7185"
                          strokeDasharray="5 4"
                          strokeWidth={2.8}
                          dot={renderSwapDot}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Severity vs Bad WP */}
                  <div className="chartBox chartDock" style={{ height: 220 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendData} margin={CHART_MARGIN}>
                        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                        <XAxis dataKey="time" interval="preserveStartEnd" minTickGap={18} tick={AXIS_TICK} />
                        <YAxis yAxisId="left" domain={[0, 100]} tick={AXIS_TICK} />
                        <YAxis yAxisId="right" orientation="right" tick={AXIS_TICK} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend {...LEGEND_PROPS} />
                        <ReferenceLine yAxisId="left" y={35} stroke="#fbbf24" strokeDasharray="4 4" strokeOpacity={0.45} />
                        <ReferenceLine yAxisId="left" y={60} stroke="#fb7185" strokeDasharray="4 4" strokeOpacity={0.45} />
                        <Line yAxisId="left" type="monotone" dataKey="severity" name="Severity" stroke="#fbbf24" strokeWidth={2.8} dot={renderAnomalyDot('severity', 35, '#fbbf24')} activeDot={{ r: 6 }} />
                        <Line yAxisId="right" type="monotone" dataKey="badWpCount" name="Bad WP" stroke="#34d399" strokeWidth={2.8} dot={renderAnomalyDot('badWpCount', 1, '#34d399')} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* RSS (max/p95/total) */}
                  <div className="chartBox chartDock" style={{ height: 220 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendData} margin={CHART_MARGIN}>
                        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                        <XAxis dataKey="time" interval="preserveStartEnd" minTickGap={18} tick={AXIS_TICK} />
                        <YAxis tick={AXIS_TICK} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend {...LEGEND_PROPS} />
                        <ReferenceLine y={TH.rssWarn} stroke="#fbbf24" strokeDasharray="4 4" strokeOpacity={0.45} />
                        <ReferenceLine y={TH.rssCrit} stroke="#fb7185" strokeDasharray="4 4" strokeOpacity={0.45} />
                        <Line type="monotone" dataKey="maxRssGB" name="Max RSS (GB)" stroke="#60a5fa" strokeWidth={2.8} dot={renderAnomalyDot('maxRssGB', TH.rssWarn, '#60a5fa')} activeDot={{ r: 6 }} />
                        <Line type="monotone" dataKey="p95RssGB" name="P95 RSS (GB)" stroke="#a78bfa" strokeWidth={2.4} dot={false} activeDot={{ r: 5 }} />
                        <Line type="monotone" dataKey="totalRssGB" name="Total RSS (GB)" stroke="#fb7185" strokeDasharray="5 4" strokeWidth={2.4} dot={false} activeDot={{ r: 5 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Runaway & Offenders */}
                  <div className="chartBox chartDock" style={{ height: 220 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendData} margin={CHART_MARGIN}>
                        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                        <XAxis dataKey="time" interval="preserveStartEnd" minTickGap={18} tick={AXIS_TICK} />
                        <YAxis tick={AXIS_TICK} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend {...LEGEND_PROPS} />
                        <Line type="monotone" dataKey="runawayCount" name="Runaway (>=24h)" stroke="#f97316" strokeWidth={2.8} dot={renderAnomalyDot('runawayCount', 1, '#f97316')} activeDot={{ r: 6 }} />
                        <Line type="monotone" dataKey="offenderCount" name="Offenders" stroke="#22c55e" strokeWidth={2.8} dot={renderAnomalyDot('offenderCount', 1, '#22c55e')} activeDot={{ r: 6 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Top hosts RSS trend */}
                  <div className="chartBox chartDock" style={{ height: 260 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={hostRssTrend.data} margin={CHART_MARGIN}>
                        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                        <XAxis dataKey="time" interval="preserveStartEnd" minTickGap={18} tick={AXIS_TICK} />
                        <YAxis tick={AXIS_TICK} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend {...LEGEND_PROPS} />
                        {hostRssTrend.topHosts.map((h, i) => (
                          <Line
                            key={h}
                            type="monotone"
                            dataKey={h}
                            name={h}
                            dot={false}
                            activeDot={{ r: 6 }}
                            stroke={CHART_COLORS[i % CHART_COLORS.length]}
                            strokeWidth={2.6}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Selected snapshot distributions */}
                  {selected ? (
                    <>
                      <div className="chartBox chartDock" style={{ height: 220 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={distType} margin={CHART_MARGIN}>
                            <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                            <XAxis dataKey="type" interval="preserveStartEnd" minTickGap={10} tick={AXIS_TICK} />
                            <YAxis tick={AXIS_TICK} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend {...LEGEND_PROPS} />
                            <Bar dataKey="count" name="WP count" fill="#60a5fa" radius={[7, 7, 0, 0]} maxBarSize={72} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="chartBox chartDock" style={{ height: 220 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={distAge} margin={CHART_MARGIN}>
                            <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                            <XAxis dataKey="bucket" interval="preserveStartEnd" minTickGap={10} tick={AXIS_TICK} />
                            <YAxis tick={AXIS_TICK} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend {...LEGEND_PROPS} />
                            <Bar dataKey="count" name="WP count" fill="#a78bfa" radius={[7, 7, 0, 0]} maxBarSize={72} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="chartBox chartDock" style={{ height: 220 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={distRss} margin={CHART_MARGIN}>
                            <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                            <XAxis dataKey="bucket" interval="preserveStartEnd" minTickGap={10} tick={AXIS_TICK} />
                            <YAxis tick={AXIS_TICK} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend {...LEGEND_PROPS} />
                            <Bar dataKey="count" name="WP count" fill="#fb7185" radius={[7, 7, 0, 0]} maxBarSize={72} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}
        </div>

        {/* RIGHT column: Top WP */}
        <div className="cmpCol cmpColRight">
          {(leftCollapsed || centerCollapsed) ? (
            <div className="cmpRestoreBar">
              {leftCollapsed ? <button className="btn" type="button" onClick={() => setLeftCollapsed(false)}>Show snapshots</button> : null}
              {centerCollapsed ? <button className="btn" type="button" onClick={() => setCenterCollapsed(false)}>Show summary/charts</button> : null}
            </div>
          ) : null}
          <section className="panel" id="cmp-top-wp">
            <div className="panelHead">
              <div>
                <div className="panelTitle">Top WP (selected snapshot)</div>
                <div className="panelSub">Filter: host / bad / runaway / search • virtual rows {wpRows.length}</div>
              </div>

              <div className="row gap">
                <button className="btn" onClick={exportWpCSV} type="button" disabled={!wpRows.length}>
                  Export CSV
                </button>
                <button className="btn" onClick={copyEvidence} type="button" disabled={!selected}>
                  Copy evidence
                </button>
              </div>
            </div>

            <div className="panelTools panelToolsRow">
              <input
                className="input grow"
                placeholder="Filter WP (host/pid/job/status)…"
                value={wpSearch}
                onChange={(e) => setWpSearch(e.target.value)}
                disabled={!selected}
              />
              <select className="input inputMd" value={wpHost} onChange={(e) => setWpHost(e.target.value)} disabled={!selected}>
                {hostOptions.map((h) => (
                  <option key={h} value={h}>
                    {h === 'ALL' ? 'All hosts' : h}
                  </option>
                ))}
              </select>
              <select className="input inputSm" value={wpLimit} onChange={(e) => setWpLimit(e.target.value)} title="Max rows" disabled={!selected}>
                <option value={120}>120</option>
                <option value={250}>250</option>
                <option value={500}>500</option>
                <option value={1200}>1,200</option>
                <option value={3000}>3,000</option>
                <option value="ALL">All</option>
              </select>

              <label className="toggle">
                <input type="checkbox" checked={wpOnlyBad} onChange={(e) => setWpOnlyBad(e.target.checked)} />
                <span>Only bad</span>
              </label>
              <label className="toggle">
                <input type="checkbox" checked={wpRunaway} onChange={(e) => setWpRunaway(e.target.checked)} />
                <span>Runaway</span>
              </label>
            </div>

            <div className="panelBody panelBodyNoPad">
              <div className="panelScroll panelScrollVirtual">
                <CmpVirtualTable
                  rows={wpRows}
                  emptyText="Tidak ada WP terdeteksi (atau ter-filter habis). Coba matikan filter Only bad."
                  rowKey={(r, i) => `${r.host}-${r.pid}-${r.job}-${i}`}
                  rowClass={(r) => (r.status === 'CRIT' ? 'rowCrit' : r.status === 'WARN' ? 'rowWarn' : '')}
                  columns={[
                    { id: 'idx', label: '#', w: 54, render: (_r, i) => <span className="muted">{i + 1}</span> },
                    { id: 'host', label: 'Host', w: 170, title: (r) => r.host, render: (r) => r.host },
                    { id: 'pid', label: 'PID', w: 84, render: (r) => <span className="pill pill-muted">{r.pid}</span> },
                    { id: 'type', label: 'Type', w: 84, render: (r) => <span className="pill pill-info">{r.type || '-'}</span> },
                    { id: 'rss', label: 'RSS', w: 92, render: (r) => <span className="pill pill-muted">{r.rssGB.toFixed(2)}</span> },
                    { id: 'age', label: 'Age', w: 92, render: (r) => <span className="pill pill-age">{hoursToAge(r.ageH)}</span> },
                    { id: 'status', label: 'Status', w: 86, render: (r) => <span className={classStatus(r.status)}>{r.status}</span> },
                    { id: 'job', label: 'Job', flex: true, title: (r) => r.job, render: (r) => r.job },
                    {
                      id: 'action',
                      label: 'Action',
                      w: 92,
                      render: (r) => (
                        <button className="btn btn-mini" type="button" onClick={(e) => { e.stopPropagation(); applyFocus(r.focusKey || wpKey(r.host, r.job)) }}>
                          Focus
                        </button>
                      ),
                    },
                  ]}
                />
              </div>

              {showRssChart ? (
                <div className="panelDock">
                  <div className="panelDockHead">
                    <div>
                      <div className="panelTitleSm">Top RSS chart</div>
                      <div className="panelSubSm">Label = host:job (top 10)</div>
                    </div>
                  </div>

                  <div className="chartBox chartBoxSmall">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={barTopRSS} margin={CHART_MARGIN}>
                        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                        <XAxis dataKey="name" interval="preserveStartEnd" minTickGap={10} tick={AXIS_TICK} />
                        <YAxis tick={AXIS_TICK} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="RSS" fill="#60a5fa" radius={[8, 8, 0, 0]} maxBarSize={90} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>

      {dragOver ? <div className="dropHint">Drop log files (.log/.txt) here</div> : null}
    </div>
  )
}
