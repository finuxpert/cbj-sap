import React from 'react'
import CaseLinkPanel from '../features/cases/CaseLinkPanel.jsx'
import useCaseHistoryLink from '../features/cases/useCaseHistoryLink.js'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  LabelList,
  Legend,
} from 'recharts'
import EvidenceHistory from '../features/evidence/EvidenceHistory.jsx'
import { loadJson, saveJson } from './evidence-utils.js'
import './ToolComparerClean.css'
import './ToolComparerCleanVisual.css'
import './ToolComparerDynatrace.css'

const MAX_ROWS = 5000
const CASE_KEY = 'sap_wp_scout_comparator_case_id'

function n(value, fallback = 0) {
  const parsed = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : fallback
}

function ageToHours(raw = '') {
  const text = String(raw).toLowerCase().trim()
  const d = text.match(/(\d+)\s*d/)
  const h = text.match(/(\d+)\s*h/)
  const m = text.match(/(\d+)\s*m/)
  return (d ? Number(d[1]) * 24 : 0) + (h ? Number(h[1]) : 0) + (m ? Number(m[1]) / 60 : 0)
}

function fmtAge(hours = 0) {
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${Math.floor(hours % 24)}h`
  if (hours >= 1) return `${Math.floor(hours)}h ${Math.round((hours % 1) * 60)}m`
  return `${Math.round(hours * 60)}m`
}

function sevRank(sev) {
  if (sev === 'CRIT') return 3
  if (sev === 'WARN') return 2
  return 1
}

function sevOf(row) {
  const rssGb = Number(row?.rssGb || 0)
  const ageHours = Number(row?.ageHours || 0)
  const cpu = Number(row?.cpu || 0)
  const hits = Number(row?.hits || 1)

  if (rssGb >= 256 || cpu >= 95 || (rssGb >= 96 && ageHours >= 24) || (rssGb >= 64 && ageHours >= 24 && hits >= 10)) return 'CRIT'
  if (rssGb >= 32 || ageHours >= 168 || cpu >= 70 || hits >= 5) return 'WARN'
  return 'OK'
}

function scoreOf(row) {
  const severity = row.severity || sevOf(row)
  return Math.round((row.cpu * 0.35) + (row.rssGb * 4.2) + (Math.log1p(row.ageHours) * 18) + (row.hits || 1) * 3 + (severity === 'CRIT' ? 35 : severity === 'WARN' ? 16 : 0))
}

function shortLabel(value = '', max = 24) {
  const text = String(value || '')
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function normalizeSnapshotLabel(value = '', fallback = '') {
  const text = String(value || '').trim()
  const hhmm = text.match(/\b(\d{1,2}:\d{2})(?::\d{2})?\b/)
  if (hhmm) return hhmm[1].padStart(5, '0')
  const iso = text.match(/T(\d{2}:\d{2})/)
  if (iso) return iso[1]
  const fileStamp = fallback.match(/(\d{1,2})[-_:.]?(\d{2})(?:[-_:.]?\d{2})?/)
  if (fileStamp) return `${fileStamp[1].padStart(2, '0')}:${fileStamp[2]}`
  return fallback || 'snapshot'
}

function parseResourceMetricLine(line = '', snapshot = '', fallback = '') {
  const text = String(line || '')
  if (!/(cpu|mem|memory|swap|si\/so|\bsi\b)/i.test(text)) return null

  const pick = (patterns, group = 1) => {
    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match) return n(match[group], 0)
    }
    return 0
  }

  const cpu = pick([
    /CPU\s+usage\s*:\s*(\d+(?:[.,]\d+)?)\s*%\s*used/i,
    /cpu\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*%?/i,
  ])

  const mem = pick([
    /Memory\s*:\s*used\s+\d+(?:[.,]\d+)?\s*G\s*\(\s*(\d+(?:[.,]\d+)?)\s*%\s*\)/i,
    /Memory\s*:\s*.*?\(\s*(\d+(?:[.,]\d+)?)\s*%\s*\)/i,
    /mem(?:ory)?\s*[:=]?\s*(?:used\s+)?\d+(?:[.,]\d+)?\s*G\s*\(\s*(\d+(?:[.,]\d+)?)\s*%\s*\)/i,
    /mem(?:ory)?\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*%/i,
  ])

  const swapSi = pick([
    /Swap\s+IO\s*:\s*si\/so\s+(\d+(?:[.,]\d+)?)\/(\d+(?:[.,]\d+)?)\s*p\/s/i,
  ])

  if (!cpu && !mem && !swapSi) return null

  return {
    time: normalizeSnapshotLabel(snapshot, fallback),
    cpu: Math.max(0, Math.min(100, cpu)),
    mem: Math.max(0, Math.min(100, mem)),
    swapSi: Math.max(0, swapSi),
    source: 'telemetry',
  }
}

function WpScoutTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload || {}
  return (
    <div className="evidenceChartTooltip cmpCleanTooltip">
      <strong>{row.fullName || label}</strong>
      <span>Severity: {row.severity || '-'} · Problem Score: {row.score || 0}</span>
      <small>RSS {Number(row.rss || row.rssGb || 0).toFixed(2)} GB · CPU {Number(row.cpu || 0).toFixed(1)}% · Age {row.ageRaw || '-'}</small>
      <small>Why this matters: high RSS, old WP age, repeated hits, or high CPU makes this process a stronger RCA suspect.</small>
    </div>
  )
}

function HostPressureTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload || {}
  return (
    <div className="evidenceChartTooltip cmpCleanTooltip">
      <strong>{row.host || label}</strong>
      <span>Host Pressure Score: {row.score || 0}</span>
      <small>Critical {row.crit || 0} · Warning {row.warn || 0} · Max RSS {Number(row.rss || 0).toFixed(1)} GB</small>
      <small>Why this matters: host with more critical/warning offenders should be checked first in SM50/SM66 and OS memory view.</small>
    </div>
  )
}

function ResourceTrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload || {}
  return (
    <div className="evidenceChartTooltip cmpCleanTooltip">
      <strong>Snapshot {label}</strong>
      <span>CPU {Number(row.cpu || 0).toFixed(1)}% · Mem {Number(row.mem || 0).toFixed(1)}% · Swap si {Number(row.swapSi || 0).toFixed(0)}</span>
      <small>{row.swapSi > 0 ? 'Swap activity detected. Validate OS memory pressure around this window.' : 'No swap-in activity detected on this point.'}</small>
      {row.source === 'rss-pressure' ? <small>Mem% is estimated from WP RSS pressure because raw memory telemetry was not found.</small> : null}
    </div>
  )
}

function SwapDot(props) {
  const { cx, cy, payload } = props
  if (!payload || Number(payload.swapSi || 0) <= 0) return null
  return <circle cx={cx} cy={cy} r={4.5} className="cmpTrendSwapDot" />
}

function parseFileText(fileName, text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n')
  const rows = []
  const resourceSamples = []
  let host = 'UNKNOWN'
  let snapshot = ''

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue

    const snapMatch = line.match(/^snapshot\s*@\s*(.+)$/i)
    if (snapMatch) {
      snapshot = snapMatch[1].trim()
      continue
    }

    const metricSample = parseResourceMetricLine(line, snapshot, fileName)
    if (metricSample) resourceSamples.push(metricSample)

    const hostMatch = line.match(/^Hostname\s*:\s*(\S+)/i) || line.match(/^##\s*WP-SCOUT\s*@\s*(\S+)/i)
    if (hostMatch) {
      host = hostMatch[1].trim()
      continue
    }

    if (!/^\d{2,8}\s+/.test(line) || /^PID\s+/i.test(line)) continue
    const parts = line.split(/\s+/)
    if (parts.length < 8) continue

    const pid = parts[0]
    const inst = parts[1] || ''
    const wp = parts[2] || ''
    const type = parts[3] || ''
    const cpu = n(parts.find((p, idx) => idx > 3 && /^\d+[.,]?\d*$/.test(p)), 0)

    let rssGb = 0
    let ageRaw = ''
    let state = ''
    for (const token of parts) {
      if (!ageRaw && /\d+[dhm]/i.test(token)) ageRaw = token
      if (!state && /^[RSW]$/.test(token)) state = token
      if (!rssGb && /^\d+(?:[.,]\d+)?G?$/i.test(token)) {
        const val = n(token.replace(/G/i, ''))
        if (val > 0 && val < 1024) rssGb = Math.max(rssGb, val)
      }
    }

    const pathIdx = parts.findIndex((p) => p.startsWith('/'))
    const beforePath = pathIdx >= 0 ? parts.slice(0, pathIdx) : parts
    const job = beforePath.slice(-1)[0] || '-'
    const errorCode = beforePath.slice(-2)[0] || '-'
    const program = beforePath.slice(16, -2).join(' ') || '-'

    const row = {
      id: `${fileName}-${pid}-${rows.length}`,
      hits: 1,
      fileName,
      snapshot,
      trendTime: normalizeSnapshotLabel(snapshot, fileName),
      host,
      pid,
      inst,
      wp,
      type,
      cpu,
      rssGb,
      ageRaw: ageRaw || '-',
      ageHours: ageToHours(ageRaw),
      state: state || '-',
      program,
      job,
      errorCode,
      raw: line,
    }
    row.severity = sevOf(row)
    row.score = scoreOf(row)
    rows.push(row)
    if (rows.length >= MAX_ROWS) break
  }

  return { fileName, rows, resourceSamples }
}

function uniqueOffenders(sourceRows) {
  const map = new Map()
  for (const row of sourceRows) {
    const key = `${row.host}|${row.pid}|${row.type}|${row.job}`
    const cur = map.get(key)
    if (!cur) {
      const next = { ...row, hits: 1, maxRssGb: row.rssGb, maxAgeHours: row.ageHours }
      next.severity = sevOf(next)
      next.score = scoreOf(next)
      map.set(key, next)
      continue
    }
    cur.hits += 1
    cur.maxRssGb = Math.max(cur.maxRssGb || 0, row.rssGb)
    cur.maxAgeHours = Math.max(cur.maxAgeHours || 0, row.ageHours)
    cur.rssGb = Math.max(cur.rssGb, row.rssGb)
    cur.ageHours = Math.max(cur.ageHours, row.ageHours)
    cur.ageRaw = fmtAge(cur.ageHours)
    if (sevRank(row.severity) > sevRank(cur.sourceSeverity || 'OK')) cur.sourceSeverity = row.severity
    cur.severity = sevOf(cur)
    cur.score = scoreOf(cur)
  }
  return Array.from(map.values()).sort((a, b) => b.score - a.score || b.hits - a.hits)
}

function buildResourceTrend(rows = [], telemetrySamples = []) {
  const direct = new Map()
  for (const item of telemetrySamples || []) {
    const key = item.time || 'snapshot'
    const cur = direct.get(key) || {
      time: key,
      cpuSum: 0,
      cpuCount: 0,
      memSum: 0,
      memCount: 0,
      swapSi: 0,
      source: 'telemetry',
    }

    const cpu = Number(item.cpu || 0)
    const mem = Number(item.mem || 0)

    if (cpu > 0) {
      cur.cpuSum += cpu
      cur.cpuCount += 1
    }

    if (mem > 0) {
      cur.memSum += mem
      cur.memCount += 1
    }

    cur.swapSi = Math.max(cur.swapSi, Number(item.swapSi || 0))
    direct.set(key, cur)
  }

  if (direct.size >= 2) {
    return Array.from(direct.values())
      .map((item) => ({
        time: item.time,
        cpu: item.cpuCount ? item.cpuSum / item.cpuCount : 0,
        mem: item.memCount ? item.memSum / item.memCount : 0,
        swapSi: item.swapSi,
        source: 'telemetry',
      }))
      .sort((a, b) => String(a.time).localeCompare(String(b.time)))
  }

  const grouped = new Map()
  const maxRss = Math.max(1, ...rows.map((row) => Number(row.rssGb || 0)))
  for (const row of rows) {
    const time = row.trendTime || normalizeSnapshotLabel(row.snapshot, row.fileName)
    const cur = grouped.get(time) || { time, cpu: 0, mem: 0, swapSi: 0, source: 'rss-pressure' }
    cur.cpu = Math.max(cur.cpu, Number(row.cpu || 0))
    cur.mem = Math.max(cur.mem, Math.min(100, (Number(row.rssGb || 0) / maxRss) * 100))
    cur.swapSi = Math.max(cur.swapSi, 0)
    grouped.set(time, cur)
  }
  return Array.from(grouped.values()).sort((a, b) => String(a.time).localeCompare(String(b.time))).slice(0, 40)
}

function severityFromStats(stats = {}) {
  if (stats.crit > 0) return 'CRIT'
  if (stats.warn > 0) return 'WARN'
  return 'INFO'
}

function buildComparerSummary(analysis) {
  if (!analysis?.topRow) return 'WP-SCOUT comparator evidence saved to Case History.'
  const top = analysis.topRow
  return `${top.host || '-'} / PID ${top.pid || '-'} / ${top.type || '-'} / ${top.job || '-'}. Max RSS ${Number(top.rssGb || 0).toFixed(1)} GB, hits ${top.hits || 1}.`
}

function buildComparerAnalysis(sourceRows = [], fileCount = 0, resourceTrend = []) {
  if (!sourceRows.length) return null
  const uniqueRows = uniqueOffenders(sourceRows)
  const crit = uniqueRows.filter((row) => row.severity === 'CRIT').length
  const warn = uniqueRows.filter((row) => row.severity === 'WARN').length
  const hosts = new Set(sourceRows.map((row) => row.host)).size
  const maxRss = Math.max(0, ...sourceRows.map((row) => row.rssGb))
  const maxAge = Math.max(0, ...sourceRows.map((row) => row.ageHours))
  const topRow = uniqueRows[0] || null
  const hostMap = new Map()

  for (const row of uniqueRows) {
    const current = hostMap.get(row.host) || { host: row.host, crit: 0, warn: 0, rss: 0, score: 0 }
    current.crit += row.severity === 'CRIT' ? 1 : 0
    current.warn += row.severity === 'WARN' ? 1 : 0
    current.rss = Math.max(current.rss, row.rssGb)
    current.score += row.score
    hostMap.set(row.host, current)
  }

  const hostPressure = Array.from(hostMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)

  return {
    fileCount,
    severity: severityFromStats({ crit, warn }),
    rawRows: sourceRows.length,
    totalUnique: uniqueRows.length,
    crit,
    warn,
    hosts,
    maxRss,
    maxAge,
    topRow,
    summary: buildComparerSummary({ topRow }),
    topHosts: hostPressure,
    resourceTrend,
    uniqueRows: uniqueRows.slice(0, 100),
    rows: sourceRows.slice(0, 120),
  }
}

function buildComparerCasePayload(analysis, title) {
  return {
    title,
    severity: analysis?.severity || 'INFO',
    summary: analysis?.summary || '',
    top_anomaly: analysis?.topRow ? `${analysis.topRow.severity} WP-SCOUT offender` : 'WP-SCOUT comparator',
    top_suspect: analysis?.topRow ? `${analysis.topRow.host} / PID ${analysis.topRow.pid} / ${analysis.topRow.type}` : 'WP-SCOUT comparator',
    status: 'OPEN',
    created_by: 'sap-rca-workspace',
  }
}

function buildComparerParsedPayload(analysis) {
  return {
    tool: 'WP-SCOUT / RCA Comparator',
    verdict: analysis?.topRow ? `${analysis.topRow.severity} offender ranked` : 'WP-SCOUT comparator parsed',
    severity: analysis?.severity || 'INFO',
    confidence: analysis?.topRow ? Math.min(99, Math.max(40, Number(analysis.topRow.score || 0))) : 0,
    top_anomaly: analysis?.topRow ? `${analysis.topRow.severity} WP-SCOUT offender` : 'WP-SCOUT comparator',
    top_suspect: analysis?.topRow ? `${analysis.topRow.host} / PID ${analysis.topRow.pid} / ${analysis.topRow.type} / ${analysis.topRow.job}` : 'WP-SCOUT comparator',
    summary: analysis?.summary || 'WP-SCOUT comparator evidence saved to Case History.',
    result_json: {
      file_count: analysis?.fileCount || 0,
      raw_rows: analysis?.rawRows || 0,
      unique_rows: analysis?.totalUnique || 0,
      crit: analysis?.crit || 0,
      warn: analysis?.warn || 0,
      hosts: analysis?.hosts || 0,
      max_rss_gb: Number(analysis?.maxRss || 0),
      max_age_hours: Number(analysis?.maxAge || 0),
      top_row: analysis?.topRow || null,
      top_hosts: analysis?.topHosts || [],
      resource_trend: analysis?.resourceTrend || [],
      unique_offenders: analysis?.uniqueRows || [],
      rows: analysis?.rows || [],
    },
  }
}

async function readAsText(file) {
  return file.text()
}

function EmptyChart({ label = 'Upload WP-SCOUT log untuk menampilkan chart' }) {
  return <div className="cmpCleanEmptyChart">{label}</div>
}

function MiniStat({ label, value, tone = '' }) {
  return (
    <div className={`cmpCleanStat ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function FindingCard({ stats, topRow }) {
  let title = 'No RCA evidence loaded'
  let desc = 'Upload WP-SCOUT log untuk membaca work process, RSS, age, host pressure, dan offender queue.'
  let tone = ''

  if (stats.total) {
    if (stats.crit > 0) {
      tone = 'crit'
      title = 'Primary suspect identified'
      desc = `${topRow?.host || '-'} / PID ${topRow?.pid || '-'} / ${topRow?.type || '-'} / ${topRow?.job || '-'}. Max RSS ${Number(topRow?.rssGb || 0).toFixed(1)} GB, hits ${topRow?.hits || 1}. Validate SM50/SM66, job owner, and memory pressure.`
    } else if (stats.warn > 0) {
      tone = 'warn'
      title = 'Warning threshold reached'
      desc = `${stats.warn} warning offender(s). Review long-running WP, RSS growth, and recurring job pattern before escalation.`
    } else {
      tone = 'ok'
      title = 'No critical offender'
      desc = 'Tidak ada WP melewati threshold kritikal. Simpan evidence dan korelasikan dengan ST03N/log jika symptom masih ada.'
    }
  }

  return (
    <section className={`cmpCleanFinding ${tone}`}>
      <div>
        <span>RCA finding</span>
        <strong>{title}</strong>
        <p>{desc}</p>
      </div>
    </section>
  )
}

function ActionNotes({ topRow, hasData }) {
  const actions = hasData && topRow
    ? [
        `SM50/SM66: validate PID ${topRow.pid} on ${topRow.host}.`,
        `SM37/job owner: check ${topRow.job || '-'} schedule and owner.`,
        'ST22/SM21: correlate dump/system log around same timestamp.',
        'OS level: validate top/memory pressure and long-running process age.',
      ]
    : ['Upload WP-SCOUT log to generate Basis action notes.']

  return (
    <section className="cmpCleanActionsPanel">
      <span>Recommended checks</span>
      <ol>{actions.map((item) => <li key={item}>{item}</li>)}</ol>
    </section>
  )
}

function ResourceTrendPanel({ data }) {
  const hasSwap = data.some((item) => Number(item.swapSi || 0) > 0)
  const hasEstimatedMem = data.some((item) => item.source === 'rss-pressure')
  const peakCpu = Math.max(0, ...data.map((item) => Number(item.cpu || 0)))
  const peakMem = Math.max(0, ...data.map((item) => Number(item.mem || 0)))
  const peakSwap = Math.max(0, ...data.map((item) => Number(item.swapSi || 0)))

  return (
    <section className="cmpCleanPanel rcaReadableChartPanel cmpResourceTrendPanel">
      <div className="chartTitleBlock cmpTrendTitleBlock">
        <div>
          <h2>Trend – CPU / Mem / Swap</h2>
          <p>Dot merah = swap si &gt; 0. Gunakan trend ini untuk korelasi resource dan indikasi hang.</p>
        </div>
        <div className="cmpTrendBadges">
          <span>Peak CPU {peakCpu.toFixed(0)}%</span>
          <span>Peak Mem {peakMem.toFixed(0)}%</span>
          <span className={hasSwap ? 'crit' : ''}>Swap {hasSwap ? peakSwap.toFixed(0) : '0'}</span>
        </div>
      </div>
      {hasEstimatedMem ? <small className="cmpTrendNote">Mem% estimated from WP RSS pressure because raw memory telemetry was not detected in the uploaded WP-SCOUT text.</small> : null}
      <div className="cmpCleanChart cmpResourceTrendChart">
        {data.length >= 2 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 16, right: 46, bottom: 14, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" axisLine={false} tickLine={false} minTickGap={18} />
              <YAxis yAxisId="left" domain={[0, 100]} axisLine={false} tickLine={false} />
              <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} />
              <Tooltip content={<ResourceTrendTooltip />} />
              <Legend verticalAlign="bottom" height={28} />
              <Line yAxisId="left" type="monotone" dataKey="cpu" name="CPU %" strokeWidth={2.6} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              <Line yAxisId="left" type="monotone" dataKey="mem" name="Mem %" strokeWidth={2.6} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              <Line yAxisId="right" type="monotone" dataKey="swapSi" name="Swap si" strokeWidth={2.1} strokeDasharray="5 4" dot={<SwapDot />} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : <EmptyChart label="Need at least two WP-SCOUT snapshots to draw CPU/Mem/Swap trend." />}
      </div>
    </section>
  )
}

