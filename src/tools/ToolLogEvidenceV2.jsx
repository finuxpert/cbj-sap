import React from 'react'
import ReactECharts from 'echarts-for-react'
import {
  buildOwnerAction,
  classifySapError,
  expandZipAwareFiles,
  fileExt,
  fmt,
  latestRcaSession,
  loadJson,
  safe,
  saveJson,
} from './evidence-utils.js'
import {
  DecisionCard,
  EmptyState,
  EvidenceServerPanel,
  EvidenceToolbar,
  SessionBanner,
  UploadedFilesPanel,
} from './EvidenceDecisionKit.jsx'
import './ToolEvidenceSpecialist.css'

const CACHE_KEY = 'sap_log_evidence_v2_cache'
const ACCEPTED_TYPES = ['.log', '.txt', '.csv', '.zip']
const LOG_COLORS = {
  CRIT: '#ef4444',
  WARN: '#f59e0b',
  OK: '#22c55e',
  BASIS: '#38bdf8',
  ABAP: '#a78bfa',
  DB: '#14b8a6',
  UNKNOWN: '#94a3b8',
}
const GRAPH_COLORS = [LOG_COLORS.BASIS, LOG_COLORS.DB, LOG_COLORS.OK, LOG_COLORS.WARN, LOG_COLORS.ABAP, LOG_COLORS.CRIT]
const KNOWN_ERRORS = [
  'CONVT_OVERFLOW',
  'CONVT_NO_NUMBER',
  'DBSQL_DUPLICATE_KEY_ER',
  'DBSQL_SQL_DEADLOCK_DET',
  'ITAB_DUPLICATE_KEY',
  'LOAD_PROGRAM_TABLE_MIS',
  'SYSTEM_ABAP_ACCESS_DEN',
  'GETWA_NOT_ASSIGNED',
  'UNCAUGHT_EXCEPTION',
  'SYNTAX_ERROR',
  'CALL_FUNCTION_SEND_ERR',
  'TIME_OUT',
  'IMPORT_WRONG_END_POS',
]

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

  const physicalMemGb = pickGb([
    /(?:physical\s+memory|phys(?:ical)?\s+mem(?:ory)?|mem(?:ory)?\s+total|total\s+memory|MemTotal)\s*[:=]\s*([\d.]+)\s*(TB|GB|G|MB|M|KB|K)?/i,
    /(?:RAM|Memory)\s*[:=]\s*([\d.]+)\s*(TB|GB|G|MB|M|KB|K)/i,
    /Mem:\s+([\d.]+)\s*(TB|GB|G|MB|M|KB|K)?/i
  ])

  const swapGb = pickGb([
    /(?:swap\s+total|total\s+swap|SwapTotal|swap)\s*[:=]\s*([\d.]+)\s*(TB|GB|G|MB|M|KB|K)?/i,
    /Swap:\s+([\d.]+)\s*(TB|GB|G|MB|M|KB|K)?/i
  ])

  return { physicalMemGb, swapGb }
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
    rows.push({
      fileName,
      snapshot,
      timeLabel,
      host,
      pid: m[1],
      wp: m[3],
      type: m[4],
      cpu: Number(m[5]) || 0,
      rssGb: Number(m[7]) || 0,
      physicalMemGb: mem.physicalMemGb,
      swapGb: mem.swapGb,
      state: m[8],
      className: m[14],
      program,
      errorCode,
      jobName,
      lineNo: 0,
      source: 'WP-SCOUT',
    })
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
    rows.push({
      fileName,
      timeLabel: hhmm,
      host: 'UNKNOWN',
      pid: '',
      wp: '',
      type: '',
      cpu: 0,
      rssGb: 0,
      physicalMemGb: mem.physicalMemGb,
      swapGb: mem.swapGb,
      state: '',
      className: severity,
      program: safe(line).slice(0, 140),
      errorCode,
      jobName: '?',
      lineNo: idx + 1,
      source: 'generic-log',
    })
  })
  return rows
}

