import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { buildAutoPeakRcaV3, resourcePressureScoreV3, resourceSeverityV3 } from '../logRcaEngineV3.js'
import { validateEvidenceAnalysisV3 } from '../evidenceSchemaV3.js'
import { __test } from '../workloadAnalyticsV3.js'

function timeForMinute(minute) {
  const hh = String(2 + Math.floor(minute / 60)).padStart(2, '0')
  const mm = String(minute % 60).padStart(2, '0')
  return `2026-01-15 ${hh}:${mm}`
}

function telemetryRow({ fileName, host, minute, cpuPct = 10, memoryPct = 20, wpCritical = 0, load1 = 0.8, load5 = 0.8, load15 = 0.8, loadRatio = 0.1, swapIn = 0, vcpu = 8 }) {
  const time = timeForMinute(minute)
  return { fileName, snapshot: time, timeLabel: time, sortKey: minute, host, vcpu, cpuPct, memoryPct, memoryTotalGb: 64, load1, load5, load15, loadRatio, swapIn, wpCritical }
}

function workloadSample({ host = 'APP1', workload = 'JOB_A', index, cpu = null, rssGb = null, maxPidRssGb = null, errors = [], pids = 1, dState = 0 }) {
  return {
    host, workload, collectionKey: `c${index}`, collectionIndex: index,
    collectionTime: timeForMinute(index * 20), cpu, rssGb, maxPidRssGb, concurrentPids: pids, dState, errors,
    program: 'ZPROG', type: 'BTC', rawCount: pids,
  }
}

