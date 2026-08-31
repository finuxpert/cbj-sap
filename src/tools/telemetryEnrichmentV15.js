import { enrichRankedRowsV13 } from './telemetryEnrichmentV13.js'

const metric = (value) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function directIoAtTarget(row = {}, rca = {}) {
  const targetCollectionKey = row.targetCollectionKey || rca.resourceLandscapePeak?.key || ''
  const records = (row.records || []).filter((item) => item.collectionKey === targetCollectionKey)
  const byPid = new Map()
  records.forEach((record) => {
    const pid = String(record.pid || '')
    if (!pid) return
    const read = metric(record.readMiBps)
    const write = metric(record.writeMiBps)
    if (read === null && write === null) return
    const current = byPid.get(pid) || { read: 0, write: 0, observed: false }
    if (read !== null) current.read = Math.max(current.read, read)
    if (write !== null) current.write = Math.max(current.write, write)
    current.observed = true
    byPid.set(pid, current)
  })
  const values = Array.from(byPid.values()).filter((item) => item.observed)
  if (!values.length) return null
  return {
    readMiBps: values.reduce((sum, item) => sum + item.read, 0),
    writeMiBps: values.reduce((sum, item) => sum + item.write, 0),
    observedPids: values.length,
  }
}

export function enrichRankedRowsV15(rows = [], rca = {}) {
  return enrichRankedRowsV13(rows, rca).map((row) => {
    const direct = directIoAtTarget(row, rca)
    if (!direct) return row
    return {
      ...row,
      targetReadMiBps: direct.readMiBps,
      targetWriteMiBps: direct.writeMiBps,
      targetIoObservedPids: direct.observedPids,
      targetIoSource: 'COLLECTOR_INTERVAL',
      enhancedEvidence: true,
      enhancedEvidenceUsable: row.enhancedEvidenceUsable || true,
    }
  })
}

export const __test = { directIoAtTarget }
