import JSZip from 'jszip'
import { setWpScoutParsedEvidence } from '../pdf/wpScoutParsedEvidenceStore.js'

const MAX_DIRECT_ROWS = 5000
const WP_TYPES = new Set(['BTC', 'DIA', 'UPD', 'SPO', 'ENQ', 'RFC', 'BGD', 'UP2', 'ICM', 'GATEWAY'])

function n(value, fallback = 0) {
  const parsed = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : fallback
}

function ageToHours(raw = '') {
  const text = String(raw).toLowerCase().trim()
  const d = text.match(/(\d+)\s*d/)
  const h = text.match(/(\d+)\s*h/)
  const m = text.match(/(\d+)\s*m/)
  return (d ? Number(d[1]) * 24 : 0) + (h ? Number(h[1]) : 0) + (m ? Number(m[1]) / 60 : 0)
}

function severityOf(row) {
  const rssGb = Number(row?.rssGb || 0)
  const ageHours = Number(row?.ageHours || 0)
  const cpu = Number(row?.cpu || 0)

  if (rssGb >= 96 || cpu >= 95 || (rssGb >= 64 && ageHours >= 24)) return 'CRIT'
  if (rssGb >= 32 || ageHours >= 168 || cpu >= 70) return 'WARN'
  return 'OK'
}

function normalizeSnapshotLabel(value = '', fallback = '') {
  const text = String(value || '').trim()
  const hhmm = text.match(/\b(\d{1,2}:\d{2})(?::\d{2})?\b/)
  if (hhmm) return hhmm[1].padStart(5, '0')
  const fileStamp = fallback.match(/(\d{1,2})[-_:.]?(\d{2})(?:[-_:.]?\d{2})?/)
  if (fileStamp) return `${fileStamp[1].padStart(2, '0')}:${fileStamp[2]}`
  return fallback || 'snapshot'
}

function parseResourceMetricLine(line = '', snapshot = '', fallback = '') {
  const text = String(line || '')
  const pick = (patterns, group = 1) => {
    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match) return n(match[group], 0)
    }
    return 0
  }

  const cpu = pick([
    /CPU\s+usage\s*:\s*(\d+(?:[.,]\d+)?)\s*%\s*used/i,
    /\bcpu\s*[:=]\s*(\d+(?:[.,]\d+)?)\s*%/i,
  ])

  const mem = pick([
    /Memory\s*:\s*used\s+\d+(?:[.,]\d+)?\s*G\s*\(\s*(\d+(?:[.,]\d+)?)\s*%\s*\)/i,
    /Memory\s*:\s*.*?\(\s*(\d+(?:[.,]\d+)?)\s*%\s*\)/i,
    /\bmem(?:ory)?\s*[:=]\s*(\d+(?:[.,]\d+)?)\s*%/i,
  ])

  const swapSi = pick([
    /Swap\s+IO\s*:\s*si\/so\s+(\d+(?:[.,]\d+)?)\/(\d+(?:[.,]\d+)?)\s*p\/s/i,
  ])

  if (!cpu && !mem && !swapSi) return null

  return {
    time: normalizeSnapshotLabel(snapshot, fallback),
    cpu: Math.max(0, Math.min(100, cpu)),
    mem: Math.max(0, Math.min(100, mem)),
    swapSi: Math.max(0, swapSi),
    source: 'direct-upload-telemetry',
  }
}

function looksLikeResourceLine(line = '') {
  return /^(CPU\s+usage|Memory\s*:|Swap\s+IO|Filesystem|Disk|Load|Uptime)\b/i.test(String(line || '').trim())
}

function looksLikeProcessRow(parts = []) {
  if (parts.length < 8) return false
  if (!/^\d{2,8}$/.test(parts[0])) return false

  const type = String(parts[3] || '').toUpperCase()
  if (!WP_TYPES.has(type)) return false

  return parts.some((token) => /\d+[dhm]/i.test(token)) || parts.some((token) => /^[RSW]$/.test(token))
}

