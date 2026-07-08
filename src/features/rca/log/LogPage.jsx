import React from 'react'
import { buildOwnerAction, classifySapError, expandZipAwareFiles, fileExt, fmt, latestRcaSession, loadJson, safe, saveJson } from '../shared/rca-utils.js'
import { DecisionCard, EmptyState, EvidenceServerPanel, EvidenceToolbar, SessionBanner, UploadedFilesPanel } from '../shared/RcaEvidenceKit.jsx'
import '../shared/RcaDashboard.css'

const CACHE_KEY = 'sap_log_evidence_v2_cache'
const ACCEPTED_TYPES = ['.log', '.txt', '.csv', '.zip']
const KNOWN_ERRORS = ['CONVT_OVERFLOW', 'CONVT_NO_NUMBER', 'DBSQL_DUPLICATE_KEY_ER', 'DBSQL_SQL_DEADLOCK_DET', 'ITAB_DUPLICATE_KEY', 'LOAD_PROGRAM_TABLE_MIS', 'SYSTEM_ABAP_ACCESS_DEN', 'GETWA_NOT_ASSIGNED', 'UNCAUGHT_EXCEPTION', 'SYNTAX_ERROR', 'CALL_FUNCTION_SEND_ERR', 'TIME_OUT', 'IMPORT_WRONG_END_POS']

async function expandFiles(fileList) {
  const expanded = await expandZipAwareFiles(fileList, ['log', 'txt', 'csv'])
  return expanded.filter((file) => ['log', 'txt', 'csv'].includes(fileExt(file.name)))
}

function parseMemorySnapshot(text = '') {
  const raw = String(text || '')
  const pickGb = (patterns = []) => {
    for (const rx of patterns) {
      const m = raw.match(rx)
      if (!m) continue
      const value = Number(m[1])
      const unit = String(m[2] || 'GB').toUpperCase()
      if (!Number.isFinite(value)) continue
      if (unit.startsWith('T')) return value * 1024
      if (unit.startsWith('M')) return value / 1024
      if (unit.startsWith('K')) return value / 1024 / 1024
      return value
    }
    return 0
  }
  return {
    physicalMemGb: pickGb([/(?:physical\s+memory|phys(?:ical)?\s+mem(?:ory)?|mem(?:ory)?\s+total|total\s+memory|MemTotal)\s*[:=]\s*([\d.]+)\s*(TB|GB|G|MB|M|KB|K)?/i, /(?:RAM|Memory)\s*[:=]\s*([\d.]+)\s*(TB|GB|G|MB|M|KB|K)/i, /Mem:\s+([\d.]+)\s*(TB|GB|G|MB|M|KB|K)?/i]),
    swapGb: pickGb([/(?:swap\s+total|total\s+swap|SwapTotal|swap)\s*[:=]\s*([\d.]+)\s*(TB|GB|G|MB|M|KB|K)?/i, /Swap:\s+([\d.]+)\s*(TB|GB|G|MB|M|KB|K)?/i]),
  }
}

