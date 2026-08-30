const metric = (value) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

const num = (value, fallback = 0) => metric(value) ?? fallback
const severityRank = (value = '') => ({ NORMAL: 0, WARN: 1, CRIT: 2 })[String(value || '').toUpperCase()] ?? 0

function epochMinutes(value = '') {
  const match = String(value || '').match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})/)
  if (!match) return null
  return Math.round(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5])) / 60000)
}

function gapMinutes(left = '', right = '') {
  const a = epochMinutes(left)
  const b = epochMinutes(right)
  return a === null || b === null ? 0 : Math.max(0, b - a)
}

function median(values = []) {
  const rows = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b)
  if (!rows.length) return 0
  const mid = Math.floor(rows.length / 2)
  return rows.length % 2 ? rows[mid] : (rows[mid - 1] + rows[mid]) / 2
}

export function snapshotSeverityV3(snapshot = {}) {
  const cpu = metric(snapshot.cpuPct)
  const ram = metric(snapshot.memoryPct)
  const load = metric(snapshot.loadRatio)
  const swapIn = metric(snapshot.swapIn)
  const wpCritical = metric(snapshot.wpCritical)
  const resourceCrit = (load !== null && load >= 1.5) || (ram !== null && ram >= 85) || (cpu !== null && cpu >= 90) || (swapIn !== null && swapIn >= 1000)
  const resourceWarn = (load !== null && load >= 1) || (ram !== null && ram >= 75) || (cpu !== null && cpu >= 75) || (swapIn !== null && swapIn >= 100)
  if (resourceCrit) return 'CRIT'
  if (resourceWarn || (wpCritical !== null && wpCritical >= 1)) return 'WARN'
  return 'NORMAL'
}

export function resourcePressureScoreV3(snapshot = {}) {
  const signals = [
    [metric(snapshot.cpuPct), 90],
    [metric(snapshot.memoryPct), 85],
    [metric(snapshot.loadRatio), 1.5],
    [metric(snapshot.swapIn), 1000],
  ].filter(([value]) => value !== null).map(([value, threshold]) => Math.max(0, value / threshold))
  if (!signals.length) return 0
  const maxSignal = Math.max(...signals)
  const avgSignal = signals.reduce((sum, value) => sum + value, 0) / signals.length
  return Math.round(Math.min(100, (maxSignal * 0.6 + avgSignal * 0.4) * 100))
}

function chooseBetterHostRow(previous, next) {
  if (!previous) return next
  const severityDelta = severityRank(next.severity) - severityRank(previous.severity)
  if (severityDelta > 0) return next
  if (severityDelta < 0) return previous
  return next.resourcePressure > previous.resourcePressure ? next : previous
}

function fileCycles(rows = []) {
  const sorted = [...rows].sort((a, b) => num(a.sortKey, Number.MAX_SAFE_INTEGER) - num(b.sortKey, Number.MAX_SAFE_INTEGER) || String(a.host).localeCompare(String(b.host)))
  const cycles = []
  let current = null
  for (const raw of sorted) {
    const row = { ...raw, severity: snapshotSeverityV3(raw), resourcePressure: resourcePressureScoreV3(raw) }
    const previous = current?.rows?.at(-1)
    const repeatedHost = current?.seenHosts?.has(row.host)
    const longGap = previous && gapMinutes(previous.timeLabel || previous.snapshot, row.timeLabel || row.snapshot) > 12 && current.seenHosts.size >= 2
    if (!current || repeatedHost || longGap) {
      current = { rows: [], seenHosts: new Set() }
      cycles.push(current)
    }
    current.rows.push(row)
    current.seenHosts.add(row.host)
  }
  return cycles.map((cycle, index) => ({ index, rows: cycle.rows }))
}

export function buildLogicalCollectionsV3(telemetry = []) {
  const byFile = new Map()
  telemetry.forEach((row, index) => {
    const fileName = row.fileName || `evidence-${index}`
    if (!byFile.has(fileName)) byFile.set(fileName, [])
    byFile.get(fileName).push(row)
  })

  const collections = []
  for (const [fileName, rows] of byFile.entries()) {
    for (const cycle of fileCycles(rows)) {
      const actualTimes = cycle.rows.map((row) => row.timeLabel || row.snapshot).filter(Boolean).sort()
      const byHost = new Map()
      cycle.rows.forEach((row) => byHost.set(row.host, chooseBetterHostRow(byHost.get(row.host), row)))
      const hostRows = Array.from(byHost.values()).sort((a, b) => String(a.host).localeCompare(String(b.host)))
      const crit = hostRows.filter((row) => row.severity === 'CRIT').length
      const warn = hostRows.filter((row) => row.severity === 'WARN').length
      const elevated = crit + warn
      const resourcePressure = hostRows.reduce((best, row) => Math.max(best, row.resourcePressure), 0)
      const averagePressure = hostRows.length ? Math.round(hostRows.reduce((sum, row) => sum + row.resourcePressure, 0) / hostRows.length) : 0
      const timeLabel = actualTimes[0] || cycle.rows[0]?.timeLabel || cycle.rows[0]?.snapshot || fileName
      const endTime = actualTimes.at(-1) || timeLabel
      const sortKey = cycle.rows.reduce((best, row) => Math.min(best, num(row.sortKey, Number.MAX_SAFE_INTEGER)), Number.MAX_SAFE_INTEGER)
      const key = `${fileName}::cycle-${cycle.index + 1}`
      const severity = hostRows.reduce((best, row) => severityRank(row.severity) > severityRank(best) ? row.severity : best, 'NORMAL')
      collections.push({
        key, fileName, cycle: cycle.index + 1, rows: hostRows, byHost, hostCount: hostRows.length,
        timeLabel, endTime, sortKey, crit, warn, elevated, normal: Math.max(0, hostRows.length - elevated), severity,
        resourcePressure, averagePressure,
        landscapeScore: crit * 50 + warn * 20 + resourcePressure + averagePressure * 0.25,
      })
    }
  }
  return collections.sort((a, b) => a.sortKey - b.sortKey || a.timeLabel.localeCompare(b.timeLabel) || a.fileName.localeCompare(b.fileName))
}