function IntakeSummary({ files, rows, busy, lastLoad, hasAnalysis }) {
  const fileCount = files.length
  const stepItems = [
    'Upload & Analyze',
    'Review analysis',
    'Create or link case',
    'Save to Case History',
    'Check Evidence History (Postgres)',
  ]

  return (
    <section className="cmpCleanIntakeCard">
      <div className="cmpCleanIntakeHead">
        <span className="cmpCleanKicker">Workflow</span>
        <h2>One clear RCA flow</h2>
        <p>Use the single upload action in the header, then finish case linking and save on the right panel.</p>
      </div>
      <div className="cmpCleanIntakeMeta">
        <div className="cmpCleanIntakeStat">
          <strong>{fileCount}</strong>
          <span>Files loaded</span>
        </div>
        <div className="cmpCleanIntakeStat">
          <strong>{rows.length}</strong>
          <span>Parsed rows</span>
        </div>
        <div className="cmpCleanIntakeStat">
          <strong>{busy ? 'Running' : hasAnalysis ? 'Ready' : 'Waiting'}</strong>
          <span>Analysis state</span>
        </div>
      </div>
      <ol className="cmpCleanFlowList">
        {stepItems.map((item) => <li key={item}>{item}</li>)}
      </ol>
      <div className="cmpCleanIntakeStatus">{lastLoad || 'No evidence analyzed yet. Upload WP-SCOUT files from the header to start.'}</div>
    </section>
  )
}

