import { describe, expect, it } from 'vitest'
import { __test } from '../workloadAnalyticsV4.js'

function baseRow(overrides = {}) {
  return {
    targetEvidence: 'EXACT_TARGET',
    targetConcurrentPids: 1,
    targetDState: 0,
    targetHostPressure: 100,
    cpuContributionPct: 12,
    cpuContributionRawPct: 12,
    cpuUplift: { score: 0.8, z: 4, delta: 20 },
    rssUplift: { score: 0.5, z: 3, delta: 4 },
    errorState: 'NONE',
    cpuBaseline: { count: 10 },
    rssBaseline: { count: 10 },
    records: [{ collectionKey: 'c1', mappingConfidence: 'EXACT', actualTime: '2026-01-15 11:25' }],
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

describe('role-aware incident scoring v3.4', () => {
  it('classifies a low-CPU D-state process as blocked victim instead of automatic culprit', () => {
    const row = baseRow({ targetDState: 1, targetConcurrentPids: 1, cpuContributionPct: 0.3, cpuContributionRawPct: 0.3, cpuUplift: { score: 0, z: 0, delta: 0 }, rssUplift: { score: 1, z: 8, delta: 12 } })
    const scored = __test.scoreWorkloadV4(row, blockedHost)
    expect(scored.role).toBe('BLOCKED_VICTIM')
    expect(scored.victimScore).toBeGreaterThan(scored.causalScore)
  })

  it('classifies a strong valid CPU contributor as resource consumer', () => {
    const row = baseRow({ targetDState: 0, cpuContributionPct: 30, cpuContributionRawPct: 30, cpuUplift: { score: 1, z: 8, delta: 50 }, rssUplift: { score: 0, z: 0, delta: 0 } })
    const scored = __test.scoreWorkloadV4(row, blockedHost)
    expect(scored.role).toBe('RESOURCE_CONSUMER')
    expect(scored.causalScore).toBeGreaterThan(scored.victimScore)
  })

  it('uses ERROR_SIGNAL rather than claiming an error is the root source', () => {
    const row = baseRow({ cpuContributionPct: null, cpuContributionRawPct: null, cpuUplift: { score: 0 }, rssUplift: { score: 0 }, errorState: 'NEW_BEFORE_TARGET' })
    expect(__test.classifyWorkloadRole(row, normalHost)).toBe('ERROR_SIGNAL')
  })

  it('strongly down-weights resource-normal host evidence', () => {
    const row = baseRow({ cpuContributionPct: 30, cpuContributionRawPct: 30, cpuUplift: { score: 1, z: 8, delta: 50 } })
    const crit = __test.scoreWorkloadV4(row, blockedHost)
    const normal = __test.scoreWorkloadV4(row, normalHost)
    expect(crit.causalScore).toBeGreaterThan(normal.causalScore * 3)
  })

  it('rejects physically inconsistent CPU contribution scale', () => {
    const assessment = __test.cpuContributionAssessment(382)
    expect(assessment.valid).toBe(false)
    expect(assessment.status).toBe('INCONSISTENT_SCALE')
  })
})

describe('actual-minute incident alignment', () => {
  const target = { key: 'c1', timeLabel: '2026-01-15 11:25' }

  it('marks an 11:33 host sample as late evidence for an 11:25 landscape incident', () => {
    const timing = __test.targetTimingForRow({ records: [{ collectionKey: 'c1', actualTime: '2026-01-15 11:33' }] }, target)
    expect(timing.evidence).toBe('LATE_TARGET')
    expect(timing.deltaMinutes).toBe(8)
  })

  it('keeps a sample within two minutes as exact evidence', () => {
    const timing = __test.targetTimingForRow({ records: [{ collectionKey: 'c1', actualTime: '2026-01-15 11:26' }] }, target)
    expect(timing.evidence).toBe('EXACT_TARGET')
  })

  it('classifies an error first seen eight minutes later as NEW_AFTER_TARGET', () => {
    const timing = __test.classifyLandscapeErrorTimings([{ errorCode: 'TIME_OUT', actualTime: '2026-01-15 11:33' }], '2026-01-15 11:25', 25)
    expect(timing.state).toBe('NEW_AFTER_TARGET')
    expect(timing.timings[0].deltaMinutes).toBe(8)
  })
})

describe('true incident anchor', () => {
  it('anchors to the actual strongest resource host sample instead of collection start', () => {
    const rca = {
      resourceLandscapePeak: {
        key: 'c1',
        timeLabel: '2026-01-15 11:25',
        rows: [
          { host: 'APP2', timeLabel: '2026-01-15 11:25', resourceSeverity: 'NORMAL', resourcePressure: 20 },
          { host: 'APP1', timeLabel: '2026-01-15 11:33', resourceSeverity: 'CRIT', resourcePressure: 100 },
        ],
      },
    }
    const anchor = __test.deriveIncidentAnchor(rca)
    expect(anchor.host).toBe('APP1')
    expect(anchor.time).toBe('2026-01-15 11:33')
  })
})

describe('dual confidence', () => {
  it('keeps exact local evidence HIGH even when cross-host landscape timing is LOW', () => {
    const collection = {
      key: 'c1',
      rows: [
        { timeLabel: '2026-01-15 11:25' },
        { timeLabel: '2026-01-15 11:33' },
        { timeLabel: '2026-01-15 11:33' },
        { timeLabel: '2026-01-15 11:33' },
        { timeLabel: '2026-01-15 11:33' },
      ],
    }
    const local = __test.localConfidenceFor(baseRow(), collection, blockedHost)
    const landscape = __test.landscapeConfidenceFor(collection, '2026-01-15 11:25')
    expect(local.grade).toBe('HIGH')
    expect(landscape.grade).toBe('LOW')
    expect(landscape.skewMinutes).toBe(8)
  })

  it('caps late local evidence below HIGH', () => {
    const collection = { key: 'c1', rows: [{ timeLabel: '2026-01-15 11:25' }] }
    const local = __test.localConfidenceFor(baseRow({ targetEvidence: 'LATE_TARGET' }), collection, blockedHost)
    expect(local.grade).not.toBe('HIGH')
    expect(local.score).toBeLessThanOrEqual(69)
  })
})

describe('CPU evidence provenance', () => {
  it('does not calculate estimated CPU share when target CPU evidence is unavailable', () => {
    const share = __test.cpuShareFromEvidence({ targetCpu: null }, blockedHost, { deltaMinutes: 0 })
    expect(share.valid).toBe(false)
    expect(share.status).toBe('UNAVAILABLE_TARGET_CPU')
  })

  it('does not calculate estimated CPU share from a host sample eight minutes away', () => {
    const share = __test.cpuShareFromEvidence({ targetCpu: 40 }, blockedHost, { deltaMinutes: 8 })
    expect(share.valid).toBe(false)
    expect(share.status).toBe('TEMPORAL_MISMATCH')
  })
})

describe('RCA verdict / abstention', () => {
  it('abstains when victim evidence dominates a medium-strength top candidate', () => {
    const rows = [
      { workload: 'JOB_A', host: 'APP1', causalScore: 51, incidentScore: 65, victimScore: 70, localConfidence: { grade: 'HIGH' }, incidentRole: 'MIXED', targetEvidence: 'EXACT_TARGET', targetDState: 1 },
      { workload: 'JOB_B', host: 'APP1', causalScore: 48, incidentScore: 55, victimScore: 30, localConfidence: { grade: 'HIGH' }, incidentRole: 'RESOURCE_CONSUMER', targetEvidence: 'EXACT_TARGET', targetDState: 0 },
    ]
    const anchor = { time: '2026-01-15 11:25', host: 'APP1', row: { memoryPct: 99, cpuPct: 75, resourceLoadRatio: 3.43, swapIn: 450 } }
    const verdict = __test.verdictFor(rows, { resourceLandscapePeak: { rows: [anchor.row], timeLabel: anchor.time } }, anchor, { grade: 'LOW', score: 25 })
    expect(verdict.status).toBe('NO_SINGLE_CULPRIT')
    expect(verdict.pattern).toBe('MEMORY_BLOCKING_CONTENTION')
    expect(verdict.reasons).toContain('VICTIM_EVIDENCE_DOMINATES')
  })

  it('supports a single culprit only with strong causal score, high confidence and clear margin', () => {
    const rows = [
      { workload: 'JOB_A', host: 'APP1', causalScore: 82, incidentScore: 85, victimScore: 30, localConfidence: { grade: 'HIGH' }, incidentRole: 'RESOURCE_CONSUMER', targetEvidence: 'EXACT_TARGET', targetDState: 0 },
      { workload: 'JOB_B', host: 'APP1', causalScore: 55, incidentScore: 60, victimScore: 20, localConfidence: { grade: 'HIGH' }, incidentRole: 'BACKGROUND', targetEvidence: 'EXACT_TARGET', targetDState: 0 },
    ]
    const anchor = { time: '2026-01-15 11:25', host: 'APP1', row: { memoryPct: 70, cpuPct: 95, resourceLoadRatio: 2, swapIn: 0 } }
    const verdict = __test.verdictFor(rows, { resourceLandscapePeak: { rows: [anchor.row], timeLabel: anchor.time } }, anchor, { grade: 'HIGH', score: 100 })
    expect(verdict.status).toBe('SINGLE_CULPRIT_SUPPORTED')
  })
})

describe('DuckDB/JS snapshot parity comparator', () => {
  it('passes equivalent aggregate snapshots', () => {
    const js = [{ host: 'APP1', workload: 'JOB', collectionKey: 'c1', cpu: 110, rssGb: 7, maxPidRssGb: 4, concurrentPids: 2, dState: 1 }]
    expect(__test.compareSnapshotParity(js, [{ ...js[0] }]).status).toBe('PASS')
  })

  it('reports a metric mismatch', () => {
    const js = [{ host: 'APP1', workload: 'JOB', collectionKey: 'c1', cpu: 110, rssGb: 7, maxPidRssGb: 4, concurrentPids: 2, dState: 1 }]
    const parity = __test.compareSnapshotParity(js, [{ ...js[0], cpu: 100 }])
    expect(parity.status).toBe('FAIL')
    expect(parity.mismatchCount).toBe(1)
  })
})
