import { exportWpScoutVisualPdf as exportV4WpScoutVisualPdf } from './wpScoutVisualPdfEnterpriseV4.js'

const C = {
  red: [214, 70, 88],
  yellow: [214, 155, 40],
  green: [30, 160, 130],
  dark: [5, 22, 22],
  ink: [25, 35, 35],
  muted: [82, 96, 96],
  teal: [0, 90, 84],
  light: [246, 251, 250],
  border: [224, 234, 232],
}

const clean = (value = '') => String(value || '').replace(/\s+/g, ' ').trim()
const compact = (value = '', limit = 120) => {
  const text = clean(value)
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}
const numberOf = (value = '') => Number(String(value || '').replace(',', '.').match(/-?\d+(?:\.\d+)?/)?.[0] || 0)
const statusColor = (value) => (/RED|CRIT|HIGH|CRITICAL/i.test(value) ? C.red : /YELLOW|WARN|MEDIUM|WARNING/i.test(value) ? C.yellow : C.green)
const statusLabel = (severity) => (severity === 'CRITICAL' ? 'RED / CHECK NOW' : severity === 'WARNING' ? 'YELLOW / WATCH' : 'GREEN / OK')

function pageOf(pdf) {
  return { w: pdf.internal.pageSize.getWidth(), h: pdf.internal.pageSize.getHeight(), m: 14 }
}

function ensure(pdf, page, y, need = 12) {
  if (y.value + need > page.h - 20) {
    pdf.addPage('a4', 'portrait')
    Object.assign(page, pageOf(pdf))
    y.value = 16
  }
}

function write(pdf, page, y, value, size = 9, style = 'normal', color = C.ink, indent = 0) {
  pdf.setFont('helvetica', style)
  pdf.setFontSize(size)
  pdf.setTextColor(...color)
  pdf.splitTextToSize(String(value || '-'), page.w - page.m * 2 - indent).forEach((line) => {
    ensure(pdf, page, y, size >= 12 ? 9 : 6)
    pdf.text(line, page.m + indent, y.value)
    y.value += size >= 12 ? 6.5 : 5
  })
}

function rowCells(row) {
  return Array.from(row.querySelectorAll('td,th')).map((cell) => clean(cell.textContent)).filter(Boolean)
}

function evidenceRows(root) {
  return Array.from(root.querySelectorAll('tbody tr,.cmpCleanTable tbody tr'))
    .map((row) => {
      const cells = rowCells(row)
      return { cells, text: cells.join(' | ') }
    })
    .filter((row) => /\b(CRIT|WARN|OK)\b/i.test(row.text) && /\d+(?:\.\d+)?\s*GB/i.test(row.text))
}

function parseRow(row = { cells: [], text: '' }) {
  const cells = row.cells || []
  const text = row.text || cells.join(' | ')
  return {
    status: /\bCRIT\b/i.test(text) ? 'CRIT' : /\bWARN\b/i.test(text) ? 'WARN' : 'OK',
    host: cells.find((item) => !/^(CRIT|WARN|OK|INFO|RED|YELLOW|GREEN)$/i.test(item) && /[A-Z0-9]+PAPPDC/i.test(item)) || text.match(/[A-Z0-9]+PAPPDC/i)?.[0] || '-',
    pid: cells.find((item) => /^\d{3,8}$/.test(item)) || text.match(/\b\d{3,8}\b/)?.[0] || '-',
    type: cells.find((item) => /^(BTC|DIA|UPD|SPO|ENQ|RFC|BGD|\?)$/i.test(item)) || '-',
    rss: cells.find((item) => /\d+(?:\.\d+)?\s*GB/i.test(item)) || text.match(/\d+(?:\.\d+)?\s*GB/i)?.[0] || '-',
    age: cells.find((item) => /\d+d|\d+h|\d+m/i.test(item)) || '-',
    job: cells.find((item) => /^Z[A-Z0-9_]{4,}$/i.test(item)) || cells.find((item) => !/^(CRIT|WARN|OK)$/i.test(item) && /[A-Z0-9_]{8,}/i.test(item)) || '-',
  }
}

