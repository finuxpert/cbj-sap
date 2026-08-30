import { buildLogAnalysis as buildLegacyLogAnalysis, parseLogText as parseLegacyLogText } from './logAnalysis2026.js'

const ENHANCED_VERSION = '1.13'
const KB_PER_GB = 1024 * 1024

const metric = (value) => {
  if (value === null || value === undefined || value === '' || String(value).toUpperCase() === 'NA') return null
  const parsed = Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

const text = (value) => String(value ?? '').trim()

function minuteStamp(value = '') {
  const match = String(value || '').match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/)
  if (!match) return null
  return Math.round(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5])) / 60000)
}

function timeLabel(value = '') {
  const match = String(value || '').match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/)
  if (!match) return ''
  return `${match[1]}-${match[2]}-${match[3]} ${String(match[4]).padStart(2, '0')}:${match[5]}`
}

function kvTokens(input = '') {
  const out = {}
  String(input || '').split(/\s+/).filter(Boolean).forEach((token) => {
    const index = token.indexOf('=')
    if (index <= 0) return
    out[token.slice(0, index)] = token.slice(index + 1)
  })
  return out
}

function gbFromKb(value) {
  const observed = metric(value)
  return observed === null ? null : observed / KB_PER_GB
}

function inferFileHost(fileName = '') {
  const match = String(fileName || '').toUpperCase().match(/\b([A-Z0-9_-]*PAPPDC)\b/)
  return match?.[1] || ''
}

function uniqueHosts(values = []) {
  return Array.from(new Set(values.map((value) => text(value).toUpperCase()).filter(Boolean)))
}

function finalizeSourceBlock(block = {}) {
  const hostnameHosts = uniqueHosts(block.hostnameHosts)
  const wpScoutHosts = uniqueHosts(block.wpScoutHosts)
  const enhancedHosts = uniqueHosts(block.enhancedHosts)
  const declaredHosts = uniqueHosts([block.fileHost, ...hostnameHosts, ...wpScoutHosts, ...enhancedHosts])
  const status = declaredHosts.length > 1 ? 'MISMATCH' : declaredHosts.length === 1 ? 'VERIFIED' : 'UNVERIFIED'
  return {
    ...block,
    hostnameHosts,
    wpScoutHosts,
    enhancedHosts,
    declaredHosts,
    sourceHost: declaredHosts[0] || '',
    status,
  }
}

