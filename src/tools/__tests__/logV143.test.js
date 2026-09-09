import { describe, expect, it } from 'vitest'
import { buildLogAnalysis, parseLogText, __test as logTest } from '../logAnalysisV14.js'
import { buildAutoPeakSphereV3 } from '../logSphereEngineV3.js'

function hostLog({ hostname = 'AOPH2PAPPDC', wpHost = hostname, swapIn = 784 } = {}) {
  return `snapshot @ 2026-01-15 07:21:00
Hostname : ${hostname}
vCPU : 8
CPU usage : 21.2 %
Load (15m) : L15=1.84, vCPU=8, r=0.23 LA 1.84/1.84/1.84
Memory : used 37.5G (58.7%), free 26.3G / 63.8G
Swap IO : si/so ${swapIn}/0 p/s
Total WP Critical : 19
## WP-SCOUT @ ${wpHost} SID=AOP INSTS=00 TS=2026-01-15 07:21:00
`
}

describe('LOG v1.14.3 raw source-host provenance', () => {
  it('verifies matching raw Hostname and WP-SCOUT declarations and preserves scoring evidence', () => {
    const parsed = parseLogText(hostLog(), 'AOPH2PAPPDC.log')
    expect(parsed.telemetry).toHaveLength(1)
    expect(parsed.telemetry[0].sourceHostStatus).toBe('VERIFIED')
    expect(parsed.telemetry[0].sourceHostnameHost).toBe('AOPH2PAPPDC')
    expect(parsed.telemetry[0].sourceWpScoutHost).toBe('AOPH2PAPPDC')

    const analysis = buildLogAnalysis([parsed])
    expect(analysis.sourceHostProvenance.status).toBe('PASS')
    expect(analysis.sourceHostProvenance.droppedTelemetryRows).toBe(0)
    expect(analysis.telemetry).toHaveLength(1)

    const rca = buildAutoPeakSphereV3(analysis)
    const app2 = rca.hostPeaks.find((item) => item.host === 'AOPH2PAPPDC')
    expect(app2).toBeTruthy()
    expect(app2.metrics.swapIn.value).toBe(784)
    expect(app2.metrics.swapIn.row.sourceHostStatus).toBe('VERIFIED')
  })

  it('drops a telemetry block when raw Hostname and WP-SCOUT host disagree', () => {
    const parsed = parseLogText(hostLog({ hostname: 'AOPH2PAPPDC', wpHost: 'AOPH5PAPPDC' }), 'collection.log')
    expect(parsed.telemetry).toHaveLength(1)
    expect(parsed.telemetry[0].sourceHostStatus).toBe('MISMATCH')

    const analysis = buildLogAnalysis([parsed])
    expect(analysis.sourceHostProvenance.status).toBe('FAIL')
    expect(analysis.sourceHostProvenance.mismatchBlocks).toBe(1)
    expect(analysis.sourceHostProvenance.droppedTelemetryRows).toBe(1)
    expect(analysis.telemetry).toHaveLength(0)
  })

  it('keeps filename host optional but detects a direct filename/header conflict when present', () => {
    const provenance = logTest.parseSourceHostBlocks(hostLog({ hostname: 'AOPH5PAPPDC', wpHost: 'AOPH5PAPPDC' }), 'AOPH2PAPPDC.log')
    expect(provenance.blocks[0].status).toBe('MISMATCH')
    expect(provenance.blocks[0].declaredHosts).toContain('AOPH2PAPPDC')
    expect(provenance.blocks[0].declaredHosts).toContain('AOPH5PAPPDC')
  })
})
