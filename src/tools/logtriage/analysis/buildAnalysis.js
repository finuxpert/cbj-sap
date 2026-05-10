import { buildOwnerAction, classifySapError, safe } from '../../evidence-utils.js'
import { confidenceLabel } from './confidenceLabel.js'

export function groupEvidenceRows(rows, key) {
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

export function buildTimeline(rows = []) {
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

function clampPct(value) {
  const number = Number(value || 0)
  if (!Number.isFinite(number)) return 0
  return Math.max(0, Math.min(100, number))
}

export function buildSystemResources(rows = []) {
  const map = new Map()
  rows.forEach((row) => {
    if (!row.timeLabel) return

    const cpu = clampPct(row.cpu || row.cpuPct || row.cpuPercent)
    const mem = clampPct(row.mem || row.memory || row.memoryPct || row.memPercent || row.rssPct)
    const swap = clampPct(row.swap || row.swapPct || row.swapPercent)

    if (!cpu && !mem && !swap) return

    const current = map.get(row.timeLabel) || {
      name: row.timeLabel,
      cpuMax: 0,
      cpuTotal: 0,
      cpuCount: 0,
      memMax: 0,
      memTotal: 0,
      memCount: 0,
      swapMax: 0,
      swapTotal: 0,
      swapCount: 0,
    }

    if (cpu) {
      current.cpuMax = Math.max(current.cpuMax, cpu)
      current.cpuTotal += cpu
      current.cpuCount += 1
    }

    if (mem) {
      current.memMax = Math.max(current.memMax, mem)
      current.memTotal += mem
      current.memCount += 1
    }

    if (swap) {
      current.swapMax = Math.max(current.swapMax, swap)
      current.swapTotal += swap
      current.swapCount += 1
    }

    map.set(row.timeLabel, current)
  })

  return Array.from(map.values())
    .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    .map((row) => ({
      name: row.name,
      cpu: Math.round(row.cpuCount ? row.cpuTotal / row.cpuCount : row.cpuMax),
      mem: Math.round(row.memCount ? row.memTotal / row.memCount : row.memMax),
      swap: Math.round(row.swapCount ? row.swapTotal / row.swapCount : row.swapMax),
      cpuMax: Math.round(row.cpuMax),
      memMax: Math.round(row.memMax),
      swapMax: Math.round(row.swapMax),
    }))
    .slice(-30)
}

export function buildAnalysis(files, rows, evidenceServer) {
  const errorGroups = groupEvidenceRows(rows, 'errorCode')
  const jobGroups = groupEvidenceRows(rows, 'jobName')
  const programGroups = groupEvidenceRows(rows, 'program')
  const primary = errorGroups[0]
  const timeline = buildTimeline(rows)
  const system_resources = buildSystemResources(rows)

  const sourceCount = new Set(rows.map((row) => row.source)).size
  const fileCount = new Set(rows.map((row) => row.fileName)).size

  const repeatedSignal = primary?.hits > 1 ? 16 : 0
  const criticalSignal = Math.min(36, (primary?.critHits || 0) * 9)
  const volumeSignal = Math.min(24, rows.length * 2)
  const coverageSignal = Math.min(14, fileCount * 4 + sourceCount * 3)
  const timelineSignal = Math.min(10, timeline.length * 2)

  const confidence = primary
    ? Math.min(100, Math.round(
        criticalSignal +
        repeatedSignal +
        volumeSignal +
        coverageSignal +
        timelineSignal,
      ))
    : 0

  const verdict = primary ? 'Detected' : 'Not confirmed'

  const nextAction = primary
    ? buildOwnerAction(primary)
    : 'Upload WP-SCOUT, SM21, ST22, dev_w, or job logs containing SAP error patterns.'

  const summary = primary
    ? `${primary.name} is strongest: ${primary.hits} hit(s), ${primary.critHits} CRIT, owner ${primary.owner}.`
    : 'No known SAP error patterns detected from uploaded logs.'

  return {
    files,
    rows,
    errorGroups,
    jobGroups,
    programGroups,
    primary,
    timeline,
    system_resources,
    resources: system_resources,
    cpu_mem_swap: system_resources,
    confidence,
    confidenceText: confidenceLabel(confidence, rows, primary),
    verdict,
    nextAction,
    summary,
    evidenceServer,
    createdAt: new Date().toISOString(),
  }
}
