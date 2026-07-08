import React from 'react'
import { buildOwnerAction, classifySapError, expandZipAwareFiles, fileExt, fmt, loadJson, safe, saveJson } from '../shared/rca-utils.js'
import { EmptyState, UploadedFilesPanel } from '../shared/RcaEvidenceKit.jsx'
import '../shared/RcaDashboard.css'
import './LogPage.css'

const CACHE_KEY = 'sap_log_evidence_v2_cache'
const ACCEPTED_TYPES = ['.log', '.txt', '.csv', '.zip']
const KNOWN_ERRORS = ['CONVT_OVERFLOW', 'CONVT_NO_NUMBER', 'DBSQL_DUPLICATE_KEY_ER', 'DBSQL_SQL_DEADLOCK_DET', 'ITAB_DUPLICATE_KEY', 'LOAD_PROGRAM_TABLE_MIS', 'SYSTEM_ABAP_ACCESS_DEN', 'GETWA_NOT_ASSIGNED', 'UNCAUGHT_EXCEPTION', 'SYNTAX_ERROR', 'CALL_FUNCTION_SEND_ERR', 'TIME_OUT', 'IMPORT_WRONG_END_POS', 'TSV_TNEW_PAGE_ALLOC_FA']
const LOG_TABS = ['Overview', 'Error Analysis', 'Work Process', 'Job Analysis', 'System Resources']

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
    rows.push({ fileName, snapshot, timeLabel, host, pid: m[1], wp: m[3], type: m[4], cpu: Number(m[5]) || 0, rssGb: Number(m[7]) || 0, physicalMemGb: mem.physicalMemGb, swapGb: mem.swapGb, state: m[8], className: m[14], program, errorCode, jobName, durationSec: Number(m[11]) || 0, lineNo: 0, source: 'WP-SCOUT' })
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
    rows.push({ fileName, timeLabel: hhmm, host: 'UNKNOWN', pid: '', wp: '', type: '', cpu: 0, rssGb: 0, physicalMemGb: mem.physicalMemGb, swapGb: mem.swapGb, state: '', className: severity, program: safe(line).slice(0, 140), errorCode, jobName: '?', durationSec: 0, lineNo: idx + 1, source: 'generic-log' })
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

function normalizeHost(value = '') {
  const host = safe(value)
  return !host || host.toUpperCase() === 'UNKNOWN' ? 'UNKNOWN' : host
}

function group(rows, key) {
  const map = new Map()
  rows.forEach((row) => {
    const name = safe(row[key]) || '?'
    const family = classifySapError(key === 'errorCode' ? name : row.errorCode)
    const current = map.get(name) || { name, hits: 0, critHits: 0, warnHits: 0, maxCpu: 0, maxRssGb: 0, examples: new Set(), jobs: new Set(), programs: new Set(), times: new Set(), files: new Set(), hosts: new Set(), sources: new Set(), family: family.family, owner: family.owner, meaning: family.meaning }
    current.hits += 1
    current.critHits += row.className === 'CRIT' ? 1 : 0
    current.warnHits += row.className === 'WARN' ? 1 : 0
    current.maxCpu = Math.max(current.maxCpu, row.cpu || 0)
    current.maxRssGb = Math.max(current.maxRssGb, row.rssGb || 0)
    if (row.program && key !== 'program') current.examples.add(row.program)
    if (row.jobName && key !== 'jobName') current.examples.add(row.jobName)
    if (row.program) current.programs.add(row.program)
    if (row.jobName) current.jobs.add(row.jobName)
    if (row.timeLabel) current.times.add(row.timeLabel)
    if (row.fileName) current.files.add(row.fileName)
    if (row.host) current.hosts.add(row.host)
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
    hosts: Array.from(item.hosts).slice(0, 5),
    sources: Array.from(item.sources).slice(0, 5),
  })).sort((a, b) => b.critHits - a.critHits || b.hits - a.hits)
}

function buildTimeline(rows = []) {
  const map = new Map()
  rows.forEach((row) => {
    const key = row.timeLabel || 'N/A'
    const current = map.get(key) || { time: key, hits: 0, crit: 0, warn: 0, cpu: 0, rssGb: 0 }
    current.hits += 1
    current.crit += row.className === 'CRIT' ? 1 : 0
    current.warn += row.className === 'WARN' ? 1 : 0
    current.cpu = Math.max(current.cpu, row.cpu || 0)
    current.rssGb = Math.max(current.rssGb, row.rssGb || 0)
    map.set(key, current)
  })
  return Array.from(map.values()).sort((a, b) => String(a.time).localeCompare(String(b.time)))
}

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

