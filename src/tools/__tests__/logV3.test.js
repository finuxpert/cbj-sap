import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { buildAutoPeakRcaV3 } from '../logRcaEngineV3.js'
import { validateEvidenceAnalysisV3 } from '../evidenceSchemaV3.js'
import { __test } from '../workloadAnalyticsV3.js'

function telemetryRow({ fileName, host, minute, cpuPct = 10, memoryPct = 20, wpCritical = 0, loadRatio = 0.1, swapIn = 0 }) {
  const hh = String(2 + Math.floor(minute / 60)).padStart(2, '0')
  const mm = String(minute % 60).padStart(2, '0')
  const time = `2026-01-15 ${hh}:${mm}`
  return { fileName, snapshot: time, timeLabel: time, sortKey: minute, host, vcpu: 8, cpuPct, memoryPct, memoryTotalGb: 64, loadRatio, swapIn, wpCritical }
}

function workloadSample({ index, cpu = null, rssGb = null, maxPidRssGb = null, errors = [], pids = 1, dState = 0 }) {
  const minute = index * 20
  const hh = String(2 + Math.floor(minute / 60)).padStart(2, '0')
  const mm = String(minute % 60).padStart(2, '0')
  return {
    host: 'APP1', workload: 'JOB_A', collectionKey: `c${index}`, collectionIndex: index,
    collectionTime: `2026-01-15 ${hh}:${mm}`, cpu, rssGb, maxPidRssGb, concurrentPids: pids, dState, errors,
    program: 'ZPROG', type: 'BTC', rawCount: pids,
  }
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
    expect(rca.validatedAnalysis.telemetry).toHaveLength(150)
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
      expect(sample.maxPidRssGb).toBeNull()
      expect(sample.concurrentPids).toBe(values.length)
    }))
  })
})

describe('bounded process-to-collection mapping', () => {
  it('classifies exact, <=2m, <=5m, and rejects farther evidence', () => {
    const rca = {
      collections: [{
        key: 'c0', fileName: 'f.log', timeLabel: '2026-01-15 02:00',
        rows: [{ fileName: 'f.log', host: 'APP1', snapshot: '2026-01-15 02:00', timeLabel: '2026-01-15 02:00' }],
      }],
    }
    const process = (time, pid) => ({ fileName: 'f.log', host: 'APP1', snapshot: time, timeLabel: time, pid, program: 'ZPROG' })
    const attached = __test.attachCollections([
      process('2026-01-15 02:00', '1'),
      process('2026-01-15 02:02', '2'),
      process('2026-01-15 02:05', '3'),
      process('2026-01-15 02:06', '4'),
    ], rca)
    expect(attached.map((row) => row.mappingConfidence)).toEqual(['EXACT', 'NEAREST_2M', 'NEAREST_5M', 'UNMAPPED'])
    expect(attached.map((row) => row.collectionIndex)).toEqual([0, 0, 0, -1])
    expect(__test.mappingCounts(attached)).toEqual({ EXACT: 1, NEAREST_2M: 1, NEAREST_5M: 1, UNMAPPED: 1 })
  })
})

describe('resource vs operational peaks and sustained pressure', () => {
  it('keeps WP-only operational peak separate from resource landscape peak', () => {
    const telemetry = []
    for (let host = 1; host <= 5; host += 1) telemetry.push(telemetryRow({ fileName: 'wp.log', host: `APP${host}`, minute: host - 1, wpCritical: 5 }))
    for (let host = 1; host <= 5; host += 1) telemetry.push(telemetryRow({ fileName: 'resource.log', host: `APP${host}`, minute: 20 + host - 1, cpuPct: host === 1 ? 80 : 10 }))
    const rca = buildAutoPeakRcaV3({ telemetry })
    expect(rca.resourceLandscapePeak.fileName).toBe('resource.log')
    expect(rca.operationalLandscapePeak.fileName).toBe('wp.log')
  })

  it('measures the strongest consecutive resource-elevated run', () => {
    const telemetry = [
      telemetryRow({ fileName: 'f0.log', host: 'APP1', minute: 0, cpuPct: 80 }),
      telemetryRow({ fileName: 'f1.log', host: 'APP1', minute: 20, cpuPct: 82 }),
      telemetryRow({ fileName: 'f2.log', host: 'APP1', minute: 40, cpuPct: 84 }),
      telemetryRow({ fileName: 'f3.log', host: 'APP1', minute: 60, cpuPct: 10 }),
    ]
    const rca = buildAutoPeakRcaV3({ telemetry })
    const host = rca.hostPeaks[0]
    expect(rca.cadence.nominalMinutes).toBe(20)
    expect(host.sustained.sustainedSamples).toBe(3)
    expect(host.sustained.sustainedMinutes).toBe(40)
    expect(host.sustained.sustainedScore).toBeGreaterThan(0)
    expect(host.sustained.pressureAuc).toBeGreaterThan(0)
  })
})

