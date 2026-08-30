import { rankResourceConsumersV3, __test as v3Test } from './workloadAnalyticsV3.js'
import { resourceSignalScoresV3 } from './logRcaEngineV3.js'

const CPU_CONTRIBUTION_MAX_VALID_PCT = 120

const metric = (value) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}
const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0))

function minuteStamp(value = '') {
  const match = String(value || '').match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})/)
  if (!match) return null
  return Math.round(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5])) / 60000)
}

function collectionSkewMinutes(collection = {}) {
  const times = (collection.rows || []).map((row) => minuteStamp(row.timeLabel || row.snapshot)).filter((value) => value !== null)
  if (times.length < 2) return 0
  return Math.max(...times) - Math.min(...times)
}

function skewGrade(minutes = 0) {
  if (minutes <= 2) return 'HIGH'
  if (minutes <= 5) return 'MEDIUM'
  return 'LOW'
}

function hostSeverityWeight(hostTarget = {}) {
  const severity = String(hostTarget?.resourceSeverity || 'NORMAL').toUpperCase()
  if (severity === 'CRIT') return 1
  if (severity === 'WARN') return 0.6
  return 0.2
}

function victimHostWeight(hostTarget = {}) {
  const severity = String(hostTarget?.resourceSeverity || 'NORMAL').toUpperCase()
  if (severity === 'CRIT') return 1
  if (severity === 'WARN') return 0.75
  return 0.4
}

function cpuContributionAssessment(value) {
  const observed = metric(value)
  if (observed === null) return { valid: false, status: 'UNAVAILABLE', value: null }
  if (observed < 0 || observed > CPU_CONTRIBUTION_MAX_VALID_PCT) {
    return { valid: false, status: 'INCONSISTENT_SCALE', value: observed }
  }
  return { valid: true, status: 'VALID', value: observed }
}

function targetTimingForRow(row = {}, targetCollection = {}) {
  const targetStamp = minuteStamp(targetCollection?.timeLabel || '')
  const targetKey = targetCollection?.key || ''
  const rawTargetRows = (row.records || []).filter((record) => !targetKey || record.collectionKey === targetKey)
  const candidates = rawTargetRows
    .map((record) => ({ time: record.actualTime || record.timeLabel || record.snapshot || '', stamp: minuteStamp(record.actualTime || record.timeLabel || record.snapshot || '') }))
    .filter((record) => record.stamp !== null)

  if (!candidates.length && row.targetTime) {
    const stamp = minuteStamp(row.targetTime)
    if (stamp !== null) candidates.push({ time: row.targetTime, stamp })
  }

  if (targetStamp === null || !candidates.length) {
    return { evidence: 'NO_TARGET_SAMPLE', deltaMinutes: null, actualTime: '', temporalWeight: 0 }
  }

  const nearest = candidates.sort((a, b) => Math.abs(a.stamp - targetStamp) - Math.abs(b.stamp - targetStamp))[0]
  const deltaMinutes = nearest.stamp - targetStamp
  const distance = Math.abs(deltaMinutes)
  if (distance <= 2) return { evidence: 'EXACT_TARGET', deltaMinutes, actualTime: nearest.time, temporalWeight: 1 }
  if (distance <= 5) return { evidence: 'NEAR_TARGET', deltaMinutes, actualTime: nearest.time, temporalWeight: 0.72 }
  if (distance <= 10) return { evidence: deltaMinutes < 0 ? 'EARLY_TARGET' : 'LATE_TARGET', deltaMinutes, actualTime: nearest.time, temporalWeight: 0.32 }
  return { evidence: 'OFF_TARGET', deltaMinutes, actualTime: nearest.time, temporalWeight: 0.08 }
}

