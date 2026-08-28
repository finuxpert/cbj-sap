const UNKNOWN = '?'

const num = (value, fallback = 0) => {
  const parsed = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : fallback
}

const median = (values = []) => {
  const rows = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b)
  if (!rows.length) return 0
  const mid = Math.floor(rows.length / 2)
  return rows.length % 2 ? rows[mid] : (rows[mid - 1] + rows[mid]) / 2
}

const severityRank = (value = '') => ({ NORMAL: 0, OK: 0, WARN: 1, CRIT: 2 })[String(value || '').toUpperCase()] ?? 0

export function snapshotSeverityAuto(snapshot = {}) {
  const cpu = num(snapshot.cpuPct)
  const ram = num(snapshot.memoryPct)
  const load = num(snapshot.loadRatio)
  const swapIn = num(snapshot.swapIn)
  const wpCritical = num(snapshot.wpCritical)
  if (load >= 1.5 || ram >= 85 || cpu >= 90 || swapIn >= 1000 || wpCritical >= 3) return 'CRIT'
  if (load >= 1 || ram >= 75 || cpu >= 75 || swapIn >= 100 || wpCritical >= 1) return 'WARN'
  return 'NORMAL'
}

export function pressureScoreAuto(snapshot = {}) {
  const normalized = [
    num(snapshot.cpuPct) / 90,
    num(snapshot.memoryPct) / 85,
    num(snapshot.loadRatio) / 1.5,
    num(snapshot.swapIn) / 1000,
    num(snapshot.wpCritical) / 3,
  ].map((value) => Math.max(0, value))
  const maxSignal = Math.max(...normalized, 0)
  const avgSignal = normalized.reduce((sum, value) => sum + value, 0) / normalized.length
  return Math.round(Math.min(100, (maxSignal * 0.55 + avgSignal * 0.45) * 100))
}

function epochMinutes(value = '') {
  const match = String(value || '').match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})/)
  if (!match) return null
  const millis = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]))
  return Math.round(millis / 60000)
}

function gapMinutes(left = '', right = '') {
  const a = epochMinutes(left)
  const b = epochMinutes(right)
  return a === null || b === null ? 0 : Math.max(0, b - a)
}

function worstSeverity(rows = []) {
  return rows.reduce((best, row) => severityRank(row.severity) > severityRank(best) ? row.severity : best, 'NORMAL')
}

function collectionKey(row = {}, index = 0) {
  return row.fileName || row.snapshot || row.timeLabel || `collection-${index}`
}

function buildCollections(telemetry = []) {
  const map = new Map()
  telemetry.forEach((raw, index) => {
    const row = { ...raw, severity: snapshotSeverityAuto(raw), pressureScore: pressureScoreAuto(raw) }
    const key = collectionKey(row, index)
    const current = map.get(key) || { key, fileName: row.fileName || key, rows: [], sortKey: Number.MAX_SAFE_INTEGER, timeLabel: '' }
    current.rows.push(row)
    if (num(row.sortKey, Number.MAX_SAFE_INTEGER) < current.sortKey) {
      current.sortKey = num(row.sortKey, Number.MAX_SAFE_INTEGER)
      current.timeLabel = row.timeLabel || current.timeLabel
    }
    map.set(key, current)
  })

  return Array.from(map.values()).map((item) => {
    const byHost = new Map()
    item.rows.forEach((row) => {
      const previous = byHost.get(row.host)
      if (!previous || severityRank(row.severity) > severityRank(previous.severity) || row.pressureScore > previous.pressureScore) byHost.set(row.host, row)
    })
    const rows = Array.from(byHost.values()).sort((a, b) => String(a.host).localeCompare(String(b.host)))
    const crit = rows.filter((row) => row.severity === 'CRIT').length
    const warn = rows.filter((row) => row.severity === 'WARN').length
    const elevated = crit + warn
    const averagePressure = rows.length ? rows.reduce((sum, row) => sum + row.pressureScore, 0) / rows.length : 0
    const maxPressure = rows.reduce((best, row) => Math.max(best, row.pressureScore), 0)
    const landscapeScore = crit * 50 + warn * 20 + averagePressure
    return {
      ...item,
      rows,
      byHost,
      hostCount: rows.length,
      crit,
      warn,
      elevated,
      normal: Math.max(0, rows.length - elevated),
      severity: worstSeverity(rows),
      averagePressure: Math.round(averagePressure),
      maxPressure,
      landscapeScore,
    }
  }).sort((a, b) => a.sortKey - b.sortKey || a.timeLabel.localeCompare(b.timeLabel) || a.fileName.localeCompare(b.fileName))
}

