import * as duckdb from '@duckdb/duckdb-wasm'
import duckdbMvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'
import duckdbEhWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import duckdbMvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url'
import duckdbEhWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'
import { resourceSignalScoresV3 } from './logSphereEngineV3.js'

const UNKNOWN = '?'
const DUCKDB_TIMEOUT_MS = 5000
const MAX_MAPPING_DISTANCE_MINUTES = 5
const BUNDLES = { mvp: { mainModule: duckdbMvpWasm, mainWorker: duckdbMvpWorker }, eh: { mainModule: duckdbEhWasm, mainWorker: duckdbEhWorker } }

const metric = (value) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}
const numeric = (value) => metric(value) ?? 0
const clean = (value) => String(value ?? '').replace(/[\t\r\n]+/g, ' ').trim()
const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0))

function identity(row = {}) {
  if (row.workloadName && row.workloadName !== UNKNOWN) return row.workloadName
  if (row.jobName && row.jobName !== UNKNOWN) return row.jobName
  if (row.program && row.program !== UNKNOWN) return row.program
  return row.pid ? `PID ${row.pid}` : 'Unknown workload'
}

function minuteStamp(value = '') {
  const match = String(value || '').match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})/)
  if (!match) return null
  return Math.round(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5])) / 60000)
}

function withTimeout(promise, ms = DUCKDB_TIMEOUT_MS, label = 'DuckDB operation') {
  let timer
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms) })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function median(values = []) {
  const rows = values.map(metric).filter((value) => value !== null).sort((a, b) => a - b)
  if (!rows.length) return null
  const middle = Math.floor(rows.length / 2)
  return rows.length % 2 ? rows[middle] : (rows[middle - 1] + rows[middle]) / 2
}

function medianAbsoluteDeviation(values = [], center = null) {
  const observed = values.map(metric).filter((value) => value !== null)
  const pivot = center ?? median(observed)
  if (pivot === null || !observed.length) return null
  return median(observed.map((value) => Math.abs(value - pivot)))
}

function baselineStats(samples = [], key = '', targetIndex = -1, floor = 0.1) {
  let candidates = samples.filter((row) => row.collectionIndex >= 0 && Math.abs(row.collectionIndex - targetIndex) > 1 && metric(row[key]) !== null)
  if (candidates.length < 3) candidates = samples.filter((row) => row.collectionIndex !== targetIndex && metric(row[key]) !== null)
  const values = candidates.map((row) => metric(row[key])).filter((value) => value !== null)
  const center = median(values)
  const mad = medianAbsoluteDeviation(values, center)
  const scale = center === null ? null : Math.max(floor, (mad ?? 0) * 1.4826)
  return { median: center, mad, scale, count: values.length }
}

function upliftAgainstBaseline(value, baseline = {}) {
  const observed = metric(value)
  if (observed === null || baseline.median === null || baseline.scale === null || baseline.count < 2) return { score: null, z: null, delta: null }
  const delta = observed - baseline.median
  const z = delta / baseline.scale
  return { score: clamp01(z / 4), z, delta }
}

function collectionIndex(rca = {}) {
  const exact = new Map()
  const byFileHost = new Map()
  ;(rca.collections || []).forEach((collection, index) => {
    collection.rows.forEach((row) => {
      const stamp = row.snapshot || row.timeLabel || ''
      const sample = {
        key: collection.key,
        index,
        time: collection.timeLabel,
        sampleTime: row.timeLabel || row.snapshot || collection.timeLabel,
        stamp: minuteStamp(row.timeLabel || row.snapshot || collection.timeLabel),
      }
      exact.set(`${row.fileName || collection.fileName}|${row.host}|${stamp}`, sample)
      const fh = `${row.fileName || collection.fileName}|${row.host}`
      if (!byFileHost.has(fh)) byFileHost.set(fh, [])
      byFileHost.get(fh).push(sample)
    })
  })
  return { exact, byFileHost }
}

function unmappedRow(row, actualTime, distance = null) {
  return {
    ...row,
    workload: identity(row),
    collectionKey: `unmapped:${row.fileName}:${actualTime}`,
    collectionIndex: -1,
    collectionTime: actualTime,
    actualTime,
    mappingConfidence: 'UNMAPPED',
    mappingDistanceMinutes: distance,
  }
}