function metric(root, labels = []) {
  const text = clean(root?.textContent || '')
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = text.match(new RegExp(`${escaped}[^0-9]{0,34}(\\d+(?:\\.\\d+)?)(?:\\s*(GB|%|rows?))?`, 'i'))
    if (match) return `${match[1]}${match[2] ? ` ${match[2]}` : ''}`
  }
  return ''
}

function swapStatus(root) {
  const text = clean(root?.textContent || '')
  const badge = text.match(/\bSwap\s+([0-9]+)\b/i)
  if (badge) return Number(badge[1]) > 0 ? `ACTIVE (${badge[1]})` : 'CLEAR'
  const signal = text.match(/\bswap\s*(?:si|so)?\s*[:=]\s*([0-9]+)\b/i)
  return signal && Number(signal[1]) > 0 ? `ACTIVE (${signal[1]})` : 'CLEAR'
}

function buildReport(root) {
  const rows = evidenceRows(root).map(parseRow)
  const top = rows.find((row) => row.status === 'CRIT') || rows[0] || parseRow()
  const critical = rows.filter((row) => row.status === 'CRIT').length || numberOf(metric(root, ['Critical']))
  const warning = rows.filter((row) => row.status === 'WARN').length || numberOf(metric(root, ['Warning']))
  const ok = rows.filter((row) => row.status === 'OK').length
  const maxRss = metric(root, ['Max RSS']) || top.rss
  const rss = numberOf(maxRss)
  const swap = swapStatus(root)
  const severity = top.status === 'CRIT' || critical > 0 || rss >= 128 ? 'CRITICAL' : top.status === 'WARN' || warning > 0 || rss >= 32 ? 'WARNING' : 'STABLE'
  const color = severity === 'CRITICAL' ? C.red : severity === 'WARNING' ? C.yellow : C.green
  const risk = Math.max(0, Math.min(100, (severity === 'CRITICAL' ? 74 : severity === 'WARNING' ? 50 : 22) + Math.min(16, Math.round(rss / 18)) + Math.min(8, critical * 3 + warning) + (swap.startsWith('ACTIVE') ? 8 : 0)))

  return {
    generatedAt: new Date().toLocaleString('id-ID'),
    rows,
    top,
    severity,
    color,
    risk,
    swap,
    confidence: severity === 'CRITICAL' ? 'High' : severity === 'WARNING' ? 'Medium' : 'Normal',
    metrics: { critical, warning, ok, maxRss, hosts: metric(root, ['Hosts']) || '-', rawRows: metric(root, ['Raw Rows', 'Rows']) || rows.length },
  }
}

function buildNarrative(report) {
  const isRed = report.severity === 'CRITICAL'
  const isYellow = report.severity === 'WARNING'
  return {
    title: isRed ? 'Executive AI Narrative — Immediate Basis Validation Required' : isYellow ? 'Executive AI Narrative — Elevated Memory Pressure' : 'Executive AI Narrative — No Dominant Critical Signal',
    summary: isRed
      ? `WP-SCOUT evidence indicates a critical memory pressure pattern. The first validation target is host ${report.top.host}, PID ${report.top.pid}, type ${report.top.type}, with ${report.metrics.maxRss} RSS.`
      : isYellow
        ? `The evidence shows warning-level pressure. Validate the top process on ${report.top.host} and monitor RSS/swap trend before business impact increases.`
        : 'Current evidence does not show a dominant RED process. Keep the export as a baseline and continue normal monitoring.',
    impact: isRed
      ? 'Potential impact: dialog degradation, job delay, memory exhaustion, or user-facing performance issue if the offender remains active.'
      : isYellow
        ? 'Potential impact: slower runtime and higher queue risk if memory pressure continues.'
        : 'Potential impact: low based on the visible evidence set.',
    next: isRed
      ? `Basis to check SM50/SM66 for PID ${report.top.pid}, correlate job ${report.top.job}, then validate ST22/SM21 in the same time window.`
      : `Basis to monitor ${report.top.host}, confirm whether ${report.top.job} is expected, and attach this PDF to the incident record if escalation is needed.`,
  }
}

