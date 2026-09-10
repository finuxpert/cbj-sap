import { describe, expect, it } from 'vitest'
import { drilldownMeta, sampleConsumerContribution, sampleConsumerMemory, sortSampleConsumers } from '../logSampleDrilldown.js'

const rows = [
  { key: 'cpu', targetCpu: 95, targetRss: 1.5, targetDState: 0 },
  { key: 'memory', targetCpu: 35, targetRss: 8.2, targetDState: 0 },
  { key: 'blocked', targetCpu: 10, targetRss: 2.1, targetDState: 4 },
]

describe('metric-aware LOG sample drilldown', () => {
  it('ranks CPU and RAM by metric-relevant process evidence', () => {
    expect(sortSampleConsumers(rows, 'cpuPct').map((row) => row.key)).toEqual(['cpu', 'memory', 'blocked'])
    expect(sortSampleConsumers(rows, 'memoryPct').map((row) => row.key)).toEqual(['memory', 'blocked', 'cpu'])
  })

  it('uses D-State first for load, iowait and WP critical contributor ranking', () => {
    expect(sortSampleConsumers(rows, 'resourceLoadRatio')[0].key).toBe('blocked')
    expect(sortSampleConsumers(rows, 'iowaitPct')[0].key).toBe('blocked')
    expect(sortSampleConsumers(rows, 'wpCritical')[0].key).toBe('blocked')
  })

  it('uses memory evidence for RAM, swap and memory pressure', () => {
    expect(drilldownMeta('swapIn').sortId).toBe('memory')
    expect(drilldownMeta('psiMemoryFull10').sortId).toBe('memory')
    expect(sampleConsumerMemory(rows[1])).toBe(8.2)
    expect(sampleConsumerContribution(rows[1], 'memoryPct')).toBe(8.2)
  })
})