function buildHostResourceSummary(rows = []) {
  const map = new Map()
  rows.forEach((row) => {
    const host = normalizeHost(row.host)
    const current = map.get(host) || { name: host, rows: 0, badWp: 0, crit: 0, warn: 0, peakCpu: 0, maxRssGb: 0, maxSwapGb: 0, physicalMemGb: 0, topCpuRow: null, topRssRow: null, pids: new Set(), wpTypes: new Set(), jobs: new Set(), programs: new Set(), errors: new Set(), times: new Set() }
    current.rows += 1
    current.crit += row.className === 'CRIT' ? 1 : 0
    current.warn += row.className === 'WARN' ? 1 : 0
    current.badWp = current.crit + current.warn
    current.physicalMemGb = Math.max(current.physicalMemGb, Number(row.physicalMemGb) || 0)
    current.maxSwapGb = Math.max(current.maxSwapGb, Number(row.swapGb) || 0)
    if ((row.cpu || 0) >= current.peakCpu) { current.peakCpu = Number(row.cpu) || 0; current.topCpuRow = row }
    if ((row.rssGb || 0) >= current.maxRssGb) { current.maxRssGb = Number(row.rssGb) || 0; current.topRssRow = row }
    if (row.pid) current.pids.add(row.pid)
    if (row.type) current.wpTypes.add(row.type)
    if (row.jobName && row.jobName !== '?') current.jobs.add(row.jobName)
    if (row.program && row.program !== '?') current.programs.add(row.program)
    if (row.errorCode && row.errorCode !== '?') current.errors.add(row.errorCode)
    if (row.timeLabel) current.times.add(row.timeLabel)
    map.set(host, current)
  })
  return Array.from(map.values()).map((item) => ({
    ...item,
    pids: Array.from(item.pids).slice(0, 6),
    wpTypes: Array.from(item.wpTypes).slice(0, 6),
    jobs: Array.from(item.jobs).slice(0, 4),
    programs: Array.from(item.programs).slice(0, 4),
    errors: Array.from(item.errors).slice(0, 4),
    times: Array.from(item.times).slice(0, 6),
    topPid: item.topCpuRow?.pid || item.topRssRow?.pid || '-',
    topWp: item.topCpuRow?.wp || item.topRssRow?.wp || '-',
    topProgram: item.topCpuRow?.program || item.topRssRow?.program || '-',
    topJob: item.topCpuRow?.jobName || item.topRssRow?.jobName || '-',
    topError: item.topCpuRow?.errorCode || item.topRssRow?.errorCode || '-',
  })).sort((a, b) => b.badWp - a.badWp || b.peakCpu - a.peakCpu || b.maxRssGb - a.maxRssGb)
}

function buildRcaExplanation(analysis) {
  const rows = analysis?.rows || []
  const primary = analysis?.primary
  const host = analysis?.hostResources?.[0]
  const topRow = [...rows].sort((a, b) => (b.cpu || 0) - (a.cpu || 0) || (b.rssGb || 0) - (a.rssGb || 0) || (b.durationSec || 0) - (a.durationSec || 0))[0]
  if (!topRow && !primary) return null
  const family = classifySapError(topRow?.errorCode || primary?.name || '')
  return {
    symptom: host ? `${host.name} has ${fmt(host.badWp, 0)} CRIT/WARN WP rows, peak CPU ${fmt(host.peakCpu)}%, max RSS ${fmt(host.maxRssGb)} GB, swap ${fmt(host.maxSwapGb)} GB.` : 'Resource symptom is detected from uploaded log rows.',
    suspect: topRow ? `Suspect PID ${topRow.pid || '-'} WP ${topRow.wp || '-'} ${topRow.type || '-'} running ${displayLabel(topRow.program, 48)} / ${displayLabel(topRow.jobName, 36)} at ${topRow.timeLabel || '-'} with CPU ${fmt(topRow.cpu)}% and RSS ${fmt(topRow.rssGb)} GB.` : 'No PID-level WP row was available in the evidence.',
    error: primary ? `${primary.name}: ${primary.meaning || family.meaning}. Owner routing: ${primary.owner || family.owner}.` : `${topRow?.errorCode || '-'}: ${family.meaning}. Owner routing: ${family.owner}.`,
    action: cleanActionText(buildOwnerAction(primary || { name: topRow?.errorCode || '-', owner: family.owner, family: family.family, meaning: family.meaning })) || 'Validate WP-SCOUT around the incident window, then correlate PID, job, ABAP program, SM21/ST22 error, and OS CPU/RSS/swap from the same APP server.',
  }
}

