import React from 'react'
import { expandZipAwareFiles, fileExt } from './evidence-utils.js'
import { buildLogAnalysis, parseLogText } from './logAnalysis2026.js'
import { buildAutoPeakRca } from './logAutoPeak2026.js'
import './LogAutoRca.css'

const n = (value, digits = 0) => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: digits })
const signed = (value, digits = 1, suffix = '') => `${Number(value || 0) > 0 ? '+' : ''}${n(value, digits)}${suffix}`
const shortTime = (value = '') => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}:\d{2})$/)
  return match ? `${match[2]}-${match[3]} ${match[4]}` : value || '—'
}
const durationText = (minutes = 0) => {
  const value = Number(minutes || 0)
  if (value < 60) return `${value} min`
  const h = Math.floor(value / 60)
  const m = value % 60
  return `${h}h${m ? ` ${m}m` : ''}`
}
const classTone = (value = '') => String(value || '').toLowerCase()

function Stat({ label, value, meta }) {
  return <div className="autoPeakStat"><span>{label}</span><b>{value}</b><small>{meta}</small></div>
}

function Status({ value = 'NORMAL' }) {
  return <span className={`autoPeakStatus ${classTone(value)}`}>{value}</span>
}

function CandidateClass({ value = 'BACKGROUND' }) {
  return <span className={`autoPeakCandidateClass ${classTone(value)}`}>{value}</span>
}

function HostPeakCard({ item, candidate, active, onClick }) {
  const peak = item.peak || {}
  return <button type="button" className={`autoPeakHostCard ${active ? 'active' : ''}`} onClick={onClick}>
    <div className="autoPeakHostCardTop"><b>{item.host}</b><Status value={item.severity} /></div>
    <strong>{shortTime(item.peakTime)}</strong>
    <div className="autoPeakHostMetrics">
      <span>CPU <b>{n(peak.cpuPct, 1)}%</b></span>
      <span>RAM <b>{n(peak.memoryPct, 1)}%</b></span>
      <span>Load <b>{n(peak.loadRatio, 2)}</b></span>
      <span>Swap <b>{n(peak.swapIn)}</b></span>
      <span>WP Crit <b>{n(peak.wpCritical)}</b></span>
    </div>
    <div className="autoPeakHostCandidate">
      <small>Top correlated workload</small>
      {candidate ? <><b title={candidate.name}>{candidate.name}</b><span><CandidateClass value={candidate.classification} /> · score {candidate.score}</span></> : <span>No strong candidate</span>}
    </div>
  </button>
}

function TimelineTable({ rca, selectedKey, onSelect }) {
  if (!rca?.collections?.length) return null
  const hostColumns = rca.hosts
  const gapByEnd = new Map(rca.cadence.gaps.map((gap) => [gap.end, gap]))
  return <div className="autoPeakTimelineWrap">
    <table className="autoPeakTimeline">
      <thead><tr><th>Time</th><th>Landscape</th>{hostColumns.map((host) => <th key={host}>{host.replace('AOPH', 'APP').replace('PAPPDC', '')}</th>)}<th>Source</th></tr></thead>
      <tbody>{rca.collections.flatMap((collection, index) => {
        const gap = index ? gapByEnd.get(collection.timeLabel) : null
        const rows = []
        if (gap) rows.push(<tr className="autoPeakGap" key={`gap-${collection.key}`}><td colSpan={hostColumns.length + 3}>Evidence gap · {durationText(gap.minutes)} · {shortTime(gap.start)} → {shortTime(gap.end)}</td></tr>)
        rows.push(<tr key={collection.key} className={`${selectedKey === collection.key ? 'selected' : ''} ${rca.landscapePeak?.key === collection.key ? 'landscapePeak' : ''}`} onClick={() => onSelect(collection.key)}>
          <td><b>{shortTime(collection.timeLabel)}</b>{rca.landscapePeak?.key === collection.key ? <small>LANDSCAPE PEAK</small> : null}</td>
          <td><Status value={collection.severity} /><small>{collection.elevated}/{collection.hostCount} elevated</small></td>
          {hostColumns.map((host) => {
            const hostRow = collection.byHost.get(host)
            return <td key={`${collection.key}-${host}`}>{hostRow ? <><Status value={hostRow.severity} /><small>P{hostRow.pressureScore}</small></> : <span className="autoPeakMissing">NO SAMPLE</span>}</td>
          })}
          <td title={collection.fileName}>{collection.fileName}</td>
        </tr>)
        return rows
      })}</tbody>
    </table>
  </div>
}

