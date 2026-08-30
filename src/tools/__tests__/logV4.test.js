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

describe('role-aware incident scoring v3.3', () => {
  it('classifies a low-CPU D-state process as blocked victim instead of automatic culprit', () => {
    const row = baseRow({ targetDState: 1, targetConcurrentPids: 1, cpuContributionPct: 0.3, cpuUplift: { score: 0, z: 0, delta: 0 }, rssUplift: { score: 1, z: 8, delta: 12 } })
    const scored = __test.scoreWorkloadV4(row, blockedHost)
    expect(scored.role).toBe('BLOCKED_VICTIM')
    expect(scored.victimScore).toBeGreaterThan(scored.causalScore)
  })

  it('classifies a strong CPU contributor as resource consumer', () => {
    const row = baseRow({ targetDState: 0, cpuContributionPct: 18, cpuUplift: { score: 1, z: 8, delta: 50 }, rssUplift: { score: 0, z: 0, delta: 0 } })
    const scored = __test.scoreWorkloadV4(row, blockedHost)
    expect(scored.role).toBe('RESOURCE_CONSUMER')
    expect(scored.causalScore).toBeGreaterThan(scored.victimScore)
  })

  it('does not use persistence or absolute RSS ratio in causal score', () => {
    const a = baseRow({ presenceCount: 30, hostSampleCount: 30, maxPidRssUsedRamIndicatorPct: 90 })
    const b = baseRow({ presenceCount: 1, hostSampleCount: 30, maxPidRssUsedRamIndicatorPct: 5 })
    expect(__test.scoreWorkloadV4(a, blockedHost).causalScore).toBe(__test.scoreWorkloadV4(b, blockedHost).causalScore)
  })
})

describe('incident evidence confidence', () => {
  it('downgrades cross-host confidence when collection skew exceeds five minutes', () => {
    const collection = {
      rows: [
        { timeLabel: '2026-01-15 11:25' },
        { timeLabel: '2026-01-15 11:33' },
      ],
    }
    const confidence = __test.confidenceFor(baseRow(), collection, blockedHost)
    expect(confidence.skewMinutes).toBe(8)
    expect(confidence.skewGrade).toBe('LOW')
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
