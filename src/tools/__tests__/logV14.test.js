import { describe, expect, it } from 'vitest'
import { __test as parserTest, telemetryCapabilitiesV13 } from '../logAnalysisV14.js'
import { __test as telemetryTest, classifyWchan, enrichWorkloadRowV13 } from '../telemetryEnrichmentV13.js'
import { classifyErrorCode, errorTaxonomyForRow, incidentPatternV14, refineWorkloadV14, verdictV14 } from '../incidentTaxonomyV14.js'

describe('LOG v1.13 enhanced Linux telemetry', () => {
  it('parses host and process RCA-EXT blocks without converting NA to zero', () => {
    const ext = parserTest.parseEnhancedBlocks(`
## RCA-EXT @ APP1 TS=2026-01-15 11:25:00 VERSION=1.13
EXT_HOST iowait_pct=31.2 psi_cpu_some10=5.4 psi_cpu_full10=NA psi_mem_some10=22 psi_mem_full10=8 psi_io_some10=42 psi_io_full10=18 sample_seconds=1
EXT_PROC pid=1234 state=D wchan=nfs_file_read pss_kb=1048576 private_kb=262144 shared_kb=786432 read_bytes=1000 write_bytes=2000 majflt=12
`, 'x.log')
    expect(ext.hostRows).toHaveLength(1)
    expect(ext.hostRows[0].iowaitPct).toBe(31.2)
    expect(ext.hostRows[0].psiCpuFull10).toBeNull()
    expect(ext.processRows[0].pssGb).toBe(1)
    expect(ext.processRows[0].privateGb).toBe(0.25)
    expect(ext.processRows[0].wchan).toBe('nfs_file_read')
  })

  it('reports legacy mode when enhanced evidence is absent', () => {
    const caps = telemetryCapabilitiesV13({ telemetry: [{ host: 'APP1' }], processes: [{ pid: '1' }] })
    expect(caps.mode).toBe('LEGACY')
    expect(caps.enhanced).toBe(false)
  })

  it('sums PSS across PIDs and keeps private/shared separately', () => {
    const memory = telemetryTest.snapshotMemory([
      { pid: '1', pssGb: 1, privateGb: 0.4, sharedGb: 0.6 },
      { pid: '2', pssGb: 2, privateGb: 1.5, sharedGb: 0.5 },
    ])
    expect(memory.pssGb).toBe(3)
    expect(memory.privateGb).toBe(1.9)
    expect(memory.sharedGb).toBe(1.1)
  })

  it('classifies blocking channels deterministically', () => {
    expect(classifyWchan('nfs_file_read')).toBe('NFS')
    expect(classifyWchan('balance_pgdat')).toBe('MEMORY_RECLAIM')
    expect(classifyWchan('io_schedule')).toBe('BLOCK_IO')
    expect(classifyWchan('futex_wait_queue')).toBe('LOCK')
  })

  it('derives per-process I/O rate only from positive cumulative deltas', () => {
    const all = [
      { pid: '1', actualTime: '2026-01-15 11:05', readBytes: 0, writeBytes: 0, majflt: 1 },
      { pid: '1', actualTime: '2026-01-15 11:25', readBytes: 120 * 1024 * 1024, writeBytes: 60 * 1024 * 1024, majflt: 21 },
    ]
    const result = telemetryTest.ioRatesAtTarget(all, [all[1]])
    expect(result.readMiBps).toBeCloseTo(0.1, 4)
    expect(result.writeMiBps).toBeCloseTo(0.05, 4)
    expect(result.majorFaultsPerMin).toBeCloseTo(1, 4)
  })

  it('builds PSS uplift and WCHAN evidence for a target workload', () => {
    const row = {
      host: 'APP1',
      targetCollectionKey: 'c2',
      records: [
        { pid: '1', collectionKey: 'c1', actualTime: '2026-01-15 11:05', pssGb: 1, wchan: '0' },
        { pid: '1', collectionKey: 'c2', actualTime: '2026-01-15 11:25', pssGb: 4, wchan: 'balance_pgdat' },
      ],
    }
    const rca = { resourceLandscapePeak: { key: 'c2', byHost: new Map([['APP1', { host: 'APP1', memoryPct: 99, psiMemoryFull10: 8 }]]) } }
    const result = enrichWorkloadRowV13(row, rca)
    expect(result.targetPssGb).toBe(4)
    expect(result.pssBaseline.median).toBe(1)
    expect(result.pssUplift.delta).toBe(3)
    expect(result.wchanClass).toBe('MEMORY_RECLAIM')
  })
})