function attachCollections(processes = [], rca = {}) {
  const index = collectionIndex(rca)
  return processes.map((row) => {
    const actualTime = row.timeLabel || row.snapshot || ''
    const exact = index.exact.get(`${row.fileName}|${row.host}|${row.snapshot || actualTime}`)
    if (exact) {
      return {
        ...row,
        workload: identity(row),
        collectionKey: exact.key,
        collectionIndex: exact.index,
        collectionTime: exact.time,
        actualTime,
        mappingConfidence: 'EXACT',
        mappingDistanceMinutes: 0,
      }
    }

    const candidates = index.byFileHost.get(`${row.fileName}|${row.host}`) || []
    const target = minuteStamp(actualTime)
    if (target === null || !candidates.length) return unmappedRow(row, actualTime)

    const nearest = candidates.reduce((best, candidate) => {
      if (candidate.stamp === null) return best
      const distance = Math.abs(candidate.stamp - target)
      return !best || distance < best.distance ? { ...candidate, distance } : best
    }, null)
    if (!nearest || nearest.distance > MAX_MAPPING_DISTANCE_MINUTES) return unmappedRow(row, actualTime, nearest?.distance ?? null)

    return {
      ...row,
      workload: identity(row),
      collectionKey: nearest.key,
      collectionIndex: nearest.index,
      collectionTime: nearest.time,
      actualTime,
      mappingConfidence: nearest.distance <= 2 ? 'NEAREST_2M' : 'NEAREST_5M',
      mappingDistanceMinutes: nearest.distance,
    }
  })
}

function aggregateSnapshotsJs(rows = []) {
  const groups = new Map()
  rows.forEach((row) => {
    const key = `${row.host}|${row.workload}|${row.collectionKey}`
    const current = groups.get(key) || {
      host: row.host,
      workload: row.workload,
      collectionKey: row.collectionKey,
      collectionIndex: row.collectionIndex,
      collectionTime: row.collectionTime,
      cpuValues: [],
      rssValues: [],
      pids: new Set(),
      dState: 0,
      errors: new Set(),
      programs: new Map(),
      types: new Map(),
      rawCount: 0,
    }
    const cpu = metric(row.cpu)
    const rss = metric(row.rssGb)
    if (cpu !== null) current.cpuValues.push(cpu)
    if (rss !== null) current.rssValues.push(rss)
    if (row.pid) current.pids.add(String(row.pid))
    if (String(row.state || '').toUpperCase() === 'D') current.dState += 1
    if (row.errorCode && row.errorCode !== UNKNOWN) current.errors.add(row.errorCode)
    if (row.program && row.program !== UNKNOWN) current.programs.set(row.program, (current.programs.get(row.program) || 0) + 1)
    if (row.type && row.type !== UNKNOWN) current.types.set(row.type, (current.types.get(row.type) || 0) + 1)
    current.rawCount += 1
    groups.set(key, current)
  })
  const mode = (map) => [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '—'
  return Array.from(groups.values()).map((item) => ({
    host: item.host,
    workload: item.workload,
    collectionKey: item.collectionKey,
    collectionIndex: item.collectionIndex,
    collectionTime: item.collectionTime,
    cpu: item.cpuValues.length ? item.cpuValues.reduce((sum, value) => sum + value, 0) : null,
    rssGb: item.rssValues.length ? item.rssValues.reduce((sum, value) => sum + value, 0) : null,
    maxPidRssGb: item.rssValues.length ? Math.max(...item.rssValues) : null,
    concurrentPids: item.pids.size,
    dState: item.dState,
    errors: Array.from(item.errors),
    program: mode(item.programs),
    type: mode(item.types),
    rawCount: item.rawCount,
  })).sort((a, b) => a.collectionIndex - b.collectionIndex || a.collectionTime.localeCompare(b.collectionTime))
}

async function aggregateSnapshotsDuckDb(rows = []) {
  let worker
  let db
  let conn
  try {
    const bundle = await withTimeout(duckdb.selectBundle(BUNDLES), 1800, 'DuckDB bundle selection')
    worker = new Worker(bundle.mainWorker)
    db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING), worker)
    await withTimeout(db.instantiate(bundle.mainModule, bundle.pthreadWorker), DUCKDB_TIMEOUT_MS, 'DuckDB instantiate')
    conn = await withTimeout(db.connect(), 1800, 'DuckDB connect')
    const header = ['host', 'workload', 'collection_key', 'collection_index', 'collection_time', 'program', 'type', 'state', 'pid', 'error_code', 'cpu', 'rss']
    const lines = [header.join('\t')]
    rows.forEach((row) => {
      const cpu = metric(row.cpu)
      const rss = metric(row.rssGb)
      lines.push([
        clean(row.host), clean(row.workload), clean(row.collectionKey), row.collectionIndex, clean(row.collectionTime), clean(row.program), clean(row.type), clean(row.state), clean(row.pid), clean(row.errorCode),
        cpu === null ? '' : cpu, rss === null ? '' : rss,
      ].join('\t'))
    })
    const fileName = `workload-v32-${Date.now()}.tsv`
    await withTimeout(db.registerFileText(fileName, lines.join('\n')), 1800, 'DuckDB file registration')
    const result = await withTimeout(conn.query(`
      SELECT
        host, workload, collection_key,
        min(try_cast(collection_index AS INTEGER)) AS collection_index,
        any_value(collection_time) AS collection_time,
        any_value(nullif(program, '')) AS program,
        any_value(nullif(type, '')) AS type,
        sum(try_cast(nullif(cpu, '') AS DOUBLE)) AS cpu,
        sum(try_cast(nullif(rss, '') AS DOUBLE)) AS rss_gb,
        max(try_cast(nullif(rss, '') AS DOUBLE)) AS max_pid_rss_gb,
        count(DISTINCT nullif(pid, '')) AS concurrent_pids,
        sum(CASE WHEN upper(state) = 'D' THEN 1 ELSE 0 END) AS d_state,
        string_agg(DISTINCT nullif(error_code, ''), '||') FILTER (WHERE nullif(error_code, '') IS NOT NULL AND error_code <> '?') AS errors,
        count(*) AS raw_count
      FROM read_csv('${fileName}', delim='\\t', header=true, all_varchar=true)
      GROUP BY host, workload, collection_key
      ORDER BY collection_index, collection_time
    `), DUCKDB_TIMEOUT_MS, 'DuckDB workload snapshot aggregation')
    return result.toArray().map((row) => {
      const item = row.toJSON ? row.toJSON() : { ...row }
      return {
        host: item.host,
        workload: item.workload,
        collectionKey: item.collection_key,
        collectionIndex: numeric(item.collection_index),
        collectionTime: item.collection_time || '',
        program: item.program || '—',
        type: item.type || '—',
        cpu: metric(item.cpu),
        rssGb: metric(item.rss_gb),
        maxPidRssGb: metric(item.max_pid_rss_gb),
        concurrentPids: numeric(item.concurrent_pids),
        dState: numeric(item.d_state),
        errors: String(item.errors || '').split('||').filter(Boolean),
        rawCount: numeric(item.raw_count),
      }
    })
  } finally {
    try { await conn?.close?.() } catch {}
    try { await db?.terminate?.() } catch {}
    try { worker?.terminate() } catch {}
  }
}