function calculateConfidence(primary, rows, timeline, files) {
  const fileCount = new Set((files || []).map((file) => file.name)).size
  if (!primary) return 0
  return Math.min(100, Math.round(Math.min(36, (primary.critHits || 0) * 9) + (primary.hits > 1 ? 16 : 0) + Math.min(24, rows.length * 2) + Math.min(14, fileCount * 4) + Math.min(10, timeline.length * 2)))
}

function buildAnalysis(files, rows) {
  const errorGroups = group(rows, 'errorCode')
  const jobGroups = group(rows, 'jobName')
  const programGroups = group(rows, 'program')
  const primary = errorGroups[0]
  const timeline = buildTimeline(rows)
  const infra = buildInfraSummary(rows)
  const hostResources = buildHostResourceSummary(rows)
  const confidence = calculateConfidence(primary, rows, timeline, files)
  const analysis = { files, rows, errorGroups, jobGroups, programGroups, primary, timeline, infra, hostResources, confidence, createdAt: new Date().toISOString() }
  return { ...analysis, rcaExplanation: buildRcaExplanation(analysis) }
}

function normalizeAnalysis(analysis) {
  if (!analysis) return null
  const rows = Array.isArray(analysis.rows) ? analysis.rows : []
  if (!rows.length) return analysis
  const files = Array.isArray(analysis.files) ? analysis.files : []
  const errorGroups = group(rows, 'errorCode')
  const jobGroups = group(rows, 'jobName')
  const programGroups = group(rows, 'program')
  const primary = errorGroups[0] || analysis.primary
  const timeline = buildTimeline(rows)
  const infra = buildInfraSummary(rows)
  const hostResources = buildHostResourceSummary(rows)
  const confidence = calculateConfidence(primary, rows, timeline, files)
  const normalized = { ...analysis, files, rows, errorGroups, jobGroups, programGroups, primary, timeline, infra, hostResources, confidence }
  return { ...normalized, rcaExplanation: buildRcaExplanation(normalized) }
}

function buildReportText(analysis) {
  if (!analysis) return ''
  const normalized = normalizeAnalysis(analysis)
  const primary = normalized.primary
  return ['SAP Work Process Log Analysis', primary ? `Primary Error: ${primary.name}` : 'Primary Error: -', primary ? `Error Family: ${primary.family}` : 'Error Family: -', primary ? `Owner: ${primary.owner}` : 'Owner: -', `Bad WP: ${normalized.infra?.badWp || 0}`, `Rows: ${normalized.rows?.length || 0}`].join('\n')
}

function cleanActionText(text = '') { return safe(text).replace(/^(Focus [^:]+)\s+\1:?\s*/i, '$1: ') }
function AcceptedTypes() { return <div className="acceptedTypes">{ACCEPTED_TYPES.map((item) => <span key={item}>{item}</span>)}</div> }

function evidencePeriod(files = []) {
  const joined = files.map((file) => file.name || '').join(' ')
  const match = joined.match(/(\d{1,2}\.\d{1,2}\.\d{4})\s*-\s*(\d{1,2}\.\d{1,2}\.\d{4})/)
  if (match) return `${match[1]} - ${match[2]}`
  return 'Uploaded log period'
}

function evidencePackName(files = []) {
  const zip = files.find((file) => String(file.name || '').toLowerCase().endsWith('.zip'))
  if (zip?.name) return zip.name
  return files[0]?.name || 'No log evidence loaded'
}