function parseSourceHostBlocks(rawText = '', fileName = '') {
  const blocks = []
  const fileHost = inferFileHost(fileName)
  let current = null
  const ensure = () => {
    if (!current) current = { fileName, fileHost, snapshot: '', timeLabel: '', hostnameHosts: [], wpScoutHosts: [], enhancedHosts: [] }
    return current
  }
  const flush = () => {
    if (!current) return
    const meaningful = current.snapshot || current.hostnameHosts.length || current.wpScoutHosts.length || current.enhancedHosts.length
    if (meaningful) blocks.push(finalizeSourceBlock(current))
    current = null
  }

  String(rawText || '').replace(/\r/g, '').split('\n').forEach((rawLine) => {
    const line = text(rawLine)
    if (!line) return
    let match = line.match(/^snapshot\s*@\s*(.+)$/i)
    if (match) {
      flush()
      current = { fileName, fileHost, snapshot: match[1].trim(), timeLabel: timeLabel(match[1]), hostnameHosts: [], wpScoutHosts: [], enhancedHosts: [] }
      return
    }
    match = line.match(/^Hostname\s*:\s*(\S+)/i)
    if (match) {
      ensure().hostnameHosts.push(match[1])
      return
    }
    match = line.match(/^##\s*WP-SCOUT\s*@\s*(\S+)\s+SID=\S+\s+INSTS=\S+\s+TS=(.+)$/i)
    if (match) {
      const block = ensure()
      block.wpScoutHosts.push(match[1])
      if (!block.snapshot) {
        block.snapshot = match[2].trim()
        block.timeLabel = timeLabel(match[2])
      }
      return
    }
    match = line.match(/^##\s*RCA-EXT\s*@\s*(\S+)\s+TS=(.+?)(?:\s+VERSION=\S+)?$/i)
    if (match) {
      const block = ensure()
      block.enhancedHosts.push(match[1])
      if (!block.snapshot) {
        block.snapshot = match[2].trim()
        block.timeLabel = timeLabel(match[2])
      }
    }
  })
  flush()
  return { fileName, fileHost, blocks }
}

function sourceBlockForRow(row = {}, provenance = {}) {
  const blocks = provenance.blocks || []
  if (!blocks.length) return null
  const rowTime = timeLabel(row.snapshot || row.timeLabel)
  const exact = blocks.filter((block) => block.timeLabel && block.timeLabel === rowTime)
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) {
    const host = text(row.host).toUpperCase()
    return exact.find((block) => block.declaredHosts?.includes(host)) || exact[0]
  }
  if (blocks.length === 1) return blocks[0]
  return null
}

function attachSourceHostProvenance(legacy = {}, provenance = {}) {
  const attach = (row) => {
    const block = sourceBlockForRow(row, provenance)
    const parsedHost = text(row.host).toUpperCase()
    const sourceHost = block?.sourceHost || ''
    let sourceHostStatus = block?.status || 'UNVERIFIED'
    if (sourceHostStatus !== 'MISMATCH' && sourceHost && parsedHost && sourceHost !== parsedHost) sourceHostStatus = 'MISMATCH'
    return {
      ...row,
      sourceHostStatus,
      sourceDeclaredHost: sourceHost,
      sourceFileHost: block?.fileHost || provenance.fileHost || '',
      sourceHostnameHost: (block?.hostnameHosts || []).join('|'),
      sourceWpScoutHost: (block?.wpScoutHosts || []).join('|'),
      sourceEnhancedHost: (block?.enhancedHosts || []).join('|'),
      sourceProvenanceSnapshot: block?.snapshot || '',
    }
  }
  return {
    ...legacy,
    telemetry: (legacy.telemetry || []).map(attach),
    processes: (legacy.processes || []).map(attach),
    sourceHostProvenance: provenance,
  }
}

function summarizeSourceHostProvenance(parsedFiles = []) {
  const blocks = parsedFiles.flatMap((item) => item.sourceHostProvenance?.blocks || [])
  const telemetryRows = parsedFiles.flatMap((item) => item.telemetry || [])
  const processRows = parsedFiles.flatMap((item) => item.processes || [])
  const mismatchTelemetry = telemetryRows.filter((row) => row.sourceHostStatus === 'MISMATCH')
  const mismatchProcesses = processRows.filter((row) => row.sourceHostStatus === 'MISMATCH')
  const mismatchBlocks = blocks.filter((block) => block.status === 'MISMATCH')
  const unverifiedBlocks = blocks.filter((block) => block.status === 'UNVERIFIED')
  const verifiedBlocks = blocks.filter((block) => block.status === 'VERIFIED')
  const issues = mismatchBlocks.map((block) => ({
    fileName: block.fileName,
    snapshot: block.snapshot,
    fileHost: block.fileHost,
    hostnameHosts: block.hostnameHosts,
    wpScoutHosts: block.wpScoutHosts,
    enhancedHosts: block.enhancedHosts,
    declaredHosts: block.declaredHosts,
  }))
  const rowMismatchCount = mismatchTelemetry.length + mismatchProcesses.length
  return {
    status: mismatchBlocks.length || rowMismatchCount ? 'FAIL' : unverifiedBlocks.length ? 'WARN' : 'PASS',
    totalBlocks: blocks.length,
    verifiedBlocks: verifiedBlocks.length,
    unverifiedBlocks: unverifiedBlocks.length,
    mismatchBlocks: mismatchBlocks.length,
    rowMismatchCount,
    droppedTelemetryRows: mismatchTelemetry.length,
    droppedProcessRows: mismatchProcesses.length,
    issues,
  }
}

function sanitizeSourceHostRows(parsedFiles = []) {
  return parsedFiles.map((item) => ({
    ...item,
    telemetry: (item.telemetry || []).filter((row) => row.sourceHostStatus !== 'MISMATCH'),
    processes: (item.processes || []).filter((row) => row.sourceHostStatus !== 'MISMATCH'),
  }))
}

function parseEnhancedBlocks(rawText = '', fileName = '') {
  const hostRows = []
  const processRows = []
  let ctx = null
  String(rawText || '').replace(/\r/g, '').split('\n').forEach((rawLine) => {
    const line = text(rawLine)
    if (!line) return
    const header = line.match(/^##\s*RCA-EXT\s*@\s*(\S+)\s+TS=(.+?)(?:\s+VERSION=(\S+))?$/i)
    if (header) {
      ctx = { host: header[1], actualTime: timeLabel(header[2]), version: header[3] || ENHANCED_VERSION, fileName }
      return
    }
    if (!ctx) return
    if (/^EXT_HOST\s+/i.test(line)) {
      const kv = kvTokens(line.replace(/^EXT_HOST\s+/i, ''))
      hostRows.push({
        ...ctx,
        iowaitPct: metric(kv.iowait_pct),
        psiCpuSome10: metric(kv.psi_cpu_some10),
        psiCpuFull10: metric(kv.psi_cpu_full10),
        psiMemorySome10: metric(kv.psi_mem_some10),
        psiMemoryFull10: metric(kv.psi_mem_full10),
        psiIoSome10: metric(kv.psi_io_some10),
        psiIoFull10: metric(kv.psi_io_full10),
        enhancedSampleSeconds: metric(kv.sample_seconds),
        enhancedTelemetryVersion: ctx.version,
      })
      return
    }
    if (/^EXT_PROC\s+/i.test(line)) {
      const kv = kvTokens(line.replace(/^EXT_PROC\s+/i, ''))
      if (!kv.pid) return
      processRows.push({
        ...ctx,
        pid: String(kv.pid),
        procState: kv.state && kv.state !== 'NA' ? kv.state : '',
        wchan: kv.wchan && kv.wchan !== 'NA' ? kv.wchan : '',
        pssGb: gbFromKb(kv.pss_kb),
        privateGb: gbFromKb(kv.private_kb),
        sharedGb: gbFromKb(kv.shared_kb),
        readBytes: metric(kv.read_bytes),
        writeBytes: metric(kv.write_bytes),
        rchar: metric(kv.rchar),
        wchar: metric(kv.wchar),
        syscr: metric(kv.syscr),
        syscw: metric(kv.syscw),
        majflt: metric(kv.majflt),
        enhancedTelemetryVersion: ctx.version,
      })
    }
  })
  return { hostRows, processRows }
}

function nearest(rows = [], targetTime = '', predicate = () => true, maxMinutes = 5) {
  const target = minuteStamp(targetTime)
  if (target === null) return null
  let best = null
  rows.forEach((row) => {
    if (!predicate(row)) return
    const stamp = minuteStamp(row.actualTime)
    if (stamp === null) return
    const signedDistance = stamp - target
    const distance = Math.abs(signedDistance)
    if (distance > maxMinutes) return
    if (!best || distance < best.distance) best = { row, distance, signedDistance }
  })
  return best
}

function mappingLabel(distance) {
  if (distance === null || distance === undefined) return 'UNAVAILABLE'
  if (distance === 0) return 'EXACT'
  if (distance <= 1) return 'NEAR_1M'
  if (distance <= 2) return 'NEAR_2M'
  if (distance <= 5) return 'CONTEXT_5M'
  return 'STALE'
}

const HOST_FIELDS = [
  'iowaitPct', 'psiCpuSome10', 'psiCpuFull10', 'psiMemorySome10', 'psiMemoryFull10',
  'psiIoSome10', 'psiIoFull10', 'enhancedSampleSeconds', 'enhancedTelemetryVersion',
]

const PROCESS_FIELDS = [
  'procState', 'wchan', 'pssGb', 'privateGb', 'sharedGb', 'readBytes', 'writeBytes',
  'rchar', 'wchar', 'syscr', 'syscw', 'majflt', 'enhancedTelemetryVersion',
]

function copyFields(target, source, fields) {
  if (!source) return target
  const next = { ...target }
  fields.forEach((field) => {
    if (source[field] !== undefined) next[field] = source[field]
  })
  return next
}

function attachNearest(target, match, fields) {
  if (!match?.row) return target
  const next = copyFields(target, match.row, fields)
  next.enhancedSampleTime = match.row.actualTime || ''
  next.enhancedDeltaMinutes = match.signedDistance
  next.enhancedMapping = mappingLabel(match.distance)
  next.enhancedCausalUsable = match.distance <= 2
  return next
}

function enrichParsed(legacy, ext) {
  const telemetry = (legacy.telemetry || []).map((row) => attachNearest(
    row,
    nearest(ext.hostRows, row.timeLabel || row.snapshot, (item) => item.host === row.host, 5),
    HOST_FIELDS,
  ))
  const processes = (legacy.processes || []).map((row) => attachNearest(
    row,
    nearest(ext.processRows, row.timeLabel || row.snapshot, (item) => item.host === row.host && String(item.pid) === String(row.pid), 5),
    PROCESS_FIELDS,
  ))
  return { ...legacy, telemetry, processes, enhanced: ext }
}

function processIdentity(row = {}) {
  return [row.snapshot, row.host, row.instance, row.pid, row.wp].join('|')
}

function telemetryIdentity(row = {}) {
  return [row.snapshot, row.host].join('|')
}

const PROVENANCE_FIELDS = ['enhancedSampleTime', 'enhancedDeltaMinutes', 'enhancedMapping', 'enhancedCausalUsable']
const SOURCE_PROVENANCE_FIELDS = ['sourceHostStatus', 'sourceDeclaredHost', 'sourceFileHost', 'sourceHostnameHost', 'sourceWpScoutHost', 'sourceEnhancedHost', 'sourceProvenanceSnapshot']

function reattachEnhanced(analysis, parsedFiles = []) {
  const processMap = new Map()
  const telemetryMap = new Map()
  parsedFiles.flatMap((item) => item.processes || []).forEach((row) => {
    if ([...PROCESS_FIELDS, ...PROVENANCE_FIELDS, ...SOURCE_PROVENANCE_FIELDS].some((field) => row[field] !== null && row[field] !== undefined && row[field] !== '')) processMap.set(processIdentity(row), row)
  })
  parsedFiles.flatMap((item) => item.telemetry || []).forEach((row) => {
    if ([...HOST_FIELDS, ...PROVENANCE_FIELDS, ...SOURCE_PROVENANCE_FIELDS].some((field) => row[field] !== null && row[field] !== undefined && row[field] !== '')) telemetryMap.set(telemetryIdentity(row), row)
  })
  const telemetry = (analysis.telemetry || []).map((row) => copyFields(row, telemetryMap.get(telemetryIdentity(row)), [...HOST_FIELDS, ...PROVENANCE_FIELDS, ...SOURCE_PROVENANCE_FIELDS]))
  const processes = (analysis.processes || []).map((row) => copyFields(row, processMap.get(processIdentity(row)), [...PROCESS_FIELDS, ...PROVENANCE_FIELDS, ...SOURCE_PROVENANCE_FIELDS]))
  return { ...analysis, telemetry, processes }
}

export function telemetryCapabilitiesV13(analysis = {}) {
  const telemetry = analysis.telemetry || []
  const processes = analysis.processes || []
  const count = (rows, field) => rows.filter((row) => row[field] !== null && row[field] !== undefined && row[field] !== '').length
  const anyObserved = (row, fields) => fields.some((field) => row[field] !== null && row[field] !== undefined && row[field] !== '')
  const hostEnhancedRows = telemetry.filter((row) => anyObserved(row, ['iowaitPct', 'psiCpuSome10', 'psiMemorySome10', 'psiIoSome10'])).length
  const processEnhancedRows = processes.filter((row) => anyObserved(row, ['pssGb', 'privateGb', 'wchan', 'readBytes', 'writeBytes'])).length
  const hostCoveragePct = telemetry.length ? hostEnhancedRows / telemetry.length * 100 : 0
  const processCoveragePct = processes.length ? processEnhancedRows / processes.length * 100 : 0
  const caps = {
    hostSamples: telemetry.length,
    processSamples: processes.length,
    hostEnhancedRows,
    processEnhancedRows,
    hostCoveragePct: Math.round(hostCoveragePct),
    processCoveragePct: Math.round(processCoveragePct),
    iowait: count(telemetry, 'iowaitPct'),
    psiCpu: count(telemetry, 'psiCpuSome10') + count(telemetry, 'psiCpuFull10'),
    psiMemory: count(telemetry, 'psiMemorySome10') + count(telemetry, 'psiMemoryFull10'),
    psiIo: count(telemetry, 'psiIoSome10') + count(telemetry, 'psiIoFull10'),
    pss: count(processes, 'pssGb'),
    privateMemory: count(processes, 'privateGb'),
    sharedMemory: count(processes, 'sharedGb'),
    wchan: count(processes, 'wchan'),
    processIo: count(processes, 'readBytes') + count(processes, 'writeBytes'),
    majorFaults: count(processes, 'majflt'),
  }
  const observed = hostEnhancedRows + processEnhancedRows
  const fullEnough = hostCoveragePct >= 70 && processCoveragePct >= 50 && caps.pss > 0 && caps.wchan > 0 && caps.processIo > 0
  caps.mode = observed === 0 ? 'LEGACY' : fullEnough ? 'ENHANCED' : 'PARTIAL'
  caps.enhanced = caps.mode !== 'LEGACY'
  caps.fullEnhanced = caps.mode === 'ENHANCED'
  caps.coveragePct = Math.round((hostCoveragePct + processCoveragePct) / 2)
  return caps
}

export function parseLogText(rawText = '', fileName = '') {
  const legacy = parseLegacyLogText(rawText, fileName)
  const provenance = parseSourceHostBlocks(rawText, fileName)
  return attachSourceHostProvenance(enrichParsed(legacy, parseEnhancedBlocks(rawText, fileName)), provenance)
}

export function buildLogAnalysis(parsedFiles = []) {
  const sourceHostProvenance = summarizeSourceHostProvenance(parsedFiles)
  const sanitizedFiles = sanitizeSourceHostRows(parsedFiles)
  const analysis = reattachEnhanced(buildLegacyLogAnalysis(sanitizedFiles), sanitizedFiles)
  return { ...analysis, sourceHostProvenance, telemetryCapabilities: telemetryCapabilitiesV13(analysis) }
}

export const __test = {
  parseEnhancedBlocks,
  parseSourceHostBlocks,
  attachSourceHostProvenance,
  summarizeSourceHostProvenance,
  sanitizeSourceHostRows,
  enrichParsed,
  minuteStamp,
  telemetryCapabilitiesV13,
  nearest,
  mappingLabel,
}
