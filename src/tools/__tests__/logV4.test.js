import { describe, expect, it } from 'vitest'
import { __test } from '../workloadAnalyticsV4.js'

function baseRow(overrides = {}) {
  return {
    targetEvidence: 'EXACT_TARGET',
    targetConcurrentPids: 1,
    targetDState: 0,
    targetHostPressure: 100,
    cpuContributionPct: 12,
    cpuUplift: { score: 0.8, z: 4, delta: 20 },
    rssUplift: { score: 0.5, z: 3, delta: 4 },
    errorState: 'NONE',
    cpuBaseline: { count: 10 },
    rssBaseline: { count: 10 },
    ...overrides,
  }
}

const blockedHost = {
  resourceSeverity: 'CRIT',
  resourcePressure: 100,
  resourceCoverage: { observed: 4, total: 4, pct: 100 },
  load1: 48,
  vcpu: 8,
  resourceLoadRatio: 6,
  swapIn: 500,
  cpuPct: 70,
  memoryPct: 95,
}

const normalHost = {
  ...blockedHost,
  resourceSeverity: 'NORMAL',
  resourcePressure: 20,
  load1: 1,
  resourceLoadRatio: 0.12,
  swapIn: 0,
  cpuPct: 4,
  memoryPct: 40,
}

describe('role-aware incident scoring v3.3.1', () => {
  it('classifies a low-CPU D-state process as blocked victim instead of automatic culprit', () => {
    const row = baseRow({ targetDState: 1, targetConcurrentPids: 1, cpuContributionPct: 0.3, cpuUplift: { score: 0, z: 0, delta: 0 }, rssUplift: { score: 1, z: 8, delta: 12 } })
    const scored = __test.scoreWorkloadV4(row, blockedHost)
    expect(scored.role).toBe('BLOCKED_VICTIM')
    expect(scored.victimScore).toBeGreaterThan(scored.causalScore)
  })

  it('classifies a strong valid CPU contributor as resource consumer', () => {
    const row = baseRow({ targetDState: 0, cpuContributionPct: 30, cpuUplift: { score: 1, z: 8, delta: 50 }, rssUplift: { score: 0, z: 0, delta: 0 } })
    const scored = __test.scoreWorkloadV4(row, blockedHost)
    expect(scored.role).toBe('RESOURCE_CONSUMER')
    expect(scored.causalScore).toBeGreaterThan(scored.victimScore)
  })

  it('does not use persistence or absolute RSS ratio in causal score', () => {
    const a = baseRow({ presenceCount: 30, hostSampleCount: 30, maxPidRssUsedRamIndicatorPct: 90 })
    const b = baseRow({ presenceCount: 1, hostSampleCount: 30, maxPidRssUsedRamIndicatorPct: 5 })
    expect(__test.scoreWorkloadV4(a, blockedHost).causalScore).toBe(__test.scoreWorkloadV4(b, blockedHost).causalScore)
  })

  it('strongly down-weights a resource-normal host for the same workload evidence', () => {
    const row = baseRow({ cpuContributionPct: 30, cpuUplift: { score: 1, z: 8, delta: 50 } })
    const crit = __test.scoreWorkloadV4(row, blockedHost)
    const normal = __test.scoreWorkloadV4(row, normalHost)
    expect(crit.causalScore).toBeGreaterThan(normal.causalScore * 3)
    expect(__test.hostSeverityWeight(normalHost)).toBe(0.2)
  })

  it('rejects physically inconsistent CPU contribution scale from positive consumer evidence', () => {
    const assessment = __test.cpuContributionAssessment(382)
    expect(assessment.valid).toBe(false)
    expect(assessment.status).toBe('INCONSISTENT_SCALE')
    const invalid = __test.scoreWorkloadV4(baseRow({ cpuContributionPct: 382, cpuUplift: { score: 0, z: 0, delta: 0 }, rssUplift: { score: 0, z: 0, delta: 0 } }), blockedHost)
    const valid = __test.scoreWorkloadV4(baseRow({ cpuContributionPct: 30, cpuUplift: { score: 0, z: 0, delta: 0 }, rssUplift: { score: 0, z: 0, delta: 0 } }), blockedHost)
    expect(valid.causalScore).toBeGreaterThan(invalid.causalScore)
  })
})