describe('workload aggregation consistency', () => {
  it('sums concurrent PID CPU/RSS, preserves max PID RSS, and uses peak concurrent PID count', () => {
    const rows = [
      { host: 'APP1', workload: 'JOB_A', collectionKey: 'c1', collectionIndex: 0, collectionTime: '2026-01-15 02:00', pid: '101', cpu: 60, rssGb: 4, state: 'S', errorCode: '?' },
      { host: 'APP1', workload: 'JOB_A', collectionKey: 'c1', collectionIndex: 0, collectionTime: '2026-01-15 02:00', pid: '102', cpu: 50, rssGb: 3, state: 'S', errorCode: '?' },
    ]
    const snapshots = __test.aggregateSnapshotsJs(rows)
    expect(snapshots[0].cpu).toBe(110)
    expect(snapshots[0].rssGb).toBe(7)
    expect(snapshots[0].maxPidRssGb).toBe(4)
    expect(snapshots[0].concurrentPids).toBe(2)

    const rca = { collections: [{ key: 'c1' }], hostPeaks: [{ host: 'APP1', sampleCount: 1, peakCollectionIndex: 0, peakCollectionKey: 'c1', peakTime: '2026-01-15 02:00', resourcePeak: { memoryTotalGb: 64, vcpu: 8 } }] }
    const ranked = __test.buildWindowRows(snapshots, rows, rca)
    expect(ranked[0].peakCpu).toBe(110)
    expect(ranked[0].peakRss).toBe(7)
    expect(ranked[0].peakMaxPidRss).toBe(4)
    expect(ranked[0].peakConcurrentPids).toBe(2)
    expect(ranked[0].uniquePidCount).toBe(2)
    expect(ranked[0].peakCorrelation).toBe(100)
  })

  it('does not let ΣRSS fan-out dominate the primary memory signal', () => {
    const fanoutRaw = Array.from({ length: 10 }, (_, index) => ({ host: 'APP1', workload: 'FANOUT', collectionKey: 'c0', collectionIndex: 0, collectionTime: '2026-01-15 02:00', pid: String(index), cpu: 0, rssGb: 2, state: 'S', errorCode: '?' }))
    const singleRaw = [{ host: 'APP1', workload: 'SINGLE', collectionKey: 'c0', collectionIndex: 0, collectionTime: '2026-01-15 02:00', pid: '99', cpu: 0, rssGb: 20, state: 'S', errorCode: '?' }]
    const raw = [...fanoutRaw, ...singleRaw]
    const snapshots = __test.aggregateSnapshotsJs(raw)
    const rca = { collections: [{ key: 'c0' }], hostPeaks: [{ host: 'APP1', sampleCount: 1, peakCollectionIndex: 0, peakCollectionKey: 'c0', peakTime: '2026-01-15 02:00', resourcePeak: { memoryTotalGb: 64, vcpu: 8 } }] }
    const ranked = __test.buildWindowRows(snapshots, raw, rca)
    const fanout = ranked.find((row) => row.workload === 'FANOUT')
    const single = ranked.find((row) => row.workload === 'SINGLE')
    expect(fanout.peakRss).toBe(20)
    expect(fanout.peakMaxPidRss).toBe(2)
    expect(single.peakRss).toBe(20)
    expect(single.peakMaxPidRss).toBe(20)
    expect(single.resourceScore).toBeGreaterThan(fanout.resourceScore)
  })

  it('returns N/A alignment when no resource alignment signal exists', () => {
    const samples = [workloadSample({ index: 0 }), workloadSample({ index: 1 })]
    const rca = { collections: [{ key: 'c0' }, { key: 'c1' }], hostPeaks: [{ host: 'APP1', sampleCount: 2, peakCollectionIndex: 1, peakCollectionKey: 'c1', peakTime: '2026-01-15 02:20', resourcePeak: { memoryTotalGb: 64, vcpu: 8 } }] }
    const ranked = __test.buildWindowRows(samples, [], rca)
    expect(ranked[0].peakCorrelation).toBeNull()
  })
})

describe('error timing relative to host resource peak', () => {
  it('distinguishes before, exact, and after peak first occurrence', () => {
    const samples = [
      workloadSample({ index: 0, cpu: 10, rssGb: 1, maxPidRssGb: 1, errors: ['ERR_BEFORE'] }),
      workloadSample({ index: 1, cpu: 20, rssGb: 2, maxPidRssGb: 2, errors: ['ERR_AT'] }),
      workloadSample({ index: 2, cpu: 10, rssGb: 1, maxPidRssGb: 1, errors: ['ERR_AFTER'] }),
    ]
    const rca = { collections: [{ key: 'c0' }, { key: 'c1' }, { key: 'c2' }], hostPeaks: [{ host: 'APP1', sampleCount: 3, peakCollectionIndex: 1, peakCollectionKey: 'c1', peakTime: '2026-01-15 02:20', resourcePeak: { memoryTotalGb: 64, vcpu: 8 } }] }
    const ranked = __test.buildWindowRows(samples, [], rca)[0]
    const states = Object.fromEntries(ranked.errorTimings.map((item) => [item.error, item.state]))
    expect(states.ERR_BEFORE).toBe('NEW_BEFORE_PEAK')
    expect(states.ERR_AT).toBe('NEW_AT_PEAK')
    expect(states.ERR_AFTER).toBe('NEW_AFTER_PEAK')
    expect(ranked.errorState).toBe('NEW_AT_PEAK')
  })
})
