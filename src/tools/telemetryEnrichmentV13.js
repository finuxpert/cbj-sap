const MIB = 1024 * 1024

const metric = (value) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0))

function minuteStamp(value = '') {
  const match = String(value || '').match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})/)
  if (!match) return null
  return Math.round(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5])) / 60000)
}

function median(values = []) {
  const rows = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b)
  if (!rows.length) return null
  const mid = Math.floor(rows.length / 2)
  return rows.length % 2 ? rows[mid] : (rows[mid - 1] + rows[mid]) / 2
}

function mad(values = [], med = median(values)) {
  if (med === null) return null
  return median(values.map((value) => Math.abs(Number(value) - med)).filter(Number.isFinite))
}

function uplift(current, values = [], absoluteFloor = 0.25) {
  const observed = metric(current)
  const med = median(values)
  if (observed === null || med === null) return { current: observed, median: med, delta: null, z: null, score: 0, count: values.length }
  const spread = mad(values, med)
  const scale = Math.max(absoluteFloor, Math.abs(med) * 0.1, (spread ?? 0) * 1.4826)
  const delta = observed - med
  const z = delta / scale
  const relative = med > absoluteFloor ? delta / med : delta / absoluteFloor
  const score = delta <= 0 ? 0 : clamp01(Math.max((z - 2) / 6, (relative - 0.25) / 1.5))
  return { current: observed, median: med, delta, z, score, count: values.length, scale }
}

function uniquePidSnapshot(records = []) {
  const map = new Map()
  records.forEach((row) => {
    const pid = String(row.pid || '')
    if (!pid) return
    const current = map.get(pid) || {}
    const next = { ...current, ...row }
    ;['pssGb', 'privateGb', 'sharedGb', 'readBytes', 'writeBytes', 'rchar', 'wchar', 'syscr', 'syscw', 'majflt'].forEach((field) => {
      const value = metric(row[field])
      const old = metric(current[field])
      if (value !== null && (old === null || value > old)) next[field] = value
    })
    if (!next.wchan && row.wchan) next.wchan = row.wchan
    if (!next.procState && row.procState) next.procState = row.procState
    map.set(pid, next)
  })
  return Array.from(map.values())
}

function snapshotMemory(records = []) {
  const rows = uniquePidSnapshot(records)
  const sum = (field) => {
    const values = rows.map((row) => metric(row[field])).filter((value) => value !== null)
    return values.length ? values.reduce((total, value) => total + value, 0) : null
  }
  return {
    pssGb: sum('pssGb'),
    privateGb: sum('privateGb'),
    sharedGb: sum('sharedGb'),
    observedPids: rows.filter((row) => metric(row.pssGb) !== null || metric(row.privateGb) !== null || metric(row.sharedGb) !== null).length,
  }
}

export function classifyWchan(wchan = '') {
  const value = String(wchan || '').toLowerCase()
  if (!value || value === '0' || value === '-' || value === 'na') return 'NONE'
  if (/nfs|sunrpc|rpc_|xprt|rpc_wait/.test(value)) return 'NFS'
  if (/balance_pgdat|reclaim|shrink|compact|do_swap|swap_|mem_cgroup|try_to_free|kswapd/.test(value)) return 'MEMORY_RECLAIM'
  if (/io_schedule|wait_on_page|folio_wait|filemap|submit_bio|blk_|ext4|xfs|btrfs|dm_/.test(value)) return 'BLOCK_IO'
  if (/sock|tcp|udp|inet|sk_wait|network|net_/.test(value)) return 'NETWORK'
  if (/futex|mutex|rwsem|semaphore|lock|wait_for_completion/.test(value)) return 'LOCK'
  return 'OTHER'
}

function topWchan(records = []) {
  const counts = new Map()
  records.forEach((row) => {
    const value = String(row.wchan || '').trim()
    if (!value) return
    const key = `${classifyWchan(value)}|${value}`
    counts.set(key, (counts.get(key) || 0) + 1)
  })
  const best = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]
  if (!best) return { wchan: '', className: 'NONE', count: 0 }
  const [className, wchan] = best[0].split('|')
  return { wchan, className, count: best[1] }
}

function nearestPrevious(records = [], current = {}) {
  const currentStamp = minuteStamp(current.actualTime || current.timeLabel || current.snapshot)
  if (currentStamp === null) return null
  const pid = String(current.pid || '')
  return records
    .filter((row) => String(row.pid || '') === pid)
    .map((row) => ({ row, stamp: minuteStamp(row.actualTime || row.timeLabel || row.snapshot) }))
    .filter((item) => item.stamp !== null && item.stamp < currentStamp)
    .sort((a, b) => b.stamp - a.stamp)[0]?.row || null
}