function incidentRca({ hosts = ['APP1'], targetIndex = 1, hostStates = {} } = {}) {
  const collections = [0, 1, 2].map((index) => {
    const byHost = new Map()
    hosts.forEach((host) => {
      const overrides = hostStates[host]?.[index] || {}
      byHost.set(host, {
        host,
        fileName: `f${index}.log`,
        snapshot: timeForMinute(index * 20),
        timeLabel: timeForMinute(index * 20),
        vcpu: 8,
        cpuPct: 80,
        memoryPct: 80,
        memoryTotalGb: 64,
        resourceLoadRatio: 1.2,
        swapIn: 100,
        resourceSeverity: index === targetIndex ? 'WARN' : 'NORMAL',
        resourcePressure: index === targetIndex ? 80 : 30,
        ...overrides,
      })
    })
    return { key: `c${index}`, timeLabel: timeForMinute(index * 20), byHost, rows: [...byHost.values()] }
  })
  const target = collections[targetIndex]
  const hostPeaks = hosts.map((host) => ({
    host,
    sampleCount: 3,
    peakCollectionIndex: targetIndex,
    peakCollectionKey: target.key,
    peakTime: target.byHost.get(host).timeLabel,
    resourcePeak: target.byHost.get(host),
  }))
  return { collections, resourceLandscapePeak: target, landscapePeak: target, hostPeaks, cadence: { nominalMinutes: 20 } }
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

describe('Load1-calibrated host pressure', () => {
  it('uses Load1/vCPU for instantaneous resource severity instead of lagging Load15', () => {
    const fastSpike = telemetryRow({ fileName: 'a.log', host: 'APP1', minute: 0, cpuPct: 20, memoryPct: 30, load1: 16, load5: 4, load15: 0.8, loadRatio: 0.1, swapIn: 0, vcpu: 8 })
    const lagOnly = telemetryRow({ fileName: 'b.log', host: 'APP1', minute: 20, cpuPct: 20, memoryPct: 30, load1: 2, load5: 4, load15: 16, loadRatio: 2, swapIn: 0, vcpu: 8 })
    expect(resourceSeverityV3(fastSpike)).toBe('CRIT')
    expect(resourceSeverityV3(lagOnly)).toBe('NORMAL')
  })

  it('does not inflate pressure merely because an unused metric is missing', () => {
    const observedZero = telemetryRow({ fileName: 'a.log', host: 'APP1', minute: 0, cpuPct: 50, memoryPct: 70, load1: 4, swapIn: 0 })
    const missingSwap = { ...observedZero, swapIn: null }
    expect(Math.abs(resourcePressureScoreV3(observedZero) - resourcePressureScoreV3(missingSwap))).toBeLessThanOrEqual(1)
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

  it('labels two elevated points a short burst and three points sustained', () => {
    const short = buildAutoPeakRcaV3({ telemetry: [
      telemetryRow({ fileName: 's0.log', host: 'APP1', minute: 0, cpuPct: 80 }),
      telemetryRow({ fileName: 's1.log', host: 'APP1', minute: 20, cpuPct: 82 }),
      telemetryRow({ fileName: 's2.log', host: 'APP1', minute: 40, cpuPct: 10 }),
    ] })
    expect(short.hostPeaks[0].sustained.sustainedClass).toBe('SHORT_BURST')

    const sustained = buildAutoPeakRcaV3({ telemetry: [
      telemetryRow({ fileName: 'f0.log', host: 'APP1', minute: 0, cpuPct: 80 }),
      telemetryRow({ fileName: 'f1.log', host: 'APP1', minute: 20, cpuPct: 82 }),
      telemetryRow({ fileName: 'f2.log', host: 'APP1', minute: 40, cpuPct: 84 }),
      telemetryRow({ fileName: 'f3.log', host: 'APP1', minute: 60, cpuPct: 10 }),
    ] })
    expect(sustained.hostPeaks[0].sustained.sustainedClass).toBe('SUSTAINED')
    expect(sustained.hostPeaks[0].sustained.sustainedMinutes).toBe(40)
  })
})

describe('incident-relative workload ranking', () => {
  it('ranks a workload that spikes at the landscape incident above a heavier off-incident workload', () => {
    const incident = [
      workloadSample({ workload: 'INCIDENT', index: 0, cpu: 10, rssGb: 2, maxPidRssGb: 2 }),
      workloadSample({ workload: 'INCIDENT', index: 1, cpu: 80, rssGb: 10, maxPidRssGb: 8, pids: 2, dState: 1 }),
      workloadSample({ workload: 'INCIDENT', index: 2, cpu: 10, rssGb: 2, maxPidRssGb: 2 }),
    ]
    const offpeak = [
      workloadSample({ workload: 'OFFPEAK', index: 0, cpu: 220, rssGb: 30, maxPidRssGb: 20, pids: 4 }),
      workloadSample({ workload: 'OFFPEAK', index: 1, cpu: 2, rssGb: 2, maxPidRssGb: 2 }),
      workloadSample({ workload: 'OFFPEAK', index: 2, cpu: 2, rssGb: 2, maxPidRssGb: 2 }),
    ]
    const ranked = __test.buildWindowRows([...incident, ...offpeak], [], incidentRca())
    const incidentRow = ranked.find((row) => row.workload === 'INCIDENT')
    const offpeakRow = ranked.find((row) => row.workload === 'OFFPEAK')
    expect(offpeakRow.footprintScore).toBeGreaterThan(incidentRow.footprintScore)
    expect(incidentRow.incidentScore).toBeGreaterThan(offpeakRow.incidentScore)
    expect(ranked[0].workload).toBe('INCIDENT')
  })

  it('suppresses a stable baseline workload even when it is present in every sample', () => {
    const stable = [0, 1, 2].map((index) => workloadSample({ workload: 'STABLE', index, cpu: 5, rssGb: 3, maxPidRssGb: 3, pids: 2 }))
    const spike = [
      workloadSample({ workload: 'SPIKE', index: 0, cpu: 5, rssGb: 3, maxPidRssGb: 3 }),
      workloadSample({ workload: 'SPIKE', index: 1, cpu: 45, rssGb: 9, maxPidRssGb: 8 }),
      workloadSample({ workload: 'SPIKE', index: 2, cpu: 5, rssGb: 3, maxPidRssGb: 3 }),
    ]
    const ranked = __test.buildWindowRows([...stable, ...spike], [], incidentRca())
    const stableRow = ranked.find((row) => row.workload === 'STABLE')
    const spikeRow = ranked.find((row) => row.workload === 'SPIKE')
    expect(spikeRow.cpuUplift.score).toBeGreaterThan(stableRow.cpuUplift.score)
    expect(spikeRow.incidentScore).toBeGreaterThan(stableRow.incidentScore)
  })

  it('down-weights identical workload evidence on a host that is resource-normal at the incident', () => {
    const rca = incidentRca({
      hosts: ['APP1', 'APP2'],
      hostStates: {
        APP1: { 1: { resourceSeverity: 'CRIT', resourcePressure: 100, cpuPct: 95, memoryPct: 90 } },
        APP2: { 1: { resourceSeverity: 'NORMAL', resourcePressure: 35, cpuPct: 30, memoryPct: 50 } },
      },
    })
    const samples = []
    for (const host of ['APP1', 'APP2']) {
      samples.push(workloadSample({ host, workload: 'SAME', index: 0, cpu: 5, rssGb: 2, maxPidRssGb: 2 }))
      samples.push(workloadSample({ host, workload: 'SAME', index: 1, cpu: 40, rssGb: 8, maxPidRssGb: 7, dState: 1 }))
      samples.push(workloadSample({ host, workload: 'SAME', index: 2, cpu: 5, rssGb: 2, maxPidRssGb: 2 }))
    }
    const ranked = __test.buildWindowRows(samples, [], rca)
    const app1 = ranked.find((row) => row.host === 'APP1')
    const app2 = ranked.find((row) => row.host === 'APP2')
    expect(app1.incidentScore).toBeGreaterThan(app2.incidentScore)
  })

  it('preserves full-window aggregate invariants separately from incident score', () => {
    const rows = [
      { host: 'APP1', workload: 'JOB_A', collectionKey: 'c1', collectionIndex: 1, collectionTime: timeForMinute(20), pid: '101', cpu: 60, rssGb: 4, state: 'S', errorCode: '?' },
      { host: 'APP1', workload: 'JOB_A', collectionKey: 'c1', collectionIndex: 1, collectionTime: timeForMinute(20), pid: '102', cpu: 50, rssGb: 3, state: 'S', errorCode: '?' },
    ]
    const snapshots = __test.aggregateSnapshotsJs(rows)
    expect(snapshots[0].cpu).toBe(110)
    expect(snapshots[0].rssGb).toBe(7)
    expect(snapshots[0].maxPidRssGb).toBe(4)
    expect(snapshots[0].concurrentPids).toBe(2)
  })
})

describe('error timing relative to landscape incident', () => {
  it('uses actual minutes and distinguishes before, exact, after, and persistent-near-target', () => {
    const raw = [
      { errorCode: 'ERR_BEFORE', actualTime: '2026-01-15 02:00' },
      { errorCode: 'ERR_AT', actualTime: '2026-01-15 02:20' },
      { errorCode: 'ERR_AFTER', actualTime: '2026-01-15 02:40' },
      { errorCode: 'ERR_PERSIST', actualTime: '2026-01-15 01:20' },
      { errorCode: 'ERR_PERSIST', actualTime: '2026-01-15 02:20' },
    ]
    const result = __test.classifyErrorTimings(raw, '2026-01-15 02:20', 25)
    const states = Object.fromEntries(result.timings.map((item) => [item.error, item.state]))
    expect(states.ERR_BEFORE).toBe('NEW_BEFORE_TARGET')
    expect(states.ERR_AT).toBe('NEW_AT_TARGET')
    expect(states.ERR_AFTER).toBe('NEW_AFTER_TARGET')
    expect(states.ERR_PERSIST).toBe('PERSISTENT_NEAR_TARGET')
    expect(result.state).toBe('NEW_AT_TARGET')
  })
})