function classifyLandscapeErrorTimings(rawRows = [], targetTime = '', windowMinutes = 25) {
  const targetStamp = minuteStamp(targetTime)
  const occurrences = new Map()
  rawRows.forEach((row) => {
    const error = row.errorCode
    if (!error || error === '?') return
    const time = row.actualTime || row.timeLabel || row.snapshot || ''
    const stamp = minuteStamp(time)
    if (stamp === null) return
    if (!occurrences.has(error)) occurrences.set(error, [])
    occurrences.get(error).push({ stamp, time })
  })
  if (!occurrences.size || targetStamp === null) return { state: occurrences.size ? 'OFF_TARGET' : 'NONE', timings: [], exactErrors: [] }

  const timings = Array.from(occurrences.entries()).map(([error, rows]) => {
    const ordered = [...rows].sort((a, b) => a.stamp - b.stamp)
    const first = ordered[0]
    const deltaMinutes = first.stamp - targetStamp
    const appearsNearTarget = ordered.some((row) => Math.abs(row.stamp - targetStamp) <= windowMinutes)
    let state = 'OFF_TARGET'
    if (Math.abs(deltaMinutes) <= 2) state = 'NEW_AT_TARGET'
    else if (deltaMinutes < -2 && deltaMinutes >= -windowMinutes) state = 'NEW_BEFORE_TARGET'
    else if (deltaMinutes > 2 && deltaMinutes <= windowMinutes) state = 'NEW_AFTER_TARGET'
    else if (deltaMinutes < -windowMinutes && appearsNearTarget) state = 'PERSISTENT_NEAR_TARGET'
    return { error, state, deltaMinutes, firstTime: first.time }
  })

  const rank = { NONE: 0, OFF_TARGET: 1, NEW_AFTER_TARGET: 2, PERSISTENT_NEAR_TARGET: 3, NEW_BEFORE_TARGET: 4, NEW_AT_TARGET: 5 }
  const state = timings.reduce((best, item) => rank[item.state] > rank[best] ? item.state : best, 'NONE')
  return { state, timings, exactErrors: timings.filter((item) => item.state === 'NEW_AT_TARGET').map((item) => item.error) }
}

function errorCauseUnit(state = '') {
  if (state === 'NEW_BEFORE_TARGET') return 1
  if (state === 'NEW_AT_TARGET') return 0.8
  if (state === 'PERSISTENT_NEAR_TARGET') return 0.35
  return 0
}

function temporalUnit(evidence = '') {
  if (evidence === 'EXACT_TARGET') return 1
  if (evidence === 'NEAR_TARGET') return 0.72
  if (evidence === 'EARLY_TARGET' || evidence === 'LATE_TARGET') return 0.32
  if (evidence === 'OFF_TARGET') return 0.08
  if (evidence === 'ADJACENT_TARGET') return 0.45
  return 0
}

function blockedUnitFor(row = {}, hostTarget = {}) {
  const signals = resourceSignalScoresV3(hostTarget)
  const blockedStress = Math.max(metric(signals.load) ?? 0, metric(signals.swap) ?? 0)
  const pids = metric(row.targetConcurrentPids) ?? 0
  const d = metric(row.targetDState) ?? 0
  const ratio = pids > 0 ? d / pids : d > 0 ? 1 : 0
  return clamp01(ratio * Math.max(0.35, blockedStress))
}

function consumerUnitFor(row = {}) {
  const contribution = cpuContributionAssessment(row.cpuContributionRawPct ?? row.cpuContributionPct)
  const cpuContributionUnit = contribution.valid ? clamp01(contribution.value / 25) : 0
  const cpuUplift = clamp01(row.cpuUplift?.score ?? 0)
  // RSS is shared-memory sensitive; uplift is useful evidence, but deliberately secondary.
  const rssUplift = clamp01(row.rssUplift?.score ?? 0)
  return clamp01(cpuContributionUnit * 0.55 + cpuUplift * 0.3 + rssUplift * 0.15)
}