function parseWpRows(text = '', fileName = '') {
  const snapshot = text.match(/snapshot\s*@\s*([^\n]+)/i)?.[1]?.trim() || ''
  const timeLabel = snapshot.split(' ')[1]?.slice(0, 5) || snapshot || fileName
  const host = text.match(/Hostname\s*:\s*(\S+)/i)?.[1]?.trim() || text.match(/##\s*WP-SCOUT\s*@\s*(\S+)/i)?.[1]?.trim() || 'UNKNOWN'
  const mem = parseMemorySnapshot(text)
  const rows = []
  const rx = /^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+([\d.]+)\s+([\d.]+G)\s+([\d.]+)\s+([RS])\s+(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(CRIT|WARN|OK)\s+(\S+)\s+(\S+)\s+(.*)$/
  String(text || '').replace(/\r/g, '').split('\n').forEach((line) => {
    const m = safe(line).match(rx)
    if (!m) return
    const rest = safe(m[17])
    const pathIdx = rest.lastIndexOf(' /')
    const noPath = pathIdx >= 0 ? rest.slice(0, pathIdx).trim() : rest
    const parts = noPath.split(/\s+/).filter(Boolean)
    const jobName = parts.pop() || '?'
    const errorCode = parts.pop() || '?'
    const program = parts.join(' ') || '?'
    rows.push({ fileName, snapshot, timeLabel, host, pid: m[1], wp: m[3], type: m[4], cpu: Number(m[5]) || 0, rssGb: Number(m[7]) || 0, physicalMemGb: mem.physicalMemGb, swapGb: mem.swapGb, state: m[8], className: m[14], program, errorCode, jobName, lineNo: 0, source: 'WP-SCOUT' })
  })
  return rows
}

function parseGenericErrors(text = '', fileName = '') {
  const rows = []
  const mem = parseMemorySnapshot(text)
  String(text || '').replace(/\r/g, '').split('\n').forEach((line, idx) => {
    const errorCode = KNOWN_ERRORS.find((error) => line.includes(error))
    if (!errorCode) return
    const hhmm = line.match(/\b(\d{2}:\d{2})(?::\d{2})?\b/)?.[1] || ''
    const severity = /CRIT|ERROR|\bE\b|dump|abend|failed|exception/i.test(line) ? 'CRIT' : 'WARN'
    rows.push({ fileName, timeLabel: hhmm, host: 'UNKNOWN', pid: '', wp: '', type: '', cpu: 0, rssGb: 0, physicalMemGb: mem.physicalMemGb, swapGb: mem.swapGb, state: '', className: severity, program: safe(line).slice(0, 140), errorCode, jobName: '?', lineNo: idx + 1, source: 'generic-log' })
  })
  return rows
}

function displayLabel(value = '', max = 28) {
  const label = safe(value)
  const normalized = !label || label === '?' || label.toUpperCase() === 'UNKNOWN' ? 'Unknown' : label
  return normalized.length > max ? `${normalized.slice(0, Math.max(8, max - 1))}…` : normalized
}

function compactFamilyLabel(family = '') {
  return safe(family).replace('SAP runtime/log pattern', 'Runtime Pattern').replace('RFC / communication function error', 'RFC / Communication').replace('ABAP program load/runtime issue', 'ABAP Runtime').replace('Database/application data consistency issue', 'Data Consistency') || 'Unknown'
}

function group(rows, key) {
  const map = new Map()
  rows.forEach((row) => {
    const name = safe(row[key]) || '?'
    const family = classifySapError(key === 'errorCode' ? name : row.errorCode)
    const current = map.get(name) || { name, hits: 0, critHits: 0, warnHits: 0, maxCpu: 0, examples: new Set(), jobs: new Set(), programs: new Set(), times: new Set(), files: new Set(), sources: new Set(), family: family.family, owner: family.owner, meaning: family.meaning }
    current.hits += 1
    current.critHits += row.className === 'CRIT' ? 1 : 0
    current.warnHits += row.className === 'WARN' ? 1 : 0
    current.maxCpu = Math.max(current.maxCpu, row.cpu || 0)
    if (row.program && key !== 'program') current.examples.add(row.program)
    if (row.jobName && key !== 'jobName') current.examples.add(row.jobName)
    if (row.program) current.programs.add(row.program)
    if (row.jobName) current.jobs.add(row.jobName)
    if (row.timeLabel) current.times.add(row.timeLabel)
    if (row.fileName) current.files.add(row.fileName)
    if (row.source) current.sources.add(row.source)
    map.set(name, current)
  })
  return Array.from(map.values()).map((item) => ({
    ...item,
    examples: Array.from(item.examples).slice(0, 3),
    jobs: Array.from(item.jobs).filter((value) => value !== '?').slice(0, 5),
    programs: Array.from(item.programs).filter((value) => value !== '?').slice(0, 5),
    times: Array.from(item.times).slice(0, 10),
    files: Array.from(item.files).slice(0, 5),
    sources: Array.from(item.sources).slice(0, 5),
  })).sort((a, b) => b.critHits - a.critHits || b.hits - a.hits)
}

function buildTimeline(rows = []) {
  const map = new Map()
  rows.forEach((row) => {
    if (!row.timeLabel) return
    const current = map.get(row.timeLabel) || { time: row.timeLabel, hits: 0, crit: 0, warn: 0 }
    current.hits += 1
    current.crit += row.className === 'CRIT' ? 1 : 0
    current.warn += row.className === 'WARN' ? 1 : 0
    map.set(row.timeLabel, current)
  })
  return Array.from(map.values()).sort((a, b) => String(a.time).localeCompare(String(b.time)))
}

function confidenceLabel(confidence, rows, primary) {
  if (!primary) return 'No classified error pattern found.'
  if (rows.length < 3) return 'Low sample size; treat as initial clue, not final RCA.'
  if (confidence >= 75) return 'Strong pattern from uploaded log evidence.'
  if (confidence >= 45) return 'Moderate pattern; verify with ST03N/WP-SCOUT timeline.'
  return 'Weak pattern; evidence is partial.'
}

function buildAnalysis(files, rows, evidenceServer) {
  const errorGroups = group(rows, 'errorCode')
  const jobGroups = group(rows, 'jobName')
  const programGroups = group(rows, 'program')
  const primary = errorGroups[0]
  const timeline = buildTimeline(rows)
  const sourceCount = new Set(rows.map((row) => row.source)).size
  const fileCount = new Set(rows.map((row) => row.fileName)).size
  const confidence = primary ? Math.min(100, Math.round(Math.min(36, (primary.critHits || 0) * 9) + (primary.hits > 1 ? 16 : 0) + Math.min(24, rows.length * 2) + Math.min(14, fileCount * 4 + sourceCount * 3) + Math.min(10, timeline.length * 2))) : 0
  const verdict = primary ? 'Detected' : 'Not confirmed'
  const nextAction = primary ? buildOwnerAction(primary) : 'Upload WP-SCOUT, SM21, ST22, dev_w, or job logs containing SAP error patterns.'
  const summary = primary ? `${primary.name} is strongest: ${primary.hits} hit(s), ${primary.critHits} CRIT, owner ${primary.owner}.` : 'No known SAP error patterns detected from uploaded logs.'
  return { files, rows, errorGroups, jobGroups, programGroups, primary, timeline, confidence, confidenceText: confidenceLabel(confidence, rows, primary), verdict, nextAction, summary, evidenceServer, createdAt: new Date().toISOString() }
}

function buildReportText(analysis) {
  if (!analysis) return ''
  const primary = analysis.primary
  return ['SAP Log Evidence RCA Summary', `Verdict: ${analysis.verdict}`, `Confidence: ${analysis.confidence}% - ${analysis.confidenceText}`, primary ? `Primary Error: ${primary.name}` : 'Primary Error: -', primary ? `Error Family: ${primary.family}` : 'Error Family: -', primary ? `Owner Direction: ${primary.owner}` : 'Owner Direction: -', `Next Action: ${analysis.nextAction}`, `Parsed Rows: ${analysis.rows?.length || 0}`].join('\n')
}

function cleanActionText(text = '') { return safe(text).replace(/^(Focus [^:]+)\s+\1:?\s*/i, '$1: ') }
function ownerHint(primary, analysis) { if (!primary) return 'Based only on uploaded evidence pattern.'; const target = primary.jobs?.[0] || primary.programs?.[0] || primary.examples?.[0] || primary.name; const firstTime = primary.times?.[0] || 'peak time'; return `Review ${target} around ${firstTime}. ${analysis?.rows?.length || 0} parsed rows.` }

function percentile(values = [], p = 95) {
  const nums = values.map(Number).filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  if (!nums.length) return 0
  const idx = Math.min(nums.length - 1, Math.max(0, Math.ceil((p / 100) * nums.length) - 1))
  return Number(nums[idx].toFixed(2))
}

function buildInfraSummary(rows = []) {
  const peakCpuRow = rows.reduce((best, row) => ((row.cpu || 0) > (best?.cpu || 0) ? row : best), null)
  const maxRssRow = rows.reduce((best, row) => ((row.rssGb || 0) > (best?.rssGb || 0) ? row : best), null)
  const rssValues = rows.map((row) => Number(row.rssGb) || 0).filter((value) => value > 0)
  const physicalMemGb = Math.max(0, ...rows.map((row) => Number(row.physicalMemGb) || 0))
  const swapGb = Math.max(0, ...rows.map((row) => Number(row.swapGb) || 0))
  const critCount = rows.filter((row) => row.className === 'CRIT').length
  const warnCount = rows.filter((row) => row.className === 'WARN').length
  return { peakCpu: peakCpuRow?.cpu || 0, peakCpuTime: peakCpuRow?.timeLabel || '-', peakCpuProgram: displayLabel(peakCpuRow?.program || '-', 34), maxRssGb: maxRssRow?.rssGb || 0, maxRssTime: maxRssRow?.timeLabel || '-', totalRssGb: Number(rssValues.reduce((sum, value) => sum + value, 0).toFixed(2)), p95RssGb: percentile(rssValues, 95), physicalMemGb, swapGb, badWp: critCount + warnCount, critCount, warnCount }
}

function AcceptedTypes() { return <div className="acceptedTypes">{ACCEPTED_TYPES.map((item) => <span key={item}>{item}</span>)}</div> }

function FinalHero({ busy, onFiles }) {
  return <header className="rcaFinalHero"><div><span>SAP Basis RCA Evidence Analyzer</span><h1>Log Evidence Console</h1><p>Compact log classification console for WP-SCOUT, SM21, ST22, dev_w, job log, and CSV evidence.</p></div><label className="rcaFinalUpload"><input type="file" multiple accept=".zip,.log,.txt,.csv" onChange={(event) => onFiles(event.target.files)} /><strong>{busy ? 'Parsing…' : 'Upload Log Evidence'}</strong><small>Log, text, CSV, or ZIP evidence</small><AcceptedTypes /></label></header>
}

function ErrorRankingChart({ rows = [] }) {
  const data = rows.slice(0, 8)
  const maxHits = Math.max(1, ...data.map((row) => row.hits || 0))
  return <section className="rcaFinalCard rcaFinalChartCard"><div className="rcaFinalPanelTitle"><h2>Top Error Code / Error Ranking</h2><span>Hits / CRIT</span></div>{data.length ? <div className="rcaLiteBars logBars">{data.map((row) => <div className="rcaLiteBarRow" key={row.name}><div className="rcaLiteBarLabel" title={row.name}>{displayLabel(row.name, 24)}</div><div className="rcaLiteBarTrack"><span className="crit" style={{ width: `${Math.max(2, (row.hits / maxHits) * 100)}%` }} /></div><div className="rcaLiteBarValue">{row.hits} / C{row.critHits || 0}</div></div>)}</div> : <p>No classified error rows.</p>}</section>
}

function ErrorTrendChart({ data = [] }) {
  const items = data.slice(-18)
  const maxHits = Math.max(1, ...items.map((item) => item.hits || 0))
  return <section className="rcaFinalCard rcaFinalChartCard"><div className="rcaFinalPanelTitle"><h2>Error Trend</h2><span>Time Window</span></div>{items.length ? <div className="rcaLiteTrend">{items.map((item) => <div className="rcaTrendPoint" key={item.time}><span className="hit" style={{ height: `${Math.max(4, (item.hits / maxHits) * 120)}px` }} title={`${item.time} hits ${item.hits}`} /><span className="crit" style={{ height: `${Math.max(3, (item.crit / maxHits) * 120)}px` }} title={`${item.time} crit ${item.crit}`} /><small>{item.time}</small></div>)}</div> : <p>No timeline data.</p>}</section>
}

function ErrorRankingTable({ rows = [] }) {
  return <section className="rcaFinalCard rcaFinalTableCard"><div className="rcaFinalPanelTitle"><h2>Error Ranking Table</h2><span>Top classified errors</span></div><div className="rcaFinalTableWrap"><table><thead><tr><th>Error Code</th><th>Family</th><th>Owner</th><th>Hits</th><th>CRIT</th><th>Programs / Jobs</th></tr></thead><tbody>{rows.slice(0, 8).map((row) => <tr key={row.name}><td><b>{displayLabel(row.name, 34)}</b></td><td>{compactFamilyLabel(row.family)}</td><td>{row.owner}</td><td>{row.hits}</td><td>{row.critHits}</td><td>{[...(row.programs || []), ...(row.jobs || [])].slice(0, 2).join(' · ') || '-'}</td></tr>)}</tbody></table></div></section>
}

function RcaInsight({ primary, analysis, status }) {
  return <section className="rcaFinalCard rcaFinalInsightBlock"><div className="rcaFinalPanelTitle"><h2>RCA Insight</h2><span>Classified Signal</span></div>{primary ? <><p><b>{primary.name}</b> points to <b>{compactFamilyLabel(primary.family)}</b>.</p><p>{primary.meaning}</p><div className="rcaFinalMetricRows"><span>Hits<b>{primary.hits}</b></span><span>CRIT<b>{primary.critHits}</b></span><span>Files<b>{primary.files?.length || 0}</b></span></div><p className="rcaFinalAction">{analysis.nextAction}</p></> : <p>{status}</p>}</section>
}

function MappingPanel({ primary }) {
  return <section className="rcaFinalCard"><div className="rcaFinalPanelTitle"><h2>Error to Job / Program Mapping</h2><span>Extracted Context</span></div>{primary ? <div className="rcaFinalList"><div><b>Jobs</b><span>{primary.jobs?.join(' · ') || 'No job extracted'}</span></div><div><b>Programs</b><span>{primary.programs?.join(' · ') || 'No program extracted'}</span></div><div><b>Seen at</b><span>{primary.times?.join(', ') || 'No timestamp extracted'}</span></div></div> : <p>Upload logs to map errors to jobs and programs.</p>}</section>
}

function RecommendedAction({ analysis }) {
  const rows = (analysis?.errorGroups || []).slice(0, 5).map((item) => ({ name: item.name, text: cleanActionText(buildOwnerAction(item)), owner: item.owner }))
  return <section className="rcaFinalCard"><div className="rcaFinalPanelTitle"><h2>Recommended Action</h2><span>Owner Routing</span></div><div className="rcaFinalList">{rows.length ? rows.map((item) => <div key={item.name}><b>{item.owner} · {item.name}</b><span>{item.text}</span></div>) : <div><b>Pending</b><span>No action until error evidence is parsed.</span></div>}</div></section>
}

function InfraPressure({ rows = [] }) {
  const summary = buildInfraSummary(rows)
  return <section className="rcaFinalCard"><div className="rcaFinalPanelTitle"><h2>Infra Pressure</h2><span>Compact WP Signal</span></div><section className="rcaFinalInfraGrid"><div><span>Peak CPU</span><b>{fmt(summary.peakCpu)}%</b><small>{summary.peakCpuProgram} · {summary.peakCpuTime}</small></div><div><span>Max RSS</span><b>{fmt(summary.maxRssGb)} GB</b><small>{summary.maxRssTime}</small></div><div><span>P95 RSS</span><b>{fmt(summary.p95RssGb)} GB</b><small>WP rows only</small></div><div><span>Total RSS</span><b>{fmt(summary.totalRssGb)} GB</b><small>Parsed RSS sum</small></div><div><span>Bad WP</span><b>{fmt(summary.badWp, 0)}</b><small>CRIT + WARN</small></div><div><span>Physical / Swap</span><b>{summary.physicalMemGb ? `${fmt(summary.physicalMemGb)} / ${fmt(summary.swapGb)} GB` : 'N/A'}</b><small>Only if detected</small></div></section></section>
}

export default function LogPage() {
  const [session] = React.useState(latestRcaSession)
  const [files, setFiles] = React.useState([])
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('Upload WP-SCOUT/SM21/ST22/dev_w/job logs or ZIP to validate error evidence.')
  const [analysis, setAnalysis] = React.useState(() => loadJson(CACHE_KEY, null))
  const [serverInfo, setServerInfo] = React.useState(null)

  React.useEffect(() => {
    let active = true
    import('../../../evidence-api-client.js').then(({ listEvidence }) => listEvidence({ tool: 'investigation', limit: 5 })).then((response) => { if (active) setServerInfo(response) }).catch(() => { if (active) setServerInfo({ ok: false }) })
    return () => { active = false }
  }, [])

  const analyze = async (nextFiles = files) => {
    setBusy(true)
    setStatus('Parsing log evidence…')
    try {
      const rows = []
      for (const file of nextFiles) {
        const text = await file.text()
        const wpRows = parseWpRows(text, file.name)
        rows.push(...(wpRows.length ? wpRows : parseGenericErrors(text, file.name)))
      }
      const result = buildAnalysis(nextFiles.map((file) => ({ name: file.name, size: file.size })), rows, serverInfo)
      setAnalysis(result)
      saveJson(CACHE_KEY, result)
      setStatus('Log evidence analysis complete.')
    } catch (error) {
      setStatus(error?.message || 'Failed to parse logs.')
    } finally {
      setBusy(false)
    }
  }

  const onFiles = async (fileList) => {
    setBusy(true)
    try {
      const expanded = await expandFiles(fileList)
      setFiles(expanded)
      await analyze(expanded)
    } catch (error) {
      setStatus(error?.message || 'Failed to read upload.')
    } finally {
      setBusy(false)
    }
  }

  const primary = analysis?.primary
  const familyValue = primary ? compactFamilyLabel(primary.family) : 'Unknown'
  const displayedFiles = files.length ? files : (analysis?.files || [])

  return <section className="rcaFinalShell logEvidenceShell"><FinalHero busy={busy} onFiles={onFiles} /><SessionBanner session={session} /><EvidenceToolbar analysis={analysis} cacheKey={CACHE_KEY} reportText={buildReportText(analysis)} filenamePrefix="sap-log-evidence-final" /><section className="rcaFinalKpiStrip"><DecisionCard label="Primary Error" value={primary?.name || 'Pending'} hint={analysis?.summary || status} tone={primary ? 'good' : ''} /><DecisionCard label="Error Family" value={familyValue} hint={primary?.meaning || 'Upload logs to classify error family'} tone="blue" /><DecisionCard label="Owner Direction" value={primary?.owner || 'Pending'} hint={ownerHint(primary, analysis)} /><DecisionCard label="Confidence" value={`${analysis?.confidence || 0}%`} hint={analysis?.confidenceText || `${analysis?.rows?.length || 0} parsed rows`} /></section>{analysis ? <><div className="rcaFinalMainGrid"><main className="rcaFinalMainCol"><ErrorRankingChart rows={analysis.errorGroups || []} /><ErrorTrendChart data={analysis.timeline || []} /><ErrorRankingTable rows={analysis.errorGroups || []} /></main><aside className="rcaFinalInsightCol"><RcaInsight primary={primary} analysis={analysis} status={status} /><MappingPanel primary={primary} /><RecommendedAction analysis={analysis} /></aside></div><div className="rcaFinalFooterGrid"><InfraPressure rows={analysis.rows || []} /></div></> : <EmptyState title="Upload log evidence"><p>Upload WP-SCOUT logs, SM21/ST22 text, dev_w trace, job log text, CSV, or a ZIP containing logs. This dashboard uses real uploaded evidence and cached analysis only.</p></EmptyState>}<div className="rcaFinalFooterGrid"><UploadedFilesPanel files={displayedFiles} /><EvidenceServerPanel serverInfo={serverInfo} /></div></section>
}
