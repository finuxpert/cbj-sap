import { rankResourceConsumersV3 } from './workloadAnalyticsV3.js'
import { resourceSignalScoresV3 } from './logSphereEngineV3.js'

const CPU_CONTRIBUTION_MAX_VALID_PCT = 120

const metric = (value) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}
const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0))
const severityRank = (value = '') => ({ UNKNOWN: -1, NORMAL: 0, WARN: 1, CRIT: 2 })[String(value || '').toUpperCase()] ?? -1

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
  const severity = String(hostTarget?.resourceSeverity || 'UNKNOWN').toUpperCase()
  if (severity === 'CRIT') return 1
  if (severity === 'WARN') return 0.6
  if (severity === 'NORMAL') return 0.2
  return 0.1
}

function victimHostWeight(hostTarget = {}) {
  const severity = String(hostTarget?.resourceSeverity || 'UNKNOWN').toUpperCase()
  if (severity === 'CRIT') return 1
  if (severity === 'WARN') return 0.75
  if (severity === 'NORMAL') return 0.4
  return 0.2
}

function cpuContributionAssessment(value) {
  const observed = metric(value)
  if (observed === null) return { valid: false, status: 'UNAVAILABLE', value: null }
  if (observed < 0 || observed > CPU_CONTRIBUTION_MAX_VALID_PCT) {
    return { valid: false, status: 'INCONSISTENT_SCALE', value: observed }
  }
  return { valid: true, status: 'VALID', value: observed }
}

function deriveIncidentAnchor(rca = {}) {
  const collection = rca.resourceLandscapePeak || rca.landscapePeak || null
  if (!collection?.rows?.length) return { time: collection?.timeLabel || '', host: '', resourceSeverity: collection?.resourceSeverity || 'NORMAL', resourcePressure: collection?.resourcePressure || 0, collectionKey: collection?.key || '' }
  const best = collection.rows.reduce((current, row) => {
    if (!current) return row
    const severityDelta = severityRank(row.resourceSeverity) - severityRank(current.resourceSeverity)
    if (severityDelta > 0) return row
    if (severityDelta < 0) return current
    const pressureDelta = Number(row.resourcePressure || 0) - Number(current.resourcePressure || 0)
    if (pressureDelta > 0) return row
    if (pressureDelta < 0) return current
    const currentStamp = minuteStamp(current.timeLabel || current.snapshot)
    const rowStamp = minuteStamp(row.timeLabel || row.snapshot)
    if (rowStamp !== null && currentStamp !== null && rowStamp < currentStamp) return row
    return current
  }, null)
  return {
    time: best?.timeLabel || best?.snapshot || collection.timeLabel || '',
    host: best?.host || '',
    resourceSeverity: best?.resourceSeverity || collection.resourceSeverity || 'NORMAL',
    resourcePressure: Number(best?.resourcePressure || 0),
    collectionKey: collection.key || '',
    row: best || null,
  }
}

