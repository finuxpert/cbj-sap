import { buildLogAnalysis as buildV14LogAnalysis, parseLogText as parseV14LogText, telemetryCapabilitiesV13, __test as v14Test } from './logAnalysisV14.js'

const UNKNOWN = '?'
const V22_MARKER = '## RCA-SNAPSHOT-V2.2-BEGIN'

const metric = (value) => {
  if (value === null || value === undefined || value === '' || String(value).toUpperCase() === 'NA') return null
  const parsed = Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

const text = (value) => String(value ?? '').trim()
const clean = (value) => {
  const out = text(value)
  return !out || out === UNKNOWN || out.toUpperCase() === 'NA' ? UNKNOWN : out
}

function timeLabel(value = '') {
  const match = String(value || '').match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/)
  if (!match) return ''
  return `${match[1]}-${match[2]}-${match[3]} ${String(match[4]).padStart(2, '0')}:${match[5]}`
}

function sortKey(value = '', epoch = null) {
  const observedEpoch = metric(epoch)
  if (observedEpoch !== null) return observedEpoch
  const parsed = Date.parse(String(value || ''))
  if (Number.isFinite(parsed)) return Math.floor(parsed / 1000)
  const label = timeLabel(value)
  return label ? Number(label.replace(/[- :]/g, '')) : Number.MAX_SAFE_INTEGER
}

function workloadName(row = {}) {
  const job = clean(row.jobName)
  const program = clean(row.program)
  if (job !== UNKNOWN && job !== program) return job
  if (program !== UNKNOWN) return program
  return row.pid ? `PID ${row.pid}` : 'Unknown process'
}

function parseKeyValueBlock(lines = [], startMarker = '', endMarker = '') {
  const start = lines.findIndex((line) => text(line) === startMarker)
  if (start < 0) return null
  const end = lines.findIndex((line, index) => index > start && text(line) === endMarker)
  if (end < 0) return null
  const out = {}
  for (let index = start + 1; index < end; index += 1) {
    const parts = String(lines[index] || '').split('\t')
    if (parts.length < 2) continue
    out[text(parts[0])] = text(parts.slice(1).join('\t'))
  }
  return out
}

function parseTableBlock(lines = [], startMarker = '', endMarker = '') {
  const start = lines.findIndex((line) => text(line) === startMarker)
  if (start < 0) return null
  const end = lines.findIndex((line, index) => index > start && text(line) === endMarker)
  if (end < 0 || end <= start + 1) return null
  const header = String(lines[start + 1] || '').split('\t').map(text)
  if (!header.length) return null
  const rows = []
  for (let index = start + 2; index < end; index += 1) {
    const raw = String(lines[index] || '')
    if (!raw.trim()) continue
    const values = raw.split('\t')
    const row = {}
    header.forEach((name, column) => { row[name] = text(values[column] ?? '') })
    rows.push(row)
  }
  return { header, rows }
}

function humanMetric(rawText = '', pattern) {
  const match = String(rawText || '').match(pattern)
  return match ? metric(match[1]) : null
}

function parseHumanCounts(rawText = '') {
  return {
    wpRunning: humanMetric(rawText, /Total\s+WP\s+Running\s*:\s*(\d+)/i),
    wpStandby: humanMetric(rawText, /Total\s+WP\s+Standby\s*:\s*(\d+)/i),
    wpCritical: humanMetric(rawText, /CPU\s+WP\s+Critical\s*:\s*(\d+)/i),
    wpWarn: humanMetric(rawText, /CPU\s+WP\s+Warn\s*:\s*(\d+)/i),
    wpOk: humanMetric(rawText, /CPU\s+WP\s+OK\s*:\s*(\d+)/i),
    wpDialog: humanMetric(rawText, /Total\s+WP\s+Dialog\s*:\s*(\d+)/i),
    wpBtc: humanMetric(rawText, /Total\s+WP\s+BTC\s*:\s*(\d+)/i),
    wpUpd: humanMetric(rawText, /Total\s+WP\s+UPD\s*:\s*(\d+)/i),
  }
}