function targetSample(samples = [], targetIndex = -1) {
  const exact = samples.find((row) => row.collectionIndex === targetIndex)
  if (exact) return { sample: exact, deltaCollections: 0, temporalWeight: 1, evidence: 'EXACT_TARGET' }
  const adjacent = samples.filter((row) => Math.abs(row.collectionIndex - targetIndex) === 1).sort((a, b) => Math.abs(a.collectionIndex - targetIndex) - Math.abs(b.collectionIndex - targetIndex))[0]
  if (adjacent) return { sample: adjacent, deltaCollections: adjacent.collectionIndex - targetIndex, temporalWeight: 0.55, evidence: 'ADJACENT_TARGET' }
  return { sample: null, deltaCollections: null, temporalWeight: 0, evidence: 'NO_TARGET_SAMPLE' }
}

function classifyErrorTimings(rawRows = [], targetTime = '', windowMinutes = 25) {
  const targetStamp = minuteStamp(targetTime)
  const occurrences = new Map()
  rawRows.forEach((row) => {
    const error = row.errorCode
    if (!error || error === UNKNOWN) return
    const stamp = minuteStamp(row.actualTime || row.timeLabel || row.snapshot)
    if (stamp === null) return
    if (!occurrences.has(error)) occurrences.set(error, [])
    occurrences.get(error).push({ stamp, time: row.actualTime || row.timeLabel || row.snapshot })
  })
  if (!occurrences.size || targetStamp === null) return { state: occurrences.size ? 'OFF_TARGET' : 'NONE', timings: [], exactErrors: [] }

  const timings = Array.from(occurrences.entries()).map(([error, rows]) => {
    const ordered = [...rows].sort((a, b) => a.stamp - b.stamp)
    const first = ordered[0]
    const deltaMinutes = first.stamp - targetStamp
    const appearsNearTarget = ordered.some((row) => Math.abs(row.stamp - targetStamp) <= windowMinutes)
    let state = 'OFF_TARGET'
    if (Math.abs(deltaMinutes) <= 5) state = 'NEW_AT_TARGET'
    else if (deltaMinutes < -5 && deltaMinutes >= -windowMinutes) state = 'NEW_BEFORE_TARGET'
    else if (deltaMinutes > 5 && deltaMinutes <= windowMinutes) state = 'NEW_AFTER_TARGET'
    else if (deltaMinutes < -windowMinutes && appearsNearTarget) state = 'PERSISTENT_NEAR_TARGET'
    return { error, state, deltaMinutes, firstTime: first.time }
  })

  const rank = { NONE: 0, OFF_TARGET: 1, NEW_AFTER_TARGET: 2, PERSISTENT_NEAR_TARGET: 3, NEW_BEFORE_TARGET: 4, NEW_AT_TARGET: 5 }
  const state = timings.reduce((best, item) => rank[item.state] > rank[best] ? item.state : best, 'NONE')
  return { state, timings, exactErrors: timings.filter((item) => item.state === 'NEW_AT_TARGET').map((item) => item.error) }
}

