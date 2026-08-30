import * as duckdb from '@duckdb/duckdb-wasm'
import duckdbMvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'
import duckdbEhWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import duckdbMvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url'
import duckdbEhWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'

const UNKNOWN = '?'
const DUCKDB_TIMEOUT_MS = 5000
const BUNDLES = { mvp: { mainModule: duckdbMvpWasm, mainWorker: duckdbMvpWorker }, eh: { mainModule: duckdbEhWasm, mainWorker: duckdbEhWorker } }

const metric = (value) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}
const numeric = (value) => metric(value) ?? 0
const clean = (value) => String(value ?? '').replace(/[\t\r\n]+/g, ' ').trim()

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

function collectionIndex(rca = {}) {
  const exact = new Map()
  const byFileHost = new Map()
  ;(rca.collections || []).forEach((collection, index) => {
    collection.rows.forEach((row) => {
      const stamp = row.snapshot || row.timeLabel || ''
      exact.set(`${row.fileName || collection.fileName}|${row.host}|${stamp}`, { key: collection.key, index, time: collection.timeLabel })
      const fh = `${row.fileName || collection.fileName}|${row.host}`
      if (!byFileHost.has(fh)) byFileHost.set(fh, [])
      byFileHost.get(fh).push({ key: collection.key, index, time: collection.timeLabel, sampleTime: row.timeLabel || row.snapshot || collection.timeLabel, stamp: minuteStamp(row.timeLabel || row.snapshot || collection.timeLabel) })
    })
  })
  return { exact, byFileHost }
}

function attachCollections(processes = [], rca = {}) {
  const index = collectionIndex(rca)
  return processes.map((row) => {
    const actualTime = row.timeLabel || row.snapshot || ''
    const exact = index.exact.get(`${row.fileName}|${row.host}|${row.snapshot || actualTime}`)
    if (exact) return { ...row, workload: identity(row), collectionKey: exact.key, collectionIndex: exact.index, collectionTime: exact.time, actualTime }
    const candidates = index.byFileHost.get(`${row.fileName}|${row.host}`) || []
    const target = minuteStamp(actualTime)
    let nearest = candidates.length === 1 ? candidates[0] : null
    if (!nearest && target !== null && candidates.length) {
      nearest = candidates.reduce((best, candidate) => {
        if (candidate.stamp === null) return best
        const distance = Math.abs(candidate.stamp - target)
        return !best || distance < best.distance ? { ...candidate, distance } : best
      }, null)
    }
    if (nearest) return { ...row, workload: identity(row), collectionKey: nearest.key, collectionIndex: nearest.index, collectionTime: nearest.time, actualTime }
    return { ...row, workload: identity(row), collectionKey: `unmapped:${row.fileName}:${actualTime}`, collectionIndex: -1, collectionTime: actualTime, actualTime }
  })
}

function aggregateSnapshotsJs(rows = []) {
  const groups = new Map()
  rows.forEach((row) => {
    const key = `${row.host}|${row.workload}|${row.collectionKey}`
    const current = groups.get(key) || {
      host: row.host, workload: row.workload, collectionKey: row.collectionKey, collectionIndex: row.collectionIndex,
      collectionTime: row.collectionTime, cpuValues: [], rssValues: [], pids: new Set(), dState: 0, errors: new Set(), programs: new Map(), types: new Map(), rawCount: 0,
    }
    const cpu = metric(row.cpu); const rss = metric(row.rssGb)
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
    host: item.host, workload: item.workload, collectionKey: item.collectionKey, collectionIndex: item.collectionIndex, collectionTime: item.collectionTime,
    cpu: item.cpuValues.length ? item.cpuValues.reduce((sum, value) => sum + value, 0) : null,
    rssGb: item.rssValues.length ? item.rssValues.reduce((sum, value) => sum + value, 0) : null,
    concurrentPids: item.pids.size, dState: item.dState, errors: Array.from(item.errors), program: mode(item.programs), type: mode(item.types), rawCount: item.rawCount,
  })).sort((a, b) => a.collectionIndex - b.collectionIndex || a.collectionTime.localeCompare(b.collectionTime))
}

