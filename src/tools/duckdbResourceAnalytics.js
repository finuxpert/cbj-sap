import * as duckdb from '@duckdb/duckdb-wasm'
import duckdbMvpWasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'
import duckdbEhWasm from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import duckdbMvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url'
import duckdbEhWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'

const UNKNOWN = '?'
const DUCKDB_THRESHOLD = 8000
const DUCKDB_TIMEOUT_MS = 3500

const MANUAL_BUNDLES = {
  mvp: { mainModule: duckdbMvpWasm, mainWorker: duckdbMvpWorker },
  eh: { mainModule: duckdbEhWasm, mainWorker: duckdbEhWorker },
}

const metric = (value) => {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}
const numeric = (value) => metric(value) ?? 0
const identity = (row = {}) => row.workloadName && row.workloadName !== UNKNOWN
  ? row.workloadName
  : row.jobName && row.jobName !== UNKNOWN
    ? row.jobName
    : row.program && row.program !== UNKNOWN
      ? row.program
      : row.pid ? `PID ${row.pid}` : 'Unknown workload'

const clean = (value) => String(value ?? '').replace(/[\t\r\n]+/g, ' ').trim()

function withTimeout(promise, ms = DUCKDB_TIMEOUT_MS, label = 'DuckDB operation') {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function minuteStamp(value = '') {
  const match = String(value || '').match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})/)
  if (!match) return null
  return Math.round(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5])) / 60000)
}

function aggregateAt(records = [], time = '') {
  const rows = records.filter((row) => (row.timeLabel || row.snapshot) === time)
  return {
    cpu: rows.reduce((sum, row) => sum + numeric(row.cpu), 0),
    rss: rows.reduce((sum, row) => sum + numeric(row.rssGb), 0),
    d: rows.filter((row) => String(row.state || '').toUpperCase() === 'D').length,
    pids: new Set(rows.map((row) => row.pid).filter(Boolean)).size,
    errors: new Set(rows.map((row) => row.errorCode).filter((value) => value && value !== UNKNOWN)),
  }
}

function enrichRows(rows = [], processes = [], hostPeaks = [], cadenceMinutes = 10, collectionCount = 1) {
  const grouped = new Map()
  processes.forEach((row) => {
    const key = `${row.host}|${identity(row)}`
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(row)
  })
  const hostPeakMap = new Map(hostPeaks.map((row) => [row.host, row]))
  return rows.map((item) => {
    const key = `${item.host}|${item.workload}`
    const records = grouped.get(key) || []
    const hostPeak = hostPeakMap.get(item.host) || null
    const hostPeakTime = hostPeak?.peakTime || ''
    const hostPeakStamp = minuteStamp(hostPeakTime)
    const nearTimes = Array.from(new Set(records.map((row) => row.timeLabel || row.snapshot).filter(Boolean))).filter((time) => {
      const stamp = minuteStamp(time)
      return stamp !== null && hostPeakStamp !== null && Math.abs(stamp - hostPeakStamp) <= Math.max(10, cadenceMinutes || 10)
    })
    const near = nearTimes.map((time) => ({ time, ...aggregateAt(records, time) }))
    const nearCpu = Math.max(0, ...near.map((row) => row.cpu))
    const nearRss = Math.max(0, ...near.map((row) => row.rss))
    const cpuCorrelation = numeric(item.peak_cpu) ? Math.min(1, nearCpu / numeric(item.peak_cpu)) : 0
    const rssCorrelation = numeric(item.peak_rss) ? Math.min(1, nearRss / numeric(item.peak_rss)) : 0
    const peakCorrelation = Math.round((cpuCorrelation * 0.5 + rssCorrelation * 0.5) * 100)
    const allErrors = Array.from(new Set(records.map((row) => row.errorCode).filter((value) => value && value !== UNKNOWN)))
    const peakErrors = Array.from(new Set(near.flatMap((row) => Array.from(row.errors))))
    const beforeErrors = new Set(records.filter((row) => {
      const stamp = minuteStamp(row.timeLabel || row.snapshot)
      return stamp !== null && hostPeakStamp !== null && stamp < hostPeakStamp - Math.max(10, cadenceMinutes || 10)
    }).map((row) => row.errorCode).filter((value) => value && value !== UNKNOWN))
    const newPeakErrors = peakErrors.filter((error) => !beforeErrors.has(error))
    const errorState = newPeakErrors.length ? 'NEW_AT_PEAK' : peakErrors.length ? 'PERSISTENT_AT_PEAK' : allErrors.length ? 'OFF_PEAK' : 'NONE'
    const availableCollections = Math.max(1, numeric(hostPeak?.sampleCount) || collectionCount || 1)
    const persistence = Math.min(1, numeric(item.presence_count) / availableCollections)
    const hostMemoryGb = metric(hostPeak?.peak?.memoryTotalGb)
    const peakRss = numeric(item.peak_rss)
    const rssPressure = hostMemoryGb && hostMemoryGb > 0
      ? Math.min(1, peakRss / Math.max(1, hostMemoryGb * 0.25))
      : Math.min(1, peakRss / 16)
    const resourceScore = Math.round(Math.min(100,
      Math.min(1, numeric(item.peak_cpu) / 80) * 30 +
      rssPressure * 30 +
      Math.min(1, numeric(item.d_state_hits) / 3) * 18 +
      Math.min(1, numeric(item.pid_count) / 5) * 10 +
      persistence * 12
    ))
    return {
      key,
      host: item.host,
      workload: item.workload,
      program: item.program || '—',
      type: item.type || '—',
      avgCpu: numeric(item.avg_cpu),
      peakCpu: numeric(item.peak_cpu),
      peakRss,
      dStateHits: numeric(item.d_state_hits),
      pidCount: numeric(item.pid_count),
      presenceCount: numeric(item.presence_count),
      recordCount: numeric(item.record_count),
      hostSampleCount: availableCollections,
      persistence,
      resourceScore,
      peakCorrelation,
      errorState,
      errors: allErrors,
      newPeakErrors,
      hostPeakTime,
      firstSeen: records.map((row) => row.timeLabel || row.snapshot).filter(Boolean).sort()[0] || '—',
      lastSeen: records.map((row) => row.timeLabel || row.snapshot).filter(Boolean).sort().at(-1) || '—',
      records: [...records].sort((a, b) => numeric(a.sortKey) - numeric(b.sortKey)),
    }
  }).sort((a, b) => b.resourceScore - a.resourceScore || b.peakCorrelation - a.peakCorrelation || b.peakRss - a.peakRss || b.peakCpu - a.peakCpu)
}