function parseWpScoutText(fileName, text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n')
  const rows = []
  const resourceSamples = []
  let host = 'UNKNOWN'
  let snapshot = ''

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue

    const snapMatch = line.match(/^snapshot\s*@\s*(.+)$/i)
    if (snapMatch) {
      snapshot = snapMatch[1].trim()
      continue
    }

    const metricSample = parseResourceMetricLine(line, snapshot, fileName)
    if (metricSample) {
      resourceSamples.push(metricSample)
      continue
    }

    const hostMatch = line.match(/^Hostname\s*:\s*(\S+)/i) || line.match(/^##\s*WP-SCOUT\s*@\s*(\S+)/i)
    if (hostMatch) {
      host = hostMatch[1].trim()
      continue
    }

    if (looksLikeResourceLine(line)) continue
    if (!/^\d{2,8}\s+/.test(line) || /^PID\s+/i.test(line)) continue

    const parts = line.split(/\s+/)
    if (!looksLikeProcessRow(parts)) continue

    const pid = parts[0]
    const inst = parts[1] || ''
    const wp = parts[2] || ''
    const type = parts[3] || '?'
    const cpu = n(parts.find((p, idx) => idx > 3 && /^\d+[.,]?\d*$/.test(p)), 0)

    let rssGb = 0
    let ageRaw = ''
    let state = ''

    for (const token of parts) {
      if (!ageRaw && /\d+[dhm]/i.test(token)) ageRaw = token
      if (!state && /^[RSW]$/.test(token)) state = token
      if (!rssGb && /^\d+(?:[.,]\d+)?G?$/i.test(token)) {
        const val = n(token.replace(/G/i, ''))
        if (val > 0 && val < 512) rssGb = Math.max(rssGb, val)
      }
    }

    const pathIdx = parts.findIndex((p) => p.startsWith('/'))
    const beforePath = pathIdx >= 0 ? parts.slice(0, pathIdx) : parts
    const job = beforePath.slice(-1)[0] || '-'
    const errorCode = beforePath.slice(-2)[0] || '-'
    const program = beforePath.slice(16, -2).join(' ') || '-'
    const ageHours = ageToHours(ageRaw)
    const trendTime = normalizeSnapshotLabel(snapshot, fileName)
    const row = {
      id: `${fileName}-${pid}-${rows.length}`,
      fileName,
      snapshot,
      trendTime,
      host,
      pid,
      inst,
      wp,
      type,
      cpu,
      rssGb,
      rss: `${rssGb.toFixed(2)} GB`,
      ageRaw: ageRaw || '-',
      ageHours,
      state: state || '-',
      program,
      job,
      errorCode,
      raw: line,
    }
    row.status = severityOf(row)
    row.severity = row.status
    row.cells = [row.status, row.host, row.pid, row.type || '?', `${row.rssGb.toFixed(2)} GB`, row.ageRaw, row.job].filter(Boolean)
    row.text = row.cells.join(' | ')
    rows.push(row)

    if (rows.length >= MAX_DIRECT_ROWS) break
  }

  return { rows, resourceSamples }
}

async function expandInputFile(file) {
  const name = file?.name || 'upload'
  if (/\.zip$/i.test(name)) {
    const zip = await JSZip.loadAsync(file)
    const entries = Object.values(zip.files)
      .filter((entry) => !entry.dir)
      .filter((entry) => /\.(log|txt|out|trace)$/i.test(entry.name) || !/\.[a-z0-9]{1,8}$/i.test(entry.name))

    const expanded = []
    for (const entry of entries) {
      const text = await entry.async('text')
      expanded.push({ name: entry.name.split('/').pop() || entry.name, text })
    }
    return expanded
  }

  return [{ name, text: await file.text() }]
}

function summarizeRows(rows = [], resourceSamples = []) {
  const crit = rows.filter((row) => row.status === 'CRIT').length
  const warn = rows.filter((row) => row.status === 'WARN').length
  const hosts = new Set(rows.map((row) => row.host).filter(Boolean)).size
  const maxRss = Math.max(0, ...rows.map((row) => Number(row.rssGb || 0)))
  const peakCpu = Math.max(0, ...resourceSamples.map((row) => Number(row.cpu || 0)), ...rows.map((row) => Number(row.cpu || 0)))
  const peakMem = Math.max(0, ...resourceSamples.map((row) => Number(row.mem || 0)))
  const peakSwap = Math.max(0, ...resourceSamples.map((row) => Number(row.swapSi || 0)))
  const topRow = [...rows].sort((a, b) => Number(b.rssGb || 0) - Number(a.rssGb || 0))[0] || null

  return { crit, warn, hosts, maxRss, peakCpu, peakMem, peakSwap, topRow }
}

export async function parseWpScoutDirectUploadFiles(fileList) {
  const files = Array.from(fileList || []).filter(Boolean)
  const expanded = []

  for (const file of files) {
    expanded.push(...await expandInputFile(file))
  }

  const parsed = expanded.map((item) => ({ name: item.name, ...parseWpScoutText(item.name, item.text) }))
  const rows = parsed.flatMap((item) => item.rows)
  const resourceSamples = parsed.flatMap((item) => item.resourceSamples || [])
  const summary = summarizeRows(rows, resourceSamples)

  setWpScoutParsedEvidence(rows, {
    source: files.some((file) => /\.zip$/i.test(file.name)) ? 'zip-direct-upload' : 'text-direct-upload',
    fileName: files.map((file) => file.name).join(', '),
    expandedFiles: expanded.map((item) => item.name),
    resourceSamples,
    summary,
  })

  return {
    rows,
    resourceSamples,
    summary,
    files: expanded,
    sourceFiles: files.map((file) => file.name),
  }
}