function card(pdf, x, y, w, h, label, value, color) {
  pdf.setFillColor(...C.light)
  pdf.setDrawColor(...C.border)
  pdf.roundedRect(x, y, w, h, 3, 3, 'FD')
  pdf.setTextColor(...color)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(7)
  pdf.text(label.toUpperCase(), x + 4, y + 6)
  pdf.setTextColor(...C.ink)
  pdf.setFontSize(10)
  pdf.text(pdf.splitTextToSize(String(value || '-'), w - 8).slice(0, 2), x + 4, y + 14)
}

function cover(pdf, page, y, report) {
  pdf.setFillColor(...C.dark)
  pdf.rect(0, 0, page.w, 53, 'F')
  pdf.setFillColor(...report.color)
  pdf.rect(0, 0, 5, 53, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(17)
  pdf.text('WP-SCOUT Enterprise RCA Report V5', page.m, 16)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.text(`Generated: ${report.generatedAt}`, page.m, 25)
  pdf.text('Deterministic V5 export: executive narrative, KPI delta, impact score, checklist, appendix.', page.m, 34)
  y.value = 63
  pdf.setTextColor(...report.color)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(20)
  pdf.text(`${report.severity} — ${statusLabel(report.severity)}`, page.m, y.value)
  pdf.setTextColor(...C.ink)
  pdf.setFontSize(9)
  pdf.text(`Confidence: ${report.confidence} • Owner Direction: Basis / Infrastructure`, page.m, y.value + 7)
  y.value += 18
  const barW = page.w - page.m * 2
  pdf.setTextColor(...C.teal)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.text('Incident Impact Score', page.m, y.value)
  pdf.setFillColor(232, 240, 239)
  pdf.roundedRect(page.m, y.value + 4, barW, 7, 2, 2, 'F')
  pdf.setFillColor(...report.color)
  pdf.roundedRect(page.m, y.value + 4, Math.max(5, barW * (report.risk / 100)), 7, 2, 2, 'F')
  pdf.setTextColor(...C.ink)
  pdf.setFontSize(9)
  pdf.text(`${Math.round(report.risk)} / 100`, page.m + barW - 25, y.value + 17)
  y.value += 26
  const w = (page.w - page.m * 2 - 8) / 3
  card(pdf, page.m, y.value, w, 22, 'Worst Host', report.top.host, report.color)
  card(pdf, page.m + w + 4, y.value, w, 22, 'Worst PID / Type', `${report.top.pid} / ${report.top.type}`, report.color)
  card(pdf, page.m + (w + 4) * 2, y.value, w, 22, 'Top Job', report.top.job, report.color)
  y.value += 27
  card(pdf, page.m, y.value, w, 22, 'Main Pressure', `${report.metrics.maxRss} RSS`, report.color)
  card(pdf, page.m + w + 4, y.value, w, 22, 'CRIT / WARN', `${report.metrics.critical} CRIT / ${report.metrics.warning} WARN`, report.color)
  card(pdf, page.m + (w + 4) * 2, y.value, w, 22, 'Evidence Rows', report.metrics.rawRows, report.color)
  y.value += 32
}

function narrativePage(pdf, y, report) {
  pdf.addPage('a4', 'portrait')
  const page = pageOf(pdf)
  y.value = 16
  const narrative = buildNarrative(report)
  write(pdf, page, y, narrative.title, 14, 'bold', C.teal)
  write(pdf, page, y, 'Generated from visible WP-SCOUT evidence using deterministic rules. No network call, no runtime injector, no screenshot-only dependency.', 8.5, 'normal', C.muted)
  y.value += 4
  ;[
    ['Executive Summary', narrative.summary],
    ['Business / Technical Impact', narrative.impact],
    ['Recommended Next Move', narrative.next],
  ].forEach(([title, body]) => {
    ensure(pdf, page, y, 30)
    pdf.setFillColor(...C.light)
    pdf.setDrawColor(...C.border)
    pdf.roundedRect(page.m, y.value, page.w - page.m * 2, 31, 3, 3, 'FD')
    pdf.setTextColor(...report.color)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(9)
    pdf.text(title, page.m + 5, y.value + 7)
    pdf.setTextColor(...C.ink)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8.3)
    pdf.text(pdf.splitTextToSize(body, page.w - page.m * 2 - 10).slice(0, 3), page.m + 5, y.value + 14)
    y.value += 37
  })
}

