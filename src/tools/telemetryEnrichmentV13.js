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

function hasEnhancedFields(row = {}) {
  return ['pssGb', 'privateGb', 'sharedGb', 'readBytes', 'writeBytes', 'wchan'].some((field) => row[field] !== null && row[field] !== undefined && row[field] !== '')
}

function enhancedQuality(records = []) {
  const deltas = records.map((row) => metric(row.enhancedDeltaMinutes)).filter((value) => value !== null)
  if (!deltas.length) {
    return records.some(hasEnhancedFields)
      ? { usable: true, grade: 'UNVERIFIED_LEGACY', deltaMinutes: null }
      : { usable: false, grade: 'UNAVAILABLE', deltaMinutes: null }
  }
  const nearest = Math.min(...deltas.map((value) => Math.abs(value)))
  if (nearest <= 1) return { usable: true, grade: 'EXACT', deltaMinutes: nearest }
  if (nearest <= 2) return { usable: true, grade: 'NEAR', deltaMinutes: nearest }
  if (nearest <= 5) return { usable: false, grade: 'CONTEXT_ONLY', deltaMinutes: nearest }
  return { usable: false, grade: 'STALE', deltaMinutes: nearest }
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
    pssGb: sum('pssGb'), privateGb: sum('privateGb'), sharedGb: sum('sharedGb'),
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
  const candidates = records.filter((row) => String(row.wchan || '').trim())
  const blocked = candidates.filter((row) => String(row.procState || row.state || '').toUpperCase() === 'D')
  const source = blocked.length ? blocked : candidates
  const counts = new Map()
  source.forEach((row) => {
    const value = String(row.wchan || '').trim()
    const key = `${classifyWchan(value)}|${value}`
    counts.set(key, (counts.get(key) || 0) + 1)
  })
  const best = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]
  if (!best) return { wchan: '', className: 'NONE', count: 0, scope: 'NONE', dStatePids: 0 }
  const [className, wchan] = best[0].split('|')
  return { wchan, className, count: best[1], scope: blocked.length ? 'D_STATE' : 'ALL_STATE', dStatePids: blocked.length }
}

function nearestPrevious(records = [], current = {}) {
  const currentStamp = minuteStamp(current.actualTime || current.timeLabel || current.snapshot)
  if (currentStamp === null) return null
  const pid = String(current.pid || '')
  return records.filter((row) => String(row.pid || '') === pid)
    .map((row) => ({ row, stamp: minuteStamp(row.actualTime || row.timeLabel || row.snapshot) }))
    .filter((item) => item.stamp !== null && item.stamp < currentStamp)
    .sort((a, b) => b.stamp - a.stamp)[0]?.row || null
}

function ioRatesAtTarget(allRecords = [], targetRecords = []) {
  let readBps = 0; let writeBps = 0; let majfltPerMin = 0; let observed = 0
  const windows = []
  uniquePidSnapshot(targetRecords).forEach((current) => {
    const previous = nearestPrevious(allRecords, current)
    if (!previous) return
    const currentStamp = minuteStamp(current.actualTime || current.timeLabel || current.snapshot)
    const previousStamp = minuteStamp(previous.actualTime || previous.timeLabel || previous.snapshot)
    const seconds = currentStamp !== null && previousStamp !== null ? (currentStamp - previousStamp) * 60 : 0
    if (seconds <= 0 || seconds > 7200) return
    const curRead = metric(current.readBytes); const prevRead = metric(previous.readBytes)
    const curWrite = metric(current.writeBytes); const prevWrite = metric(previous.writeBytes)
    const curFault = metric(current.majflt); const prevFault = metric(previous.majflt)
    let used = false
    if (curRead !== null && prevRead !== null && curRead >= prevRead) { readBps += (curRead - prevRead) / seconds; used = true }
    if (curWrite !== null && prevWrite !== null && curWrite >= prevWrite) { writeBps += (curWrite - prevWrite) / seconds; used = true }
    if (curFault !== null && prevFault !== null && curFault >= prevFault) { majfltPerMin += (curFault - prevFault) / (seconds / 60); used = true }
    if (used) { observed += 1; windows.push(seconds / 60) }
  })
  return { readMiBps: observed ? readBps / MIB : null, writeMiBps: observed ? writeBps / MIB : null, majorFaultsPerMin: observed ? majfltPerMin : null, observedPids: observed, windowMinutes: windows.length ? median(windows) : null }
}

function recordsForCollection(records = [], collectionKey = '') { return records.filter((row) => row.collectionKey === collectionKey) }

