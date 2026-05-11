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

function scorePressure(value, warnAt = 70, critAt = 90) {
  const pct = clampPct(value)
  if (pct >= critAt) return 100
  if (pct >= warnAt) return Math.round(60 + ((pct - warnAt) / Math.max(1, critAt - warnAt)) * 40)
  return Math.round((pct / Math.max(1, warnAt)) * 55)
}

function severityFromPressure(score) {
  if (score >= 85) return 'CRIT'
  if (score >= 60) return 'WARN'
  return 'INFO'
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

export function buildInfraSaturation(systemResources = []) {
  if (!systemResources.length) {
    return {
      score: 0,
      severity: 'INFO',
      verdict: 'No infra telemetry detected',
      owner: 'UNKNOWN',
      cpu: { max: 0, avg: 0, score: 0 },
      memory: { max: 0, avg: 0, score: 0 },
      swap: { max: 0, avg: 0, score: 0 },
      signals: [],
      nextAction: 'Upload OS/SAP host telemetry containing CPU, memory, or swap values to validate infra pressure.',
    }
  }

  const avg = (key) => Math.round(systemResources.reduce((sum, row) => sum + Number(row[key] || 0), 0) / Math.max(systemResources.length, 1))
  const max = (key) => Math.max(...systemResources.map((row) => Number(row[key] || 0)))

  const cpuMax = max('cpuMax') || max('cpu')
  const memMax = max('memMax') || max('mem')
  const swapMax = max('swapMax') || max('swap')
  const cpuScore = scorePressure(cpuMax, 75, 92)
  const memScore = scorePressure(memMax, 78, 92)
  const swapScore = scorePressure(swapMax, 10, 35)
  const score = Math.max(cpuScore, memScore, swapScore, Math.round((cpuScore * 0.35) + (memScore * 0.35) + (swapScore * 0.30)))
  const severity = severityFromPressure(score)

  const signals = []
  if (cpuScore >= 60) signals.push(`CPU pressure max ${cpuMax}%`)
  if (memScore >= 60) signals.push(`Memory pressure max ${memMax}%`)
  if (swapScore >= 60) signals.push(`Swap pressure max ${swapMax}%`)

  const dominant = [
    { key: 'CPU', score: cpuScore },
    { key: 'MEMORY', score: memScore },
    { key: 'SWAP', score: swapScore },
  ].sort((a, b) => b.score - a.score)[0]

  const owner = severity === 'INFO' ? 'UNKNOWN' : 'INFRA/BASIS'
  const verdict = severity === 'CRIT'
    ? `${dominant.key} saturation likely contributes to incident symptoms.`
    : severity === 'WARN'
      ? `${dominant.key} pressure detected; validate host health before app-only RCA.`
      : 'No strong infra saturation detected from uploaded telemetry.'

  return {
    score,
    severity,
    verdict,
    owner,
    dominant: dominant.key,
    cpu: { max: cpuMax, avg: avg('cpu'), score: cpuScore },
    memory: { max: memMax, avg: avg('mem'), score: memScore },
    swap: { max: swapMax, avg: avg('swap'), score: swapScore },
    signals,
    nextAction: severity === 'INFO'
      ? 'Continue application/log RCA; infra telemetry does not currently show strong saturation.'
      : 'Check OS-level sar/top/vmstat, SAP host agent metrics, and affected instance health for the incident window.',
  }
}

function buildOwnershipDirection(primary, infraSaturation) {
  const appOwner = primary?.owner || 'UNKNOWN'
  const infraScore = infraSaturation?.score || 0
  const appScore = primary ? Math.min(100, (primary.critHits || 0) * 18 + (primary.hits || 0) * 8) : 0
  const basisScore = Math.max(infraScore, appOwner === 'BASIS' ? appScore : 0)
  const functionalScore = appOwner === 'FUNCTIONAL' ? appScore : 0
  const abapScore = appOwner === 'ABAP' ? appScore : 0
  const dbaScore = appOwner === 'DBA' ? appScore : 0

  const scores = [
    { owner: 'INFRA/BASIS', score: basisScore },
    { owner: 'ABAP', score: abapScore },
    { owner: 'DBA', score: dbaScore },
    { owner: 'FUNCTIONAL', score: functionalScore },
    { owner: appOwner, score: appScore },
  ].filter((item, index, arr) => item.owner && item.owner !== 'UNKNOWN' && arr.findIndex((x) => x.owner === item.owner) === index)
    .sort((a, b) => b.score - a.score)

  return {
    primary_owner: scores[0]?.owner || appOwner || 'UNKNOWN',
    secondary_owner: scores[1]?.owner || '',
    scores,
    reason: infraScore >= 60
      ? `${infraSaturation.dominant} pressure is strong enough to include INFRA/BASIS in RCA validation.`
      : primary
        ? `Primary ownership follows strongest SAP error family: ${primary.name}.`
        : 'No strong ownership signal detected yet.',
  }
}

export function buildAnalysis(files, rows, evidenceServer) {
  const errorGroups = groupEvidenceRows(rows, 'errorCode')
  const jobGroups = groupEvidenceRows(rows, 'jobName')
  const programGroups = groupEvidenceRows(rows, 'program')
  const primary = errorGroups[0]
  const timeline = buildTimeline(rows)
  const system_resources = buildSystemResources(rows)
  const infra_saturation = buildInfraSaturation(system_resources)
  const ownership_direction = buildOwnershipDirection(primary, infra_saturation)

  const sourceCount = new Set(rows.map((row) => row.source)).size
  const fileCount = new Set(rows.map((row) => row.fileName)).size

  const repeatedSignal = primary?.hits > 1 ? 16 : 0
  const criticalSignal = Math.min(36, (primary?.critHits || 0) * 9)
  const volumeSignal = Math.min(24, rows.length * 2)
  const coverageSignal = Math.min(14, fileCount * 4 + sourceCount * 3)
  const timelineSignal = Math.min(10, timeline.length * 2)
  const infraSignal = infra_saturation.severity === 'CRIT' ? 12 : infra_saturation.severity === 'WARN' ? 6 : 0

  const confidence = primary
    ? Math.min(100, Math.round(
        criticalSignal +
        repeatedSignal +
        volumeSignal +
        coverageSignal +
        timelineSignal +
        infraSignal,
      ))
    : infra_saturation.score

  const verdict = primary || infra_saturation.score ? 'Detected' : 'Not confirmed'

  const nextAction = infra_saturation.severity !== 'INFO'
    ? infra_saturation.nextAction
    : primary
      ? buildOwnerAction(primary)
      : 'Upload WP-SCOUT, SM21, ST22, dev_w, OS telemetry, or job logs containing SAP/infra error patterns.'

  const summary = primary
    ? `${primary.name} is strongest: ${primary.hits} hit(s), ${primary.critHits} CRIT, owner ${ownership_direction.primary_owner}. ${infra_saturation.verdict}`
    : infra_saturation.score
      ? infra_saturation.verdict
      : 'No known SAP error patterns or infra saturation detected from uploaded logs.'

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
    infra_saturation,
    ownership_direction,
    confidence,
    confidenceText: confidenceLabel(confidence, rows, primary),
    verdict,
    nextAction,
    summary,
    evidenceServer,
    createdAt: new Date().toISOString(),
  }
}