function kpiDeltaPage(pdf, y, report) {
  pdf.addPage('a4', 'portrait')
  const page = pageOf(pdf)
  y.value = 16
  write(pdf, page, y, 'KPI Delta Comparison', 14, 'bold', C.teal)
  write(pdf, page, y, 'Baseline bands are static operational thresholds so the PDF remains deterministic and build-safe.', 8.5, 'normal', C.muted)
  y.value += 4
  const rows = [
    ['Max RSS', report.metrics.maxRss, '< 32 GB normal / >= 128 GB critical', numberOf(report.metrics.maxRss) >= 128 ? 'Critical' : numberOf(report.metrics.maxRss) >= 32 ? 'Warning' : 'Stable'],
    ['Critical Rows', String(report.metrics.critical), '0 expected', report.metrics.critical > 0 ? 'Critical' : 'Stable'],
    ['Warning Rows', String(report.metrics.warning), '0 preferred', report.metrics.warning > 0 ? 'Warning' : 'Stable'],
    ['Swap', report.swap, 'CLEAR expected', report.swap.startsWith('ACTIVE') ? 'Critical' : 'Stable'],
    ['Evidence Coverage', String(report.metrics.rawRows), 'Rows exported from active view', Number(report.metrics.rawRows) > 0 ? 'Stable' : 'Warning'],
  ]
  const widths = [34, 35, page.w - page.m * 2 - 112, 43]
  let x = page.m
  pdf.setFillColor(...C.dark)
  pdf.rect(page.m, y.value, page.w - page.m * 2, 8, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(7)
  ;['KPI', 'VALUE', 'BASELINE / DELTA RULE', 'STATUS'].forEach((header, index) => {
    pdf.text(header, x + 1, y.value + 5.5)
    x += widths[index]
  })
  y.value += 8
  rows.forEach((row, index) => {
    ensure(pdf, page, y, 11)
    pdf.setFillColor(index % 2 ? 250 : 245, 250, 249)
    pdf.rect(page.m, y.value, page.w - page.m * 2, 10, 'F')
    x = page.m
    row.forEach((value, col) => {
      pdf.setTextColor(...(col === 3 ? statusColor(value) : C.ink))
      pdf.setFont('helvetica', col === 0 || col === 3 ? 'bold' : 'normal')
      pdf.setFontSize(7.2)
      pdf.text(pdf.splitTextToSize(compact(value, 80), widths[col] - 2).slice(0, 1), x + 1, y.value + 6.5)
      x += widths[col]
    })
    y.value += 10
  })
}

function checklistPage(pdf, y, report) {
  pdf.addPage('a4', 'portrait')
  const page = pageOf(pdf)
  y.value = 16
  write(pdf, page, y, 'RCA Action Checklist', 14, 'bold', C.teal)
  const items = [
    `Open SM50/SM66 and validate host ${report.top.host}, PID ${report.top.pid}, type ${report.top.type}.`,
    `Check whether job ${report.top.job} is expected, long-running, or safe to reschedule.`,
    `Correlate ST22, SM21, and system log in the same time window as this export.`,
    `Validate OS memory and swap on the reported host; current swap signal: ${report.swap}.`,
    'Attach WP-SCOUT source evidence and this PDF to the incident or change record.',
  ]
  items.forEach((item, index) => {
    ensure(pdf, page, y, 17)
    pdf.setDrawColor(...C.border)
    pdf.roundedRect(page.m, y.value, 7, 7, 1.5, 1.5)
    pdf.setTextColor(...report.color)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8)
    pdf.text(String(index + 1), page.m + 10, y.value + 5.3)
    pdf.setTextColor(...C.ink)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8.3)
    pdf.text(pdf.splitTextToSize(item, page.w - page.m * 2 - 18), page.m + 18, y.value + 5.3)
    y.value += 15
  })
}