function scoreErrorSupport(state = '') {
  if (state === 'NEW_AT_TARGET' || state === 'NEW_BEFORE_TARGET') return 1
  if (state === 'PERSISTENT_NEAR_TARGET') return 0.7
  if (state === 'NEW_AFTER_TARGET') return 0.2
  return 0
}

function hostEventWeight(row = {}) {
  if (row.resourceSeverity === 'CRIT') return 1
  if (row.resourceSeverity === 'WARN') return 0.85
  return 0.45
}

function workloadFootprintScore({ peakCpu, peakMaxPidRss, peakRss, dStateHits, peakConcurrentPids, persistence, hostMemoryGb, hostVcpu }) {
  const cpuPressure = peakCpu === null ? 0 : hostVcpu && hostVcpu > 0 ? Math.min(1, peakCpu / Math.max(100, hostVcpu * 100 * 0.25)) : Math.min(1, peakCpu / 100)
  const maxPidRssPressure = peakMaxPidRss === null ? 0 : hostMemoryGb && hostMemoryGb > 0 ? Math.min(1, peakMaxPidRss / Math.max(1, hostMemoryGb * 0.15)) : Math.min(1, peakMaxPidRss / 8)
  const sumRssPressure = peakRss === null ? 0 : hostMemoryGb && hostMemoryGb > 0 ? Math.min(1, peakRss / Math.max(1, hostMemoryGb * 0.5)) : Math.min(1, peakRss / 32)
  return Math.round(Math.min(100,
    cpuPressure * 30 + maxPidRssPressure * 20 + sumRssPressure * 8 + Math.min(1, dStateHits / 3) * 20 + Math.min(1, peakConcurrentPids / 5) * 10 + persistence * 12
  ))
}

