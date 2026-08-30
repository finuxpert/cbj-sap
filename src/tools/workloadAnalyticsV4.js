import { rankResourceConsumersV3, __test as v3Test } from './workloadAnalyticsV3.js'
import { resourceSignalScoresV3 } from './logRcaEngineV3.js'

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

function errorCauseUnit(state = '') {
  if (state === 'NEW_BEFORE_TARGET') return 1
  if (state === 'NEW_AT_TARGET') return 0.8
  if (state === 'PERSISTENT_NEAR_TARGET') return 0.35
  return 0
}

function temporalUnit(evidence = '') {
  if (evidence === 'EXACT_TARGET') return 1
  if (evidence === 'ADJACENT_TARGET') return 0.55
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
  const cpuContribution = metric(row.cpuContributionPct)
  const cpuContributionUnit = cpuContribution === null ? 0 : clamp01(cpuContribution / 10)
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

  // Causal priority intentionally excludes persistence and absolute RSS/used-RAM ratios.
  // RSS contributes only as a baseline uplift because plain Linux RSS may include shared pages.
  let causalRaw = consumer * 35 + cpuUplift * 20 + rssUplift * 10 + error * 10 + temporal * 10 + hostPressure * 15
  if (role === 'BLOCKED_VICTIM') causalRaw *= 0.58
  else if (role === 'BACKGROUND') causalRaw *= 0.72

  const victimRaw = blockedVictim * 60 + rssUplift * 15 + temporal * 10 + hostPressure * 15
  const relevanceRaw = Math.max(causalRaw, victimRaw * 0.85) + temporal * 5
  return {
    role,
    causalScore: Math.round(Math.min(100, causalRaw)),
    victimScore: Math.round(Math.min(100, victimRaw)),
    relevanceScore: Math.round(Math.min(100, relevanceRaw)),
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
    },
  }
}

export function confidenceFor(row = {}, targetCollection = {}, hostTarget = {}) {
  const skewMinutes = collectionSkewMinutes(targetCollection)
  const skew = skewGrade(skewMinutes)
  const evidenceUnit = row.targetEvidence === 'EXACT_TARGET' ? 1 : row.targetEvidence === 'ADJACENT_TARGET' ? 0.62 : 0.2
  const cpuCount = Number(row.cpuBaseline?.count || 0)
  const rssCount = Number(row.rssBaseline?.count || 0)
  const baselineCount = Math.max(cpuCount, rssCount)
  const baselineUnit = clamp01(baselineCount / 6)
  const coveragePct = metric(hostTarget?.resourceCoverage?.pct)
  const coverageUnit = coveragePct === null ? 0.5 : clamp01(coveragePct / 100)
  const skewUnit = skew === 'HIGH' ? 1 : skew === 'MEDIUM' ? 0.72 : 0.4
  const score = Math.round(evidenceUnit * 35 + baselineUnit * 25 + coverageUnit * 20 + skewUnit * 20)
  let grade = score >= 80 ? 'HIGH' : score >= 60 ? 'MEDIUM' : 'LOW'
  // High confidence requires a sufficiently synchronous capture and exact target evidence.
  if (skew === 'LOW' && grade === 'HIGH') grade = 'MEDIUM'
  if (row.targetEvidence !== 'EXACT_TARGET' && grade === 'HIGH') grade = 'MEDIUM'
  if (baselineCount < 3 && grade === 'HIGH') grade = 'MEDIUM'
  return {
    score,
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
  return rows.map((row) => {
    const hostTarget = targetCollection?.byHost?.get?.(row.host) || null
    const scoring = scoreWorkloadV4(row, hostTarget || {})
    const confidence = confidenceFor(row, targetCollection || {}, hostTarget || {})
    const hostMemoryGb = metric(hostTarget?.memoryTotalGb)
    const hostMemoryPct = metric(hostTarget?.memoryPct)
    const hostUsedMemoryGb = hostMemoryGb !== null && hostMemoryPct !== null ? hostMemoryGb * hostMemoryPct / 100 : null
    const maxPidRssUsedRamIndicatorPct = metric(row.targetMaxPidRss) !== null && hostUsedMemoryGb && hostUsedMemoryGb > 0
      ? metric(row.targetMaxPidRss) / hostUsedMemoryGb * 100
      : null
    return {
      ...row,
      incidentScoreV3: row.incidentScore,
      incidentScore: scoring.relevanceScore,
      resourceScore: scoring.relevanceScore,
      causalScore: scoring.causalScore,
      victimScore: scoring.victimScore,
      incidentRole: scoring.role,
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
    ? `DuckDB-WASM v3.3 · parity ${parity.status}${parity.status === 'PASS' ? ` (${parity.compared})` : ''}`
    : `JS fallback v3.3 · DuckDB: ${engineReason}`

  return { ...ranked, rows, engine, engineReason, parity, crossHostConfidence }
}

export const __test = { classifyWorkloadRole, scoreWorkloadV4, confidenceFor, compareSnapshotParity, collectionSkewMinutes, skewGrade }