function LogHeader({ busy, files, analysis, onFiles }) {
  const displayedFiles = files.length ? files : (analysis?.files || [])
  return <header className="rcaFinalHero logTechnicalHero"><div><span>Work Process Log Console</span><h1>Log Evidence Console</h1><p>Technical investigation view for WP-SCOUT, SM21, ST22, dev_w trace, background job log, CPU, RSS, swap, PID, program, and error evidence.</p></div><label className="rcaFinalUpload"><input type="file" multiple accept=".zip,.log,.txt,.csv" onChange={(event) => onFiles(event.target.files)} /><strong>{busy ? 'Parsing logs…' : 'Upload Log Evidence'}</strong><small>Log, text, CSV, or ZIP evidence</small><AcceptedTypes /></label><div className="st03nFilterBar logFilterBar"><label><span>System</span><select defaultValue="PRD"><option>PRD</option><option>AOQ</option><option>QAS</option></select></label><label><span>Time Window</span><input readOnly value={evidencePeriod(displayedFiles)} /></label><label><span>Evidence Pack</span><input readOnly value={evidencePackName(displayedFiles)} /></label><label><span>Files</span><input readOnly value={`${displayedFiles.length || 0}`} /></label></div></header>
}

function LogTabs({ activeTab, onChange }) {
  return <nav className="st03nTabs logTabs">{LOG_TABS.map((tab) => <button type="button" className={activeTab === tab ? 'active' : ''} key={tab} onClick={() => onChange(tab)}>{tab}</button>)}</nav>
}

function KpiStrip({ analysis, status }) {
  const normalized = normalizeAnalysis(analysis)
  const primary = normalized?.primary
  const infra = normalized?.infra || {}
  const kpis = [
    ['Primary Error', primary?.name || 'Pending', primary ? `${primary.hits} hits / ${primary.critHits} CRIT` : status, primary ? 'hot' : ''],
    ['Error Family', primary ? compactFamilyLabel(primary.family) : 'Unknown', primary?.meaning || 'Upload logs to classify error family', ''],
    ['Owner', primary?.owner || 'Pending', primary ? cleanActionText(buildOwnerAction(primary)) : 'Basis / ABAP / Integration routing', ''],
    ['Bad WP', fmt(infra.badWp || 0, 0), 'CRIT + WARN work process rows', ''],
    ['Peak CPU', `${fmt(infra.peakCpu || 0)}%`, `${infra.peakCpuProgram || '-'} · ${infra.peakCpuTime || '-'}`, ''],
    ['Max RSS / Swap', `${fmt(infra.maxRssGb || 0)} GB / ${fmt(infra.swapGb || 0)} GB`, 'RSS and detected swap', ''],
  ]
  return <section className="st03nKpiGrid logKpiGrid">{kpis.map(([label, value, hint, tone]) => <div className={`st03nKpi logKpi ${tone || ''}`} key={label}><span>{label}</span><b>{value}</b><small>{hint}</small></div>)}</section>
}

function BarChart({ title, subtitle, rows = [], valueKey = 'hits', labelKey = 'name', tone = 'crit', limit = 8 }) {
  const data = rows.slice(0, limit)
  const maxValue = Math.max(1, ...data.map((row) => Number(row[valueKey]) || 0))
  return <section className="rcaFinalCard rcaFinalChartCard"><div className="rcaFinalPanelTitle"><h2>{title}</h2><span>{subtitle}</span></div>{data.length ? <div className="rcaLiteBars logBars">{data.map((row) => <div className="rcaLiteBarRow" key={`${title}-${row[labelKey]}`}><div className="rcaLiteBarLabel" title={row[labelKey]}>{displayLabel(row[labelKey], 26)}</div><div className="rcaLiteBarTrack"><span className={tone} style={{ width: `${Math.max(2, ((Number(row[valueKey]) || 0) / maxValue) * 100)}%` }} /></div><div className="rcaLiteBarValue">{fmt(Number(row[valueKey]) || 0, valueKey === 'hits' ? 0 : 1)}</div></div>)}</div> : <p>No data available.</p>}</section>
}

function TrendChart({ title, data = [], metric = 'hits', tone = 'hit' }) {
  const items = data.slice(-18)
  const maxValue = Math.max(1, ...items.map((item) => item[metric] || 0))
  return <section className="rcaFinalCard rcaFinalChartCard"><div className="rcaFinalPanelTitle"><h2>{title}</h2><span>Time window</span></div>{items.length ? <div className="rcaLiteTrend">{items.map((item) => <div className="rcaTrendPoint" key={`${title}-${item.time}`}><span className={tone} style={{ height: `${Math.max(4, ((item[metric] || 0) / maxValue) * 120)}px` }} title={`${item.time} ${metric} ${item[metric]}`} /><small>{item.time}</small></div>)}</div> : <p>No timeline data.</p>}</section>
}