function parseV22(rawText = '', fileName = '') {
  if (!String(rawText || '').includes(V22_MARKER)) return null
  const lines = String(rawText || '').replace(/\r/g, '').split('\n')
  const snapshot = parseKeyValueBlock(lines, '## RCA-SNAPSHOT-V2.2-BEGIN', '## RCA-SNAPSHOT-V2.2-END')
  const wp = parseTableBlock(lines, '## RCA-WP-V2.2-BEGIN', '## RCA-WP-V2.2-END')
  if (!snapshot || !wp) return null

  const snapshotTs = clean(snapshot.snapshot_ts) !== UNKNOWN ? snapshot.snapshot_ts : ''
  const label = timeLabel(snapshotTs)
  const host = clean(snapshot.hostname) !== UNKNOWN ? snapshot.hostname.toUpperCase() : 'UNKNOWN'
  const sid = clean(snapshot.sids) !== UNKNOWN ? snapshot.sids : ''
  const instance = clean(snapshot.instances) !== UNKNOWN ? snapshot.instances : ''
  const counts = parseHumanCounts(rawText)
  const epoch = metric(snapshot.snapshot_epoch)
  const baseSortKey = sortKey(snapshotTs, epoch)
  const psiMemorySupported = metric(snapshot.psi_memory_supported) === 1
  const psiIoSupported = metric(snapshot.psi_io_supported) === 1

  const telemetry = [{
    fileName,
    snapshot: snapshotTs,
    sortKey: baseSortKey,
    timeLabel: label,
    host,
    sid,
    instance,
    vcpu: metric(snapshot.vcpu),
    cpuPct: metric(snapshot.host_cpu_pct),
    load1: metric(snapshot.load1),
    load5: metric(snapshot.load5),
    load15: metric(snapshot.load15),
    loadRatio: metric(snapshot.load15_vcpu_ratio),
    memoryUsedGb: metric(snapshot.memory_used_gb),
    memoryFreeGb: metric(snapshot.memory_free_gb),
    memoryTotalGb: metric(snapshot.memory_total_gb),
    memoryPct: metric(snapshot.memory_used_pct),
    swapIn: metric(snapshot.swap_in_ps),
    swapOut: metric(snapshot.swap_out_ps),
    ...counts,
    iowaitPct: metric(snapshot.host_iowait_pct),
    psiMemorySome10: psiMemorySupported ? metric(snapshot.psi_memory_some_avg10) : null,
    psiMemoryFull10: psiMemorySupported ? metric(snapshot.psi_memory_full_avg10) : null,
    psiIoSome10: psiIoSupported ? metric(snapshot.psi_io_some_avg10) : null,
    psiIoFull10: psiIoSupported ? metric(snapshot.psi_io_full_avg10) : null,
    psiCpuSome10: null,
    psiCpuFull10: null,
    enhancedSampleSeconds: metric(snapshot.cpu_sample_seconds),
    enhancedTelemetryVersion: '2.2',
    enhancedSampleTime: label,
    enhancedDeltaMinutes: 0,
    enhancedMapping: 'EXACT',
    enhancedCausalUsable: true,
    collectorSchema: 'RCA-SNAPSHOT-V2.2',
    collectorSnapshotId: snapshot.snapshot_id || '',
    collectorCollectionSeconds: metric(snapshot.collection_duration_seconds),
    collectorProcCaptureSeconds: metric(snapshot.proc_capture_duration_seconds),
    collectorProcParallelism: metric(snapshot.proc_capture_parallelism),
    collectorWpCount: metric(snapshot.wp_count),
    collectorWpTypeKnownCount: metric(snapshot.wp_type_known_count),
    collectorPssReadableCount: metric(snapshot.pss_readable_count),
    collectorProcIoReadableCount: metric(snapshot.proc_io_readable_count),
    collectorWchanReadableCount: metric(snapshot.wchan_readable_count),
    collectorPsiMemorySupported: psiMemorySupported,
    collectorPsiIoSupported: psiIoSupported,
  }]

  const processes = wp.rows.map((raw) => {
    const recency = clean(raw.error_recency)
    const latestError = clean(raw.error_code)
    const rcaError = recency === 'AT_SNAPSHOT' ? latestError : UNKNOWN
    const readMiBps = metric(raw.read_mib_s)
    const writeMiBps = metric(raw.write_mib_s)
    const procTime = timeLabel(raw.proc_sample_ts) || label
    const row = {
      fileName,
      snapshot: snapshotTs,
      sortKey: baseSortKey,
      timeLabel: label,
      host: clean(raw.host) !== UNKNOWN ? raw.host.toUpperCase() : host,
      sid: clean(raw.sid) !== UNKNOWN ? raw.sid : sid,
      instance: clean(raw.inst) !== UNKNOWN ? raw.inst : instance,
      pid: clean(raw.pid) === UNKNOWN ? '' : raw.pid,
      wp: clean(raw.wp) === UNKNOWN ? '' : raw.wp,
      type: clean(raw.type),
      typeSource: clean(raw.type_source),
      cpu: metric(raw.cpu_interval_pct),
      pmemPct: metric(raw.pmem_pct),
      rssGb: metric(raw.rss_gb),
      rssFlag: clean(raw.rss_flag),
      state: clean(raw.state),
      procState: clean(raw.state),
      age: metric(raw.wp_uptime_sec) === null ? UNKNOWN : `${Math.round(metric(raw.wp_uptime_sec))}s`,
      wpUptimeSec: metric(raw.wp_uptime_sec),
      className: clean(raw.cpu_class) === UNKNOWN ? 'OK' : raw.cpu_class.toUpperCase(),
      rabax: metric(raw.rabax_tail_count) ?? 0,
      sxpg: metric(raw.sxpg_tail_count) ?? 0,
      jobCounter: metric(raw.jobstart_tail_count) ?? 0,
      rxmsg: metric(raw.rxmsg_tail_count) ?? 0,
      program: clean(raw.program),
      programSource: clean(raw.program_source),
      errorCode: rcaError,
      latestErrorCode: latestError,
      errorProgram: clean(raw.error_program),
      jobName: clean(raw.job_name),
      latestErrorTime: clean(raw.latest_error_ts),
      latestErrorEpoch: metric(raw.latest_error_epoch),
      latestErrorAgeSec: metric(raw.latest_error_age_sec),
      errorRecency: recency,
      logPath: clean(raw.log_path) === UNKNOWN ? '' : raw.log_path,
      resourceSample: true,
      source: 'RCA-WP-V2.2',
      sections: ['RCA-WP-V2.2'],
      pssGb: metric(raw.pss_gb),
      privateGb: metric(raw.private_gb),
      sharedGb: metric(raw.shared_gb),
      wchan: clean(raw.wchan) === UNKNOWN ? '' : raw.wchan,
      readMiBps,
      writeMiBps,
      directIoRate: readMiBps !== null || writeMiBps !== null,
      readBytes: readMiBps === null ? null : 0,
      writeBytes: writeMiBps === null ? null : 0,
      enhancedTelemetryVersion: '2.2',
      enhancedSampleTime: procTime,
      enhancedDeltaMinutes: 0,
      enhancedMapping: 'EXACT',
      enhancedCausalUsable: true,
      procSampleDeltaSec: metric(raw.proc_sample_delta_sec),
      collectorSnapshotId: raw.snapshot_id || snapshot.snapshot_id || '',
      collectorSchema: 'RCA-WP-V2.2',
    }
    return { ...row, workloadName: workloadName(row) }
  })

  const provenance = v14Test.parseSourceHostBlocks(rawText, fileName)
  return v14Test.attachSourceHostProvenance({ telemetry, processes, collectorV22: true }, provenance)
}