function fallbackRows(processes = []) {
  const grouped = new Map()
  processes.forEach((row) => {
    const workload = identity(row)
    const key = `${row.host}|${workload}`
    const current = grouped.get(key) || { host: row.host, workload, programs: new Map(), types: new Map(), records: [] }
    current.records.push(row)
    if (row.program && row.program !== UNKNOWN) current.programs.set(row.program, (current.programs.get(row.program) || 0) + 1)
    if (row.type && row.type !== UNKNOWN) current.types.set(row.type, (current.types.get(row.type) || 0) + 1)
    grouped.set(key, current)
  })
  const mode = (map) => [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '—'
  return Array.from(grouped.values()).map((item) => {
    const cpuValues = item.records.map((row) => metric(row.cpu)).filter((value) => value !== null)
    const rssValues = item.records.map((row) => metric(row.rssGb)).filter((value) => value !== null)
    return {
      host: item.host,
      workload: item.workload,
      program: mode(item.programs),
      type: mode(item.types),
      avg_cpu: cpuValues.length ? cpuValues.reduce((sum, value) => sum + value, 0) / cpuValues.length : null,
      peak_cpu: cpuValues.length ? Math.max(...cpuValues) : null,
      peak_rss: rssValues.length ? Math.max(...rssValues) : null,
      d_state_hits: item.records.filter((row) => String(row.state || '').toUpperCase() === 'D').length,
      pid_count: new Set(item.records.map((row) => row.pid).filter(Boolean)).size,
      presence_count: new Set(item.records.map((row) => row.timeLabel || row.snapshot).filter(Boolean)).size,
      record_count: item.records.length,
    }
  })
}

export async function rankResourceConsumers(processes = [], hostPeaks = [], cadenceMinutes = 10, collectionCount = 1) {
  if (!processes.length) return { rows: [], engine: 'NO_PROCESS_DATA' }

  const fallback = enrichRows(fallbackRows(processes), processes, hostPeaks, cadenceMinutes, collectionCount)
  if (processes.length < DUCKDB_THRESHOLD) return { rows: fallback, engine: 'JS_FAST_PATH' }

  let worker
  let db
  let conn
  try {
    const bundle = await withTimeout(duckdb.selectBundle(MANUAL_BUNDLES), 1500, 'DuckDB bundle selection')
    worker = new Worker(bundle.mainWorker)
    db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING), worker)
    await withTimeout(db.instantiate(bundle.mainModule, bundle.pthreadWorker), DUCKDB_TIMEOUT_MS, 'DuckDB instantiate')
    conn = await withTimeout(db.connect(), 1500, 'DuckDB connect')
    const header = ['host', 'workload', 'program', 'type', 'state', 'pid', 'time_label', 'cpu', 'rss']
    const lines = [header.join('\t')]
    processes.forEach((row) => {
      const cpu = metric(row.cpu)
      const rss = metric(row.rssGb)
      lines.push([
        clean(row.host), clean(identity(row)), clean(row.program && row.program !== UNKNOWN ? row.program : ''), clean(row.type && row.type !== UNKNOWN ? row.type : ''), clean(row.state), clean(row.pid), clean(row.timeLabel || row.snapshot),
        cpu === null ? '' : cpu, rss === null ? '' : rss,
      ].join('\t'))
    })
    const fileName = `log-processes-${Date.now()}.tsv`
    await withTimeout(db.registerFileText(fileName, lines.join('\n')), 1500, 'DuckDB file registration')
    const result = await withTimeout(conn.query(`
      SELECT
        host,
        workload,
        any_value(program) AS program,
        any_value(type) AS type,
        avg(try_cast(cpu AS DOUBLE)) AS avg_cpu,
        max(try_cast(cpu AS DOUBLE)) AS peak_cpu,
        max(try_cast(rss AS DOUBLE)) AS peak_rss,
        sum(CASE WHEN upper(state) = 'D' THEN 1 ELSE 0 END) AS d_state_hits,
        count(DISTINCT nullif(pid, '')) AS pid_count,
        count(DISTINCT time_label) AS presence_count,
        count(*) AS record_count
      FROM read_csv('${fileName}', delim='\\t', header=true, all_varchar=true)
      GROUP BY host, workload
    `), DUCKDB_TIMEOUT_MS, 'DuckDB resource query')
    const rows = result.toArray().map((row) => row.toJSON ? row.toJSON() : { ...row })
    return { rows: enrichRows(rows, processes, hostPeaks, cadenceMinutes, collectionCount), engine: 'DUCKDB_WASM' }
  } catch (error) {
    return { rows: fallback, engine: `JS_FALLBACK: ${error?.message || 'DuckDB unavailable'}` }
  } finally {
    try { conn?.close?.().catch?.(() => {}) } catch {}
    try { db?.terminate?.().catch?.(() => {}) } catch {}
    try { worker?.terminate() } catch {}
  }
}