function DataTable({ title, subtitle, rows = [], columns = [] }) {
  return <section className="rcaFinalCard rcaFinalTableCard logDataTable"><div className="rcaFinalPanelTitle"><h2>{title}</h2><span>{subtitle}</span></div><div className="rcaFinalTableWrap"><table><thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${title}-${index}-${row.name || row.pid || row.program}`}>{columns.map((column) => <td key={column.key}>{column.render ? column.render(row, index) : row[column.key]}</td>)}</tr>)}</tbody></table></div></section>
}

function ErrorRankingTable({ rows = [] }) {
  return <DataTable title="Error Ranking" subtitle="Classified SAP errors" rows={rows.slice(0, 12)} columns={[{ key: 'rank', label: '#', render: (_row, index) => index + 1 }, { key: 'name', label: 'Error Code', render: (row) => <b>{displayLabel(row.name, 34)}</b> }, { key: 'family', label: 'Family', render: (row) => compactFamilyLabel(row.family) }, { key: 'owner', label: 'Owner' }, { key: 'hits', label: 'Hits' }, { key: 'critHits', label: 'CRIT' }, { key: 'context', label: 'Program / Job', render: (row) => [...(row.programs || []), ...(row.jobs || [])].slice(0, 2).join(' · ') || '-' }]} />
}

function TopResourceTable({ rows = [] }) {
  const data = [...rows].sort((a, b) => (b.cpu || 0) - (a.cpu || 0) || (b.rssGb || 0) - (a.rssGb || 0)).slice(0, 14)
  return <DataTable title="Top Resource Consumer" subtitle="CPU / RSS / Swap by work process" rows={data} columns={[{ key: 'rank', label: '#', render: (_row, index) => index + 1 }, { key: 'host', label: 'APP Server', render: (row) => displayLabel(row.host, 18) }, { key: 'pid', label: 'PID' }, { key: 'wp', label: 'WP' }, { key: 'type', label: 'Type' }, { key: 'cpu', label: 'CPU %', render: (row) => fmt(row.cpu) }, { key: 'rssGb', label: 'RSS GB', render: (row) => fmt(row.rssGb) }, { key: 'swapGb', label: 'Swap GB', render: (row) => fmt(row.swapGb) }, { key: 'program', label: 'Program', render: (row) => displayLabel(row.program, 32) }, { key: 'jobName', label: 'Job', render: (row) => displayLabel(row.jobName, 24) }, { key: 'errorCode', label: 'Error', render: (row) => displayLabel(row.errorCode, 24) }]} />
}

function LongRunningTable({ rows = [] }) {
  const data = [...rows].sort((a, b) => (b.durationSec || 0) - (a.durationSec || 0) || (b.cpu || 0) - (a.cpu || 0)).slice(0, 12)
  return <DataTable title="Long Running Work Process / Jobs" subtitle="Runtime context" rows={data} columns={[{ key: 'timeLabel', label: 'Time' }, { key: 'host', label: 'APP Server', render: (row) => displayLabel(row.host, 18) }, { key: 'pid', label: 'PID' }, { key: 'wp', label: 'WP' }, { key: 'type', label: 'Type' }, { key: 'durationSec', label: 'Duration', render: (row) => `${fmt(row.durationSec, 0)} s` }, { key: 'cpu', label: 'CPU %', render: (row) => fmt(row.cpu) }, { key: 'program', label: 'Program', render: (row) => displayLabel(row.program, 38) }, { key: 'jobName', label: 'Job', render: (row) => displayLabel(row.jobName, 28) }, { key: 'className', label: 'Status' }]} />
}

function JobProgramMapping({ analysis }) {
  const jobs = (analysis?.jobGroups || []).filter((row) => row.name !== '?').slice(0, 12)
  return <DataTable title="Job / Program Mapping" subtitle="Extracted from log context" rows={jobs} columns={[{ key: 'rank', label: '#', render: (_row, index) => index + 1 }, { key: 'name', label: 'Job Name', render: (row) => <b>{displayLabel(row.name, 34)}</b> }, { key: 'programs', label: 'Program', render: (row) => row.programs?.join(' · ') || '-' }, { key: 'hosts', label: 'APP Server', render: (row) => row.hosts?.join(' · ') || '-' }, { key: 'times', label: 'Seen At', render: (row) => row.times?.join(', ') || '-' }, { key: 'hits', label: 'Hits' }, { key: 'maxCpu', label: 'Max CPU', render: (row) => fmt(row.maxCpu) }, { key: 'maxRssGb', label: 'Max RSS', render: (row) => `${fmt(row.maxRssGb)} GB` }]} />
}

function WorkProcessByType({ rows = [] }) {
  const groups = group(rows, 'type').filter((row) => row.name !== '?')
  return <DataTable title="Work Process by Type" subtitle="DIA / BTC / UPD / ENQ context" rows={groups} columns={[{ key: 'name', label: 'WP Type' }, { key: 'hits', label: 'Rows' }, { key: 'critHits', label: 'CRIT' }, { key: 'warnHits', label: 'WARN' }, { key: 'maxCpu', label: 'Max CPU', render: (row) => fmt(row.maxCpu) }, { key: 'maxRssGb', label: 'Max RSS', render: (row) => `${fmt(row.maxRssGb)} GB` }, { key: 'programs', label: 'Programs', render: (row) => row.programs?.slice(0, 2).join(' · ') || '-' }]} />
}

function HostResourceCards({ hosts = [] }) {
  if (!hosts.length) return <section className="rcaFinalCard"><div className="rcaFinalPanelTitle"><h2>APP Server Resource Summary</h2><span>No host-level rows parsed</span></div><p>No APP server resource data available. Clear cache and re-upload WP-SCOUT evidence if the previous upload was parsed before resource extraction.</p></section>
  return <section className="logHostGrid">{hosts.slice(0, 5).map((host) => <article className="rcaFinalCard logHostCard" key={host.name}><div className="logHostTitle"><span>APP Server</span><b>{displayLabel(host.name, 22)}</b></div><div className="logHostMetrics"><div><span>Peak CPU</span><b>{fmt(host.peakCpu)}%</b></div><div><span>Max RSS</span><b>{fmt(host.maxRssGb)} GB</b></div><div><span>Swap</span><b>{fmt(host.maxSwapGb)} GB</b></div><div><span>Bad WP</span><b>{fmt(host.badWp, 0)}</b></div></div><div className="logHostContext"><span>PID/WP</span><b>{host.topPid} / {host.topWp}</b><span>Program</span><b title={host.topProgram}>{displayLabel(host.topProgram, 34)}</b><span>Job</span><b title={host.topJob}>{displayLabel(host.topJob, 34)}</b><span>Error</span><b title={host.topError}>{displayLabel(host.topError, 34)}</b></div></article>)}</section>
}

function HostResourceTable({ hosts = [] }) {
  return <DataTable title="APP Server Resource Matrix" subtitle="CPU / RSS / swap / PID / job / ABAP program by host" rows={hosts} columns={[{ key: 'name', label: 'APP Server', render: (row) => <b>{displayLabel(row.name, 18)}</b> }, { key: 'rows', label: 'Rows' }, { key: 'badWp', label: 'Bad WP' }, { key: 'peakCpu', label: 'Peak CPU', render: (row) => `${fmt(row.peakCpu)}%` }, { key: 'maxRssGb', label: 'Max RSS', render: (row) => `${fmt(row.maxRssGb)} GB` }, { key: 'maxSwapGb', label: 'Swap', render: (row) => `${fmt(row.maxSwapGb)} GB` }, { key: 'topPid', label: 'PID' }, { key: 'topWp', label: 'WP' }, { key: 'wpTypes', label: 'Types', render: (row) => row.wpTypes?.join(' · ') || '-' }, { key: 'topProgram', label: 'Program', render: (row) => displayLabel(row.topProgram, 34) }, { key: 'topJob', label: 'Job', render: (row) => displayLabel(row.topJob, 28) }, { key: 'topError', label: 'Error', render: (row) => displayLabel(row.topError, 24) }]} />
}

function RcaExplanationCard({ explanation }) {
  if (!explanation) return null
  return <section className="rcaFinalCard logRcaExplanation"><div className="rcaFinalPanelTitle"><h2>RCA Explanation</h2><span>Evidence-based narrative</span></div><div className="logRcaGrid"><div><span>Symptom</span><p>{explanation.symptom}</p></div><div><span>Suspect Process</span><p>{explanation.suspect}</p></div><div><span>Error Mapping</span><p>{explanation.error}</p></div><div><span>Recommended Action</span><p>{explanation.action}</p></div></div></section>
}

function LogTabContent({ activeTab, analysis }) {
  const rows = analysis?.rows || []
  const hostResources = analysis?.hostResources || buildHostResourceSummary(rows)
  if (activeTab === 'Error Analysis') return <><ErrorRankingTable rows={analysis.errorGroups || []} /><TrendChart title="Error Hits Over Time" data={analysis.timeline || []} metric="hits" tone="hit" /><BarChart title="Error Code Distribution" subtitle="Hits" rows={analysis.errorGroups || []} valueKey="hits" tone="crit" /></>
  if (activeTab === 'Work Process') return <><LongRunningTable rows={rows} /><WorkProcessByType rows={rows} /></>
  if (activeTab === 'Job Analysis') return <><JobProgramMapping analysis={analysis} /><BarChart title="Program Frequency" subtitle="Hits by program" rows={analysis.programGroups || []} valueKey="hits" tone="db" /></>
  if (activeTab === 'System Resources') return <><HostResourceCards hosts={hostResources} /><div className="st03nTwoCol"><BarChart title="CPU by APP Server" subtitle="Peak CPU %" rows={hostResources} valueKey="peakCpu" tone="hit" /><BarChart title="RSS by APP Server" subtitle="Max RSS GB" rows={hostResources} valueKey="maxRssGb" tone="crit" /></div><HostResourceTable hosts={hostResources} /><TopResourceTable rows={rows} /><RcaExplanationCard explanation={analysis.rcaExplanation || buildRcaExplanation(analysis)} /></>
  return <><div className="st03nTwoCol wideLeft"><BarChart title="Top Error Code" subtitle="Hits / CRIT" rows={analysis.errorGroups || []} valueKey="hits" tone="crit" /><TrendChart title="Error Hits Over Time" data={analysis.timeline || []} metric="hits" tone="hit" /></div><TopResourceTable rows={rows} /></>
}

export default function LogPage() {
  const [files, setFiles] = React.useState([])
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('Upload WP-SCOUT/SM21/ST22/dev_w/job logs or ZIP to validate error evidence.')
  const [analysis, setAnalysis] = React.useState(() => loadJson(CACHE_KEY, null))
  const [activeTab, setActiveTab] = React.useState('Overview')
  const normalizedAnalysis = React.useMemo(() => normalizeAnalysis(analysis), [analysis])

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
      const result = buildAnalysis(nextFiles.map((file) => ({ name: file.name, size: file.size })), rows)
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
      setActiveTab('Overview')
      await analyze(expanded)
    } catch (error) {
      setStatus(error?.message || 'Failed to read upload.')
    } finally {
      setBusy(false)
    }
  }

  const displayedFiles = files.length ? files : (normalizedAnalysis?.files || [])
  return <section className="rcaFinalShell logEvidenceShell logTechnicalPage"><LogHeader busy={busy} files={files} analysis={normalizedAnalysis} onFiles={onFiles} /><LogTabs activeTab={activeTab} onChange={setActiveTab} /><KpiStrip analysis={normalizedAnalysis} status={status} />{normalizedAnalysis ? <><LogTabContent activeTab={activeTab} analysis={normalizedAnalysis} /><div className="rcaFinalFooterGrid logFooterCompact"><UploadedFilesPanel files={displayedFiles} /><section className="rcaFinalCard"><div className="rcaFinalPanelTitle"><h2>Parsed Context</h2><span>Evidence source</span></div><div className="rcaFinalMiniFacts"><div><span>Rows</span><b>{fmt(normalizedAnalysis.rows?.length || 0, 0)}</b></div><div><span>Files</span><b>{fmt(displayedFiles.length || 0, 0)}</b></div><div><span>Created</span><b>{normalizedAnalysis.createdAt ? new Date(normalizedAnalysis.createdAt).toLocaleString() : '-'}</b></div></div></section></div></> : <EmptyState title="Upload log evidence"><p>{status} Upload WP-SCOUT logs, SM21/ST22 text, dev_w trace, job log text, CSV, or a ZIP containing logs. This dashboard uses uploaded evidence and cached analysis only.</p></EmptyState>}</section>
}
