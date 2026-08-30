import { describe, expect, it } from 'vitest'
import { errorTaxonomyForRow, refineWorkloadV14, verdictV14 } from '../incidentTaxonomyV14.js'
import { telemetryCapabilitiesV13, __test as parserTest } from '../logAnalysisV14.js'
import { __test as telemetryTest } from '../telemetryEnrichmentV13.js'

describe('LOG v1.14.1 correctness stabilization', () => {
  it('does not double-count legacy D-state or force BLOCKED_VICTIM without enhanced evidence', () => {
    const base = {
      causalScore: 51,
      victimScore: 70,
      incidentScore: 65,
      incidentRole: 'MIXED',
      targetDState: 1,
      targetConcurrentPids: 2,
      targetEvidence: 'EXACT_TARGET',
      localConfidence: { grade: 'HIGH', score: 95 },
      enhancedEvidenceUsable: false,
      errors: [],
      errorTimings: [],
    }
    const refined = refineWorkloadV14(base, { row: { memoryPct: 99, resourceLoadRatio: 3.4, swapIn: 450 } }, { mode: 'LEGACY' })
    expect(refined.victimScore).toBe(70)
    expect(refined.incidentRole).toBe('MIXED')
    expect(refined.telemetrySignalsV14.blockedVictim).toBe(0)
  })

  it('pairs each error code with its own timing before assigning precursor support', () => {
    const taxonomy = errorTaxonomyForRow({
      errors: ['TIME_OUT', 'DBSQL_SQL_DEADLOCK'],
      errorTimings: [
        { error: 'TIME_OUT', state: 'NEW_BEFORE_TARGET', deltaMinutes: -3 },
        { error: 'DBSQL_SQL_DEADLOCK', state: 'NEW_AFTER_TARGET', deltaMinutes: 8 },
      ],
    })
    expect(taxonomy.strongest.category).toBe('DB_CONCURRENCY')
    expect(taxonomy.strongest.timing.state).toBe('NEW_AFTER_TARGET')
    expect(taxonomy.precursor).toBeNull()
    expect(taxonomy.direction).toBe('CONTEXT')
  })

  it('uses LEGACY, PARTIAL, ENHANCED instead of a binary telemetry flag', () => {
    const legacy = telemetryCapabilitiesV13({ telemetry: [{ host: 'APP1' }], processes: [{ pid: '1' }] })
    expect(legacy.mode).toBe('LEGACY')

    const partial = telemetryCapabilitiesV13({
      telemetry: [{ host: 'APP1', iowaitPct: 2 }, { host: 'APP1' }],
      processes: [{ pid: '1', pssGb: 1 }, { pid: '2' }, { pid: '3' }],
    })
    expect(partial.mode).toBe('PARTIAL')

    const telemetry = Array.from({ length: 10 }, (_, index) => ({ host: 'APP1', iowaitPct: 2, psiMemorySome10: 1, psiIoSome10: 1, sample: index }))
    const processes = Array.from({ length: 10 }, (_, index) => ({ pid: String(index), pssGb: 1, wchan: 'futex_wait', readBytes: index * 100, writeBytes: index * 20 }))
    const enhanced = telemetryCapabilitiesV13({ telemetry, processes })
    expect(enhanced.mode).toBe('ENHANCED')
  })

  it('keeps enhanced samples 3-5 minutes away as context-only, not causal evidence', () => {
    expect(parserTest.mappingLabel(0)).toBe('EXACT')
    expect(parserTest.mappingLabel(2)).toBe('NEAR_2M')
    expect(parserTest.mappingLabel(4)).toBe('CONTEXT_5M')
    expect(telemetryTest.enhancedQuality([{ enhancedDeltaMinutes: 4 }])).toEqual({ usable: false, grade: 'CONTEXT_ONLY', deltaMinutes: 4 })
  })

  it('prioritizes WCHAN from D-state PIDs over the dominant all-state WCHAN', () => {
    const top = telemetryTest.topWchan([
      { pid: '1', procState: 'S', wchan: 'futex_wait_queue_me' },
      { pid: '2', procState: 'S', wchan: 'futex_wait_queue_me' },
      { pid: '3', procState: 'S', wchan: 'futex_wait_queue_me' },
      { pid: '4', procState: 'D', wchan: 'nfs_file_read' },
    ])
    expect(top.className).toBe('NFS')
    expect(top.wchan).toBe('nfs_file_read')
    expect(top.scope).toBe('D_STATE')
  })

  it('keeps PARTIAL telemetry on the conservative culprit threshold', () => {
    const rows = [{
      workload: 'JOB_A', host: 'APP1', causalScore: 67, victimScore: 30, incidentScore: 70,
      incidentRole: 'RESOURCE_CONSUMER', targetEvidence: 'EXACT_TARGET', localConfidence: { grade: 'HIGH', score: 95 }, enhancedEvidenceUsable: true,
    }]
    const verdict = verdictV14(rows, { pattern: 'RESOURCE_CONTENTION' }, { row: {} }, { mode: 'PARTIAL' })
    expect(verdict.status).toBe('NO_SINGLE_CULPRIT')
    expect(verdict.reasons).toContain('CAUSAL_SCORE_BELOW_70')
    expect(verdict.reasons).toContain('ENHANCED_TELEMETRY_PARTIAL')
  })
})
