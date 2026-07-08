import * as XLSX from 'xlsx'
import { expandZipAwareFiles, fileExt, lower, safe, toNumber } from '../shared/rca-utils.js'

export const REQUIRED_ST03N = [
  { key: 'timeProfile', label: 'Time Profile', patterns: ['time-profile', 'time_profile', 'time profile', 'timeprofile'] },
  { key: 'workload', label: 'Workload Overview', patterns: ['workload', 'workload-overview', 'workload_overview', 'workload overview'] },
  {
    key: 'transactionStandard',
    label: 'Transaction Standard',
    patterns: [
      'transaction-standard',
      'transaction_standard',
      'transaction standard',
      'transactionstandard',
      'transaction profile',
      'transaction-profile',
      'transaction_profile',
      'transactions',
      'transaction',
      'txstd',
      'tcode',
      'tcodes',
    ],
  },
  {
    key: 'topResponse',
    label: 'Top Response Time',
    patterns: [
      'top-response-time',
      'top_response_time',
      'top response time',
      'topresponsetime',
      'top-respon-time',
      'top_respon_time',
      'top respon time',
      'toprespontime',
      'top-respond',
      'top-response',
      'top respond',
      'top response',
      'top respon',
      'response-time',
      'response_time',
      'response time',
      'respon time',
      'respon-time',
      'respon_time',
      'responsetime',
      'resp-time',
      'resp_time',
      'resptime',
    ],
  },
  { key: 'topDb', label: 'Top DB Access', patterns: ['top-db-access', 'top_db_access', 'top db access', 'top-db', 'top db', 'db-access', 'db_access', 'db access'] },
]