function ioRatesAtTarget(allRecords = [], targetRecords = []) {
  let readBps = 0
  let writeBps = 0
  let majfltPerMin = 0
  let observed = 0
  uniquePidSnapshot(targetRecords).forEach((current) => {
    const previous = nearestPrevious(allRecords, current)
    if (!previous) return
    const currentStamp = minuteStamp(current.actualTime || current.timeLabel || current.snapshot)
    const previousStamp = minuteStamp(previous.actualTime || previous.timeLabel || previous.snapshot)
    const seconds = currentStamp !== null && previousStamp !== null ? (currentStamp - previousStamp) * 60 : 0
    if (seconds <= 0 || seconds > 7200) return
    const curRead = metric(current.readBytes)
    const prevRead = metric(previous.readBytes)
    const curWrite = metric(current.writeBytes)
    const prevWrite = metric(previous.writeBytes)
    const curFault = metric(current.majflt)
    const prevFault = metric(previous.majflt)
    let used = false
    if (curRead !== null && prevRead !== null && curRead >= prevRead) { readBps += (curRead - prevRead) / seconds; used = true }
    if (curWrite !== null && prevWrite !== null && curWrite >= prevWrite) { writeBps += (curWrite - prevWrite) / seconds; used = true }
    if (curFault !== null && prevFault !== null && curFault >= prevFault) { majfltPerMin += (curFault - prevFault) / (seconds / 60); used = true }
    if (used) observed += 1
  })
  return {
    readMiBps: observed ? readBps / MIB : null,
    writeMiBps: observed ? writeBps / MIB : null,
    majorFaultsPerMin: observed ? majfltPerMin : null,
    observedPids: observed,
  }
}

function recordsForCollection(records = [], collectionKey = '') {
  return records.filter((row) => row.collectionKey === collectionKey)
}

function baselinePss(records = [], targetCollectionKey = '') {
  const byCollection = new Map()
  records.forEach((row) => {
    if (!row.collectionKey || row.collectionKey === targetCollectionKey) return
    if (!byCollection.has(row.collectionKey)) byCollection.set(row.collectionKey, [])
    byCollection.get(row.collectionKey).push(row)
  })
  return Array.from(byCollection.values()).map((rows) => snapshotMemory(rows).pssGb).filter((value) => value !== null)
}

function hostEvidence(row = {}, rca = {}) {
  const collection = rca.resourceLandscapePeak || rca.landscapePeak || null
  const host = collection?.byHost?.get?.(row.host) || null
  return {
    iowaitPct: metric(host?.iowaitPct),
    psiCpuSome10: metric(host?.psiCpuSome10),
    psiCpuFull10: metric(host?.psiCpuFull10),
    psiMemorySome10: metric(host?.psiMemorySome10),
    psiMemoryFull10: metric(host?.psiMemoryFull10),
    psiIoSome10: metric(host?.psiIoSome10),
    psiIoFull10: metric(host?.psiIoFull10),
    enhancedSampleSeconds: metric(host?.enhancedSampleSeconds),
  }
}

export function enrichWorkloadRowV13(row = {}, rca = {}) {
  const targetCollectionKey = row.targetCollectionKey || rca.resourceLandscapePeak?.key || ''
  const targetRecords = uniquePidSnapshot(recordsForCollection(row.records || [], targetCollectionKey))
  const memory = snapshotMemory(targetRecords)
  const pssHistory = baselinePss(row.records || [], targetCollectionKey)
  const pssUplift = uplift(memory.pssGb, pssHistory, 0.25)
  const wchan = topWchan(targetRecords)
  const io = ioRatesAtTarget(row.records || [], targetRecords)
  const host = hostEvidence(row, rca)
  const enhancedEvidence = [
    memory.pssGb, memory.privateGb, memory.sharedGb, io.readMiBps, io.writeMiBps,
    host.iowaitPct, host.psiMemorySome10, host.psiIoSome10,
  ].some((value) => value !== null) || wchan.className !== 'NONE'

  return {
    ...row,
    targetPssGb: memory.pssGb,
    targetPrivateGb: memory.privateGb,
    targetSharedGb: memory.sharedGb,
    pssBaseline: { median: median(pssHistory), count: pssHistory.length },
    pssUplift,
    targetWchan: wchan.wchan,
    wchanClass: wchan.className,
    wchanCount: wchan.count,
    targetReadMiBps: io.readMiBps,
    targetWriteMiBps: io.writeMiBps,
    targetMajorFaultsPerMin: io.majorFaultsPerMin,
    targetIoObservedPids: io.observedPids,
    hostIowaitPct: host.iowaitPct,
    hostPsiCpuSome10: host.psiCpuSome10,
    hostPsiCpuFull10: host.psiCpuFull10,
    hostPsiMemorySome10: host.psiMemorySome10,
    hostPsiMemoryFull10: host.psiMemoryFull10,
    hostPsiIoSome10: host.psiIoSome10,
    hostPsiIoFull10: host.psiIoFull10,
    enhancedEvidence,
  }
}

export function enrichRankedRowsV13(rows = [], rca = {}) {
  return rows.map((row) => enrichWorkloadRowV13(row, rca))
}

export const __test = {
  snapshotMemory,
  ioRatesAtTarget,
  uplift,
  topWchan,
}