function incidentScoreFor({ target, hostTarget, cpuBaseline, rssBaseline, dBaseline, persistence, errorState }) {
  const sample = target.sample
  if (!sample || !hostTarget) {
    return {
      incidentScore: 0,
      scoreBreakdown: { contribution: 0, uplift: 0, blocked: 0, temporal: 0, persistence: 0, error: 0, hostPressure: 0, eventWeight: 0 },
      cpuContributionPct: null,
      memoryLowerContributionPct: null,
      memoryUpperContributionPct: null,
      cpuUplift: { score: null, z: null, delta: null },
      rssUplift: { score: null, z: null, delta: null },
      dUplift: { score: null, z: null, delta: null },
    }
  }

  const hostSignals = resourceSignalScoresV3(hostTarget)
  const cpuStress = numeric(hostSignals.cpu)
  const memoryStress = numeric(hostSignals.ram)
  const blockedStress = Math.max(numeric(hostSignals.load), numeric(hostSignals.swap))
  const hostCpuPct = metric(hostTarget.cpuPct)
  const hostVcpu = metric(hostTarget.vcpu)
  const estimatedHostCpuUnits = hostCpuPct !== null && hostVcpu !== null && hostVcpu > 0 ? hostCpuPct * hostVcpu : null
  const cpuContribution = metric(sample.cpu) !== null && estimatedHostCpuUnits && estimatedHostCpuUnits > 0 ? metric(sample.cpu) / estimatedHostCpuUnits : null
  const hostMemoryGb = metric(hostTarget.memoryTotalGb)
  const hostMemoryPct = metric(hostTarget.memoryPct)
  const hostUsedMemoryGb = hostMemoryGb !== null && hostMemoryPct !== null ? hostMemoryGb * hostMemoryPct / 100 : null
  const memoryLowerContribution = metric(sample.maxPidRssGb) !== null && hostUsedMemoryGb && hostUsedMemoryGb > 0 ? metric(sample.maxPidRssGb) / hostUsedMemoryGb : null
  const memoryUpperContribution = metric(sample.rssGb) !== null && hostUsedMemoryGb && hostUsedMemoryGb > 0 ? Math.min(metric(sample.rssGb), hostUsedMemoryGb) / hostUsedMemoryGb : null

  const cpuContributionUnit = cpuContribution === null ? null : clamp01(cpuContribution / 0.25)
  const memoryLowerUnit = memoryLowerContribution === null ? null : clamp01(memoryLowerContribution / 0.15)
  const memoryUpperUnit = memoryUpperContribution === null ? null : clamp01(memoryUpperContribution / 0.35)
  const memoryContributionUnit = memoryLowerUnit === null ? memoryUpperUnit : memoryUpperUnit === null ? memoryLowerUnit : memoryLowerUnit * 0.8 + memoryUpperUnit * 0.2
  const contributionParts = []
  if (cpuContributionUnit !== null) contributionParts.push({ value: cpuContributionUnit, weight: Math.max(0.15, cpuStress) })
  if (memoryContributionUnit !== null) contributionParts.push({ value: memoryContributionUnit, weight: Math.max(0.15, memoryStress) })
  const contributionUnit = contributionParts.length ? contributionParts.reduce((sum, item) => sum + item.value * item.weight, 0) / contributionParts.reduce((sum, item) => sum + item.weight, 0) : 0

  const cpuUplift = upliftAgainstBaseline(sample.cpu, cpuBaseline)
  const rssUplift = upliftAgainstBaseline(sample.maxPidRssGb, rssBaseline)
  const dUplift = upliftAgainstBaseline(sample.dState, dBaseline)
  const upliftParts = []
  if (cpuUplift.score !== null) upliftParts.push({ value: cpuUplift.score, weight: Math.max(0.15, cpuStress) })
  if (rssUplift.score !== null) upliftParts.push({ value: rssUplift.score, weight: Math.max(0.15, memoryStress) })
  const upliftUnit = upliftParts.length ? upliftParts.reduce((sum, item) => sum + item.value * item.weight, 0) / upliftParts.reduce((sum, item) => sum + item.weight, 0) : 0

  const dRatio = sample.concurrentPids > 0 ? sample.dState / sample.concurrentPids : sample.dState > 0 ? 1 : 0
  const blockedUnit = clamp01(Math.max(dRatio, numeric(dUplift.score)) * Math.max(0.35, blockedStress))
  const eventWeight = hostEventWeight(hostTarget)
  const breakdown = {
    contribution: contributionUnit * 40,
    uplift: upliftUnit * 20,
    blocked: blockedUnit * 15,
    temporal: target.temporalWeight * 10,
    persistence: Math.sqrt(clamp01(persistence)) * 5,
    error: scoreErrorSupport(errorState) * 5,
    hostPressure: clamp01(numeric(hostTarget.resourcePressure) / 100) * 5,
    eventWeight,
  }
  const raw = breakdown.contribution + breakdown.uplift + breakdown.blocked + breakdown.temporal + breakdown.persistence + breakdown.error + breakdown.hostPressure
  const incidentScore = Math.round(Math.min(100, raw * eventWeight))

  return {
    incidentScore,
    scoreBreakdown: breakdown,
    cpuContributionPct: cpuContribution === null ? null : cpuContribution * 100,
    memoryLowerContributionPct: memoryLowerContribution === null ? null : memoryLowerContribution * 100,
    memoryUpperContributionPct: memoryUpperContribution === null ? null : memoryUpperContribution * 100,
    cpuUplift,
    rssUplift,
    dUplift,
  }
}