function SnapshotDetail({ collection }) {
  if (!collection) return null
  return <section className="autoPeakPanel">
    <div className="autoPeakPanelHead"><div><h2>Snapshot detail · {shortTime(collection.timeLabel)}</h2><p>All application servers captured in this log collection.</p></div><Status value={collection.severity} /></div>
    <div className="autoPeakSnapshotGrid">{collection.rows.map((row) => <article key={row.host}>
      <div><b>{row.host}</b><Status value={row.severity} /></div>
      <dl>
        <div><dt>CPU</dt><dd>{n(row.cpuPct, 1)}%</dd></div>
        <div><dt>RAM</dt><dd>{n(row.memoryPct, 1)}%</dd></div>
        <div><dt>Load/vCPU</dt><dd>{n(row.loadRatio, 2)}</dd></div>
        <div><dt>Swap In</dt><dd>{n(row.swapIn)} p/s</dd></div>
        <div><dt>WP Critical</dt><dd>{n(row.wpCritical)}</dd></div>
        <div><dt>Pressure</dt><dd>{row.pressureScore}/100</dd></div>
      </dl>
    </article>)}</div>
  </section>
}

function CauseTable({ hostPeak, candidates = [] }) {
  const visible = candidates.slice(0, 25)
  return <section className="autoPeakPanel">
    <div className="autoPeakPanelHead"><div><h2>Cause candidates · {hostPeak?.host || 'Host'}</h2><p>Ranked around the host peak at {shortTime(hostPeak?.peakTime)}. Resource correlation and new errors are evaluated separately.</p></div></div>
    {visible.length ? <div className="autoPeakTableWrap"><table className="autoPeakCauseTable">
      <thead><tr><th>Rank</th><th>Workload / Job</th><th>Class</th><th>Score</th><th>Peak CPU</th><th>CPU Δ</th><th>Peak RSS</th><th>RSS Δ</th><th>D-state Δ</th><th>PIDs</th><th>New errors at peak</th></tr></thead>
      <tbody>{visible.map((item, index) => <tr key={item.key} className={item.classification === 'BACKGROUND' ? 'background' : ''}>
        <td>{index + 1}</td>
        <td><b>{item.name}</b><small>{item.programs.slice(0, 2).join(', ') || 'Program unavailable'}</small></td>
        <td><CandidateClass value={item.classification} /></td>
        <td><b>{item.score}</b>/100</td>
        <td>{n(item.peakCpu, 1)}%</td>
        <td className={item.cpuDelta > 0 ? 'signal' : ''}>{signed(item.cpuDelta, 1, ' pp')}</td>
        <td>{n(item.peakRss, 2)} GB</td>
        <td className={item.rssDelta > 0 ? 'signal' : ''}>{signed(item.rssDelta, 2, ' GB')}</td>
        <td className={item.dStateDelta > 0 ? 'signal' : ''}>{signed(item.dStateDelta, 0)}</td>
        <td>{item.peakPids}</td>
        <td>{item.newErrors.length ? item.newErrors.join(', ') : <span className="autoPeakMuted">None new</span>}</td>
      </tr>)}</tbody>
    </table></div> : <div className="autoPeakEmpty">No workload/process records are available around this host peak.</div>}
    <div className="autoPeakMethodNote"><b>Classification:</b> RESOURCE = CPU/RSS/D-state correlation; ERROR = new error appearing at peak; MIXED = both; BACKGROUND = present but weak correlation. This is RCA evidence ranking, not automatic proof of root cause.</div>
  </section>
}