export function classifyWorkloadRole(row = {}, hostTarget = {}) {
  const consumer = consumerUnitFor(row)
  const blocked = blockedUnitFor(row, hostTarget)
  const error = errorCauseUnit(row.errorState)
  if (blocked >= 0.55 && consumer < 0.45) return 'BLOCKED_VICTIM'
  if (consumer >= 0.55 && blocked >= 0.45) return 'MIXED'
  if (consumer >= 0.55) return 'RESOURCE_CONSUMER'
  if (error >= 0.8 && blocked < 0.45 && consumer < 0.45) return 'ERROR_SOURCE'
  if ((consumer >= 0.3 && blocked >= 0.3) || (error >= 0.35 && (consumer >= 0.25 || blocked >= 0.25))) return 'MIXED'
  return 'BACKGROUND'
}

export function scoreWorkloadV4(row = {}, hostTarget = {}) {
  const consumer = consumerUnitFor(row)
  const blockedVictim = blockedUnitFor(row, hostTarget)
  const cpuUplift = clamp01(row.cpuUplift?.score ?? 0)
  const rssUplift = clamp01(row.rssUplift?.score ?? 0)
  const temporal = temporalUnit(row.targetEvidence)
  const hostPressure = clamp01((metric(row.targetHostPressure) ?? 0) / 100)
  const error = errorCauseUnit(row.errorState)
  const role = classifyWorkloadRole(row, hostTarget)
  const causalHostWeight = hostSeverityWeight(hostTarget)
  const blockedHostWeight = victimHostWeight(hostTarget)

  // Causal priority intentionally excludes persistence and absolute RSS/used-RAM ratios.
  // RSS contributes only as a baseline uplift because plain Linux RSS may include shared pages.
  // Resource-normal hosts are strongly down-weighted for a landscape incident anchored elsewhere.
  let causalRaw = consumer * 35 + cpuUplift * 20 + rssUplift * 10 + error * 10 + temporal * 10 + hostPressure * 15
  if (role === 'BLOCKED_VICTIM') causalRaw *= 0.58
  else if (role === 'BACKGROUND') causalRaw *= 0.72
  causalRaw *= causalHostWeight

  let victimRaw = blockedVictim * 60 + rssUplift * 15 + temporal * 10 + hostPressure * 15
  victimRaw *= blockedHostWeight
  const relevanceRaw = Math.max(causalRaw, victimRaw * 0.85) + temporal * 5 * Math.max(causalHostWeight, blockedHostWeight)
  return {
    role,
    causalScore: Math.round(Math.min(100, causalRaw)),
    victimScore: Math.round(Math.min(100, victimRaw)),
    relevanceScore: Math.round(Math.min(100, relevanceRaw)),
    hostSeverityWeight: causalHostWeight,
    roleSignals: {
      consumer: Math.round(consumer * 100),
      blockedVictim: Math.round(blockedVictim * 100),
      errorCause: Math.round(error * 100),
    },
    scoreBreakdownV4: {
      consumer: consumer * 35,
      cpuUplift: cpuUplift * 20,
      rssUplift: rssUplift * 10,
      error: error * 10,
      temporal: temporal * 10,
      hostPressure: hostPressure * 15,
      blockedVictim: blockedVictim * 60,
      hostSeverityWeight: causalHostWeight,
    },
  }
}

