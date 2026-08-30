import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { buildAutoPeakRcaV3 } from '../logRcaEngineV3.js'
import { validateEvidenceAnalysisV3 } from '../evidenceSchemaV3.js'
import { __test } from '../workloadAnalyticsV3.js'

function telemetryRow({ fileName, host, minute, cpuPct = 10, memoryPct = 20 }) {
  const hh = String(2 + Math.floor(minute / 60)).padStart(2, '0')
  const mm = String(minute % 60).padStart(2, '0')
  const time = `2026-01-15 ${hh}:${mm}`
  return { fileName, snapshot: time, timeLabel: time, sortKey: minute, host, vcpu: 8, cpuPct, memoryPct, memoryTotalGb: 64, loadRatio: 0.1, swapIn: 0, wpCritical: 0 }
}

describe('logical collection model', () => {
  it('groups 30 files x 5 sequential host samples into 30 collections x 5 hosts', () => {
    const telemetry = []
    for (let file = 0; file < 30; file += 1) {
      for (let host = 1; host <= 5; host += 1) telemetry.push(telemetryRow({ fileName: `f${file}.log`, host: `APP${host}`, minute: file * 20 + host - 1 }))
    }
    const rca = buildAutoPeakRcaV3({ telemetry })
    expect(rca.collections).toHaveLength(30)
    expect(rca.collections.every((row) => row.hostCount === 5)).toBe(true)
  })

  it('starts a new cycle when a host repeats inside one source file', () => {
    const telemetry = [
      telemetryRow({ fileName: 'combined.log', host: 'APP1', minute: 0 }),
      telemetryRow({ fileName: 'combined.log', host: 'APP2', minute: 1 }),
      telemetryRow({ fileName: 'combined.log', host: 'APP1', minute: 20 }),
      telemetryRow({ fileName: 'combined.log', host: 'APP2', minute: 21 }),
    ]
    const rca = buildAutoPeakRcaV3({ telemetry })
    expect(rca.collections).toHaveLength(2)
    expect(rca.collections.map((row) => row.hostCount)).toEqual([2, 2])
  })
})

describe('schema and null semantics', () => {
  it('keeps absent telemetry metrics null rather than zero', () => {
    const validated = validateEvidenceAnalysisV3({ telemetry: [{ fileName: 'a.log', snapshot: '2026-01-15 02:00', timeLabel: '2026-01-15 02:00', host: 'APP1', cpuPct: null, memoryPct: 25 }], processes: [] })
    expect(validated.quality.telemetryRejected).toBe(0)
    expect(validated.analysis.telemetry[0].cpuPct).toBeNull()
    expect(validated.analysis.telemetry[0].memoryPct).toBe(25)
  })

  it('property: aggregate CPU is null when every PID CPU is unknown, otherwise exact sum', () => {
    fc.assert(fc.property(fc.array(fc.option(fc.integer({ min: 0, max: 400 }), { nil: null }), { minLength: 1, maxLength: 20 }), (values) => {
      const rows = values.map((cpu, index) => ({ host: 'APP1', workload: 'JOB_A', collectionKey: 'c1', collectionIndex: 0, collectionTime: '2026-01-15 02:00', pid: String(index + 1), cpu, rssGb: null, state: 'S', errorCode: '?' }))
      const sample = __test.aggregateSnapshotsJs(rows)[0]
      const observed = values.filter((value) => value !== null)
      expect(sample.cpu).toBe(observed.length ? observed.reduce((sum, value) => sum + value, 0) : null)
      expect(sample.rssGb).toBeNull()
      expect(sample.concurrentPids).toBe(values.length)
    }))
  })
})

describe('workload aggregation consistency', () => {
  it('sums concurrent PID CPU/RSS and uses peak concurrent PID count', () => {
    const rows = [
      { host: 'APP1', workload: 'JOB_A', collectionKey: 'c1', collectionIndex: 0, collectionTime: '2026-01-15 02:00', pid: '101', cpu: 60, rssGb: 4, state: 'S', errorCode: '?' },
      { host: 'APP1', workload: 'JOB_A', collectionKey: 'c1', collectionIndex: 0, collectionTime: '2026-01-15 02:00', pid: '102', cpu: 50, rssGb: 3, state: 'S', errorCode: '?' },
    ]
    const snapshots = __test.aggregateSnapshotsJs(rows)
    expect(snapshots[0].cpu).toBe(110)
    expect(snapshots[0].rssGb).toBe(7)
    expect(snapshots[0].concurrentPids).toBe(2)

    const rca = { collections: [{ key: 'c1' }], hostPeaks: [{ host: 'APP1', sampleCount: 1, peakCollectionIndex: 0, peakCollectionKey: 'c1', peakTime: '2026-01-15 02:00', resourcePeak: { memoryTotalGb: 64, vcpu: 8 } }] }
    const ranked = __test.buildWindowRows(snapshots, rows, rca)
    expect(ranked[0].peakCpu).toBe(110)
    expect(ranked[0].peakRss).toBe(7)
    expect(ranked[0].peakConcurrentPids).toBe(2)
    expect(ranked[0].uniquePidCount).toBe(2)
    expect(ranked[0].peakCorrelation).toBe(100)
  })
})