function cadenceOf(collections = []) {
  const diffs = []
  for (let i = 1; i < collections.length; i += 1) {
    const diff = gapMinutes(collections[i - 1].timeLabel, collections[i].timeLabel)
    if (diff > 0 && diff <= 180) diffs.push(diff)
  }
  const nominal = Math.round(median(diffs))
  const threshold = Math.min(180, Math.max(30, nominal ? Math.round(nominal * 2.5) : 30))
  const gaps = []
  for (let i = 1; i < collections.length; i += 1) {
    const minutes = gapMinutes(collections[i - 1].timeLabel, collections[i].timeLabel)
    if (minutes > threshold) gaps.push({
      start: collections[i - 1].timeLabel,
      end: collections[i].timeLabel,
      minutes,
      afterFile: collections[i - 1].fileName,
      beforeFile: collections[i].fileName,
    })
  }
  return { nominalMinutes: nominal, thresholdMinutes: threshold, gaps }
}

function peakMetric(rows = [], key = '') {
  return rows.reduce((best, row) => num(row[key]) > num(best?.value) ? { value: num(row[key]), row, timeLabel: row.timeLabel, fileName: row.fileName } : best, null)
}

function buildHostPeaks(collections = [], hosts = []) {
  return hosts.map((host) => {
    const samples = collections.map((collection, index) => {
      const row = collection.byHost.get(host)
      return row ? { ...row, collectionIndex: index, collectionKey: collection.key, collectionTime: collection.timeLabel } : null
    }).filter(Boolean)
    const peak = samples.reduce((best, row) => {
      if (!best) return row
      const severityDelta = severityRank(row.severity) - severityRank(best.severity)
      if (severityDelta > 0) return row
      if (severityDelta === 0 && row.pressureScore > best.pressureScore) return row
      return best
    }, null)
    return {
      host,
      sampleCount: samples.length,
      severity: worstSeverity(samples),
      peak,
      peakTime: peak?.collectionTime || peak?.timeLabel || '—',
      peakCollectionIndex: peak?.collectionIndex ?? -1,
      peakPressure: peak?.pressureScore || 0,
      metrics: {
        cpu: peakMetric(samples, 'cpuPct'),
        ram: peakMetric(samples, 'memoryPct'),
        load: peakMetric(samples, 'loadRatio'),
        swapIn: peakMetric(samples, 'swapIn'),
        wpCritical: peakMetric(samples, 'wpCritical'),
      },
    }
  }).sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || b.peakPressure - a.peakPressure || a.host.localeCompare(b.host))
}

function identityName(row = {}) {
  if (row.workloadName && row.workloadName !== UNKNOWN) return row.workloadName
  if (row.jobName && row.jobName !== UNKNOWN) return row.jobName
  if (row.program && row.program !== UNKNOWN) return row.program
  return row.pid ? `PID ${row.pid}` : 'Unknown workload'
}

function seriesForWorkload(records = [], collectionKeys = []) {
  const grouped = new Map(collectionKeys.map((key) => [key, []]))
  records.forEach((row) => {
    const key = row.fileName || row.snapshot || row.timeLabel
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(row)
  })
  return collectionKeys.map((key) => {
    const rows = grouped.get(key) || []
    const cpuRows = rows.filter((row) => Number.isFinite(Number(row.cpu)))
    const rssRows = rows.filter((row) => Number.isFinite(Number(row.rssGb)))
    const errors = Array.from(new Set(rows.map((row) => row.errorCode).filter((value) => value && value !== UNKNOWN)))
    const pids = Array.from(new Set(rows.map((row) => row.pid).filter(Boolean)))
    return {
      key,
      cpu: cpuRows.reduce((sum, row) => sum + num(row.cpu), 0),
      rss: rssRows.reduce((sum, row) => sum + num(row.rssGb), 0),
      dState: rows.filter((row) => String(row.state || '').toUpperCase() === 'D').length,
      errors,
      pids,
      present: rows.length > 0,
    }
  })
}

function peakOfSeries(series = [], key = '') {
  return series.reduce((best, row) => num(row[key]) > num(best?.[key]) ? row : best, null)
}