const V22_PROCESS_FIELDS = [
  'readMiBps', 'writeMiBps', 'directIoRate', 'typeSource', 'pmemPct', 'rssFlag', 'wpUptimeSec',
  'programSource', 'latestErrorCode', 'errorProgram', 'latestErrorTime', 'latestErrorEpoch',
  'latestErrorAgeSec', 'errorRecency', 'procSampleDeltaSec', 'collectorSnapshotId', 'collectorSchema',
]

const V22_HOST_FIELDS = [
  'collectorSchema', 'collectorSnapshotId', 'collectorCollectionSeconds', 'collectorProcCaptureSeconds',
  'collectorProcParallelism', 'collectorWpCount', 'collectorWpTypeKnownCount', 'collectorPssReadableCount',
  'collectorProcIoReadableCount', 'collectorWchanReadableCount', 'collectorPsiMemorySupported', 'collectorPsiIoSupported',
]

function processIdentity(row = {}) {
  return [row.snapshot, row.host, row.instance, row.pid, row.wp].join('|')
}

function telemetryIdentity(row = {}) {
  return [row.snapshot, row.host].join('|')
}

function copyFields(target, source, fields) {
  if (!source) return target
  const next = { ...target }
  fields.forEach((field) => {
    if (source[field] !== undefined) next[field] = source[field]
  })
  return next
}

function reattachV22(analysis = {}, parsedFiles = []) {
  const processMap = new Map()
  const telemetryMap = new Map()
  parsedFiles.flatMap((item) => item.processes || []).forEach((row) => {
    if (row.collectorSchema === 'RCA-WP-V2.2') processMap.set(processIdentity(row), row)
  })
  parsedFiles.flatMap((item) => item.telemetry || []).forEach((row) => {
    if (row.collectorSchema === 'RCA-SNAPSHOT-V2.2') telemetryMap.set(telemetryIdentity(row), row)
  })
  return {
    ...analysis,
    telemetry: (analysis.telemetry || []).map((row) => copyFields(row, telemetryMap.get(telemetryIdentity(row)), V22_HOST_FIELDS)),
    processes: (analysis.processes || []).map((row) => copyFields(row, processMap.get(processIdentity(row)), V22_PROCESS_FIELDS)),
  }
}

export function telemetryCapabilitiesV15(analysis = {}) {
  const base = telemetryCapabilitiesV13(analysis)
  const processes = analysis.processes || []
  const directRead = processes.filter((row) => metric(row.readMiBps) !== null).length
  const directWrite = processes.filter((row) => metric(row.writeMiBps) !== null).length
  const schemas = new Set([
    ...(analysis.telemetry || []).map((row) => row.collectorSchema),
    ...processes.map((row) => row.collectorSchema),
  ].filter(Boolean))
  return {
    ...base,
    directProcessIo: directRead + directWrite,
    directProcessIoRead: directRead,
    directProcessIoWrite: directWrite,
    collectorSchemas: Array.from(schemas),
    collectorV22: schemas.has('RCA-SNAPSHOT-V2.2') || schemas.has('RCA-WP-V2.2'),
  }
}

export function parseLogText(rawText = '', fileName = '') {
  return parseV22(rawText, fileName) || parseV14LogText(rawText, fileName)
}

export function buildLogAnalysis(parsedFiles = []) {
  const analysis = reattachV22(buildV14LogAnalysis(parsedFiles), parsedFiles)
  return { ...analysis, telemetryCapabilities: telemetryCapabilitiesV15(analysis) }
}

export const __test = { parseV22, parseKeyValueBlock, parseTableBlock, parseHumanCounts, reattachV22 }
