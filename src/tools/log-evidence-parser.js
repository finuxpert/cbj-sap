import { KNOWN_SAP_ERROR_CODES } from './log-evidence-constants.js'
import { safe } from './evidence-utils.js'

function clampPct(value) {
  const number = Number(value || 0)
  if (!Number.isFinite(number)) return 0
  return Math.max(0, Math.min(100, number))
}

function parseResourceSignal(line = '') {
  const text = safe(line)
  const cpu = text.match(/(?:cpu|cpu_usage|cpu\s*used)\s*[:=]\s*(\d+(?:\.\d+)?)\s*%?/i)?.[1]
  const mem = text.match(/(?:mem|memory|mem_usage|memory\s*used)\s*[:=]\s*(\d+(?:\.\d+)?)\s*%?/i)?.[1]
  const swap = text.match(/(?:swap|swap_usage|swap\s*used)\s*[:=]\s*(\d+(?:\.\d+)?)\s*%?/i)?.[1]
  const rssGb = text.match(/(?:rss|rss_gb|resident)\s*[:=]\s*(\d+(?:\.\d+)?)\s*(?:g|gb)?/i)?.[1]
  const host = text.match(/(?:host|hostname|server|instance)\s*[:=]\s*([A-Za-z0-9_.-]+)/i)?.[1]

  return {
    cpu: clampPct(cpu),
    mem: clampPct(mem),
    swap: clampPct(swap),
    rssGb: Number(rssGb || 0) || 0,
    host: host || '',
  }
}

export function parseGenericErrors(text = '', fileName = '') {
  const rows = []
  String(text || '').replace(/\r/g, '').split('\n').forEach((line, idx) => {
    const errorCode = KNOWN_SAP_ERROR_CODES.find((error) => line.includes(error))
    const resource = parseResourceSignal(line)
    const hasResourceSignal = Boolean(resource.cpu || resource.mem || resource.swap || resource.rssGb)
    if (!errorCode && !hasResourceSignal) return

    const hhmm = line.match(/\b(\d{2}:\d{2})(?::\d{2})?\b/)?.[1] || ''
    const severity = /CRIT|ERROR|\bE\b|dump|abend|failed|exception|oom|out of memory|swap|paging/i.test(line) ? 'CRIT' : 'WARN'
    rows.push({
      fileName,
      timeLabel: hhmm,
      host: resource.host || 'UNKNOWN',
      pid: line.match(/(?:pid|process)\s*[:=]\s*(\d+)/i)?.[1] || '',
      wp: line.match(/(?:wp|workprocess|work_process)\s*[:=]\s*(\d+)/i)?.[1] || '',
      type: '',
      cpu: resource.cpu,
      cpuPct: resource.cpu,
      mem: resource.mem,
      memPct: resource.mem,
      memoryPct: resource.mem,
      swap: resource.swap,
      swapPct: resource.swap,
      rssGb: resource.rssGb,
      state: '',
      className: severity,
      program: safe(line).slice(0, 140),
      errorCode: errorCode || (hasResourceSignal ? 'INFRA_RESOURCE_SIGNAL' : 'UNKNOWN'),
      jobName: line.match(/(?:job|jobname|job_name)\s*[:=]\s*([A-Za-z0-9_./:-]+)/i)?.[1] || '?',
      lineNo: idx + 1,
      source: hasResourceSignal && !errorCode ? 'infra-telemetry-log' : 'generic-log',
    })
  })
  return rows
}
