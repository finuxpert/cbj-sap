const metric = (value) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value) || 0))
const clamp01 = (value) => clamp(value, 0, 1)

const ERROR_RULES = [
  { rx: /TSV_TNEW_PAGE_ALLOC_FAILED|SYSTEM_NO_ROLL|SYSTEM_NO_TASK_STORAGE|MEMORY[_ -]?(ALLOC|NO_MORE)|OUT_OF_MEMORY/i, category: 'MEMORY_ALLOCATION', causalClass: 'CAUSAL_CAPABLE' },
  { rx: /DBSQL_SQL_DEADLOCK|SQL_DEADLOCK|DEADLOCK/i, category: 'DB_CONCURRENCY', causalClass: 'CAUSAL_CAPABLE' },
  { rx: /DBSQL_DUPLICATE_KEY|DUPLICATE_KEY/i, category: 'DB_CONSTRAINT', causalClass: 'SUPPORTING' },
  { rx: /DBSQL_SQL_ERROR|SQL_ERROR|DBIF_RSQL/i, category: 'DATABASE', causalClass: 'SUPPORTING' },
  { rx: /TIME_OUT|TIMEOUT/i, category: 'TIMEOUT', causalClass: 'SYMPTOM_LIKELY' },
  { rx: /CALL_FUNCTION_SEND_ERROR|CALL_FUNCTION_REMOTE_ERROR|RFC|COMMUNICATION|CONNECTION|ICM|NI_/i, category: 'RFC_NETWORK', causalClass: 'SYMPTOM_LIKELY' },
  { rx: /RAISE_EXCEPTION|ASSERTION_FAILED|MESSAGE_TYPE_X|SYSTEM_CORE_DUMPED/i, category: 'APPLICATION_EXCEPTION', causalClass: 'SUPPORTING' },
  { rx: /STRING_SIZE_TOO_LARGE|CONVT_|MOVE_TO_LIT_NOTALLOWED_NODATA/i, category: 'ABAP_DATA', causalClass: 'SUPPORTING' },
  { rx: /IMPORT_WRONG_END_POS|EXPORT_TOO_MUCH_DATA/i, category: 'ABAP_SERIALIZATION', causalClass: 'SUPPORTING' },
]

export function classifyErrorCode(errorCode = '') {
  const code = String(errorCode || '').trim()
  if (!code || code === '?') return { code, category: 'NONE', causalClass: 'NONE' }
  const rule = ERROR_RULES.find((item) => item.rx.test(code))
  return rule ? { code, category: rule.category, causalClass: rule.causalClass } : { code, category: 'OTHER', causalClass: 'UNKNOWN' }
}

function timingForError(row = {}, code = '') {
  const match = (row.errorTimings || []).find((item) => String(item.error || '') === String(code || ''))
  return match || { error: code, state: 'NONE', deltaMinutes: null, firstTime: '' }
}

export function errorTaxonomyForRow(row = {}) {
  const errors = Array.from(new Set([...(row.errors || []), ...(row.errorTimings || []).map((item) => item.error)].filter(Boolean)))
  const rank = { NONE: 0, UNKNOWN: 1, SYMPTOM_LIKELY: 2, SUPPORTING: 3, CAUSAL_CAPABLE: 4 }
  const classified = errors.map((code) => ({ ...classifyErrorCode(code), timing: timingForError(row, code) }))
  const strongest = classified.reduce((best, item) => rank[item.causalClass] > rank[best.causalClass] ? item : best, { code: '', category: 'NONE', causalClass: 'NONE', timing: { state: 'NONE', deltaMinutes: null } })
  const precursor = classified
    .filter((item) => item.causalClass === 'CAUSAL_CAPABLE' && ['NEW_BEFORE_TARGET', 'NEW_AT_TARGET'].includes(item.timing?.state))
    .sort((a, b) => Math.abs(a.timing?.deltaMinutes ?? 9999) - Math.abs(b.timing?.deltaMinutes ?? 9999))[0] || null
  let direction = 'CONTEXT'
  if (precursor) direction = 'POTENTIAL_PRECURSOR'
  else if (strongest.causalClass === 'SYMPTOM_LIKELY' || strongest.timing?.state === 'NEW_AFTER_TARGET') direction = 'LIKELY_SYMPTOM'
  else if (strongest.causalClass === 'SUPPORTING') direction = 'SUPPORTING_SIGNAL'
  return { classified, strongest, precursor, direction }
}