export function confidenceFor(row = {}, targetCollection = {}, hostTarget = {}) {
  const skewMinutes = collectionSkewMinutes(targetCollection)
  const skew = skewGrade(skewMinutes)
  const evidenceUnit = row.targetEvidence === 'EXACT_TARGET' ? 1
    : row.targetEvidence === 'NEAR_TARGET' ? 0.78
      : (row.targetEvidence === 'EARLY_TARGET' || row.targetEvidence === 'LATE_TARGET') ? 0.45
        : row.targetEvidence === 'OFF_TARGET' ? 0.15 : 0.2
  const cpuCount = Number(row.cpuBaseline?.count || 0)
  const rssCount = Number(row.rssBaseline?.count || 0)
  const observedCounts = [cpuCount, rssCount].filter((value) => value > 0)
  const baselineCount = observedCounts.length >= 2 ? Math.min(...observedCounts) : (observedCounts[0] || 0)
  const baselineUnit = clamp01(baselineCount / 6)
  const coveragePct = metric(hostTarget?.resourceCoverage?.pct)
  const coverageUnit = coveragePct === null ? 0.5 : clamp01(coveragePct / 100)
  const skewUnit = skew === 'HIGH' ? 1 : skew === 'MEDIUM' ? 0.72 : 0.4
  const rawScore = Math.round(evidenceUnit * 35 + baselineUnit * 25 + coverageUnit * 20 + skewUnit * 20)

  let score = rawScore
  if (skew === 'LOW') score = Math.min(score, 79)
  if (row.targetEvidence === 'NEAR_TARGET') score = Math.min(score, 79)
  if (row.targetEvidence === 'EARLY_TARGET' || row.targetEvidence === 'LATE_TARGET') score = Math.min(score, 69)
  if (row.targetEvidence === 'OFF_TARGET' || row.targetEvidence === 'NO_TARGET_SAMPLE') score = Math.min(score, 49)
  if (baselineCount < 3) score = Math.min(score, 69)
  if (coveragePct !== null && coveragePct < 75) score = Math.min(score, 69)
  const grade = score >= 80 ? 'HIGH' : score >= 60 ? 'MEDIUM' : 'LOW'

  return {
    score,
    rawScore,
    grade,
    skewMinutes,
    skewGrade: skew,
    baselineCount,
    coveragePct,
  }
}

function normalizeSnapshot(row = {}) {
  const round = (value, digits = 6) => {
    const observed = metric(value)
    return observed === null ? null : Number(observed.toFixed(digits))
  }
  return {
    host: row.host || '', workload: row.workload || '', collectionKey: row.collectionKey || '',
    cpu: round(row.cpu), rssGb: round(row.rssGb), maxPidRssGb: round(row.maxPidRssGb),
    concurrentPids: Number(row.concurrentPids || 0), dState: Number(row.dState || 0),
  }
}

export function compareSnapshotParity(left = [], right = []) {
  const keyOf = (row) => `${row.host}|${row.workload}|${row.collectionKey}`
  const leftMap = new Map(left.map((row) => [keyOf(row), normalizeSnapshot(row)]))
  const rightMap = new Map(right.map((row) => [keyOf(row), normalizeSnapshot(row)]))
  const keys = new Set([...leftMap.keys(), ...rightMap.keys()])
  const mismatches = []
  keys.forEach((key) => {
    const a = leftMap.get(key)
    const b = rightMap.get(key)
    if (JSON.stringify(a) !== JSON.stringify(b)) mismatches.push({ key, js: a || null, engine: b || null })
  })
  return { status: mismatches.length ? 'FAIL' : 'PASS', compared: keys.size, mismatchCount: mismatches.length, mismatches: mismatches.slice(0, 5) }
}