function baselinePss(records = [], targetCollectionKey = '') {
  const targetIndex = records.find((row) => row.collectionKey === targetCollectionKey)?.collectionIndex
  const byCollection = new Map()
  records.forEach((row) => {
    if (!row.collectionKey || row.collectionKey === targetCollectionKey) return
    if (Number.isFinite(Number(targetIndex)) && Number.isFinite(Number(row.collectionIndex)) && Math.abs(Number(row.collectionIndex) - Number(targetIndex)) <= 1) return
    if (!byCollection.has(row.collectionKey)) byCollection.set(row.collectionKey, [])
    byCollection.get(row.collectionKey).push(row)
  })
  let values = Array.from(byCollection.values()).map((rows) => snapshotMemory(rows).pssGb).filter((value) => value !== null)
  if (values.length < 3) {
    const fallback = new Map()
    records.forEach((row) => {
      if (!row.collectionKey || row.collectionKey === targetCollectionKey) return
      if (!fallback.has(row.collectionKey)) fallback.set(row.collectionKey, [])
      fallback.get(row.collectionKey).push(row)
    })
    values = Array.from(fallback.values()).map((rows) => snapshotMemory(rows).pssGb).filter((value) => value !== null)
  }
  return values
}

function hostEvidence(row = {}, rca = {}) {
  const collection = rca.resourceLandscapePeak || rca.landscapePeak || null
  const host = collection?.byHost?.get?.(row.host) || null
  const delta = metric(host?.enhancedDeltaMinutes)
  const hasHostEnhanced = ['iowaitPct', 'psiCpuSome10', 'psiMemorySome10', 'psiIoSome10'].some((field) => metric(host?.[field]) !== null)
  const usable = delta === null ? hasHostEnhanced : Math.abs(delta) <= 2
  return {
    iowaitPct: usable ? metric(host?.iowaitPct) : null, psiCpuSome10: usable ? metric(host?.psiCpuSome10) : null, psiCpuFull10: usable ? metric(host?.psiCpuFull10) : null,
    psiMemorySome10: usable ? metric(host?.psiMemorySome10) : null, psiMemoryFull10: usable ? metric(host?.psiMemoryFull10) : null, psiIoSome10: usable ? metric(host?.psiIoSome10) : null, psiIoFull10: usable ? metric(host?.psiIoFull10) : null,
    enhancedSampleSeconds: usable ? metric(host?.enhancedSampleSeconds) : null, enhancedSampleTime: host?.enhancedSampleTime || '', enhancedDeltaMinutes: delta, enhancedMapping: host?.enhancedMapping || (hasHostEnhanced ? 'UNVERIFIED_LEGACY' : 'UNAVAILABLE'), usable,
  }
}

export function enrichWorkloadRowV13(row = {}, rca = {}) {
  const targetCollectionKey = row.targetCollectionKey || rca.resourceLandscapePeak?.key || ''
  const rawTargetRecords = uniquePidSnapshot(recordsForCollection(row.records || [], targetCollectionKey))
  const quality = enhancedQuality(rawTargetRecords)
  const targetRecords = quality.grade === 'UNVERIFIED_LEGACY'
    ? rawTargetRecords
    : quality.usable ? rawTargetRecords.filter((item) => { const delta = metric(item.enhancedDeltaMinutes); return delta !== null && Math.abs(delta) <= 2 }) : []
  const memory = snapshotMemory(targetRecords)
  const pssHistory = baselinePss(row.records || [], targetCollectionKey)
  const pssUplift = uplift(memory.pssGb, pssHistory, 0.25)
  const wchan = topWchan(targetRecords)
  const io = ioRatesAtTarget(row.records || [], targetRecords)
  const host = hostEvidence(row, rca)
  const processEnhanced = [memory.pssGb, memory.privateGb, memory.sharedGb, io.readMiBps, io.writeMiBps].some((value) => value !== null) || wchan.className !== 'NONE'
  const enhancedEvidenceUsable = quality.usable && processEnhanced
  return {
    ...row,
    targetPssGb: memory.pssGb, targetPrivateGb: memory.privateGb, targetSharedGb: memory.sharedGb,
    pssBaseline: { median: median(pssHistory), count: pssHistory.length }, pssUplift,
    targetWchan: wchan.wchan, wchanClass: wchan.className, wchanCount: wchan.count, wchanScope: wchan.scope, wchanDStatePids: wchan.dStatePids,
    targetReadMiBps: io.readMiBps, targetWriteMiBps: io.writeMiBps, targetMajorFaultsPerMin: io.majorFaultsPerMin, targetIoObservedPids: io.observedPids, targetIoWindowMinutes: io.windowMinutes,
    hostIowaitPct: host.iowaitPct, hostPsiCpuSome10: host.psiCpuSome10, hostPsiCpuFull10: host.psiCpuFull10, hostPsiMemorySome10: host.psiMemorySome10, hostPsiMemoryFull10: host.psiMemoryFull10, hostPsiIoSome10: host.psiIoSome10, hostPsiIoFull10: host.psiIoFull10,
    enhancedEvidence: processEnhanced || host.usable, enhancedEvidenceUsable, enhancedEvidenceQuality: quality.grade, enhancedEvidenceDeltaMinutes: quality.deltaMinutes,
    enhancedHostEvidenceUsable: host.usable, enhancedHostMapping: host.enhancedMapping, enhancedHostDeltaMinutes: host.enhancedDeltaMinutes,
  }
}

export function enrichRankedRowsV13(rows = [], rca = {}) { return rows.map((row) => enrichWorkloadRowV13(row, rca)) }

export const __test = { snapshotMemory, ioRatesAtTarget, uplift, topWchan, baselinePss, enhancedQuality }