function buildWindowRows(snapshots = [], attachedRows = [], rca = {}) {
  const byWorkload = new Map()
  snapshots.forEach((sample) => {
    const key = `${sample.host}|${sample.workload}`
    if (!byWorkload.has(key)) byWorkload.set(key, [])
    byWorkload.get(key).push(sample)
  })
  const rawByWorkload = new Map()
  attachedRows.forEach((row) => {
    const key = `${row.host}|${row.workload}`
    if (!rawByWorkload.has(key)) rawByWorkload.set(key, [])
    rawByWorkload.get(key).push(row)
  })

  const targetCollection = rca.resourceLandscapePeak || rca.landscapePeak || null
  const targetIndex = (rca.collections || []).findIndex((row) => row.key === targetCollection?.key)
  const targetWindowMinutes = Math.max(5, Math.min(30, Math.round((rca.cadence?.nominalMinutes || 20) * 1.25)))

  return Array.from(byWorkload.entries()).map(([key, samples]) => {
    samples.sort((a, b) => a.collectionIndex - b.collectionIndex || a.collectionTime.localeCompare(b.collectionTime))
    const raw = rawByWorkload.get(key) || []
    const host = samples[0]?.host || ''
    const workload = samples[0]?.workload || ''
    const hostPeak = (rca.hostPeaks || []).find((row) => row.host === host) || null
    const hostTarget = targetCollection?.byHost?.get?.(host) || null
    const hostTargetTime = hostTarget?.timeLabel || hostTarget?.snapshot || targetCollection?.timeLabel || ''

    const cpuSamples = samples.map((row) => row.cpu).filter((value) => metric(value) !== null)
    const rssUpperSamples = samples.map((row) => row.rssGb).filter((value) => metric(value) !== null)
    const maxPidRssSamples = samples.map((row) => row.maxPidRssGb).filter((value) => metric(value) !== null)
    const avgCpu = cpuSamples.length ? cpuSamples.reduce((sum, value) => sum + value, 0) / cpuSamples.length : null
    const peakCpu = cpuSamples.length ? Math.max(...cpuSamples) : null
    const peakRss = rssUpperSamples.length ? Math.max(...rssUpperSamples) : null
    const peakMaxPidRss = maxPidRssSamples.length ? Math.max(...maxPidRssSamples) : null
    const peakConcurrentPids = samples.reduce((best, row) => Math.max(best, numeric(row.concurrentPids)), 0)
    const uniquePidCount = new Set(raw.map((row) => row.pid).filter(Boolean)).size
    const dStateHits = samples.reduce((sum, row) => sum + numeric(row.dState), 0)
    const allErrors = Array.from(new Set(samples.flatMap((row) => row.errors || [])))
    const targetEvidence = targetSample(samples, targetIndex)
    const cpuBaseline = baselineStats(samples, 'cpu', targetIndex, 2)
    const rssBaseline = baselineStats(samples, 'maxPidRssGb', targetIndex, 0.25)
    const dBaseline = baselineStats(samples, 'dState', targetIndex, 1)
    const errorTiming = classifyErrorTimings(raw, hostTargetTime, targetWindowMinutes)
    const hostSampleCount = Math.max(1, numeric(hostPeak?.sampleCount) || rca.collections?.length || 1)
    const presenceCount = samples.filter((row) => row.collectionIndex >= 0).length
    const persistence = Math.min(1, presenceCount / hostSampleCount)
    const hostMemoryGb = metric(hostPeak?.resourcePeak?.memoryTotalGb || hostPeak?.peak?.memoryTotalGb)
    const hostVcpu = metric(hostPeak?.resourcePeak?.vcpu || hostPeak?.peak?.vcpu)
    const footprintScore = workloadFootprintScore({ peakCpu, peakMaxPidRss, peakRss, dStateHits, peakConcurrentPids, persistence, hostMemoryGb, hostVcpu })
    const incident = incidentScoreFor({ target: targetEvidence, hostTarget, cpuBaseline, rssBaseline, dBaseline, persistence, errorState: errorTiming.state })
    const incidentAlignment = targetEvidence.sample ? Math.round((targetEvidence.temporalWeight * 0.35 + ((incident.cpuUplift.score ?? 0) + (incident.rssUplift.score ?? 0)) / Math.max(1, Number(incident.cpuUplift.score !== null) + Number(incident.rssUplift.score !== null)) * 0.65) * 100) : null
    const mode = (values) => {
      const counts = new Map()
      values.filter((value) => value && value !== UNKNOWN && value !== '—').forEach((value) => counts.set(value, (counts.get(value) || 0) + 1))
      return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '—'
    }

    return {
      key,
      host,
      workload,
      program: mode(samples.map((row) => row.program)),
      type: mode(samples.map((row) => row.type)),
      resourceScore: incident.incidentScore,
      incidentScore: incident.incidentScore,
      footprintScore,
      scoreBreakdown: incident.scoreBreakdown,
      peakCorrelation: incidentAlignment,
      incidentAlignment,
      avgCpu,
      peakCpu,
      peakRss,
      peakMaxPidRss,
      dStateHits,
      peakConcurrentPids,
      uniquePidCount,
      pidCount: peakConcurrentPids,
      presenceCount,
      hostSampleCount,
      persistence,
      targetCollectionKey: targetCollection?.key || '',
      targetTime: hostTargetTime,
      targetHostSeverity: hostTarget?.resourceSeverity || 'NORMAL',
      targetHostPressure: hostTarget?.resourcePressure ?? null,
      targetEvidence: targetEvidence.evidence,
      targetDeltaCollections: targetEvidence.deltaCollections,
      targetCpu: metric(targetEvidence.sample?.cpu),
      targetRss: metric(targetEvidence.sample?.rssGb),
      targetMaxPidRss: metric(targetEvidence.sample?.maxPidRssGb),
      targetDState: targetEvidence.sample ? numeric(targetEvidence.sample.dState) : null,
      targetConcurrentPids: targetEvidence.sample ? numeric(targetEvidence.sample.concurrentPids) : null,
      cpuContributionPct: incident.cpuContributionPct,
      memoryLowerContributionPct: incident.memoryLowerContributionPct,
      memoryUpperContributionPct: incident.memoryUpperContributionPct,
      cpuBaseline,
      rssBaseline,
      dBaseline,
      cpuUplift: incident.cpuUplift,
      rssUplift: incident.rssUplift,
      dUplift: incident.dUplift,
      errorState: errorTiming.state,
      errorTimings: errorTiming.timings,
      errors: allErrors,
      newPeakErrors: errorTiming.exactErrors,
      hostPeakTime: hostPeak?.peakTime || '',
      hostPeakCollectionKey: hostPeak?.peakCollectionKey || '',
      firstSeen: samples[0]?.collectionTime || '—',
      lastSeen: samples.at(-1)?.collectionTime || '—',
      samples,
      records: raw,
    }
  }).sort((a, b) => b.incidentScore - a.incidentScore || b.footprintScore - a.footprintScore || numeric(b.incidentAlignment) - numeric(a.incidentAlignment) || numeric(b.targetDState) - numeric(a.targetDState))
}

