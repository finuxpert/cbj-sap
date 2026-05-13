import JSZip from 'jszip'
import { setWpScoutParsedEvidence } from '../pdf/wpScoutParsedEvidenceStore.js'

const MAX_DIRECT_ROWS = 5000

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

function parseWpScoutText(fileName, text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n')
  const rows = []
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

    const hostMatch = line.match(/^Hostname\s*:\s*(\S+)/i) || line.match(/^##\s*WP-SCOUT\s*@\s*(\S+)/i)
    if (hostMatch) {
      host = hostMatch[1].trim()
      continue
    }

    if (!/^\d{2,8}\s+/.test(line) || /^PID\s+/i.test(line)) continue

    const parts = line.split(/\s+/)
    if (parts.length < 8) continue

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
        if (val > 0 && val < 1024) rssGb = Math.max(rssGb, val)
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

  return rows
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

export async function parseWpScoutDirectUploadFiles(fileList) {
  const files = Array.from(fileList || []).filter(Boolean)
  const expanded = []

  for (const file of files) {
    expanded.push(...await expandInputFile(file))
  }

  const rows = expanded.flatMap((item) => parseWpScoutText(item.name, item.text))
  setWpScoutParsedEvidence(rows, {
    source: files.some((file) => /\.zip$/i.test(file.name)) ? 'zip-direct-upload' : 'text-direct-upload',
    fileName: files.map((file) => file.name).join(', '),
    expandedFiles: expanded.map((item) => item.name),
  })

  return {
    rows,
    files: expanded,
    sourceFiles: files.map((file) => file.name),
  }
}