async function aggregateSnapshotsDuckDb(rows = []) {
  let worker; let db; let conn
  try {
    const bundle = await withTimeout(duckdb.selectBundle(BUNDLES), 1800, 'DuckDB bundle selection')
    worker = new Worker(bundle.mainWorker)
    db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING), worker)
    await withTimeout(db.instantiate(bundle.mainModule, bundle.pthreadWorker), DUCKDB_TIMEOUT_MS, 'DuckDB instantiate')
    conn = await withTimeout(db.connect(), 1800, 'DuckDB connect')
    const header = ['host', 'workload', 'collection_key', 'collection_index', 'collection_time', 'program', 'type', 'state', 'pid', 'error_code', 'cpu', 'rss']
    const lines = [header.join('\t')]
    rows.forEach((row) => {
      const cpu = metric(row.cpu); const rss = metric(row.rssGb)
      lines.push([
        clean(row.host), clean(row.workload), clean(row.collectionKey), row.collectionIndex, clean(row.collectionTime), clean(row.program), clean(row.type), clean(row.state), clean(row.pid), clean(row.errorCode),
        cpu === null ? '' : cpu, rss === null ? '' : rss,
      ].join('\t'))
    })
    const fileName = `workload-v3-${Date.now()}.tsv`
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
        host: item.host, workload: item.workload, collectionKey: item.collection_key,
        collectionIndex: numeric(item.collection_index), collectionTime: item.collection_time || '',
        program: item.program || '—', type: item.type || '—',
        cpu: metric(item.cpu), rssGb: metric(item.rss_gb), concurrentPids: numeric(item.concurrent_pids), dState: numeric(item.d_state),
        errors: String(item.errors || '').split('||').filter(Boolean), rawCount: numeric(item.raw_count),
      }
    })
  } finally {
    try { await conn?.close?.() } catch {}
    try { await db?.terminate?.() } catch {}
    try { worker?.terminate() } catch {}
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
  const hostPeakMap = new Map((rca.hostPeaks || []).map((row) => [row.host, row]))

  return Array.from(byWorkload.entries()).map(([key, samples]) => {
    samples.sort((a, b) => a.collectionIndex - b.collectionIndex || a.collectionTime.localeCompare(b.collectionTime))
    const raw = rawByWorkload.get(key) || []
    const host = samples[0]?.host || ''
    const workload = samples[0]?.workload || ''
    const hostPeak = hostPeakMap.get(host) || null
    const cpuSamples = samples.map((row) => row.cpu).filter((value) => metric(value) !== null)
    const rssSamples = samples.map((row) => row.rssGb).filter((value) => metric(value) !== null)
    const avgCpu = cpuSamples.length ? cpuSamples.reduce((sum, value) => sum + value, 0) / cpuSamples.length : null
    const peakCpu = cpuSamples.length ? Math.max(...cpuSamples) : null
    const peakRss = rssSamples.length ? Math.max(...rssSamples) : null
    const peakConcurrentPids = samples.reduce((best, row) => Math.max(best, numeric(row.concurrentPids)), 0)
    const uniquePidCount = new Set(raw.map((row) => row.pid).filter(Boolean)).size
    const dStateHits = samples.reduce((sum, row) => sum + numeric(row.dState), 0)
    const allErrors = Array.from(new Set(samples.flatMap((row) => row.errors || [])))
    const peakIndex = hostPeak?.peakCollectionIndex ?? -1
    const near = peakIndex >= 0 ? samples.filter((row) => Math.abs(row.collectionIndex - peakIndex) <= 1) : []
    const nearCpu = near.map((row) => row.cpu).filter((value) => metric(value) !== null)
    const nearRss = near.map((row) => row.rssGb).filter((value) => metric(value) !== null)
    const cpuAlignment = peakCpu && nearCpu.length ? Math.min(1, Math.max(...nearCpu) / peakCpu) : 0
    const rssAlignment = peakRss && nearRss.length ? Math.min(1, Math.max(...nearRss) / peakRss) : 0
    const availableAlignmentSignals = Number(peakCpu !== null && nearCpu.length > 0) + Number(peakRss !== null && nearRss.length > 0)
    const peakCorrelation = availableAlignmentSignals ? Math.round(((peakCpu !== null && nearCpu.length ? cpuAlignment : 0) + (peakRss !== null && nearRss.length ? rssAlignment : 0)) / availableAlignmentSignals * 100) : 0
    const peakErrors = Array.from(new Set(near.flatMap((row) => row.errors || [])))
    const beforeErrors = new Set(samples.filter((row) => peakIndex >= 0 && row.collectionIndex < peakIndex - 1).flatMap((row) => row.errors || []))
    const newPeakErrors = peakErrors.filter((error) => !beforeErrors.has(error))
    const errorState = newPeakErrors.length ? 'NEW_AT_PEAK' : peakErrors.length ? 'PERSISTENT_AT_PEAK' : allErrors.length ? 'OFF_PEAK' : 'NONE'
    const hostSampleCount = Math.max(1, numeric(hostPeak?.sampleCount) || rca.collections?.length || 1)
    const persistence = Math.min(1, samples.filter((row) => row.collectionIndex >= 0).length / hostSampleCount)
    const hostMemoryGb = metric(hostPeak?.resourcePeak?.memoryTotalGb || hostPeak?.peak?.memoryTotalGb)
    const hostVcpu = metric(hostPeak?.resourcePeak?.vcpu || hostPeak?.peak?.vcpu)
    const cpuPressure = peakCpu === null ? 0 : hostVcpu && hostVcpu > 0 ? Math.min(1, peakCpu / Math.max(100, hostVcpu * 100 * 0.25)) : Math.min(1, peakCpu / 100)
    const rssPressure = peakRss === null ? 0 : hostMemoryGb && hostMemoryGb > 0 ? Math.min(1, peakRss / Math.max(1, hostMemoryGb * 0.25)) : Math.min(1, peakRss / 16)
    const resourceScore = Math.round(Math.min(100,
      cpuPressure * 30 + rssPressure * 30 + Math.min(1, dStateHits / 3) * 18 + Math.min(1, peakConcurrentPids / 5) * 10 + persistence * 12
    ))
    const mode = (values) => {
      const counts = new Map(); values.filter((value) => value && value !== UNKNOWN && value !== '—').forEach((value) => counts.set(value, (counts.get(value) || 0) + 1))
      return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '—'
    }
    return {
      key, host, workload, program: mode(samples.map((row) => row.program)), type: mode(samples.map((row) => row.type)),
      avgCpu, peakCpu, peakRss, dStateHits, peakConcurrentPids, uniquePidCount, pidCount: peakConcurrentPids,
      presenceCount: samples.filter((row) => row.collectionIndex >= 0).length, hostSampleCount, persistence, resourceScore, peakCorrelation,
      errorState, errors: allErrors, newPeakErrors, hostPeakTime: hostPeak?.peakTime || '', hostPeakCollectionKey: hostPeak?.peakCollectionKey || '',
      firstSeen: samples[0]?.collectionTime || '—', lastSeen: samples.at(-1)?.collectionTime || '—', samples, records: raw,
    }
  }).sort((a, b) => b.resourceScore - a.resourceScore || b.peakCorrelation - a.peakCorrelation || numeric(b.peakRss) - numeric(a.peakRss) || numeric(b.peakCpu) - numeric(a.peakCpu))
}

export async function rankResourceConsumersV3(processes = [], rca = {}) {
  if (!processes.length) return { rows: [], engine: 'NO_PROCESS_DATA', mappedRows: 0, unmappedRows: 0 }
  const attached = attachCollections(processes, rca)
  const mappedRows = attached.filter((row) => row.collectionIndex >= 0).length
  const unmappedRows = attached.length - mappedRows
  const fallbackSnapshots = aggregateSnapshotsJs(attached)
  let snapshots = fallbackSnapshots
  let engine = 'JS_FALLBACK_V3'
  try {
    snapshots = await aggregateSnapshotsDuckDb(attached)
    engine = 'DUCKDB_WASM_V3'
  } catch (error) {
    engine = `JS_FALLBACK_V3: ${error?.message || 'DuckDB unavailable'}`
  }
  return { rows: buildWindowRows(snapshots, attached, rca), engine, mappedRows, unmappedRows, snapshots }
}

export const __test = { attachCollections, aggregateSnapshotsJs, buildWindowRows }
