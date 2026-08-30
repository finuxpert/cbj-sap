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

function numericOrNull(value) {
  return metric(value)
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
        iowaitPct: numericOrNull(kv.iowait_pct),
        psiCpuSome10: numericOrNull(kv.psi_cpu_some10),
        psiCpuFull10: numericOrNull(kv.psi_cpu_full10),
        psiMemorySome10: numericOrNull(kv.psi_mem_some10),
        psiMemoryFull10: numericOrNull(kv.psi_mem_full10),
        psiIoSome10: numericOrNull(kv.psi_io_some10),
        psiIoFull10: numericOrNull(kv.psi_io_full10),
        enhancedSampleSeconds: numericOrNull(kv.sample_seconds),
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
        readBytes: numericOrNull(kv.read_bytes),
        writeBytes: numericOrNull(kv.write_bytes),
        rchar: numericOrNull(kv.rchar),
        wchar: numericOrNull(kv.wchar),
        syscr: numericOrNull(kv.syscr),
        syscw: numericOrNull(kv.syscw),
        majflt: numericOrNull(kv.majflt),
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
    const distance = Math.abs(stamp - target)
    if (distance > maxMinutes) return
    if (!best || distance < best.distance) best = { row, distance }
  })
  return best?.row || null
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

function enrichParsed(legacy, ext) {
  const telemetry = (legacy.telemetry || []).map((row) => {
    const source = nearest(ext.hostRows, row.timeLabel || row.snapshot, (item) => item.host === row.host, 5)
    return copyFields(row, source, HOST_FIELDS)
  })
  const processes = (legacy.processes || []).map((row) => {
    const source = nearest(
      ext.processRows,
      row.timeLabel || row.snapshot,
      (item) => item.host === row.host && String(item.pid) === String(row.pid),
      5,
    )
    return copyFields(row, source, PROCESS_FIELDS)
  })
  return { ...legacy, telemetry, processes, enhanced: ext }
}

function processIdentity(row = {}) {
  return [row.snapshot, row.host, row.instance, row.pid, row.wp].join('|')
}

function telemetryIdentity(row = {}) {
  return [row.snapshot, row.host].join('|')
}

function reattachEnhanced(analysis, parsedFiles = []) {
  const processMap = new Map()
  const telemetryMap = new Map()
  parsedFiles.flatMap((item) => item.processes || []).forEach((row) => {
    if (PROCESS_FIELDS.some((field) => row[field] !== null && row[field] !== undefined && row[field] !== '')) {
      processMap.set(processIdentity(row), row)
    }
  })
  parsedFiles.flatMap((item) => item.telemetry || []).forEach((row) => {
    if (HOST_FIELDS.some((field) => row[field] !== null && row[field] !== undefined && row[field] !== '')) {
      telemetryMap.set(telemetryIdentity(row), row)
    }
  })
  const telemetry = (analysis.telemetry || []).map((row) => copyFields(row, telemetryMap.get(telemetryIdentity(row)), HOST_FIELDS))
  const processes = (analysis.processes || []).map((row) => copyFields(row, processMap.get(processIdentity(row)), PROCESS_FIELDS))
  return { ...analysis, telemetry, processes }
}

export function telemetryCapabilitiesV13(analysis = {}) {
  const telemetry = analysis.telemetry || []
  const processes = analysis.processes || []
  const count = (rows, field) => rows.filter((row) => row[field] !== null && row[field] !== undefined && row[field] !== '').length
  const caps = {
    hostSamples: telemetry.length,
    processSamples: processes.length,
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
  caps.enhanced = caps.iowait + caps.psiCpu + caps.psiMemory + caps.psiIo + caps.pss + caps.wchan + caps.processIo > 0
  caps.mode = caps.enhanced ? 'ENHANCED' : 'LEGACY'
  return caps
}

export function parseLogText(rawText = '', fileName = '') {
  const legacy = parseLegacyLogText(rawText, fileName)
  return enrichParsed(legacy, parseEnhancedBlocks(rawText, fileName))
}

export function buildLogAnalysis(parsedFiles = []) {
  const analysis = reattachEnhanced(buildLegacyLogAnalysis(parsedFiles), parsedFiles)
  return { ...analysis, telemetryCapabilities: telemetryCapabilitiesV13(analysis) }
}

export const __test = {
  parseEnhancedBlocks,
  enrichParsed,
  minuteStamp,
  telemetryCapabilitiesV13,
}
