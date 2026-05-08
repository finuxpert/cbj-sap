import { KNOWN_SAP_ERROR_CODES } from './log-evidence-constants.js'
import { safe } from './evidence-utils.js'

export function parseGenericErrors(text = '', fileName = '') {
  const rows = []
  String(text || '').replace(/\r/g, '').split('\n').forEach((line, idx) => {
    const errorCode = KNOWN_SAP_ERROR_CODES.find((error) => line.includes(error))
    if (!errorCode) return
    const hhmm = line.match(/\b(\d{2}:\d{2})(?::\d{2})?\b/)?.[1] || ''
    const severity = /CRIT|ERROR|\bE\b|dump|abend|failed|exception/i.test(line) ? 'CRIT' : 'WARN'
    rows.push({
      fileName,
      timeLabel: hhmm,
      host: 'UNKNOWN',
      pid: '',
      wp: '',
      type: '',
      cpu: 0,
      rssGb: 0,
      state: '',
      className: severity,
      program: safe(line).slice(0, 140),
      errorCode,
      jobName: '?',
      lineNo: idx + 1,
      source: 'generic-log',
    })
  })
  return rows
}