export default function ToolComparerClean() {
  const inputRef = React.useRef(null)
  const [files, setFiles] = React.useState([])
  const [rows, setRows] = React.useState([])
  const [resourceSamples, setResourceSamples] = React.useState([])
  const [query, setQuery] = React.useState('')
  const [severityFilter, setSeverityFilter] = React.useState('BAD')
  const [viewMode, setViewMode] = React.useState('UNIQUE')
  const [hostFilter, setHostFilter] = React.useState('ALL')
  const [jobFilter, setJobFilter] = React.useState('ALL')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const [lastLoad, setLastLoad] = React.useState('')
  const caseLink = useCaseHistoryLink({
    storageKey: CASE_KEY,
    buildCasePayload: buildComparerCasePayload,
    buildParsedPayload: buildComparerParsedPayload,
    defaultCaseTitle: 'WP-SCOUT RCA Case',
    toolName: 'WP-SCOUT / RCA Comparator',
    uploadTags: ['wp-scout', 'comparer', 'sap-rca', 'auto-linked'],
    requireExplicitSaveIntent: true,
    loadJson,
    saveJson,
  })

  const ingest = async (fileList) => {
    const list = Array.from(fileList || []).filter(Boolean)
    if (!list.length) return
    setBusy(true)
    setError('')
    setLastLoad(`Parsing ${list.length} file(s)…`)
    try {
      const parsed = []
      for (const file of list) {
        const text = await readAsText(file)
        parsed.push(parseFileText(file.name, text))
      }
      const nextRows = parsed.flatMap((item) => item.rows).sort((a, b) => b.score - a.score)
      const nextSamples = parsed.flatMap((item) => item.resourceSamples || [])
      setFiles(list)
      setRows(nextRows)
      setResourceSamples(nextSamples)
      setHostFilter('ALL')
      setJobFilter('ALL')
      setLastLoad(nextRows.length ? `Parsed ${nextRows.length} WP rows from ${parsed.length} file(s).` : 'No WP rows detected. Check file format or upload raw WP-SCOUT log.')
    } catch (err) {
      console.error('[WP-SCOUT Comparator] parse failed:', err)
      setError(err?.message || String(err))
      setLastLoad('Parse failed.')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const uniqueRows = React.useMemo(() => uniqueOffenders(rows), [rows])
  const resourceTrend = React.useMemo(() => buildResourceTrend(rows, resourceSamples), [resourceSamples, rows])
  const baseRows = viewMode === 'UNIQUE' ? uniqueRows : rows
  const caseAnalysis = React.useMemo(() => buildComparerAnalysis(rows, files.length, resourceTrend), [files.length, resourceTrend, rows])

  const hostOptions = React.useMemo(() => ['ALL', ...Array.from(new Set(rows.map((r) => r.host))).sort()], [rows])
  const jobOptions = React.useMemo(() => ['ALL', ...Array.from(new Set(rows.map((r) => r.job).filter(Boolean))).sort().slice(0, 80)], [rows])

  const filteredRows = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return baseRows.filter((row) => {
      if (hostFilter !== 'ALL' && row.host !== hostFilter) return false
      if (jobFilter !== 'ALL' && row.job !== jobFilter) return false
      if (severityFilter === 'BAD' && row.severity === 'OK') return false
      if (severityFilter === 'CRIT' && row.severity !== 'CRIT') return false
      if (severityFilter === 'WARN' && row.severity !== 'WARN') return false
      if (!q) return true
      return `${row.host} ${row.pid} ${row.type} ${row.job} ${row.program} ${row.errorCode} ${row.fileName}`.toLowerCase().includes(q)
    })
  }, [baseRows, query, severityFilter, hostFilter, jobFilter])

  const stats = React.useMemo(() => {
    const crit = uniqueRows.filter((r) => r.severity === 'CRIT').length
    const warn = uniqueRows.filter((r) => r.severity === 'WARN').length
    const hosts = new Set(rows.map((r) => r.host)).size
    const maxRss = Math.max(0, ...rows.map((r) => r.rssGb))
    const maxAge = Math.max(0, ...rows.map((r) => r.ageHours))
    return { total: uniqueRows.length, raw: rows.length, crit, warn, hosts, maxRss, maxAge }
  }, [rows, uniqueRows])

  const topRow = uniqueRows[0] || null
  const topRss = React.useMemo(() => filteredRows.slice(0, 8).map((r, index) => ({
    name: `${index + 1}. ${shortLabel(`${r.host}/${r.pid}`, 20)}`,
    fullName: `${r.host} / PID ${r.pid} / ${r.type} / ${r.job}`,
    rss: Number(r.rssGb.toFixed(2)),
    rssGb: r.rssGb,
    score: r.score,
    severity: r.severity,
    cpu: r.cpu,
    ageRaw: r.ageRaw,
    hits: r.hits || 1,
  })), [filteredRows])
  const hostPressure = React.useMemo(() => {
    const map = new Map()
    for (const row of uniqueRows) {
      const cur = map.get(row.host) || { host: row.host, crit: 0, warn: 0, rss: 0, score: 0 }
      cur.crit += row.severity === 'CRIT' ? 1 : 0
      cur.warn += row.severity === 'WARN' ? 1 : 0
      cur.rss = Math.max(cur.rss, row.rssGb)
      cur.score += row.score
      map.set(row.host, cur)
    }
    return Array.from(map.values()).sort((a, b) => b.score - a.score).slice(0, 8).map((item, index) => ({
      ...item,
      name: `${index + 1}. ${shortLabel(item.host, 18)}`,
    }))
  }, [uniqueRows])

  return (
    <section className="cmpCleanShell">
      <header className="cmpCleanHeader">
        <div>
          <a className="cmpCleanKicker" href="#/tool/comparer">WP-SCOUT / RCA Comparator</a>
          <h1>SAP RCA Workspace</h1>
          <p>Upload WP-SCOUT log once, review the analysis, then link the result to Case History.</p>
          {lastLoad ? <small className="cmpCleanLoadState">{lastLoad}</small> : null}
        </div>
        <div className="cmpCleanActions">
          <input ref={inputRef} hidden type="file" multiple accept=".log,.txt,.csv" onChange={(e) => ingest(e.target.files)} />
          <button className="cmpCleanPrimary" type="button" onClick={() => inputRef.current?.click()} disabled={busy}>{busy ? 'Parsing…' : 'Upload & Analyze'}</button>
        </div>
      </header>

      <div className="cmpCleanTopRow">
        <IntakeSummary files={files} rows={rows} busy={busy} lastLoad={lastLoad} hasAnalysis={Boolean(caseAnalysis)} />
        <div className="cmpCleanSideRail">
          <CaseLinkPanel
            title="Case History Link"
            description="Follow the guided flow: create a new RCA case or explicitly link an existing DB case before saving the parsed result."
            caseId={caseLink.caseId}
            caseTitle={caseLink.caseTitle}
            recentCases={caseLink.recentCases}
            savingCase={caseLink.savingCase}
            saveStatus={caseLink.saveStatus}
            onCaseIdChange={caseLink.setCaseId}
            onCaseTitleChange={caseLink.setCaseTitle}
            onCreateCase={async () => {
              const nextCaseId = await caseLink.createLinkedCase(caseAnalysis)
              return nextCaseId
            }}
            onSaveCurrent={(options) => caseLink.persistAnalysis(caseAnalysis, files, {}, options)}
            hasAnalysis={Boolean(caseAnalysis)}
            saveLabel="Save to Case History"
            titlePlaceholder="Contoh: WP-SCOUT memory pressure RCA"
          />
          <EvidenceHistory tool="comparer" limit={5} />
        </div>
      </div>

      {error ? <div className="cmpCleanError">{error}</div> : null}

      <div className="cmpCleanStats">
        <MiniStat label="Unique" value={stats.total} />
        <MiniStat label="Raw Rows" value={stats.raw} />
        <MiniStat label="Critical" value={stats.crit} tone="crit" />
        <MiniStat label="Warning" value={stats.warn} tone="warn" />
        <MiniStat label="Hosts" value={stats.hosts} />
        <MiniStat label="Max RSS" value={`${stats.maxRss.toFixed(1)} GB`} />
      </div>

      <FindingCard stats={stats} topRow={topRow} />
      <ActionNotes topRow={topRow} hasData={Boolean(rows.length)} />

      <div className="cmpCleanGrid">
        <section className="cmpCleanPanel span2">
          <div className="cmpCleanPanelHead">
            <div>
              <h2>Offender Queue</h2>
              <p>{viewMode === 'UNIQUE' ? 'Unique offenders by host + PID + job.' : 'Raw WP rows.'}</p>
            </div>
            <div className="cmpCleanFilters">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search host, PID, job, error…" />
              <select value={hostFilter} onChange={(e) => setHostFilter(e.target.value)}>{hostOptions.map((host) => <option key={host}>{host}</option>)}</select>
              <select value={jobFilter} onChange={(e) => setJobFilter(e.target.value)}>{jobOptions.map((job) => <option key={job}>{job}</option>)}</select>
              <div className="cmpCleanSeg">
                {['UNIQUE', 'RAW'].map((value) => <button key={value} type="button" data-active={viewMode === value} onClick={() => setViewMode(value)}>{value}</button>)}
              </div>
              <div className="cmpCleanSeg">
                {['BAD', 'CRIT', 'WARN', 'ALL'].map((value) => <button key={value} type="button" data-active={severityFilter === value} onClick={() => setSeverityFilter(value)}>{value}</button>)}
              </div>
            </div>
          </div>
          <div className="cmpCleanTableWrap">
            <table className="cmpCleanTable">
              <thead>
                <tr><th>SEV</th><th>HOST</th><th>PID</th><th>TYPE</th><th>RSS</th><th>AGE</th><th>JOB</th><th>HITS</th><th>SCORE</th></tr>
              </thead>
              <tbody>
                {filteredRows.slice(0, 200).map((row) => (
                  <tr key={row.id}>
                    <td><span className={`cmpCleanBadge ${row.severity.toLowerCase()}`}>{row.severity}</span></td>
                    <td>{row.host}</td><td>{row.pid}</td><td>{row.type}</td><td>{row.rssGb.toFixed(2)} GB</td><td>{row.ageRaw}</td><td title={row.job}>{row.job}</td><td>{row.hits || 1}</td><td>{row.score}</td>
                  </tr>
                ))}
                {!filteredRows.length ? <tr><td colSpan="9" className="cmpCleanEmpty">No rows for current filter.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>

        <ResourceTrendPanel data={resourceTrend} />

        <section className="cmpCleanPanel rcaReadableChartPanel">
          <div className="chartTitleBlock">
            <h2>Top RSS offender ranking</h2>
            <p>Bar paling atas adalah WP/PID dengan RSS paling besar pada filter aktif.</p>
          </div>
          <div className="cmpCleanChart cmpCleanChartBars">
            {topRss.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topRss} layout="vertical" margin={{ top: 8, right: 46, bottom: 12, left: 118 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" axisLine={false} tickLine={false} label={{ value: 'RSS GB', position: 'insideBottom', offset: -6 }} />
                  <YAxis type="category" dataKey="name" width={118} axisLine={false} tickLine={false} />
                  <Tooltip content={<WpScoutTooltip />} />
                  <Bar dataKey="rss" name="RSS GB" radius={[0, 8, 8, 0]} barSize={22} isAnimationActive animationDuration={700}>
                    <LabelList dataKey="rss" position="right" formatter={(value) => `${value}GB`} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </div>
        </section>

        <section className="cmpCleanPanel rcaReadableChartPanel">
          <div className="chartTitleBlock">
            <h2>Host pressure ranking</h2>
            <p>Host paling atas punya akumulasi score offender terbesar; cek memory dan work process host ini dulu.</p>
          </div>
          <div className="cmpCleanChart cmpCleanChartLine">
            {hostPressure.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hostPressure} layout="vertical" margin={{ top: 8, right: 46, bottom: 12, left: 118 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" axisLine={false} tickLine={false} label={{ value: 'Host Pressure Score', position: 'insideBottom', offset: -6 }} />
                  <YAxis type="category" dataKey="name" width={118} axisLine={false} tickLine={false} />
                  <Tooltip content={<HostPressureTooltip />} />
                  <Bar dataKey="score" name="Host Pressure Score" radius={[0, 8, 8, 0]} barSize={22} isAnimationActive animationDuration={700}>
                    <LabelList dataKey="score" position="right" />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart label="No host pressure yet." />}
          </div>
        </section>
      </div>
    </section>
  )
}