function displayLabel(value = '', max = 28) {
  const label = safe(value)
  const normalized = !label || label === '?' || label.toUpperCase() === 'UNKNOWN' ? 'Unknown' : label
  return normalized.length > max ? `${normalized.slice(0, Math.max(8, max - 1))}...` : normalized
}

function compactFamilyLabel(family = '') {
  return safe(family)
    .replace('SAP runtime/log pattern', 'Runtime Pattern')
    .replace('RFC / communication function error', 'RFC / Communication')
    .replace('ABAP program load/runtime issue', 'ABAP Runtime')
    .replace('Database/application data consistency issue', 'Data Consistency') || 'Unknown'
}


function getSeverityColor(name = '') {
  const label = safe(name).toUpperCase()
  if (label.includes('CRIT') || label.includes('ERROR') || label.includes('TIME_OUT') || label.includes('TIMEOUT')) return LOG_COLORS.CRIT
  if (label.includes('WARN')) return LOG_COLORS.WARN
  if (label.includes('OK')) return LOG_COLORS.OK
  return LOG_COLORS.UNKNOWN
}

function getOwnerColor(name = '') {
  const label = safe(name).toUpperCase()
  if (label.includes('ABAP') || label.includes('DEVELOPER')) return LOG_COLORS.ABAP
  if (label.includes('BASIS') || label.includes('INFRA')) return LOG_COLORS.BASIS
  if (label.includes('DB') || label.includes('DATABASE') || label.includes('SQL')) return LOG_COLORS.DB
  return LOG_COLORS.UNKNOWN
}

function getFamilyColor(name = '') {
  const label = safe(name).toUpperCase()
  if (label.includes('TIME') || label.includes('DEADLOCK') || label.includes('ACCESS_DEN')) return LOG_COLORS.CRIT
  if (label.includes('DATA') || label.includes('SQL') || label.includes('DB')) return LOG_COLORS.DB
  if (label.includes('ABAP') || label.includes('RUNTIME') || label.includes('CONVERSION') || label.includes('PROGRAM')) return LOG_COLORS.ABAP
  if (label.includes('RFC') || label.includes('COMMUNICATION')) return LOG_COLORS.BASIS
  return LOG_COLORS.UNKNOWN
}

function getCpuColor(value = 0) {
  const cpu = Number(value || 0)
  if (cpu >= 30) return LOG_COLORS.CRIT
  if (cpu >= 15) return LOG_COLORS.WARN
  return LOG_COLORS.BASIS
}

function getLogColor(row = {}, title = '') {
  const chart = String(title || '').toLowerCase()
  if (chart.includes('severity')) return getSeverityColor(row.name)
  if (chart.includes('owner')) return getOwnerColor(row.name)
  if (chart.includes('family')) return getFamilyColor(row.name)
  if (chart.includes('cpu')) return getCpuColor(row.hits)
  if (row.crit > 0 || row.critHits > 0) return LOG_COLORS.CRIT
  return getFamilyColor(row.family || row.name) !== LOG_COLORS.UNKNOWN ? getFamilyColor(row.family || row.name) : LOG_COLORS.BASIS
}

