import { z } from 'zod'

const nullableMetric = z.preprocess((value) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}, z.number().finite().nullable())

const optionalText = z.preprocess((value) => value === null || value === undefined ? '' : String(value), z.string())

export const TelemetryRowSchemaV3 = z.object({
  fileName: optionalText,
  snapshot: optionalText,
  timeLabel: optionalText,
  sortKey: nullableMetric,
  host: z.preprocess((value) => String(value || 'UNKNOWN'), z.string().min(1)),
  sid: optionalText.optional(),
  instance: optionalText.optional(),
  vcpu: nullableMetric.optional(),
  cpuPct: nullableMetric.optional(),
  load1: nullableMetric.optional(),
  load5: nullableMetric.optional(),
  load15: nullableMetric.optional(),
  loadRatio: nullableMetric.optional(),
  memoryUsedGb: nullableMetric.optional(),
  memoryFreeGb: nullableMetric.optional(),
  memoryTotalGb: nullableMetric.optional(),
  memoryPct: nullableMetric.optional(),
  swapIn: nullableMetric.optional(),
  swapOut: nullableMetric.optional(),
  wpRunning: nullableMetric.optional(),
  wpStandby: nullableMetric.optional(),
  wpCritical: nullableMetric.optional(),
  wpOk: nullableMetric.optional(),
}).passthrough()

export const ProcessRowSchemaV3 = z.object({
  fileName: optionalText,
  snapshot: optionalText,
  timeLabel: optionalText,
  sortKey: nullableMetric,
  host: z.preprocess((value) => String(value || 'UNKNOWN'), z.string().min(1)),
  pid: optionalText.optional(),
  program: optionalText.optional(),
  jobName: optionalText.optional(),
  workloadName: optionalText.optional(),
  type: optionalText.optional(),
  state: optionalText.optional(),
  errorCode: optionalText.optional(),
  cpu: nullableMetric.optional(),
  rssGb: nullableMetric.optional(),
}).passthrough()

function validateRows(rows = [], schema) {
  const accepted = []
  const rejected = []
  rows.forEach((row, index) => {
    const result = schema.safeParse(row)
    if (result.success) accepted.push(result.data)
    else rejected.push({ index, issues: result.error.issues.slice(0, 3) })
  })
  return { accepted, rejected }
}

export function validateEvidenceAnalysisV3(analysis = {}) {
  const telemetry = validateRows(analysis.telemetry || [], TelemetryRowSchemaV3)
  const processes = validateRows(analysis.processes || [], ProcessRowSchemaV3)
  return {
    analysis: { ...analysis, telemetry: telemetry.accepted, processes: processes.accepted },
    quality: {
      telemetryAccepted: telemetry.accepted.length,
      telemetryRejected: telemetry.rejected.length,
      processAccepted: processes.accepted.length,
      processRejected: processes.rejected.length,
      telemetryIssues: telemetry.rejected,
      processIssues: processes.rejected,
    },
  }
}