function hostSignal(anchor = {}) {
  const row = anchor.row || {}
  const cpu = metric(row.cpuPct)
  const ram = metric(row.memoryPct)
  const load = metric(row.resourceLoadRatio)
  const swapIn = metric(row.swapIn)
  const hostEnhancedUsable = row.enhancedDeltaMinutes === null || row.enhancedDeltaMinutes === undefined || Math.abs(Number(row.enhancedDeltaMinutes)) <= 2
  const iowait = hostEnhancedUsable ? metric(row.iowaitPct) : null
  const psiCpuSome = hostEnhancedUsable ? metric(row.psiCpuSome10) : null
  const psiCpuFull = hostEnhancedUsable ? metric(row.psiCpuFull10) : null
  const psiMemSome = hostEnhancedUsable ? metric(row.psiMemorySome10) : null
  const psiMemFull = hostEnhancedUsable ? metric(row.psiMemoryFull10) : null
  const psiIoSome = hostEnhancedUsable ? metric(row.psiIoSome10) : null
  const psiIoFull = hostEnhancedUsable ? metric(row.psiIoFull10) : null
  return {
    cpu, ram, load, swapIn, iowait, psiCpuSome, psiCpuFull, psiMemSome, psiMemFull, psiIoSome, psiIoFull,
    cpuPressure: cpu !== null && cpu >= 90,
    memoryPressure: ram !== null && ram >= 85,
    loadPressure: load !== null && load >= 1.5,
    swapPressure: swapIn !== null && swapIn >= 100,
    ioPressure: (iowait !== null && iowait >= 10) || (psiIoSome !== null && psiIoSome >= 5) || (psiIoFull !== null && psiIoFull >= 1),
    memoryStall: (psiMemSome !== null && psiMemSome >= 5) || (psiMemFull !== null && psiMemFull >= 1),
    cpuStall: (psiCpuSome !== null && psiCpuSome >= 10) || (psiCpuFull !== null && psiCpuFull >= 1),
  }
}

export function incidentPatternV14(anchor = {}, rows = [], fallback = 'RESOURCE_CONTENTION') {
  const host = hostSignal(anchor)
  const targetRows = rows.filter((row) => ['EXACT_TARGET', 'NEAR_TARGET'].includes(row.targetEvidence))
  const hasWchan = (name) => targetRows.some((row) => row.enhancedEvidenceUsable && row.wchanClass === name)
  const hasD = targetRows.some((row) => Number(row.targetDState || 0) > 0)
  const highIoConsumer = targetRows.some((row) => row.enhancedEvidenceUsable && (metric(row.targetReadMiBps) || 0) + (metric(row.targetWriteMiBps) || 0) >= 20)
  const pssSpike = targetRows.some((row) => row.enhancedEvidenceUsable && (row.pssUplift?.score || 0) >= 0.5)

  if (hasWchan('NFS') && (host.ioPressure || host.loadPressure || hasD)) return 'NFS_IO_CONTENTION'
  if (hasWchan('MEMORY_RECLAIM') && (host.memoryPressure || host.memoryStall || host.swapPressure)) return 'MEMORY_RECLAIM_STALL'
  if (hasWchan('BLOCK_IO') && (host.ioPressure || host.loadPressure || highIoConsumer)) return 'BLOCK_IO_CONTENTION'
  if (host.memoryPressure && host.memoryStall && host.swapPressure) return 'MEMORY_RECLAIM_STALL'
  if (host.memoryPressure && host.ioPressure) return 'MEMORY_IO_CONTENTION'
  if (host.cpuPressure && (host.cpuStall || host.loadPressure)) return 'CPU_SATURATION'
  if (host.ioPressure && (hasD || highIoConsumer)) return 'IO_STALL_CONTENTION'
  if (host.memoryPressure && (pssSpike || host.swapPressure || hasD)) return 'MEMORY_BLOCKING_CONTENTION'
  if (host.memoryPressure) return 'MEMORY_PRESSURE'
  if (host.cpuPressure) return 'CPU_PRESSURE'
  return fallback || 'RESOURCE_CONTENTION'
}

function pssCausalUnit(row = {}, anchor = {}) {
  if (!row.enhancedEvidenceUsable) return 0
  const host = hostSignal(anchor)
  if (!host.memoryPressure) return 0
  const target = metric(row.targetPssGb)
  return target === null ? 0 : clamp01(row.pssUplift?.score || 0)
}

function ioCausalUnit(row = {}, anchor = {}) {
  if (!row.enhancedEvidenceUsable) return 0
  const host = hostSignal(anchor)
  if (!host.ioPressure) return 0
  const io = (metric(row.targetReadMiBps) || 0) + (metric(row.targetWriteMiBps) || 0)
  return clamp01(io / 50)
}

function enhancedBlockingUnit(row = {}, anchor = {}) {
  if (!row.enhancedEvidenceUsable) return 0
  const host = hostSignal(anchor)
  const blockedClass = ['NFS', 'BLOCK_IO', 'MEMORY_RECLAIM', 'LOCK', 'NETWORK'].includes(row.wchanClass)
  if (!blockedClass) return 0
  const hostStress = host.ioPressure || host.memoryStall || host.loadPressure || host.memoryPressure
  return hostStress ? 1 : 0.5
}

