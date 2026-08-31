import { describe, expect, it } from 'vitest'
import { buildLogAnalysis, parseLogText, telemetryCapabilitiesV15 } from '../logAnalysisV15.js'
import { __test as enrichTest } from '../telemetryEnrichmentV15.js'

const V22 = `snapshot @ 2026-09-01 00:47:14 WIB
Hostname             : AOPH1QAPPDC
  - Total WP Running : 0
  - Total WP Standby : 2
  - CPU WP Critical  : 0
  - CPU WP Warn      : 0
  - CPU WP OK        : 2
  - Total WP Dialog  : 1
  - Total WP BTC     : 1
  - Total WP UPD     : 0
## WP-SCOUT @ AOPH1QAPPDC  SID=AOQ  INSTS=20  TS=2026-09-01 00:47:14 WIB
## RCA-SNAPSHOT-V2.2-BEGIN
snapshot_id\tAOPH1QAPPDC-1788198434-3890
snapshot_ts\t2026-09-01T00:47:14+07:00
snapshot_epoch\t1788198434
hostname\tAOPH1QAPPDC
sids\tAOQ
instances\t20
wp_count\t2
wp_type_known_count\t2
pss_readable_count\t2
proc_io_readable_count\t2
wchan_readable_count\t2
proc_capture_parallelism\t4
proc_capture_duration_seconds\t2.3
psi_memory_supported\t0
psi_io_supported\t0
cpu_sample_seconds\t1.58
collection_duration_seconds\t9
vcpu\t8
host_cpu_pct\t15.63
host_cpu_nonidle_pct\t15.63
host_iowait_pct\t0.00
load1\t0.70
load5\t0.45
load15\t0.39
load15_vcpu_ratio\t0.05
memory_used_gb\t38.0
memory_free_gb\t10.1
memory_total_gb\t62.5
memory_used_pct\t60.72
swap_in_ps\t0
swap_out_ps\t0
psi_memory_some_avg10\tNA
psi_memory_full_avg10\tNA
psi_io_some_avg10\tNA
psi_io_full_avg10\tNA
wp_d_state_count\t0
## RCA-SNAPSHOT-V2.2-END
## RCA-WP-V2.2-BEGIN
snapshot_id\tsnapshot_ts\thost\tpid\tsid\tinst\twp\ttype\ttype_source\tcpu_interval_pct\tpmem_pct\trss_gb\trss_flag\tpss_gb\tprivate_gb\tshared_gb\tstate\twchan\twp_uptime_sec\tcpu_class\tread_mib_s\twrite_mib_s\tproc_sample_ts\tproc_sample_delta_sec\trabax_tail_count\tsxpg_tail_count\tjobstart_tail_count\trxmsg_tail_count\tprogram\tprogram_source\terror_code\terror_program\tjob_name\tlatest_error_ts\tlatest_error_epoch\tlatest_error_age_sec\terror_recency\tlog_path
AOPH1QAPPDC-1788198434-3890\t2026-09-01T00:47:14+07:00\tAOPH1QAPPDC\t11128\tAOQ\t20\t0\tDIA\tSAPCONTROL\t12.50\t22.4\t14.0102\tHIGH\t1.8860\t0.8456\t13.1646\tS\tksys_semtimedop\t95077\tOK\t0.1000\t0.0200\t2026-09-01T00:47:16+07:00\t2\t0\t3\t0\t0\tZCURRENT\tTRACE\t?\t?\t?\t?\tNA\tNA\tUNKNOWN\t/usr/sap/AOQ/D20/work/dev_w0
AOPH1QAPPDC-1788198434-3890\t2026-09-01T00:47:14+07:00\tAOPH1QAPPDC\t11154\tAOQ\t20\t26\tBTC\tSAPCONTROL\t26.83\t0.2\t0.1551\tNORMAL\t0.0226\t0.0200\t0.1352\tS\t__x64_sys_poll\t95077\tOK\t1.2500\t0.5000\t2026-09-01T00:47:16+07:00\t2\t28\t0\t0\t28\tSAPDBDDF\tTRACE\tDBSQL_STMNT_TOO_LARGE\tSAPDBDDF\tR_JR_BTCJOBS_GENERATOR\t2026-08-31T15:11:06+07:00\t1788163866\t34568\tHISTORICAL\t/usr/sap/AOQ/D20/work/dev_w26
## RCA-WP-V2.2-END`

describe('collector V2.2 parser', () => {
  it('uses the structured V2.2 blocks as the primary evidence source', () => {
    const parsed = parseLogText(V22, 'aoq-v22.log')
    expect(parsed.telemetry).toHaveLength(1)
    expect(parsed.processes).toHaveLength(2)
    expect(parsed.telemetry[0].cpuPct).toBe(15.63)
    expect(parsed.telemetry[0].memoryPct).toBe(60.72)
    expect(parsed.telemetry[0].iowaitPct).toBe(0)
    expect(parsed.telemetry[0].wpStandby).toBe(2)
    expect(parsed.processes[0].cpu).toBe(12.5)
    expect(parsed.processes[0].pssGb).toBe(1.886)
    expect(parsed.processes[0].readMiBps).toBe(0.1)
    expect(parsed.processes[0].type).toBe('DIA')
  })

  it('does not promote historical trace errors to incident-time RCA evidence', () => {
    const parsed = parseLogText(V22, 'aoq-v22.log')
    const btc = parsed.processes.find((row) => row.type === 'BTC')
    expect(btc.latestErrorCode).toBe('DBSQL_STMNT_TOO_LARGE')
    expect(btc.errorRecency).toBe('HISTORICAL')
    expect(btc.errorCode).toBe('?')
  })

  it('preserves V2.2 enhanced coverage through normalized analysis', () => {
    const parsed = parseLogText(V22, 'aoq-v22.log')
    const analysis = buildLogAnalysis([parsed])
    const caps = telemetryCapabilitiesV15(analysis)
    expect(analysis.processes).toHaveLength(2)
    expect(analysis.processes[0].pssGb).not.toBeNull()
    expect(caps.mode).toBe('ENHANCED')
    expect(caps.collectorV22).toBe(true)
    expect(caps.directProcessIo).toBe(4)
  })

  it('uses collector interval I/O rates directly instead of deltaing them again', () => {
    const direct = enrichTest.directIoAtTarget({
      targetCollectionKey: 'c1',
      records: [
        { collectionKey: 'c1', pid: '1', readMiBps: 1.25, writeMiBps: 0.5 },
        { collectionKey: 'c1', pid: '2', readMiBps: 0.75, writeMiBps: 0.25 },
      ],
    }, {})
    expect(direct.readMiBps).toBe(2)
    expect(direct.writeMiBps).toBe(0.75)
    expect(direct.observedPids).toBe(2)
  })
})