function group(rows, key) {
  const map = new Map()
  rows.forEach((row) => {
    const name = safe(row[key]) || '?'
    const family = classifySapError(key === 'errorCode' ? name : row.errorCode)
    const current = map.get(name) || {
      name,
      hits: 0,
      critHits: 0,
      warnHits: 0,
      maxCpu: 0,
      examples: new Set(),
      jobs: new Set(),
      programs: new Set(),
      times: new Set(),
      files: new Set(),
      sources: new Set(),
      family: family.family,
      owner: family.owner,
      meaning: family.meaning,
    }
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
  return Array.from(map.values())
    .map((item) => ({
      ...item,
      examples: Array.from(item.examples).slice(0, 3),
      jobs: Array.from(item.jobs).filter((value) => value !== '?').slice(0, 5),
      programs: Array.from(item.programs).filter((value) => value !== '?').slice(0, 5),
      times: Array.from(item.times).slice(0, 10),
      files: Array.from(item.files).slice(0, 5),
      sources: Array.from(item.sources).slice(0, 5),
    }))
    .sort((a, b) => b.critHits - a.critHits || b.hits - a.hits)
}

function buildTimeline(rows = []) {
  const timelineMap = new Map()
  rows.forEach((row) => {
    if (!row.timeLabel) return
    const current = timelineMap.get(row.timeLabel) || { time: row.timeLabel, hits: 0, crit: 0, warn: 0 }
    current.hits += 1
    current.crit += row.className === 'CRIT' ? 1 : 0
    current.warn += row.className === 'WARN' ? 1 : 0
    timelineMap.set(row.timeLabel, current)
  })
  return Array.from(timelineMap.values()).sort((a, b) => String(a.time).localeCompare(String(b.time)))
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
  const repeatedSignal = primary?.hits > 1 ? 16 : 0
  const criticalSignal = Math.min(36, (primary?.critHits || 0) * 9)
  const volumeSignal = Math.min(24, rows.length * 2)
  const coverageSignal = Math.min(14, fileCount * 4 + sourceCount * 3)
  const timelineSignal = Math.min(10, timeline.length * 2)
  const confidence = primary ? Math.min(100, Math.round(criticalSignal + repeatedSignal + volumeSignal + coverageSignal + timelineSignal)) : 0
  const verdict = primary ? 'Detected' : 'Not confirmed'
  const nextAction = primary ? buildOwnerAction(primary) : 'Upload WP-SCOUT, SM21, ST22, dev_w, or job logs containing SAP error patterns.'
  const summary = primary
    ? `${primary.name} is strongest: ${primary.hits} hit(s), ${primary.critHits} CRIT, owner ${primary.owner}.`
    : 'No known SAP error patterns detected from uploaded logs.'
  return { files, rows, errorGroups, jobGroups, programGroups, primary, timeline, confidence, confidenceText: confidenceLabel(confidence, rows, primary), verdict, nextAction, summary, evidenceServer, createdAt: new Date().toISOString() }
}

function cleanActionText(text = '') {
  return safe(text).replace(/^(Focus [^:]+)\s+\1:?\s*/i, '$1: ')
}

function ownerHint(primary, analysis) {
  if (!primary) return 'Based only on uploaded evidence pattern.'
  const target = primary.jobs?.[0] || primary.programs?.[0] || primary.examples?.[0] || primary.name
  const firstTime = primary.times?.[0] || 'peak time'
  return `Review ${target} around ${firstTime}. ${analysis?.rows?.length || 0} parsed rows.`
}

function aggregateGroups(groups = [], key, labelFn = (value) => value) {
  const map = new Map()
  groups.forEach((item) => {
    const rawName = safe(item[key]) || 'Unknown'
    const name = labelFn(rawName)
    const current = map.get(name) || { name, hits: 0, crit: 0 }
    current.hits += item.hits || 0
    current.crit += item.critHits || 0
    map.set(name, current)
  })
  return Array.from(map.values()).sort((a, b) => b.crit - a.crit || b.hits - a.hits).slice(0, 6)
}

function buildInfraTimeline(rows = []) {
  const map = new Map()
  rows.forEach((row) => {
    const time = row.timeLabel || 'unknown'
    const current = map.get(time) || { time, samples: 0, cpuTotal: 0, avgCpu: 0, maxCpu: 0, maxRssGb: 0, physicalMemGb: 0, swapGb: 0, crit: 0, warn: 0 }
    current.samples += 1
    current.cpuTotal += Number(row.cpu) || 0
    current.maxCpu = Math.max(current.maxCpu, Number(row.cpu) || 0)
    current.maxRssGb = Math.max(current.maxRssGb, Number(row.rssGb) || 0)
    current.physicalMemGb = Math.max(current.physicalMemGb, Number(row.physicalMemGb) || 0)
    current.swapGb = Math.max(current.swapGb, Number(row.swapGb) || 0)
    current.crit += row.className === 'CRIT' ? 1 : 0
    current.warn += row.className === 'WARN' ? 1 : 0
    current.avgCpu = Number((current.cpuTotal / current.samples).toFixed(2))
    map.set(time, current)
  })
  return Array.from(map.values()).sort((a, b) => String(a.time).localeCompare(String(b.time)))
}

function buildSeverityMix(rows = []) {
  const counts = { CRIT: 0, WARN: 0, OK: 0 }
  rows.forEach((row) => { counts[row.className] = (counts[row.className] || 0) + 1 })
  return [{ name: 'CRIT', hits: counts.CRIT, crit: counts.CRIT }, { name: 'WARN', hits: counts.WARN, crit: 0 }, { name: 'OK', hits: counts.OK, crit: 0 }].filter((item) => item.hits > 0)
}

function buildHostMix(rows = []) {
  const map = new Map()
  rows.forEach((row) => {
    const name = displayLabel(row.host || 'Unknown', 24)
    const current = map.get(name) || { name, hits: 0, crit: 0 }
    current.hits += 1
    current.crit += row.className === 'CRIT' ? 1 : 0
    map.set(name, current)
  })
  return Array.from(map.values()).sort((a, b) => b.crit - a.crit || b.hits - a.hits).slice(0, 6)
}

function buildSimpleRowChart(rows = [], key, labelFn = (value) => displayLabel(value)) {
  const map = new Map()
  rows.forEach((row) => {
    const name = labelFn(row[key])
    const current = map.get(name) || { name, hits: 0, crit: 0 }
    current.hits += 1
    current.crit += row.className === 'CRIT' ? 1 : 0
    map.set(name, current)
  })
  return Array.from(map.values()).sort((a, b) => b.crit - a.crit || b.hits - a.hits).slice(0, 6)
}

function wpStateLabel(value = '') {
  const state = safe(value)
  if (state === 'R') return 'R - Running'
  if (state === 'S') return 'S - Wait/Stopped'
  return displayLabel(state || 'Unknown', 20)
}

function buildProgramCpuPressure(groups = []) {
  return groups.slice(0, 6).map((item) => ({ name: displayLabel(item.name, 24), hits: item.maxCpu || 0, crit: item.critHits || 0 }))
}

function buildInfraSummary(rows = []) {
  const peakCpuRow = rows.reduce((best, row) => ((row.cpu || 0) > (best?.cpu || 0) ? row : best), null)
  const maxRssRow = rows.reduce((best, row) => ((row.rssGb || 0) > (best?.rssGb || 0) ? row : best), null)
  const physicalMemGb = Math.max(0, ...rows.map((row) => Number(row.physicalMemGb) || 0))
  const swapGb = Math.max(0, ...rows.map((row) => Number(row.swapGb) || 0))
  const hostChart = buildHostMix(rows)
  const critCount = rows.filter((row) => row.className === 'CRIT').length
  return { peakCpu: peakCpuRow?.cpu || 0, peakCpuTime: peakCpuRow?.timeLabel || '-', peakCpuProgram: displayLabel(peakCpuRow?.program || '-', 34), maxRssGb: maxRssRow?.rssGb || 0, maxRssTime: maxRssRow?.timeLabel || '-', physicalMemGb, swapGb, impactedHost: hostChart[0]?.name || 'Unknown', hostHits: hostChart[0]?.hits || 0, critCount }
}

function AcceptedTypes({ items }) {
  return <div className="acceptedTypes">{items.map((item) => <span key={item}>{item}</span>)}</div>
}

function ToolHero({ busy, onFiles }) {
  return (
    <header className="evidenceHero compactEvidenceHero finalHero">
      <div className="heroCopyBlock">
        <span>Log Evidence Console</span>
        <h1>Error pattern drilldown.</h1>
        <p>Classify SAP log signals from WP-SCOUT, SM21, ST22, dev_w, and job logs without changing the parser rules.</p>
      </div>
      <label className="evidenceUpload finalUpload">
        <input type="file" multiple accept=".zip,.log,.txt,.csv" onChange={(event) => onFiles(event.target.files)} />
        <strong>{busy ? 'Parsing...' : 'Upload Log Evidence'}</strong>
        <small>Accepted files</small>
        <AcceptedTypes items={ACCEPTED_TYPES} />
      </label>
    </header>
  )
}

function chartBase(extra = {}) {
  return {
    backgroundColor: 'transparent',
    color: GRAPH_COLORS,
    textStyle: { color: 'rgba(226,232,240,.82)' },
    tooltip: { trigger: 'axis', backgroundColor: 'rgba(15,23,42,.96)', borderColor: 'rgba(148,163,184,.22)', textStyle: { color: '#e5e7eb', fontSize: 12 }, extraCssText: 'box-shadow:0 16px 40px rgba(0,0,0,.32);border-radius:12px;' },
    grid: { left: 120, right: 24, top: 18, bottom: 24, containLabel: true },
    ...extra,
  }
}

function MetricPanel({ title, tag, rows = [], metric = 'hits', secondMetric = 'crit', unit = '', maxRows = 6 }) {
  const data = rows.slice(0, maxRows).reverse()
  const option = chartBase({
    tooltip: { ...chartBase().tooltip, formatter: (items) => {
      const item = Array.isArray(items) ? items[0] : items
      const row = item?.data?.row || {}
      return [`<b>${row.name || item?.name}</b>`, `${metric}: <b>${fmt(row[metric] || 0, 0)}${unit}</b>`, secondMetric ? `CRIT: <b>${fmt(row[secondMetric] || 0, 0)}</b>` : ''].filter(Boolean).join('<br/>')
    } },
    xAxis: { type: 'value', splitLine: { lineStyle: { color: 'rgba(148,163,184,.12)', type: 'dashed' } }, axisLabel: { color: 'rgba(203,213,225,.68)', fontSize: 10 } },
    yAxis: { type: 'category', data: data.map((row) => displayLabel(row.name, 20)), axisLabel: { color: 'rgba(226,232,240,.82)', fontSize: 10, fontWeight: 800 }, axisTick: { show: false }, axisLine: { show: false } },
    series: [{ type: 'bar', data: data.map((row) => ({ value: Number(row[metric] || 0), row, itemStyle: { color: getLogColor(row, title), borderRadius: [0, 8, 8, 0] } })), barWidth: 12, label: { show: true, position: 'right', color: 'rgba(226,232,240,.82)', fontSize: 10, formatter: ({ data: item }) => `${fmt(item.row?.[metric] || 0, 0)}${unit}${secondMetric ? ` / C${fmt(item.row?.[secondMetric] || 0, 0)}` : ''}` } }],
  })
  return <section className="evidencePanel logMetricPanel"><div className="panelTitleRow"><h2>{title}</h2><span>{tag}</span></div>{data.length ? <ReactECharts option={option} style={{ height: 230, width: '100%' }} notMerge lazyUpdate /> : <p>No chart data.</p>}</section>
}

function TimelinePanel({ data = [] }) {
  const items = data.slice(-14)
  const option = chartBase({
    tooltip: { ...chartBase().tooltip, trigger: 'axis' },
    grid: { left: 44, right: 18, top: 22, bottom: 38, containLabel: true },
    legend: { bottom: 0, textStyle: { color: 'rgba(226,232,240,.78)', fontSize: 10 } },
    xAxis: { type: 'category', data: items.map((item) => item.time), axisLabel: { color: 'rgba(203,213,225,.68)', fontSize: 10 }, axisLine: { lineStyle: { color: 'rgba(148,163,184,.24)' } } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: 'rgba(148,163,184,.12)', type: 'dashed' } }, axisLabel: { color: 'rgba(203,213,225,.68)', fontSize: 10 } },
    series: [
      { name: 'Hits', type: 'line', smooth: true, symbolSize: 5, data: items.map((item) => item.hits), areaStyle: { opacity: 0.12 }, itemStyle: { color: LOG_COLORS.BASIS }, lineStyle: { color: LOG_COLORS.BASIS } },
      { name: 'CRIT', type: 'line', smooth: true, symbolSize: 5, data: items.map((item) => item.crit), itemStyle: { color: LOG_COLORS.CRIT }, lineStyle: { color: LOG_COLORS.CRIT } },
    ],
  })
  return <section className="evidencePanel logMetricPanel"><div className="panelTitleRow"><h2>Error Timeline</h2><span>By time window</span></div>{items.length ? <ReactECharts option={option} style={{ height: 250, width: '100%' }} notMerge lazyUpdate /> : <p>No timeline data.</p>}</section>
}