describe('LOG v1.14 error taxonomy and pattern v2', () => {
  it('separates causal-capable deadlock from likely timeout symptom', () => {
    expect(classifyErrorCode('DBSQL_SQL_DEADLOCK').causalClass).toBe('CAUSAL_CAPABLE')
    expect(classifyErrorCode('TIME_OUT').causalClass).toBe('SYMPTOM_LIKELY')
    const row = { errors: ['TIME_OUT'], errorState: 'NEW_AFTER_TARGET', errorTimings: [] }
    expect(errorTaxonomyForRow(row).direction).toBe('LIKELY_SYMPTOM')
  })

  it('recognizes memory reclaim stall using PSI/swap/WCHAN evidence', () => {
    const anchor = { row: { memoryPct: 99, swapIn: 450, resourceLoadRatio: 3.4, psiMemoryFull10: 8 } }
    const pattern = incidentPatternV14(anchor, [{ targetEvidence: 'EXACT_TARGET', wchanClass: 'MEMORY_RECLAIM', targetDState: 1 }])
    expect(pattern).toBe('MEMORY_RECLAIM_STALL')
  })

  it('recognizes NFS contention when WCHAN and host I/O pressure agree', () => {
    const anchor = { row: { memoryPct: 70, resourceLoadRatio: 2, iowaitPct: 25, psiIoFull10: 4 } }
    const pattern = incidentPatternV14(anchor, [{ targetEvidence: 'EXACT_TARGET', wchanClass: 'NFS', targetDState: 1 }])
    expect(pattern).toBe('NFS_IO_CONTENTION')
  })

  it('raises victim evidence for blocked WCHAN without automatically making it a cause', () => {
    const row = {
      causalScore: 35, victimScore: 40, incidentScore: 45, incidentRole: 'BACKGROUND',
      targetEvidence: 'EXACT_TARGET', targetDState: 1, wchanClass: 'NFS',
      pssUplift: { score: 0 }, targetReadMiBps: 0, targetWriteMiBps: 0,
      errors: [], errorTimings: [], localConfidence: { grade: 'HIGH' },
    }
    const result = refineWorkloadV14(row, { row: { iowaitPct: 30, psiIoFull10: 5, resourceLoadRatio: 2 } })
    expect(result.incidentRole).toBe('BLOCKED_VICTIM')
    expect(result.victimScore).toBeGreaterThan(result.causalScore)
  })

  it('abstains when the top candidate is victim-dominant', () => {
    const rows = [
      { workload: 'A', host: 'APP1', causalScore: 55, victimScore: 75, incidentScore: 70, incidentRole: 'MIXED', targetEvidence: 'EXACT_TARGET', localConfidence: { grade: 'HIGH' } },
      { workload: 'B', host: 'APP1', causalScore: 50, victimScore: 20, incidentScore: 50, incidentRole: 'RESOURCE_CONSUMER', targetEvidence: 'EXACT_TARGET', localConfidence: { grade: 'HIGH' } },
    ]
    const verdict = verdictV14(rows, { pattern: 'MEMORY_BLOCKING_CONTENTION', landscapeConfidence: { grade: 'LOW' } }, { row: { memoryPct: 99, swapIn: 450 }, time: '2026-01-15 11:25', host: 'APP1' }, { enhanced: true, mode: 'ENHANCED' })
    expect(verdict.status).toBe('NO_SINGLE_CULPRIT')
    expect(verdict.reasons).toContain('VICTIM_EVIDENCE_DOMINATES')
  })

  it('supports a single culprit only with high-confidence causal separation', () => {
    const rows = [
      { workload: 'A', host: 'APP1', causalScore: 82, victimScore: 20, incidentScore: 82, incidentRole: 'IO_CONSUMER', targetEvidence: 'EXACT_TARGET', localConfidence: { grade: 'HIGH' } },
      { workload: 'B', host: 'APP1', causalScore: 55, victimScore: 30, incidentScore: 55, incidentRole: 'BACKGROUND', targetEvidence: 'EXACT_TARGET', localConfidence: { grade: 'HIGH' } },
    ]
    const verdict = verdictV14(rows, { pattern: 'BLOCK_IO_CONTENTION', landscapeConfidence: { grade: 'HIGH' } }, { row: { iowaitPct: 30, psiIoFull10: 5 }, time: '2026-01-15 11:25', host: 'APP1' }, { enhanced: true, mode: 'ENHANCED' })
    expect(verdict.status).toBe('SINGLE_CULPRIT_SUPPORTED')
    expect(verdict.topWorkload).toBe('A')
  })
})