function groupWorkloads(processes = [], host = '') {
  const map = new Map()
  processes.filter((row) => row.host === host).forEach((row) => {
    const name = identityName(row)
    const key = `${host}|${name}`
    const current = map.get(key) || { key, host, name, records: [], programs: new Set(), types: new Set() }
    current.records.push(row)
    if (row.program && row.program !== UNKNOWN) current.programs.add(row.program)
    if (row.type && row.type !== UNKNOWN) current.types.add(row.type)
    map.set(key, current)
  })
  return Array.from(map.values())
}

function buildHostCandidates(processes = [], collections = [], hostPeak = null) {
  if (!hostPeak || hostPeak.peakCollectionIndex < 0) return []
  const peakIndex = hostPeak.peakCollectionIndex
  const duringStart = Math.max(0, peakIndex - 1)
  const duringEnd = Math.min(collections.length - 1, peakIndex + 1)
  const baselineStart = Math.max(0, duringStart - 3)
  const baselineEnd = duringStart - 1
  const afterStart = duringEnd + 1
  const afterEnd = Math.min(collections.length - 1, duringEnd + 2)

  const baselineCollections = baselineEnd >= baselineStart ? collections.slice(baselineStart, baselineEnd + 1) : []
  const duringCollections = collections.slice(duringStart, duringEnd + 1)
  const afterCollections = afterStart <= afterEnd ? collections.slice(afterStart, afterEnd + 1) : []
  const baselineKeys = baselineCollections.map((item) => item.key)
  const duringKeys = duringCollections.map((item) => item.key)
  const afterKeys = afterCollections.map((item) => item.key)

  return groupWorkloads(processes, hostPeak.host).map((group) => {
    const before = seriesForWorkload(group.records, baselineKeys)
    const during = seriesForWorkload(group.records, duringKeys)
    const after = seriesForWorkload(group.records, afterKeys)
    const beforeCpu = median(before.map((row) => row.cpu))
    const beforeRss = median(before.map((row) => row.rss))
    const beforeD = median(before.map((row) => row.dState))
    const peakCpuRow = peakOfSeries(during, 'cpu')
    const peakRssRow = peakOfSeries(during, 'rss')
    const peakDRow = peakOfSeries(during, 'dState')
    const peakCpu = num(peakCpuRow?.cpu)
    const peakRss = num(peakRssRow?.rss)
    const peakD = num(peakDRow?.dState)
    const cpuDelta = peakCpu - beforeCpu
    const rssDelta = peakRss - beforeRss
    const dStateDelta = peakD - beforeD
    const beforeErrors = new Set(before.flatMap((row) => row.errors))
    const duringErrors = Array.from(new Set(during.flatMap((row) => row.errors)))
    const newErrors = duringErrors.filter((error) => !beforeErrors.has(error))
    const presentCount = during.filter((row) => row.present).length
    const persistence = during.length ? presentCount / during.length : 0
    const peakPids = Math.max(0, ...during.map((row) => row.pids.length))

    const cpuSignal = Math.min(1, Math.max(peakCpu / 50, Math.max(0, cpuDelta) / 20))
    const rssSignal = Math.min(1, Math.max(peakRss / 8, Math.max(0, rssDelta) / 4))
    const dSignal = Math.min(1, Math.max(0, dStateDelta) / 2)
    const resourceSignal = Math.min(1, cpuSignal * 0.38 + rssSignal * 0.36 + dSignal * 0.16 + persistence * 0.10)
    const errorSignal = newErrors.length ? Math.min(1, 0.55 + newErrors.length * 0.18) : duringErrors.length ? 0.18 : 0
    const score = Math.round(Math.min(100, (resourceSignal * 0.75 + errorSignal * 0.25) * 100))
    const resourceRelevant = resourceSignal >= 0.35
    const errorRelevant = newErrors.length > 0
    const classification = resourceRelevant && errorRelevant ? 'MIXED' : resourceRelevant ? 'RESOURCE' : errorRelevant ? 'ERROR' : 'BACKGROUND'
    const afterCpu = median(after.map((row) => row.cpu))
    const afterRss = median(after.map((row) => row.rss))
    const recovery = after.length ? ((afterCpu < peakCpu * 0.7 || peakCpu === 0) && (afterRss < peakRss * 0.85 || peakRss === 0)) : false

    return {
      ...group,
      programs: Array.from(group.programs),
      types: Array.from(group.types),
      classification,
      score,
      resourceSignal,
      errorSignal,
      peakCpu,
      peakRss,
      peakDState: peakD,
      cpuDelta,
      rssDelta,
      dStateDelta,
      peakPids,
      persistence,
      duringErrors,
      newErrors,
      recovery,
      baselineWindow: baselineCollections.length ? `${baselineCollections[0].timeLabel} → ${baselineCollections.at(-1).timeLabel}` : 'No baseline',
      peakWindow: duringCollections.length ? `${duringCollections[0].timeLabel} → ${duringCollections.at(-1).timeLabel}` : hostPeak.peakTime,
      afterWindow: afterCollections.length ? `${afterCollections[0].timeLabel} → ${afterCollections.at(-1).timeLabel}` : 'No post-peak evidence',
    }
  }).sort((a, b) => {
    const classRank = { MIXED: 3, RESOURCE: 2, ERROR: 1, BACKGROUND: 0 }
    return classRank[b.classification] - classRank[a.classification] || b.score - a.score || b.peakCpu - a.peakCpu || b.peakRss - a.peakRss
  })
}