function cadenceOf(collections = []) {
  const diffs = []
  for (let index = 1; index < collections.length; index += 1) {
    const diff = gapMinutes(collections[index - 1].timeLabel, collections[index].timeLabel)
    if (diff > 0 && diff <= 240) diffs.push(diff)
  }
  const nominalMinutes = Math.round(median(diffs))
  const thresholdMinutes = Math.min(240, Math.max(30, nominalMinutes ? Math.round(nominalMinutes * 2.5) : 30))
  const gaps = []
  for (let index = 1; index < collections.length; index += 1) {
    const minutes = gapMinutes(collections[index - 1].timeLabel, collections[index].timeLabel)
    if (minutes > thresholdMinutes) gaps.push({ start: collections[index - 1].timeLabel, end: collections[index].timeLabel, minutes })
  }
  return { nominalMinutes, thresholdMinutes, gaps }
}

function peakMetric(samples = [], key = '') {
  const available = samples.filter((row) => metric(row[key]) !== null)
  if (!available.length) return null
  return available.reduce((best, row) => metric(row[key]) > metric(best?.value) ? { value: metric(row[key]), timeLabel: row.timeLabel, fileName: row.fileName, row } : best, null)
}

function buildHostPeaks(collections = [], hosts = []) {
  return hosts.map((host) => {
    const samples = collections.map((collection, collectionIndex) => {
      const row = collection.byHost.get(host)
      return row ? { ...row, collectionKey: collection.key, collectionIndex, collectionTime: collection.timeLabel } : null
    }).filter(Boolean)
    const resourcePeak = samples.reduce((best, row) => !best || row.resourcePressure > best.resourcePressure ? row : best, null)
    const operationalPeak = samples.reduce((best, row) => {
      if (!best) return row
      const severityDelta = severityRank(row.severity) - severityRank(best.severity)
      if (severityDelta > 0) return row
      if (severityDelta === 0 && row.resourcePressure > best.resourcePressure) return row
      return best
    }, null)
    const severity = samples.reduce((best, row) => severityRank(row.severity) > severityRank(best) ? row.severity : best, 'NORMAL')
    return {
      host,
      sampleCount: samples.length,
      severity,
      peak: resourcePeak,
      resourcePeak,
      operationalPeak,
      peakTime: resourcePeak?.timeLabel || resourcePeak?.collectionTime || '—',
      peakCollectionKey: resourcePeak?.collectionKey || '',
      peakCollectionIndex: resourcePeak?.collectionIndex ?? -1,
      peakPressure: resourcePeak?.resourcePressure || 0,
      metrics: {
        cpu: peakMetric(samples, 'cpuPct'), ram: peakMetric(samples, 'memoryPct'), load: peakMetric(samples, 'loadRatio'),
        swapIn: peakMetric(samples, 'swapIn'), wpCritical: peakMetric(samples, 'wpCritical'),
      },
    }
  }).sort((a, b) => b.peakPressure - a.peakPressure || severityRank(b.severity) - severityRank(a.severity) || a.host.localeCompare(b.host))
}

export function buildAutoPeakRcaV3(analysis = {}) {
  const telemetry = analysis?.telemetry || []
  const collections = buildLogicalCollectionsV3(telemetry)
  const hosts = Array.from(new Set(telemetry.map((row) => row.host).filter((host) => host && host !== 'UNKNOWN'))).sort()
  const hostPeaks = buildHostPeaks(collections, hosts)
  const landscapePeak = collections.reduce((best, row) => !best || row.landscapeScore > best.landscapeScore ? row : best, null)
  const cadence = cadenceOf(collections)
  const files = Array.from(new Set(telemetry.map((row) => row.fileName).filter(Boolean)))
  return {
    version: 3,
    hosts,
    collections,
    hostPeaks,
    landscapePeak,
    cadence,
    evidenceWindow: {
      start: collections[0]?.timeLabel || '',
      end: collections.at(-1)?.endTime || collections.at(-1)?.timeLabel || '',
      fileCount: files.length,
      collectionCount: collections.length,
    },
  }
}