export function refineWorkloadV14(row = {}, anchor = {}, capabilities = {}) {
  const taxonomy = errorTaxonomyForRow(row)
  const telemetryMode = capabilities.mode || 'LEGACY'
  const rowEnhanced = telemetryMode !== 'LEGACY' && !!row.enhancedEvidenceUsable
  const pss = rowEnhanced ? pssCausalUnit(row, anchor) : 0
  const io = rowEnhanced ? ioCausalUnit(row, anchor) : 0
  const blocked = rowEnhanced ? enhancedBlockingUnit(row, anchor) : 0
  const temporalGood = ['EXACT_TARGET', 'NEAR_TARGET'].includes(row.targetEvidence)
  const errorSupport = taxonomy.precursor && row.localConfidence?.grade === 'HIGH' ? 1 : 0

  let causalScore = Number(row.causalScore || 0)
  let victimScore = Number(row.victimScore || 0)
  let role = row.incidentRole || 'BACKGROUND'

  if (rowEnhanced) {
    causalScore += pss * 15
    causalScore += io * 15
    victimScore += blocked * 15
    if (blocked >= 0.7 && Math.max(pss, io) < 0.45) role = 'BLOCKED_VICTIM'
    else if (io >= 0.55 && blocked < 0.55) role = 'IO_CONSUMER'
    else if (pss >= 0.55 && blocked < 0.55) role = 'MEMORY_CONSUMER'
    else if ((io >= 0.4 || pss >= 0.4) && blocked >= 0.45) role = 'MIXED'
  }

  if (errorSupport) causalScore += 8
  if (!rowEnhanced && taxonomy.strongest.causalClass !== 'NONE' && ['ERROR_SIGNAL', 'BACKGROUND'].includes(role)) role = 'ERROR_SIGNAL'
  if (!temporalGood) {
    causalScore *= 0.75
    if (rowEnhanced) victimScore *= 0.85
  }

  const relevanceScore = clamp(Math.max(Number(row.incidentScore || 0), causalScore, victimScore * 0.85))
  return {
    ...row,
    causalScore: Math.round(clamp(causalScore)),
    victimScore: Math.round(clamp(victimScore)),
    incidentScore: Math.round(relevanceScore),
    resourceScore: Math.round(relevanceScore),
    incidentRole: role,
    errorTaxonomy: taxonomy,
    telemetrySignalsV14: {
      pssCausal: Math.round(pss * 100),
      ioCausal: Math.round(io * 100),
      blockedVictim: Math.round(blocked * 100),
      errorCausalSupport: Math.round(errorSupport * 100),
    },
  }
}

export function verdictV14(rows = [], baseVerdict = {}, anchor = {}, capabilities = {}) {
  const ordered = [...rows].sort((a, b) => b.causalScore - a.causalScore || b.incidentScore - a.incidentScore)
  const top = ordered[0] || null
  const second = ordered[1] || null
  const margin = top ? Number(top.causalScore || 0) - Number(second?.causalScore || 0) : 0
  const localGrade = top?.localConfidence?.grade || 'LOW'
  const victimDominant = !!top && Number(top.victimScore || 0) > Number(top.causalScore || 0)
  const causalRole = !!top && ['RESOURCE_CONSUMER', 'MEMORY_CONSUMER', 'IO_CONSUMER', 'MIXED'].includes(top.incidentRole)
  const temporalGood = !!top && ['EXACT_TARGET', 'NEAR_TARGET'].includes(top.targetEvidence)
  const topEnhancedUsable = !!top?.enhancedEvidenceUsable
  const threshold = capabilities.mode === 'ENHANCED' && topEnhancedUsable ? 65 : 70
  const singleSupported = !!top && Number(top.causalScore || 0) >= threshold && localGrade === 'HIGH' && !victimDominant && margin >= 10 && causalRole && temporalGood
  const reasons = []
  if (!top) reasons.push('NO_CANDIDATE')
  else {
    if (Number(top.causalScore || 0) < threshold) reasons.push(`CAUSAL_SCORE_BELOW_${threshold}`)
    if (localGrade !== 'HIGH') reasons.push('LOCAL_CONFIDENCE_NOT_HIGH')
    if (victimDominant) reasons.push('VICTIM_EVIDENCE_DOMINATES')
    if (margin < 10) reasons.push('TOP_CANDIDATE_MARGIN_LT_10')
    if (!causalRole) reasons.push('TOP_ROLE_NOT_CAUSAL_CONSUMER')
    if (!temporalGood) reasons.push('TARGET_TIMING_NOT_EXACT_OR_NEAR')
    if (capabilities.mode === 'PARTIAL') reasons.push('ENHANCED_TELEMETRY_PARTIAL')
  }
  const pattern = incidentPatternV14(anchor, rows, baseVerdict.pattern)
  return {
    ...baseVerdict,
    status: singleSupported ? 'SINGLE_CULPRIT_SUPPORTED' : 'NO_SINGLE_CULPRIT',
    pattern,
    patternVersion: 'v2.1',
    topWorkload: top?.workload || '',
    topHost: top?.host || '',
    topCausalScore: Number(top?.causalScore || 0),
    topVictimScore: Number(top?.victimScore || 0),
    topLocalConfidence: localGrade,
    topRole: top?.incidentRole || '',
    margin,
    telemetryMode: capabilities.mode || 'LEGACY',
    reasons,
    interpretation: singleSupported
      ? 'One workload has a clear causal lead with high-quality incident evidence.'
      : 'No dominant initiating workload is confirmed by the available evidence.',
  }
}

export const __test = {
  hostSignal,
  pssCausalUnit,
  ioCausalUnit,
  enhancedBlockingUnit,
  timingForError,
}