function enhanceRows(rows = [], rca = {}) {
  const targetCollection = rca.resourceLandscapePeak || rca.landscapePeak || null
  const landscapeTargetTime = targetCollection?.timeLabel || ''
  const errorWindowMinutes = Math.max(5, Math.min(30, Math.round((rca.cadence?.nominalMinutes || 20) * 1.25)))

  return rows.map((row) => {
    const hostTarget = targetCollection?.byHost?.get?.(row.host) || null
    const timing = targetTimingForRow(row, targetCollection || {})
    const errorTiming = classifyLandscapeErrorTimings(row.records || [], landscapeTargetTime, errorWindowMinutes)
    const contribution = cpuContributionAssessment(row.cpuContributionPct)
    const correctedRow = {
      ...row,
      targetTime: landscapeTargetTime,
      targetHostSampleTime: row.targetTime || timing.actualTime,
      targetActualTime: timing.actualTime,
      targetEvidence: timing.evidence,
      targetDeltaMinutes: timing.deltaMinutes,
      targetTemporalWeight: timing.temporalWeight,
      targetDeltaCollections: 0,
      incidentAlignment: Math.round(timing.temporalWeight * 100),
      peakCorrelation: Math.round(timing.temporalWeight * 100),
      errorState: errorTiming.state,
      errorTimings: errorTiming.timings,
      newPeakErrors: errorTiming.exactErrors,
      cpuContributionRawPct: contribution.value,
      cpuContributionPct: contribution.valid ? contribution.value : null,
      cpuContributionValid: contribution.valid,
      cpuContributionStatus: contribution.status,
    }
    const scoring = scoreWorkloadV4(correctedRow, hostTarget || {})
    const confidence = confidenceFor(correctedRow, targetCollection || {}, hostTarget || {})
    const hostMemoryGb = metric(hostTarget?.memoryTotalGb)
    const hostMemoryPct = metric(hostTarget?.memoryPct)
    const hostUsedMemoryGb = hostMemoryGb !== null && hostMemoryPct !== null ? hostMemoryGb * hostMemoryPct / 100 : null
    const maxPidRssUsedRamIndicatorPct = metric(correctedRow.targetMaxPidRss) !== null && hostUsedMemoryGb && hostUsedMemoryGb > 0
      ? metric(correctedRow.targetMaxPidRss) / hostUsedMemoryGb * 100
      : null
    return {
      ...correctedRow,
      incidentScoreV3: row.incidentScore,
      incidentScore: scoring.relevanceScore,
      resourceScore: scoring.relevanceScore,
      causalScore: scoring.causalScore,
      victimScore: scoring.victimScore,
      incidentRole: scoring.role,
      hostSeverityWeight: scoring.hostSeverityWeight,
      roleSignals: scoring.roleSignals,
      scoreBreakdownV4: scoring.scoreBreakdownV4,
      confidence,
      incidentConfidence: confidence.grade,
      maxPidRssUsedRamIndicatorPct,
      // Backward compatibility only; UI must not call this a physical-memory contribution.
      memoryLowerContributionPct: maxPidRssUsedRamIndicatorPct,
    }
  }).sort((a, b) => b.causalScore - a.causalScore || b.incidentScore - a.incidentScore || b.confidence.score - a.confidence.score || b.footprintScore - a.footprintScore)
}

export async function rankResourceConsumersV4(processes = [], rca = {}) {
  const ranked = await rankResourceConsumersV3(processes, rca)
  let engineReason = ''
  let parity = { status: 'NOT_RUN', compared: 0, mismatchCount: 0, mismatches: [] }
  const isDuckDb = String(ranked.engine || '').startsWith('DUCKDB')
  if (isDuckDb) {
    try {
      const attached = v3Test.attachCollections(processes, rca).filter((row) => row.collectionIndex >= 0)
      const jsSnapshots = v3Test.aggregateSnapshotsJs(attached)
      parity = compareSnapshotParity(jsSnapshots, ranked.snapshots || [])
    } catch (error) {
      parity = { status: 'ERROR', compared: 0, mismatchCount: 0, mismatches: [], reason: error?.message || 'Parity check failed' }
    }
  } else if (String(ranked.engine || '').startsWith('JS_FALLBACK')) {
    engineReason = String(ranked.engine).split(':').slice(1).join(':').trim() || 'DuckDB unavailable in this browser runtime'
  }

  const rows = enhanceRows(ranked.rows || [], rca)
  const targetCollection = rca.resourceLandscapePeak || rca.landscapePeak || null
  const skewMinutes = collectionSkewMinutes(targetCollection || {})
  const crossHostConfidence = { skewMinutes, grade: skewGrade(skewMinutes) }
  const engine = isDuckDb
    ? `DuckDB-WASM v3.3.1 · parity ${parity.status}${parity.status === 'PASS' ? ` (${parity.compared})` : ''}`
    : `JS fallback v3.3.1 · DuckDB: ${engineReason}`

  return { ...ranked, rows, engine, engineReason, parity, crossHostConfidence }
}

export const __test = {
  classifyWorkloadRole,
  scoreWorkloadV4,
  confidenceFor,
  compareSnapshotParity,
  collectionSkewMinutes,
  skewGrade,
  hostSeverityWeight,
  cpuContributionAssessment,
  targetTimingForRow,
  classifyLandscapeErrorTimings,
}
