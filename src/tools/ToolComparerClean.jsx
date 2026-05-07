import React from 'react'
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
import EvidenceHistory from '../features/evidence/EvidenceHistory.jsx'
import './ToolComparerClean.css'
import './ToolComparerCleanVisual.css'
import './ToolComparerDynatrace.css'

const MAX_ROWS = 5000

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
  if (row.rssGb >= 18 || row.ageHours >= 72 || row.cpu >= 90) return 'CRIT'
  if (row.rssGb >= 10 || row.ageHours >= 24 || row.cpu >= 70) return 'WARN'
  return 'OK'
}

function scoreOf(row) {
  return Math.round((row.cpu * 0.35) + (row.rssGb * 4.2) + (Math.log1p(row.ageHours) * 18) + (row.severity === 'CRIT' ? 35 : row.severity === 'WARN' ? 16 : 0))
}

function parseFileText(fileName, text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n')
  const rows = []
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

  return { fileName, rows }
}

function uniqueOffenders(sourceRows) {
  const map = new Map()
  for (const row of sourceRows) {
    const key = `${row.host}|${row.pid}|${row.type}|${row.job}`
    const cur = map.get(key)
    if (!cur) {
      map.set(key, { ...row, hits: 1, maxRssGb: row.rssGb, maxAgeHours: row.ageHours })
      continue
    }
    cur.hits += 1
    cur.maxRssGb = Math.max(cur.maxRssGb || 0, row.rssGb)
    cur.maxAgeHours = Math.max(cur.maxAgeHours || 0, row.ageHours)
    cur.rssGb = Math.max(cur.rssGb, row.rssGb)
    cur.ageHours = Math.max(cur.ageHours, row.ageHours)
    cur.ageRaw = fmtAge(cur.ageHours)
    cur.score = Math.max(cur.score, row.score)
    if (sevRank(row.severity) > sevRank(cur.severity)) cur.severity = row.severity
  }
  return Array.from(map.values()).sort((a, b) => b.score - a.score || b.hits - a.hits)
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

export default function ToolComparerClean() {
  const inputRef = React.useRef(null)
  const [rows, setRows] = React.useState([])
  const [query, setQuery] = React.useState('')
  const [severityFilter, setSeverityFilter] = React.useState('BAD')
  const [viewMode, setViewMode] = React.useState('UNIQUE')
  const [hostFilter, setHostFilter] = React.useState('ALL')
  const [jobFilter, setJobFilter] = React.useState('ALL')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const [lastLoad, setLastLoad] = React.useState('')

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
      const nextRows = parsed.flatMap((p) => p.rows).sort((a, b) => b.score - a.score)
      setRows(nextRows)
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
  const baseRows = viewMode === 'UNIQUE' ? uniqueRows : rows

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
  const topRss = React.useMemo(() => filteredRows.slice(0, 8).map((r) => ({ name: `${r.host}/${r.pid}`, rss: Number(r.rssGb.toFixed(2)), score: r.score })), [filteredRows])
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
    return Array.from(map.values()).sort((a, b) => b.score - a.score).slice(0, 8)
  }, [uniqueRows])

  return (
    <section className="cmpCleanShell">
      <header className="cmpCleanHeader">
        <div>
          <span className="cmpCleanKicker">WP-SCOUT Comparator</span>
          <h1>SAP RCA Workspace</h1>
          <p>Upload WP-SCOUT log. Rank offender. Export RCA evidence.</p>
          {lastLoad ? <small className="cmpCleanLoadState">{lastLoad}</small> : null}
        </div>
        <div className="cmpCleanActions">
          <input ref={inputRef} hidden type="file" multiple accept=".log,.txt,.csv" onChange={(e) => ingest(e.target.files)} />
          <button className="cmpCleanPrimary" type="button" onClick={() => inputRef.current?.click()} disabled={busy}>{busy ? 'Parsing…' : 'Upload & Analyze'}</button>
        </div>
      </header>

      <div className="cmpCleanTopRow">
        <div className="cmpCleanDrop" onClick={() => inputRef.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}>
          <strong>Drop / select WP-SCOUT log</strong>
          <span>Accepted: .log, .txt, .csv. Default view groups duplicate rows into unique offenders.</span>
        </div>
        <EvidenceHistory tool="comparer" limit={5} />
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

        <section className="cmpCleanPanel">
          <h2>Top Unique RSS</h2>
          <div className="cmpCleanChart cmpCleanChartBars">
            {topRss.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topRss} margin={{ top: 28, right: 18, bottom: 8, left: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={false} axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} width={44} />
                  <Tooltip />
                  <Bar dataKey="rss" radius={[8, 8, 0, 0]} barSize={44} isAnimationActive animationDuration={900} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </div>
        </section>

        <section className="cmpCleanPanel">
          <h2>Host Pressure</h2>
          <div className="cmpCleanChart cmpCleanChartLine">
            {hostPressure.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={hostPressure} margin={{ top: 28, right: 20, bottom: 8, left: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="host" tickMargin={10} axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} width={52} />
                  <Tooltip />
                  <Line type="monotone" dataKey="score" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 7 }} isAnimationActive animationDuration={950} />
                </LineChart>
              </ResponsiveContainer>
            ) : <EmptyChart label="No host pressure yet." />}
          </div>
        </section>
      </div>
    </section>
  )
}