function withIncidentAnchor(rca = {}, anchor = deriveIncidentAnchor(rca)) {
  const source = rca.resourceLandscapePeak || rca.landscapePeak || null
  if (!source) return rca
  const anchored = { ...source, timeLabel: anchor.time || source.timeLabel, incidentAnchorTime: anchor.time || source.timeLabel, incidentAnchorHost: anchor.host || '' }
  const next = {
    ...rca,
    resourceIncidentAnchor: anchor,
    resourceLandscapePeak: anchored,
    landscapePeak: rca.landscapePeak?.key === source.key ? anchored : rca.landscapePeak,
  }
  // The UI keeps the original collection list/range, but the incident marker and ranking
  // should point at the actual host sample that produced the strongest resource evidence.
  rca.resourceIncidentAnchor = anchor
  rca.resourceLandscapePeak = anchored
  if (rca.landscapePeak?.key === source.key) rca.landscapePeak = anchored
  return next
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
  if (targetStamp === null || !candidates.length) return { evidence: 'NO_TARGET_SAMPLE', deltaMinutes: null, actualTime: '', temporalWeight: 0 }

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
  if (error >= 0.8 && blocked < 0.45 && consumer < 0.45) return 'ERROR_SIGNAL'
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
  const causalHostWeight = metric(row.hostSeverityWeightOverride) ?? hostSeverityWeight(hostTarget)
  const blockedHostWeight = metric(row.victimHostWeightOverride) ?? victimHostWeight(hostTarget)

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

function mappingUnitFor(row = {}, targetKey = '') {
  const candidates = (row.records || []).filter((record) => !targetKey || record.collectionKey === targetKey)
  let best = 0.5
  candidates.forEach((record) => {
    const confidence = String(record.mappingConfidence || '')
    if (confidence === 'EXACT') best = Math.max(best, 1)
    else if (confidence === 'NEAREST_2M') best = Math.max(best, 0.85)
    else if (confidence === 'NEAREST_5M') best = Math.max(best, 0.65)
    else if (confidence === 'UNMAPPED') best = Math.max(best, 0)
  })
  return best
}

export function localConfidenceFor(row = {}, targetCollection = {}, hostTarget = {}) {
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
  const mappingUnit = mappingUnitFor(row, targetCollection?.key || '')
  const rawScore = Math.round(evidenceUnit * 40 + baselineUnit * 25 + coverageUnit * 20 + mappingUnit * 15)

  let score = rawScore
  if (row.targetEvidence === 'NEAR_TARGET') score = Math.min(score, 84)
  if (row.targetEvidence === 'EARLY_TARGET' || row.targetEvidence === 'LATE_TARGET') score = Math.min(score, 69)
  if (row.targetEvidence === 'OFF_TARGET' || row.targetEvidence === 'NO_TARGET_SAMPLE') score = Math.min(score, 49)
  if (baselineCount < 3) score = Math.min(score, 69)
  if (coveragePct !== null && coveragePct < 75) score = Math.min(score, 69)
  const grade = score >= 80 ? 'HIGH' : score >= 60 ? 'MEDIUM' : 'LOW'
  return { score, rawScore, grade, baselineCount, coveragePct, mappingUnit: Math.round(mappingUnit * 100) }
}

export function landscapeConfidenceFor(targetCollection = {}, anchorTime = '') {
  const rows = targetCollection?.rows || []
  const anchorStamp = minuteStamp(anchorTime || targetCollection?.timeLabel || '')
  const skewMinutes = collectionSkewMinutes(targetCollection)
  if (!rows.length || anchorStamp === null) return { score: 0, grade: 'LOW', skewMinutes, skewGrade: skewGrade(skewMinutes), exactHosts: 0, nearHosts: 0, hostCount: rows.length }
  const deltas = rows.map((row) => {
    const stamp = minuteStamp(row.timeLabel || row.snapshot)
    return stamp === null ? null : Math.abs(stamp - anchorStamp)
  }).filter((value) => value !== null)
  const exactHosts = deltas.filter((value) => value <= 2).length
  const nearHosts = deltas.filter((value) => value <= 5).length
  const hostCount = Math.max(1, rows.length)
  const exactRatio = exactHosts / hostCount
  const nearRatio = nearHosts / hostCount
  const skewUnit = skewGrade(skewMinutes) === 'HIGH' ? 1 : skewGrade(skewMinutes) === 'MEDIUM' ? 0.7 : 0.35
  const score = Math.round(exactRatio * 55 + nearRatio * 20 + skewUnit * 25)
  const grade = score >= 80 ? 'HIGH' : score >= 60 ? 'MEDIUM' : 'LOW'
  return { score, grade, skewMinutes, skewGrade: skewGrade(skewMinutes), exactHosts, nearHosts, hostCount }
}

function cpuShareFromEvidence(row = {}, hostTarget = {}, timing = {}) {
  if (timing.deltaMinutes === null) return { valid: false, status: 'UNAVAILABLE_TARGET_TIME', value: null }
  if (Math.abs(timing.deltaMinutes) > 2) return { valid: false, status: 'TEMPORAL_MISMATCH', value: null }
  const targetCpu = metric(row.targetCpu)
  if (targetCpu === null) return { valid: false, status: 'UNAVAILABLE_TARGET_CPU', value: null }
  const hostCpuPct = metric(hostTarget?.cpuPct)
  const hostVcpu = metric(hostTarget?.vcpu)
  if (hostCpuPct === null || hostVcpu === null || hostVcpu <= 0) return { valid: false, status: 'UNAVAILABLE_HOST_CPU_SCALE', value: null }
  const estimatedHostCpuUnits = hostCpuPct * hostVcpu
  if (!(estimatedHostCpuUnits > 0)) return { valid: false, status: 'UNAVAILABLE_HOST_CPU_SCALE', value: null }
  const raw = targetCpu / estimatedHostCpuUnits * 100
  return cpuContributionAssessment(raw)
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

function incidentPattern(anchor = {}, rows = []) {
  const sample = anchor.row || {}
  const ram = metric(sample.memoryPct)
  const cpu = metric(sample.cpuPct)
  const load = metric(sample.resourceLoadRatio)
  const swap = metric(sample.swapIn)
  const exactRows = rows.filter((row) => row.targetEvidence === 'EXACT_TARGET' || row.targetEvidence === 'NEAR_TARGET')
  const blocked = exactRows.some((row) => Number(row.targetDState || 0) > 0)
  const memoryPressure = ram !== null && ram >= 85
  const loadPressure = load !== null && load >= 1.5
  const swapPressure = swap !== null && swap >= 100
  const cpuSaturation = cpu !== null && cpu >= 90
  if (memoryPressure && (loadPressure || swapPressure || blocked)) return 'MEMORY_BLOCKING_CONTENTION'
  if (cpuSaturation && loadPressure) return 'CPU_SATURATION'
  if (loadPressure && (swapPressure || blocked)) return 'BLOCKING_IO_CONTENTION'
  if (memoryPressure) return 'MEMORY_PRESSURE'
  if (cpuSaturation) return 'CPU_PRESSURE'
  return 'RESOURCE_CONTENTION'
}

export function verdictFor(rows = [], rca = {}, anchor = deriveIncidentAnchor(rca), landscapeConfidence = landscapeConfidenceFor(rca.resourceLandscapePeak || {}, anchor.time)) {
  const ordered = [...rows].sort((a, b) => b.causalScore - a.causalScore || b.incidentScore - a.incidentScore)
  const top = ordered[0] || null
  const second = ordered[1] || null
  const margin = top ? top.causalScore - (second?.causalScore || 0) : 0
  const localGrade = top?.localConfidence?.grade || top?.incidentConfidence || 'LOW'
  const victimDominant = !!top && Number(top.victimScore || 0) > Number(top.causalScore || 0)
  const causalRole = top && ['RESOURCE_CONSUMER', 'MIXED'].includes(top.incidentRole)
  const temporalGood = top && ['EXACT_TARGET', 'NEAR_TARGET'].includes(top.targetEvidence)
  const singleSupported = !!top && top.causalScore >= 65 && localGrade === 'HIGH' && !victimDominant && margin >= 10 && causalRole && temporalGood
  const reasons = []
  if (!top) reasons.push('NO_CANDIDATE')
  else {
    if (top.causalScore < 65) reasons.push('CAUSAL_SCORE_BELOW_65')
    if (localGrade !== 'HIGH') reasons.push('LOCAL_CONFIDENCE_NOT_HIGH')
    if (victimDominant) reasons.push('VICTIM_EVIDENCE_DOMINATES')
    if (margin < 10) reasons.push('TOP_CANDIDATE_MARGIN_LT_10')
    if (!temporalGood) reasons.push('TARGET_TIMING_NOT_EXACT_OR_NEAR')
  }
  return {
    status: singleSupported ? 'SINGLE_CULPRIT_SUPPORTED' : 'NO_SINGLE_CULPRIT',
    pattern: incidentPattern(anchor, rows),
    anchorTime: anchor.time || '',
    anchorHost: anchor.host || '',
    topWorkload: top?.workload || '',
    topHost: top?.host || '',
    topCausalScore: top?.causalScore ?? 0,
    topVictimScore: top?.victimScore ?? 0,
    topLocalConfidence: localGrade,
    margin,
    landscapeConfidence,
    reasons,
    interpretation: singleSupported
      ? 'One workload has sufficiently strong, high-confidence causal evidence and a clear margin over the next candidate.'
      : 'Current evidence does not establish one dominant initiating workload. Treat the ranking as related evidence and investigate the incident pattern at host/resource level.',
  }
}

function enhanceRows(rows = [], rca = {}) {
  const targetCollection = rca.resourceLandscapePeak || rca.landscapePeak || null
  const landscapeTargetTime = targetCollection?.timeLabel || ''
  const errorWindowMinutes = Math.max(5, Math.min(30, Math.round((rca.cadence?.nominalMinutes || 20) * 1.25)))
  const landscapeConfidence = landscapeConfidenceFor(targetCollection || {}, landscapeTargetTime)

  return rows.map((row) => {
    const hostTarget = targetCollection?.byHost?.get?.(row.host) || null
    const timing = targetTimingForRow(row, targetCollection || {})
    const errorTiming = classifyLandscapeErrorTimings(row.records || [], landscapeTargetTime, errorWindowMinutes)
    const actualHostSeverity = String(hostTarget?.resourceSeverity || 'UNKNOWN').toUpperCase()
    const hostStateAtIncident = timing.deltaMinutes !== null && Math.abs(timing.deltaMinutes) <= 2 ? actualHostSeverity : 'UNKNOWN'
    const hostTemporalWeight = timing.temporalWeight
    const share = cpuShareFromEvidence(row, hostTarget || {}, timing)
    const correctedRow = {
      ...row,
      targetTime: landscapeTargetTime,
      targetHostSampleTime: timing.actualTime || row.targetTime || '',
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
      targetHostSeverity: hostStateAtIncident,
      targetHostEvidenceSeverity: actualHostSeverity,
      targetHostEvidenceTime: timing.actualTime || hostTarget?.timeLabel || hostTarget?.snapshot || '',
      hostSeverityWeightOverride: hostSeverityWeight(hostTarget || {}) * hostTemporalWeight,
      victimHostWeightOverride: victimHostWeight(hostTarget || {}) * hostTemporalWeight,
      targetHostPressure: Number(row.targetHostPressure || hostTarget?.resourcePressure || 0) * hostTemporalWeight,
      cpuContributionRawPct: share.value,
      cpuContributionPct: share.valid ? share.value : null,
      estimatedCpuSharePct: share.valid ? share.value : null,
      cpuContributionValid: share.valid,
      cpuContributionStatus: share.status,
    }
    const scoring = scoreWorkloadV4(correctedRow, hostTarget || {})
    const local = localConfidenceFor(correctedRow, targetCollection || {}, hostTarget || {})
    const confidence = { ...local, skewMinutes: landscapeConfidence.skewMinutes, skewGrade: landscapeConfidence.skewGrade }
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
      localConfidence: local,
      landscapeConfidence,
      incidentConfidence: local.grade,
      maxPidRssUsedRamIndicatorPct,
      memoryLowerContributionPct: maxPidRssUsedRamIndicatorPct,
    }
  }).sort((a, b) => b.causalScore - a.causalScore || b.incidentScore - a.incidentScore || b.localConfidence.score - a.localConfidence.score || b.footprintScore - a.footprintScore)
}

export async function rankResourceConsumersV4(processes = [], rca = {}) {
  const anchor = deriveIncidentAnchor(rca)
  const anchoredRca = withIncidentAnchor(rca, anchor)
  // Keep the parity reference local so it is not retained in the RCA result.
  const { jsSnapshots, ...ranked } = await rankResourceConsumersV3(processes, anchoredRca)
  let engineReason = ''
  let parity = { status: 'NOT_RUN', compared: 0, mismatchCount: 0, mismatches: [] }
  const isDuckDb = String(ranked.engine || '').startsWith('DUCKDB')
  if (isDuckDb) {
    try {
      parity = compareSnapshotParity(jsSnapshots, ranked.snapshots || [])
    } catch (error) {
      parity = { status: 'ERROR', compared: 0, mismatchCount: 0, mismatches: [], reason: error?.message || 'Parity check failed' }
    }
  } else if (String(ranked.engine || '').startsWith('JS_FALLBACK')) {
    engineReason = String(ranked.engine).split(':').slice(1).join(':').trim() || 'DuckDB unavailable in this browser runtime'
  }

  const rows = enhanceRows(ranked.rows || [], anchoredRca)
  const targetCollection = anchoredRca.resourceLandscapePeak || anchoredRca.landscapePeak || null
  const landscapeConfidence = landscapeConfidenceFor(targetCollection || {}, anchor.time)
  const verdict = verdictFor(rows, anchoredRca, anchor, landscapeConfidence)
  const crossHostConfidence = { ...landscapeConfidence }
  const engine = isDuckDb
    ? `DuckDB-WASM v3.4 · parity ${parity.status}${parity.status === 'PASS' ? ` (${parity.compared})` : ''}`
    : `JS fallback v3.4 · DuckDB: ${engineReason}`
  const engineDiagnostics = { activeEngine: isDuckDb ? 'DuckDB-WASM v3.4' : 'JS fallback v3.4', duckDbStatus: isDuckDb ? 'ACTIVE' : 'FAILED', reason: engineReason, parity }

  rows.verdict = verdict
  rows.incidentAnchor = anchor
  rows.landscapeConfidence = landscapeConfidence
  rows.engineDiagnostics = engineDiagnostics

  return { ...ranked, rows, engine, engineReason, parity, crossHostConfidence, landscapeConfidence, verdict, incidentAnchor: anchor, engineDiagnostics }
}

export const __test = {
  classifyWorkloadRole,
  scoreWorkloadV4,
  localConfidenceFor,
  landscapeConfidenceFor,
  compareSnapshotParity,
  collectionSkewMinutes,
  skewGrade,
  hostSeverityWeight,
  cpuContributionAssessment,
  cpuShareFromEvidence,
  targetTimingForRow,
  classifyLandscapeErrorTimings,
  deriveIncidentAnchor,
  verdictFor,
}
