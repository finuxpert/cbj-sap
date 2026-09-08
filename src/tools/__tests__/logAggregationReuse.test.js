import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  selectBundle: vi.fn(), instantiate: vi.fn(), query: vi.fn(),
  close: vi.fn(), terminate: vi.fn(), workerTerminate: vi.fn(),
}))

vi.mock('@duckdb/duckdb-wasm', () => ({
  selectBundle: db.selectBundle,
  LogLevel: { WARNING: 2 },
  ConsoleLogger: class {},
  AsyncDuckDB: class {
    instantiate = db.instantiate
    connect = async () => ({ query: db.query, close: db.close })
    registerFileText = async () => {}
    terminate = db.terminate
  },
}))

vi.mock('../workloadAnalyticsV3.js', async (importOriginal) => {
  const original = await importOriginal()
  return {
    ...original,
    rankResourceConsumersV3: vi.fn(original.rankResourceConsumersV3),
    __test: {
      ...original.__test,
      // V4 must not repeat either mapping or aggregation through these helpers.
      attachCollections: vi.fn(() => { throw new Error('Repeated collection mapping') }),
      aggregateSnapshotsJs: vi.fn(() => { throw new Error('Repeated JS aggregation') }),
    },
  }
})

import { rankResourceConsumersV3, __test as v3 } from '../workloadAnalyticsV3.js'
import { rankResourceConsumersV4, compareSnapshotParity } from '../workloadAnalyticsV4.js'

function fixture() {
  const time = '2026-09-01 09:20'
  const host = { host: 'APP1', fileName: 'sample.log', snapshot: time, timeLabel: time, cpuPct: 95, memoryPct: 90, memoryTotalGb: 64, vcpu: 8, resourceLoadRatio: 2, swapIn: 120, resourceSeverity: 'CRIT', resourcePressure: 90 }
  const collection = { key: 'c0', timeLabel: time, rows: [host], byHost: new Map([['APP1', host]]) }
  const rca = { collections: [collection], resourceLandscapePeak: collection, landscapePeak: collection, hostPeaks: [{ host: 'APP1', sampleCount: 1, peakCollectionIndex: 0, peakCollectionKey: 'c0', peakTime: time, resourcePeak: host }], cadence: { nominalMinutes: 10 } }
  const base = { fileName: 'sample.log', host: 'APP1', snapshot: time, timeLabel: time, jobName: 'JOB_A', program: 'ZREPORT', type: 'BTC', errorCode: '?' }
  const processes = [
    { ...base, pid: '1', cpu: 10, rssGb: null, state: 'D' },
    { ...base, pid: '2', cpu: 20, rssGb: null, state: 'S' },
    { ...base, fileName: 'unmapped.log', pid: '3', cpu: 999, rssGb: 99, state: 'D' },
  ]
  const sqlRow = { host: 'APP1', workload: 'JOB_A', collection_key: 'c0', collection_index: 0, collection_time: time, cpu: 30, rss_gb: null, max_pid_rss_gb: null, concurrent_pids: 2, d_state: 1, errors: '', program: 'ZREPORT', type: 'BTC', raw_count: 2 }
  return { processes, rca, sqlRow }
}

beforeEach(() => {
  vi.clearAllMocks()
  db.selectBundle.mockResolvedValue({ mainWorker: 'worker.js', mainModule: 'duckdb.wasm' })
  db.instantiate.mockResolvedValue(undefined)
  db.query.mockResolvedValue({ toArray: () => [fixture().sqlRow] })
  vi.stubGlobal('Worker', class { terminate = db.workerTerminate })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('LOG aggregation reuse', () => {
  it('reuses the existing JS snapshots for DuckDB parity without repeating the V4 work', async () => {
    const { processes, rca } = fixture()
    const result = await rankResourceConsumersV4(processes, rca)
    const core = await rankResourceConsumersV3.mock.results[0].value
    expect(core.jsSnapshots).toEqual(core.snapshots)
    expect(core.jsSnapshots).not.toBe(core.snapshots)
    expect(result.parity).toEqual(compareSnapshotParity(core.jsSnapshots, core.snapshots))
    expect(result.parity).toMatchObject({ status: 'PASS', compared: 1, mismatchCount: 0 })
    expect(result).toMatchObject({ mappedRows: 2, unmappedRows: 1 })
    expect(result.snapshots[0]).toMatchObject({ cpu: 30, rssGb: null, maxPidRssGb: null, dState: 1, concurrentPids: 2 })
    expect(v3.attachCollections).not.toHaveBeenCalled()
    expect(v3.aggregateSnapshotsJs).not.toHaveBeenCalled()
    expect(db.query).toHaveBeenCalledTimes(1)
    expect(db.close).toHaveBeenCalledTimes(1)
    expect(db.terminate).toHaveBeenCalledTimes(1)
    expect(db.workerTerminate).toHaveBeenCalledTimes(1)
    expect(result).not.toHaveProperty('jsSnapshots')
  })

  it('still reports a real DuckDB/JS mismatch and preserves DuckDB output', async () => {
    const { processes, rca, sqlRow } = fixture()
    db.query.mockResolvedValue({ toArray: () => [{ ...sqlRow, cpu: 31 }] })
    const result = await rankResourceConsumersV4(processes, rca)
    expect(result.parity).toMatchObject({ status: 'FAIL', compared: 1, mismatchCount: 1 })
    expect(result.snapshots[0].cpu).toBe(31)
    expect(result.engineDiagnostics.duckDbStatus).toBe('ACTIVE')
  })

  it.each(['selection', 'query'])('retains the JS fallback after a DuckDB %s failure', async (stage) => {
    const { processes, rca } = fixture()
    const failure = new Error(`Forced ${stage} failure`)
    if (stage === 'selection') db.selectBundle.mockRejectedValue(failure)
    else db.query.mockRejectedValue(failure)
    const result = await rankResourceConsumersV4(processes, rca)
    const core = await rankResourceConsumersV3.mock.results[0].value
    expect(core.snapshots).toBe(core.jsSnapshots)
    expect(result.snapshots[0]).toMatchObject({ cpu: 30, rssGb: null, concurrentPids: 2 })
    expect(result.engineReason).toBe(failure.message)
    expect(result.parity.status).toBe('NOT_RUN')
    expect(result.engineDiagnostics.duckDbStatus).toBe('FAILED')
    expect(result).not.toHaveProperty('jsSnapshots')
  })

  it('keeps the existing timeout and releases DuckDB resources before using the fallback', async () => {
    vi.useFakeTimers()
    db.instantiate.mockImplementation(() => new Promise(() => {}))
    const { processes, rca } = fixture()
    const pending = rankResourceConsumersV4(processes, rca)
    await vi.advanceTimersByTimeAsync(5001)
    const result = await pending
    expect(result.engineReason).toBe('DuckDB instantiate timed out after 5000 ms')
    expect(result.snapshots[0].cpu).toBe(30)
    expect(db.terminate).toHaveBeenCalledTimes(1)
    expect(db.workerTerminate).toHaveBeenCalledTimes(1)
  })

  it('does not initialize DuckDB or parity when there are no process rows', async () => {
    const result = await rankResourceConsumersV4([], {})
    expect(result.rows).toHaveLength(0)
    expect(result.parity.status).toBe('NOT_RUN')
    expect(db.selectBundle).not.toHaveBeenCalled()
  })
})