function buildLandscapeCandidates(hostPeaks = [], hostCandidates = new Map()) {
  const map = new Map()
  hostPeaks.forEach((hostPeak) => {
    const candidates = (hostCandidates.get(hostPeak.host) || []).filter((item) => item.classification !== 'BACKGROUND').slice(0, 10)
    candidates.forEach((candidate) => {
      const key = candidate.name
      const current = map.get(key) || { name: candidate.name, hosts: new Set(), scores: [], classifications: new Set(), errors: new Set(), peakCpu: 0, peakRss: 0 }
      current.hosts.add(candidate.host)
      current.scores.push(candidate.score)
      current.classifications.add(candidate.classification)
      candidate.newErrors.forEach((error) => current.errors.add(error))
      current.peakCpu = Math.max(current.peakCpu, candidate.peakCpu)
      current.peakRss = Math.max(current.peakRss, candidate.peakRss)
      map.set(key, current)
    })
  })
  return Array.from(map.values()).map((item) => {
    const hosts = Array.from(item.hosts)
    const averageScore = item.scores.length ? Math.round(item.scores.reduce((sum, value) => sum + value, 0) / item.scores.length) : 0
    const classification = item.classifications.has('MIXED') ? 'MIXED' : item.classifications.has('RESOURCE') ? 'RESOURCE' : item.classifications.has('ERROR') ? 'ERROR' : 'BACKGROUND'
    return { ...item, hosts, hostCount: hosts.length, averageScore, classification, errors: Array.from(item.errors) }
  }).sort((a, b) => b.hostCount - a.hostCount || b.averageScore - a.averageScore || b.peakCpu - a.peakCpu)
}

export function buildAutoPeakRca(analysis = null) {
  if (!analysis?.telemetry?.length) return null
  const collections = buildCollections(analysis.telemetry)
  const hosts = Array.from(new Set(analysis.telemetry.map((row) => row.host).filter((host) => host && host !== 'UNKNOWN'))).sort()
  const cadence = cadenceOf(collections)
  const hostPeaks = buildHostPeaks(collections, hosts)
  const landscapePeak = collections.reduce((best, collection) => {
    if (!best) return collection
    if (collection.crit > best.crit) return collection
    if (collection.crit === best.crit && collection.elevated > best.elevated) return collection
    if (collection.crit === best.crit && collection.elevated === best.elevated && collection.landscapeScore > best.landscapeScore) return collection
    return best
  }, null)
  const hostCandidates = new Map()
  hostPeaks.forEach((hostPeak) => hostCandidates.set(hostPeak.host, buildHostCandidates(analysis.processes || [], collections, hostPeak)))
  const landscapeCandidates = buildLandscapeCandidates(hostPeaks, hostCandidates)
  return {
    collections,
    hosts,
    cadence,
    hostPeaks,
    hostCandidates,
    landscapeCandidates,
    landscapePeak,
    evidenceWindow: {
      start: collections[0]?.timeLabel || '—',
      end: collections.at(-1)?.timeLabel || '—',
      count: collections.length,
      fileCount: new Set(collections.map((item) => item.fileName)).size,
      hostCount: hosts.length,
    },
  }
}