function InfraTrendPanel({ data = [] }) {
  const items = data.slice(-14)
  const option = chartBase({
    tooltip: { ...chartBase().tooltip, trigger: 'axis' },
    grid: { left: 48, right: 18, top: 22, bottom: 38, containLabel: true },
    legend: { bottom: 0, textStyle: { color: 'rgba(226,232,240,.78)', fontSize: 10 } },
    xAxis: { type: 'category', data: items.map((item) => item.time), axisLabel: { color: 'rgba(203,213,225,.68)', fontSize: 10 } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: 'rgba(148,163,184,.12)', type: 'dashed' } }, axisLabel: { color: 'rgba(203,213,225,.68)', fontSize: 10 } },
    series: [
      { name: 'Avg CPU', type: 'line', smooth: true, data: items.map((item) => item.avgCpu), itemStyle: { color: LOG_COLORS.BASIS }, lineStyle: { color: LOG_COLORS.BASIS } },
      { name: 'Max CPU', type: 'line', smooth: true, data: items.map((item) => item.maxCpu), itemStyle: { color: LOG_COLORS.CRIT }, lineStyle: { color: LOG_COLORS.CRIT } },
      { name: 'RSS GB', type: 'bar', data: items.map((item) => ({ value: item.maxRssGb, itemStyle: { color: item.maxRssGb >= 5 ? LOG_COLORS.WARN : LOG_COLORS.DB } })), barWidth: 10 },
      { name: 'Physical GB', type: 'line', smooth: true, data: items.map((item) => item.physicalMemGb || 0), itemStyle: { color: LOG_COLORS.OK }, lineStyle: { color: LOG_COLORS.OK, type: 'dashed' } },
      { name: 'Swap GB', type: 'line', smooth: true, data: items.map((item) => item.swapGb || 0), itemStyle: { color: LOG_COLORS.ABAP }, lineStyle: { color: LOG_COLORS.ABAP, type: 'dashed' } },
    ],
  })
  return <section className="evidencePanel logMetricPanel"><div className="panelTitleRow"><h2>CPU and Memory Timeline</h2><span>Avg / max pressure</span></div>{items.length ? <ReactECharts option={option} style={{ height: 250, width: '100%' }} notMerge lazyUpdate /> : <p>No infra trend data.</p>}</section>
}