function appendixPage(pdf, y, report) {
  pdf.addPage('a4', 'portrait')
  const page = pageOf(pdf)
  y.value = 16
  write(pdf, page, y, 'Evidence Correlation Summary', 14, 'bold', C.teal)
  write(pdf, page, y, 'Top rows are preserved in compact form for reviewer traceability.', 8.5, 'normal', C.muted)
  const rows = report.rows.length ? report.rows : [report.top]
  const headers = ['#', 'STATUS', 'HOST', 'PID', 'TYPE', 'RSS', 'AGE/JOB']
  const widths = [8, 22, 35, 21, 17, 22, page.w - page.m * 2 - 125]
  const drawHeader = () => {
    let x = page.m
    pdf.setFillColor(...C.dark)
    pdf.rect(page.m, y.value, page.w - page.m * 2, 8, 'F')
    pdf.setTextColor(255, 255, 255)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(7)
    headers.forEach((header, index) => {
      pdf.text(header, x + 1, y.value + 5.5)
      x += widths[index]
    })
    y.value += 8
  }
  drawHeader()
  rows.slice(0, 36).forEach((row, index) => {
    if (y.value > page.h - 28) {
      pdf.addPage('a4', 'portrait')
      Object.assign(page, pageOf(pdf))
      y.value = 16
      drawHeader()
    }
    const status = row.status === 'CRIT' ? 'RED' : row.status === 'WARN' ? 'YELLOW' : 'GREEN'
    const values = [String(index + 1), status, row.host, row.pid, row.type, row.rss, compact([row.age, row.job].filter(Boolean).join(' / '), 80)]
    pdf.setFillColor(index % 2 ? 250 : 245, 250, 249)
    pdf.rect(page.m, y.value, page.w - page.m * 2, 9, 'F')
    let x = page.m
    values.forEach((value, col) => {
      pdf.setTextColor(...(col === 1 ? statusColor(value) : C.ink))
      pdf.setFont('helvetica', col === 1 ? 'bold' : 'normal')
      pdf.setFontSize(7.1)
      pdf.text(pdf.splitTextToSize(compact(value, 58), widths[col] - 2).slice(0, 1), x + 1, y.value + 6)
      x += widths[col]
    })
    y.value += 9
  })
}

function footer(pdf, report) {
  const pages = pdf.getNumberOfPages()
  for (let i = 1; i <= pages; i += 1) {
    pdf.setPage(i)
    const page = pageOf(pdf)
    pdf.setDrawColor(...C.border)
    pdf.line(page.m, page.h - 13, page.w - page.m, page.h - 13)
    pdf.setTextColor(110, 120, 120)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7)
    pdf.text(`SAP RCA Workspace V5 • ${report.generatedAt}`, page.m, page.h - 7)
    pdf.text(`Page ${i} / ${pages}`, page.w - page.m - 18, page.h - 7)
  }
}

async function exportV5WpScoutVisualPdf() {
  const jsPdfModule = await import('jspdf')
  const JsPDF = jsPdfModule.jsPDF || jsPdfModule.default
  const root = document.querySelector('.fullBleed') || document.querySelector('main') || document.body
  const report = buildReport(root)
  const pdf = new JsPDF('p', 'mm', 'a4')
  const page = pageOf(pdf)
  const y = { value: 16 }

  cover(pdf, page, y, report)
  narrativePage(pdf, y, report)
  kpiDeltaPage(pdf, y, report)
  checklistPage(pdf, y, report)
  appendixPage(pdf, y, report)
  footer(pdf, report)

  pdf.save(`sap-wpscout-enterprise-v5-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.pdf`)
}

export async function exportWpScoutVisualPdf() {
  try {
    return await exportV5WpScoutVisualPdf()
  } catch (error) {
    console.warn('[SAP RCA PDF] V5 export failed, falling back to V4', error)
    return exportV4WpScoutVisualPdf()
  }
}