function mappingCounts(rows = []) {
  const counts = { EXACT: 0, NEAREST_2M: 0, NEAREST_5M: 0, UNMAPPED: 0 }
  rows.forEach((row) => { counts[row.mappingConfidence] = (counts[row.mappingConfidence] || 0) + 1 })
  return counts
}

export async function rankResourceConsumersV3(processes = [], rca = {}) {
  if (!processes.length) return { rows: [], engine: 'NO_PROCESS_DATA', mappedRows: 0, unmappedRows: 0, mappingCounts: mappingCounts([]) }
  const attachedAll = attachCollections(processes, rca)
  const counts = mappingCounts(attachedAll)
  const attached = attachedAll.filter((row) => row.collectionIndex >= 0)
  const mappedRows = attached.length
  const unmappedRows = attachedAll.length - mappedRows
  const fallbackSnapshots = aggregateSnapshotsJs(attached)
  let snapshots = fallbackSnapshots
  let engine = 'JS_FALLBACK_V3_2'
  try {
    snapshots = await aggregateSnapshotsDuckDb(attached)
    engine = 'DUCKDB_WASM_V3_2'
  } catch (error) {
    engine = `JS_FALLBACK_V3_2: ${error?.message || 'DuckDB unavailable'}`
  }
  // Share the already-computed fallback with V4 parity; no second JS aggregation.
  return { rows: buildWindowRows(snapshots, attached, rca), engine, mappedRows, unmappedRows, mappingCounts: counts, snapshots, jsSnapshots: fallbackSnapshots }
}

export const __test = {
  attachCollections,
  aggregateSnapshotsJs,
  buildWindowRows,
  mappingCounts,
  classifyErrorTimings,
  baselineStats,
  targetSample,
}