function Group({ title, rows = [] }) {
  return <section className="evidencePanel"><div className="panelTitleRow"><h2>{title}</h2><span>Top 5</span></div><div className="evidenceList compact finalEvidenceList">{rows.slice(0, 5).map((item) => <div key={item.name}><b>{displayLabel(item.name, 40)}</b><span>hits {item.hits} - CRIT {item.critHits}</span><small>{compactFamilyLabel(item.family || '')} {item.examples?.join(' - ')}</small></div>)}</div></section>
}

function PrimaryExplanation({ primary, status }) {
  return <section className="evidencePanel interpretationPanel"><div className="panelTitleRow"><h2>Primary Error Explanation</h2><span>Classified signal</span></div>{primary ? <><p><b>{primary.name}</b> points to <b>{compactFamilyLabel(primary.family)}</b>.</p><p>{primary.meaning}</p><div className="confidenceRows finalMetricRows"><span>Hits<b>{primary.hits}</b></span><span>CRIT<b>{primary.critHits}</b></span><span>Files<b>{primary.files?.length || 0}</b></span></div></> : <p>{status}</p>}</section>
}

function MappingPanel({ primary }) {
  return <section className="evidencePanel"><div className="panelTitleRow"><h2>Error to Job / Program Mapping</h2><span>Extracted context</span></div>{primary ? <div className="evidenceList compact finalEvidenceList"><div><b>Jobs</b><span>{primary.jobs?.join(' - ') || 'No job extracted'}</span></div><div><b>Programs</b><span>{primary.programs?.join(' - ') || 'No program extracted'}</span></div><div><b>Seen at</b><span>{primary.times?.join(', ') || 'No timestamp extracted'}</span></div></div> : <p>Upload logs to map errors to jobs and programs.</p>}</section>
}