function normalizeSt03nName(name = '') {
  return lower(name)
    .replace(/\.[^.]+$/, '')
    .replace(/[_()\[\]{}]+/g, ' ')
    .replace(/[\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function nameHasPattern(normalizedName, pattern) {
  const normalizedPattern = normalizeSt03nName(pattern)
  return normalizedName.includes(normalizedPattern)
}

export function classifySt03nFile(name = '') {
  const normalized = normalizeSt03nName(name)
  const strongTopResponse = [
    'top response',
    'top respond',
    'top respon',
    'response time',
    'respon time',
    'responsetime',
    'resp time',
    'resptime',
  ]
  if (strongTopResponse.some((pattern) => nameHasPattern(normalized, pattern))) return 'topResponse'

  const strongTransaction = ['transaction standard', 'transaction profile', 'transaction', 'transactions', 'tcode', 'tcodes', 'txstd']
  if (strongTransaction.some((pattern) => nameHasPattern(normalized, pattern))) return 'transactionStandard'

  return REQUIRED_ST03N.find((item) => item.patterns.some((pattern) => nameHasPattern(normalized, pattern)))?.key || ''
}

export function isSt03nWorkbook(name = '') {
  return ['xlsx', 'xls', 'csv'].includes(fileExt(name))
}

export async function expandSt03nFiles(fileList) {
  const expanded = await expandZipAwareFiles(fileList, ['xlsx', 'xls', 'csv'])
  return expanded.filter((file) => isSt03nWorkbook(file.name))
}

export async function readSt03nMatrix(file) {
  const buffer = await file.arrayBuffer()
  if (fileExt(file.name) === 'csv') {
    const text = new TextDecoder('utf-8').decode(buffer)
    return text
      .split(/\r?\n/)
      .map((line) => line.split(/[;,\t]/).map(safe))
      .filter((row) => row.some(Boolean))
  }
  const workbook = XLSX.read(buffer, { type: 'array' })
  const worksheet = workbook.Sheets[workbook.SheetNames[0]]
  return XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true })
}

export function findSt03nHeaderIndex(rows = []) {
  let bestIndex = 0
  let bestScore = -1
  rows.slice(0, 100).forEach((row, index) => {
    const line = lower((row || []).join(' | '))
    let score = 0
    if (/transaction|report|program|time interval|task type|tcode|dialog|user|name/.test(line)) score += 4
    if (/response|respon|database|db time|dialog steps|cpu|wait|average|total|elapsed|duration|calls|steps/.test(line)) score += 5
    if (/client|object|count|load|workload/.test(line)) score += 1
    if (score > bestScore) {
      bestIndex = index
      bestScore = score
    }
  })
  return bestIndex
}

export function st03nRowsToObjects(rows = []) {
  const headerIdx = findSt03nHeaderIndex(rows)
  const header = (rows[headerIdx] || []).map((value, index) => safe(value) || `Column ${index + 1}`)
  const objects = rows
    .slice(headerIdx + 1)
    .map((row) => {
      const item = {}
      header.forEach((key, index) => {
        item[key] = row[index]
      })
      return item
    })
    .filter((item) => Object.values(item).some((value) => safe(value)))
  return { objects, headerIdx, header }
}

function pickColumn(keys = [], patterns = []) {
  return keys.find((key) => patterns.some((pattern) => pattern.test(lower(key)))) || ''
}

function labelFromRow(row, nameColumn, fileName, index) {
  const explicit = safe(row?.[nameColumn])
  if (explicit && !/^\d+(?:[.,]\d+)?$/.test(explicit)) return explicit
  const candidate = Object.keys(row || {})
    .filter((key) => /transaction|report|program|task|interval|name|tcode|object|user/i.test(key))
    .map((key) => safe(row[key]))
    .find((value) => value && !/^\d+(?:[.,]\d+)?$/.test(value))
  return candidate || `${fileName.replace(/\.[^.]+$/, '')} item ${index + 1}`
}

function timeValueFromRow(row, timeColumn, nameColumn) {
  const explicit = safe(row?.[timeColumn])
  if (explicit) return explicit

  const nameValue = safe(row?.[nameColumn])
  if (/\b(?:[01]?\d|2[0-3])[:.]\d{2}(?::\d{2})?\b/.test(nameValue)) return nameValue
  if (/\b(?:[01]\d|2[0-3])[0-5]\d\b/.test(nameValue)) return nameValue
  return ''
}

function normalizeRepeatedTimeBuckets(rows = []) {
  const timeValues = rows.map((row) => safe(row.time)).filter(Boolean)
  const uniqueTimes = new Set(timeValues)
  if (timeValues.length > 1 && uniqueTimes.size <= 1) {
    return rows.map((row) => ({
      ...row,
      time: '',
      hour: '',
      interval: '',
      bucket: '',
    }))
  }
  return rows
}

export function summarizeSt03nObjects(kind, objects = [], fileName = '') {
  const keys = Object.keys(objects[0] || {})
  const cName = pickColumn(keys, [/transaction/, /report/, /program/, /task type/, /time interval/, /tcode/, /name/, /user/])
  const cTime = pickColumn(keys, [/time interval/, /^time$/, /^hour$/, /period/, /start.*time/, /end.*time/, /timestamp/, /date.*time/, /^date$/])
  const cResp = pickColumn(keys, [/response.*ms/, /respon.*ms/, /average.*response/, /average.*respon/, /dialog step response/, /dialog step respon/, /response time/, /respon time/, /resp/, /elapsed/])
  const cDb = pickColumn(keys, [/database.*ms/, /db time/, /sequential reads time/, /direct reads time/, /^db$/, /database/])
  const cWait = pickColumn(keys, [/wait.*ms/, /roll wait/, /^wait$/])
  const cSteps = pickColumn(keys, [/dialog steps/, /^steps$/, /number.*step/, /count/, /calls/])
  const cCpu = pickColumn(keys, [/cpu/])

  const rawRows = objects
    .map((row, index) => {
      const label = labelFromRow(row, cName, fileName, index)
      const time = timeValueFromRow(row, cTime, cName)
      const responseMs = toNumber(row[cResp], 0)
      const dbMs = toNumber(row[cDb], 0)
      const waitMs = toNumber(row[cWait], 0)
      const cpuMs = toNumber(row[cCpu], 0)
      const steps = toNumber(row[cSteps], 0)
      const rawScore = responseMs + dbMs + waitMs + cpuMs + Math.log10(steps + 1) * 100
      const dbShare = responseMs > 0 ? (dbMs / responseMs) * 100 : 0
      const waitShare = responseMs > 0 ? (waitMs / responseMs) * 100 : 0
      const component = dbShare >= 45
        ? 'DB-heavy'
        : waitShare >= 25
          ? 'Wait-heavy'
          : cpuMs > responseMs * 0.35
            ? 'CPU-heavy'
            : responseMs > 0
              ? 'Response-heavy'
              : 'Workload'

      return {
        kind,
        fileName,
        label,
        time,
        hour: time,
        interval: time,
        bucket: time,
        responseMs,
        dbMs,
        waitMs,
        cpuMs,
        steps,
        rawScore,
        dbShare,
        waitShare,
        component,
        columns: { cName, cTime, cResp, cDb, cWait, cSteps, cCpu },
      }
    })
    .filter((row) => row.rawScore > 0)

  const maxScore = Math.max(1, ...rawRows.map((row) => row.rawScore))
  return normalizeRepeatedTimeBuckets(rawRows)
    .map((row) => ({ ...row, score: Math.round((row.rawScore / maxScore) * 100) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 30)
}

export async function parseSt03nFile(file, required = REQUIRED_ST03N) {
  const kind = classifySt03nFile(file.name)
  const req = required.find((item) => item.key === kind)
  const { objects, headerIdx, header } = st03nRowsToObjects(await readSt03nMatrix(file))
  const rows = summarizeSt03nObjects(kind, objects, file.name)
  return {
    kind,
    label: req?.label || kind || 'Unknown ST03N file',
    fileName: file.name,
    rows,
    status: {
      key: kind,
      label: req?.label || kind || 'Unknown ST03N file',
      ok: rows.length > 0,
      rows: rows.length,
      message: rows.length ? `parsed header row ${headerIdx + 1}` : 'no valid metric rows',
      fileName: file.name,
      columns: header.slice(0, 10),
    },
  }
}

export function buildSt03nAnalysis(files, parseStatus, rows, evidenceServer) {
  const top = rows[0]
  const parsedFiles = parseStatus.filter((item) => item.ok).length
  const completeness = Math.round((parsedFiles / REQUIRED_ST03N.length) * 100)
  const counts = rows.reduce((acc, row) => {
    acc[row.component] = (acc[row.component] || 0) + 1
    return acc
  }, {})
  const componentRows = Object.entries(counts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
  const dominant = componentRows[0]?.name || 'Unknown'
  const verdict = top ? 'Detected' : 'Not confirmed'
  const confidence = Math.min(100, Math.round((top?.score || 0) * 0.55 + completeness * 0.30 + Math.min(rows.length, 20) * 0.75))
  const correlation = top
    ? completeness >= 80 ? 'Strong workload evidence' : 'Partial workload evidence'
    : 'Weak workload evidence'
  const nextAction = top
    ? `Use ${top.label} as ST03N impact reference. Dominant component: ${top.component}.`
    : 'Upload complete ST03N pack or verify file naming/header format.'

  return {
    files,
    parseStatus,
    rows,
    top,
    completeness,
    componentRows,
    dominant,
    verdict,
    confidence,
    correlation,
    nextAction,
    evidenceServer,
    createdAt: new Date().toISOString(),
  }
}