describe('actual-minute incident alignment', () => {
  const target = { key: 'c1', timeLabel: '2026-01-15 11:25' }

  it('marks an 11:33 host sample as late evidence for an 11:25 landscape incident', () => {
    const timing = __test.targetTimingForRow({
      targetTime: '2026-01-15 11:33',
      records: [{ collectionKey: 'c1', actualTime: '2026-01-15 11:33' }],
    }, target)
    expect(timing.evidence).toBe('LATE_TARGET')
    expect(timing.deltaMinutes).toBe(8)
    expect(timing.temporalWeight).toBeLessThan(0.5)
  })

  it('keeps a sample within two minutes as exact evidence', () => {
    const timing = __test.targetTimingForRow({ records: [{ collectionKey: 'c1', actualTime: '2026-01-15 11:26' }] }, target)
    expect(timing.evidence).toBe('EXACT_TARGET')
    expect(timing.deltaMinutes).toBe(1)
  })

  it('classifies an error first seen eight minutes later as NEW_AFTER_TARGET', () => {
    const timing = __test.classifyLandscapeErrorTimings([
      { errorCode: 'TIME_OUT', actualTime: '2026-01-15 11:33' },
    ], '2026-01-15 11:25', 25)
    expect(timing.state).toBe('NEW_AFTER_TARGET')
    expect(timing.timings[0].deltaMinutes).toBe(8)
  })
})

describe('incident evidence confidence', () => {
  it('caps numeric confidence below HIGH when collection skew exceeds five minutes', () => {
    const collection = {
      rows: [
        { timeLabel: '2026-01-15 11:25' },
        { timeLabel: '2026-01-15 11:33' },
      ],
    }
    const confidence = __test.confidenceFor(baseRow(), collection, blockedHost)
    expect(confidence.skewMinutes).toBe(8)
    expect(confidence.skewGrade).toBe('LOW')
    expect(confidence.grade).toBe('MEDIUM')
    expect(confidence.score).toBeLessThan(80)
  })

  it('caps late evidence confidence even with rich baseline and coverage', () => {
    const collection = { rows: [{ timeLabel: '2026-01-15 11:25' }, { timeLabel: '2026-01-15 11:33' }] }
    const confidence = __test.confidenceFor(baseRow({ targetEvidence: 'LATE_TARGET' }), collection, blockedHost)
    expect(confidence.score).toBeLessThanOrEqual(69)
    expect(confidence.grade).not.toBe('HIGH')
  })

  it('gives high confidence to exact evidence with sufficient baseline, coverage and low skew', () => {
    const collection = { rows: [{ timeLabel: '2026-01-15 11:25' }, { timeLabel: '2026-01-15 11:26' }] }
    const confidence = __test.confidenceFor(baseRow(), collection, blockedHost)
    expect(confidence.grade).toBe('HIGH')
  })
})

describe('DuckDB/JS snapshot parity comparator', () => {
  it('passes equivalent aggregate snapshots', () => {
    const js = [{ host: 'APP1', workload: 'JOB', collectionKey: 'c1', cpu: 110, rssGb: 7, maxPidRssGb: 4, concurrentPids: 2, dState: 1 }]
    const engine = [{ ...js[0] }]
    expect(__test.compareSnapshotParity(js, engine).status).toBe('PASS')
  })

  it('reports a metric mismatch', () => {
    const js = [{ host: 'APP1', workload: 'JOB', collectionKey: 'c1', cpu: 110, rssGb: 7, maxPidRssGb: 4, concurrentPids: 2, dState: 1 }]
    const engine = [{ ...js[0], cpu: 100 }]
    const parity = __test.compareSnapshotParity(js, engine)
    expect(parity.status).toBe('FAIL')
    expect(parity.mismatchCount).toBe(1)
  })
})