function InfraSummaryCards({ summary }) {
  return <section className="infraSummaryBoard">
    <div className="infraSummaryCard"><span>Peak CPU</span><b>{fmt(summary.peakCpu)}%</b><small>{summary.peakCpuProgram} - {summary.peakCpuTime}</small></div>
    <div className="infraSummaryCard"><span>Max RSS</span><b>{fmt(summary.maxRssGb)} GB</b><small>Highest WP memory footprint - {summary.maxRssTime}</small></div>
    <div className="infraSummaryCard"><span>Physical Memory</span><b>{summary.physicalMemGb ? `${fmt(summary.physicalMemGb)} GB` : '-'}</b><small>Total RAM detected from uploaded log</small></div>
    <div className="infraSummaryCard"><span>Swap Total</span><b>{summary.swapGb ? `${fmt(summary.swapGb)} GB` : '-'}</b><small>Swap capacity detected from uploaded log</small></div>
    <div className="infraSummaryCard"><span>Most Impacted Host</span><b>{summary.impactedHost}</b><small>{summary.hostHits} hits - {summary.critCount} CRIT rows</small></div>
  </section>
}

function EvidenceCharts({ analysis, chartData }) {
  const familyChart = aggregateGroups(analysis.errorGroups, 'family', compactFamilyLabel)
  const ownerChart = aggregateGroups(analysis.errorGroups, 'owner')
  const programChart = (analysis.programGroups || []).slice(0, 6).map((item) => ({ name: displayLabel(item.name, 24), hits: item.hits || 0, crit: item.critHits || 0 }))
  const infraTimeline = buildInfraTimeline(analysis.rows || [])
  const severityChart = buildSeverityMix(analysis.rows || [])
  const hostChart = buildHostMix(analysis.rows || [])
  const wpTypeChart = buildSimpleRowChart(analysis.rows || [], 'type', (value) => displayLabel(value || 'Unknown', 18))
  const wpStateChart = buildSimpleRowChart(analysis.rows || [], 'state', wpStateLabel)
  const programCpuChart = buildProgramCpuPressure(analysis.programGroups || [])
  const infraSummary = buildInfraSummary(analysis.rows || [])
  return <>
    <div className="evidenceGrid wide logTopGrid"><MetricPanel title="Top ErrorCode" tag="ECharts hits / CRIT" rows={chartData} maxRows={8} /><MetricPanel title="Error Evidence Ranking" tag="Highest confidence first" rows={(analysis.errorGroups || []).slice(0, 10).map((item) => ({ name: item.name, hits: item.hits, crit: item.critHits }))} maxRows={8} /></div>
    <div className="evidenceGrid triple chartMiniGrid logCompactGrid"><MetricPanel title="Error Family Mix" tag="By hits / CRIT" rows={familyChart} /><MetricPanel title="Owner Direction Mix" tag="By owner" rows={ownerChart} /><MetricPanel title="Top Program Volume" tag="By program" rows={programChart} /></div>
    <div className="evidenceGrid wide logCompactGrid"><TimelinePanel data={analysis.timeline || []} /><MetricPanel title="Host Infra Signal" tag="By host" rows={hostChart} /></div>
    <section className="evidencePanel infraSectionTitle"><div className="panelTitleRow"><h2>Infra Pressure View</h2><span>CPU / memory / WP state</span></div><InfraSummaryCards summary={infraSummary} /></section>
    <div className="evidenceGrid wide chartMiniGrid infraChartGrid"><InfraTrendPanel data={infraTimeline} /><MetricPanel title="Program CPU Pressure" tag="Top max CPU" rows={programCpuChart} metric="hits" secondMetric="crit" unit="%" /></div>
    <div className="evidenceGrid triple chartMiniGrid infraChartGrid"><MetricPanel title="Log Severity Distribution" tag="CRIT / WARN / OK" rows={severityChart} /><MetricPanel title="WP Type Distribution" tag="DIA / BTC / UPD" rows={wpTypeChart} /><MetricPanel title="WP State Mix" tag="Running / waiting" rows={wpStateChart} /></div>
  </>
}