function SourceAudit({ collections = [] }) {
  return <details className="autoPeakSourceAudit"><summary>Source audit · verify file → timestamp mapping</summary><div className="autoPeakTableWrap"><table><thead><tr><th>#</th><th>Parsed time</th><th>Hosts</th><th>Source file</th></tr></thead><tbody>{collections.map((item, index) => <tr key={item.key}><td>{index + 1}</td><td>{item.timeLabel}</td><td>{item.hostCount}</td><td>{item.fileName}</td></tr>)}</tbody></table></div></details>
}

export default function ToolLogAutoRca() {
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('Upload WP-SCOUT / Daily Check logs. The workspace will sort time and find APP1–APP5 peaks automatically.')
  const [analysis, setAnalysis] = React.useState(null)
  const [rca, setRca] = React.useState(null)
  const [selectedHost, setSelectedHost] = React.useState('')
  const [selectedCollectionKey, setSelectedCollectionKey] = React.useState('')

  const upload = React.useCallback(async (list) => {
    setBusy(true)
    setStatus('Parsing logs, sorting snapshot collections, and correlating peak workloads…')
    try {
      const expanded = (await expandZipAwareFiles(list, ['log', 'txt', 'csv'])).filter((file) => ['log', 'txt', 'csv'].includes(fileExt(file.name)))
      if (!expanded.length) throw new Error('No supported .log, .txt, or .csv files found.')
      const parsed = []
      for (const file of expanded) parsed.push(parseLogText(await file.text(), file.name))
      const nextAnalysis = buildLogAnalysis(parsed)
      const nextRca = buildAutoPeakRca(nextAnalysis)
      if (!nextRca?.collections?.length) throw new Error('No host telemetry snapshots found in the uploaded logs.')
      setAnalysis(nextAnalysis)
      setRca(nextRca)
      setSelectedHost(nextRca.hostPeaks[0]?.host || nextRca.hosts[0] || '')
      setSelectedCollectionKey(nextRca.landscapePeak?.key || nextRca.collections[0]?.key || '')
      setStatus(`Parsed ${expanded.length} files into ${nextRca.collections.length} chronological snapshot collections across ${nextRca.hosts.length} application servers.`)
    } catch (error) {
      setAnalysis(null); setRca(null); setStatus(error?.message || 'LOG analysis failed.')
    } finally {
      setBusy(false)
    }
  }, [])

  const selectedHostPeak = rca?.hostPeaks?.find((item) => item.host === selectedHost) || rca?.hostPeaks?.[0] || null
  const selectedCandidates = selectedHostPeak ? (rca?.hostCandidates?.get(selectedHostPeak.host) || []) : []
  const selectedCollection = rca?.collections?.find((item) => item.key === selectedCollectionKey) || rca?.landscapePeak || null
  const topLandscapeCandidate = rca?.landscapeCandidates?.[0] || null
  const topHostCandidate = selectedCandidates.find((item) => item.classification !== 'BACKGROUND') || selectedCandidates[0] || null

  return <section className="autoPeakShell">
    <div className="autoPeakInner">
      <header className="autoPeakHeader">
        <div><span className="autoPeakEyebrow">SAP INCIDENT RCA · AUTOMATIC PEAK CORRELATION</span><h1>LOG Analysis</h1><p>Upload evidence once. The workspace sorts every 10-minute collection, finds APP1–APP5 peaks, then ranks jobs by resource consumption and error timing.</p></div>
        <label className="autoPeakUpload"><input type="file" multiple accept=".zip,.log,.txt,.csv" onChange={(event) => upload(event.target.files)} />{busy ? 'Analyzing…' : 'Upload Logs'}</label>
      </header>

      <div className={`autoPeakStatusBar ${analysis ? 'ready' : ''}`}>{status}</div>

      {!rca ? <div className="autoPeakEmptyState"><b>Expected flow</b><span>08:00 → 08:10 → 08:20 … → 11:00</span><p>No host or incident selection is required. Peak detection runs automatically across all uploaded application-server evidence.</p></div> : <>
        <section className="autoPeakStats">
          <Stat label="Log files / collections" value={`${rca.evidenceWindow.fileCount} / ${rca.evidenceWindow.count}`} meta="One chronological collection per source log" />
          <Stat label="Application servers" value={rca.evidenceWindow.hostCount} meta={rca.hosts.join(' · ')} />
          <Stat label="Evidence window" value={`${shortTime(rca.evidenceWindow.start)} → ${shortTime(rca.evidenceWindow.end)}`} meta={`${rca.cadence.nominalMinutes || '—'}-min cadence`} />
          <Stat label="Evidence gaps" value={rca.cadence.gaps.length} meta={rca.cadence.gaps.length ? `Longest ${durationText(Math.max(...rca.cadence.gaps.map((gap) => gap.minutes)))}` : 'Continuous at detected cadence'} />
        </section>

        <section className="autoPeakHero">
          <div><span>LANDSCAPE PEAK</span><strong>{shortTime(rca.landscapePeak?.timeLabel)}</strong><p>{rca.landscapePeak?.elevated || 0} of {rca.landscapePeak?.hostCount || 0} application servers elevated · {rca.landscapePeak?.crit || 0} CRIT · {rca.landscapePeak?.warn || 0} WARN</p></div>
          <div><span>TOP CROSS-HOST CANDIDATE</span><strong>{topLandscapeCandidate?.name || 'No strong shared workload'}</strong><p>{topLandscapeCandidate ? `${topLandscapeCandidate.hostCount} host(s) · ${topLandscapeCandidate.classification} · avg score ${topLandscapeCandidate.averageScore}/100` : 'Review host-specific candidates below.'}</p></div>
        </section>

        <section className="autoPeakPanel">
          <div className="autoPeakPanelHead"><div><h2>APP1–APP5 automatic peak detection</h2><p>Each host is ranked at its own worst resource-pressure snapshot. Click a host to inspect correlated jobs.</p></div></div>
          <div className="autoPeakHostGrid">{rca.hostPeaks.map((item) => {
            const candidates = rca.hostCandidates.get(item.host) || []
            const candidate = candidates.find((row) => row.classification !== 'BACKGROUND') || candidates[0] || null
            return <HostPeakCard key={item.host} item={item} candidate={candidate} active={selectedHostPeak?.host === item.host} onClick={() => setSelectedHost(item.host)} />
          })}</div>
        </section>

        <section className="autoPeakPanel">
          <div className="autoPeakPanelHead"><div><h2>Chronological landscape timeline</h2><p>Source logs are grouped by file and sorted by parsed snapshot time. Click any row to inspect all hosts at that collection.</p></div><span className="autoPeakCadence">{rca.cadence.nominalMinutes || '—'} min cadence</span></div>
          <TimelineTable rca={rca} selectedKey={selectedCollection?.key} onSelect={setSelectedCollectionKey} />
        </section>

        <SnapshotDetail collection={selectedCollection} />

        <section className="autoPeakSelectedHost">
          <div><span>SELECTED HOST PEAK</span><b>{selectedHostPeak?.host}</b><strong>{shortTime(selectedHostPeak?.peakTime)}</strong></div>
          <div><span>TOP CANDIDATE</span><b>{topHostCandidate?.name || 'No strong candidate'}</b><strong>{topHostCandidate ? `${topHostCandidate.classification} · ${topHostCandidate.score}/100` : '—'}</strong></div>
          <div><span>WHY IT RANKS</span><b>{topHostCandidate ? `CPU ${signed(topHostCandidate.cpuDelta, 1, ' pp')} · RSS ${signed(topHostCandidate.rssDelta, 2, ' GB')}` : 'No workload sample'}</b><strong>{topHostCandidate?.newErrors?.length ? `New: ${topHostCandidate.newErrors.join(', ')}` : 'No new peak-only error'}</strong></div>
        </section>

        <CauseTable hostPeak={selectedHostPeak} candidates={selectedCandidates} />
        <SourceAudit collections={rca.collections} />
      </>}
    </div>
  </section>
}
