import { describe, expect, it } from 'vitest'
import { buildAutoPeakRcaV3 } from '../logRcaEngineV3.js'

describe('LOG v1.14.2 operator polish and attribution guard', () => {
  it('keeps host peak and metric attribution on the originating application server', () => {
    const telemetry = [
      { fileName: 'c1.log', timeLabel: '2026-01-15 07:21', snapshot: '2026-01-15 07:21', sortKey: 1, host: 'AOPH1PAPPDC', vcpu: 8, cpuPct: 8, memoryPct: 40, load1: 0.8, swapIn: 0, wpCritical: 0 },
      { fileName: 'c1.log', timeLabel: '2026-01-15 07:21', snapshot: '2026-01-15 07:21', sortKey: 2, host: 'AOPH2PAPPDC', vcpu: 8, cpuPct: 21.2, memoryPct: 58.7, load1: 1.84, swapIn: 784, wpCritical: 19 },
      { fileName: 'c2.log', timeLabel: '2026-01-15 11:25', snapshot: '2026-01-15 11:25', sortKey: 3, host: 'AOPH1PAPPDC', vcpu: 8, cpuPct: 75.1, memoryPct: 99, load1: 27.44, swapIn: 450, wpCritical: 3 },
      { fileName: 'c2.log', timeLabel: '2026-01-15 11:33', snapshot: '2026-01-15 11:33', sortKey: 4, host: 'AOPH2PAPPDC', vcpu: 8, cpuPct: 4, memoryPct: 59.6, load1: 1.2, swapIn: 0, wpCritical: 21 },
    ]

    const rca = buildAutoPeakRcaV3({ telemetry, processes: [] })
    const app1 = rca.hostPeaks.find((item) => item.host === 'AOPH1PAPPDC')
    const app2 = rca.hostPeaks.find((item) => item.host === 'AOPH2PAPPDC')

    expect(app1).toBeTruthy()
    expect(app2).toBeTruthy()
    expect(app1.resourcePeak.host).toBe('AOPH1PAPPDC')
    expect(app2.resourcePeak.host).toBe('AOPH2PAPPDC')
    expect(app1.samples.every((row) => row.host === 'AOPH1PAPPDC')).toBe(true)
    expect(app2.samples.every((row) => row.host === 'AOPH2PAPPDC')).toBe(true)
    expect(app1.metrics.ram.row.host).toBe('AOPH1PAPPDC')
    expect(app2.metrics.swapIn.row.host).toBe('AOPH2PAPPDC')
    expect(app2.metrics.swapIn.value).toBe(784)
    expect(app2.metrics.swapIn.timeLabel).toBe('2026-01-15 07:21')
  })
})