function buildReportText(analysis) {
  if (!analysis) return ''
  const primary = analysis.primary
  return ['SAP Log Evidence RCA Summary', `Verdict: ${analysis.verdict}`, `Confidence: ${analysis.confidence}% - ${analysis.confidenceText}`, primary ? `Primary Error: ${primary.name}` : 'Primary Error: -', primary ? `Error Family: ${primary.family}` : 'Error Family: -', primary ? `Owner Direction: ${primary.owner}` : 'Owner Direction: -', `Next Action: ${analysis.nextAction}`, `Parsed Rows: ${analysis.rows?.length || 0}`].join('\n')
}

export default function ToolLogEvidenceV2() {
  const [session] = React.useState(latestRcaSession)
  const [files, setFiles] = React.useState([])
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('Upload WP-SCOUT/SM21/ST22/dev_w/job logs or ZIP to validate error evidence.')
  const [analysis, setAnalysis] = React.useState(() => loadJson(CACHE_KEY, null))
  const [serverInfo, setServerInfo] = React.useState(null)
  React.useEffect(() => {
    let active = true
    import('../evidence-api-client.js').then(({ listEvidence }) => listEvidence({ tool: 'investigation', limit: 5 })).then((response) => { if (active) setServerInfo(response) }).catch(() => { if (active) setServerInfo({ ok: false }) })
    return () => { active = false }
  }, [])
  const analyze = async (nextFiles = files) => {
    setBusy(true)
    setStatus('Parsing log evidence...')
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
  const chartData = analysis?.errorGroups?.slice(0, 10).map((item) => ({ name: displayLabel(item.name, 22), hits: item.hits, crit: item.critHits })) || []
  const familyValue = primary ? compactFamilyLabel(primary.family) : 'Unknown'
  const displayedFiles = files.length ? files : (analysis?.files || [])
  return <section className="evidenceToolShell refinedTool finalRcaTool logEvidenceShell"><ToolHero busy={busy} onFiles={onFiles} /><SessionBanner session={session} /><EvidenceToolbar analysis={analysis} cacheKey={CACHE_KEY} reportText={buildReportText(analysis)} filenamePrefix="sap-log-evidence-v2" /><section className="decisionBoard finalDecisionBoard"><DecisionCard label="Primary Error" value={primary?.name || 'Pending'} hint={analysis?.summary || status} tone={primary ? 'good' : ''} /><DecisionCard label="Error Family" value={familyValue} hint={primary?.meaning || 'Upload logs to classify error family'} tone="blue" /><DecisionCard label="Owner Direction" value={primary?.owner || 'Pending'} hint={ownerHint(primary, analysis)} /><DecisionCard label="Confidence" value={`${analysis?.confidence || 0}%`} hint={analysis?.confidenceText || `${analysis?.rows?.length || 0} parsed rows`} /></section><div className="evidenceGrid"><PrimaryExplanation primary={primary} status={status} /><MappingPanel primary={primary} /></div>{analysis ? <EvidenceCharts analysis={analysis} chartData={chartData} /> : <EmptyState title="Upload log evidence"><p>Upload WP-SCOUT logs, SM21/ST22 text, dev_w trace, job log text, CSV, or a ZIP containing logs.</p><ol><li>Find the strongest ErrorCode pattern.</li><li>Map the error to job/program context.</li><li>Use owner direction to route action to Basis, ABAP, functional, or DB team.</li></ol></EmptyState>}{analysis && <div className="evidenceGrid triple"><Group title="Top JobName" rows={analysis.jobGroups} /><Group title="Top Program" rows={analysis.programGroups} /><Group title="Recommended Action" rows={(analysis.errorGroups || []).slice(0, 5).map((item) => ({ name: item.name, hits: item.hits, critHits: item.critHits, family: item.owner, examples: [cleanActionText(buildOwnerAction(item))] }))} /></div>}<div className="evidenceGrid"><UploadedFilesPanel files={displayedFiles} /><EvidenceServerPanel serverInfo={serverInfo} /></div></section>
}
