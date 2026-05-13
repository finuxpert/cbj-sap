import {
  WP_SCOUT_PDF_V5_COLORS as C,
  compactPdfText as compact,
  pdfStatusColor as statusColor,
  pdfPageBox as pageOf,
  drawPdfSectionTitle,
  drawPdfTableHeader,
  drawPdfTableRow,
  writePdfText,
} from './wpScoutVisualPdfEnterpriseV5Primitives.js'

const statusRank = { CRIT: 0, WARN: 1, OK: 2 }
const statusLabel = (status) => (status === 'CRIT' ? 'RED' : status === 'WARN' ? 'YELLOW' : 'GREEN')
const safeKey = (value, fallback = 'Unknown') => {
  const text = String(value || '').trim()
  return text && text !== '-' ? text : fallback
}

function groupedBy(rows, keyFn) {
  return rows.reduce((acc, row) => {
    const key = keyFn(row)
    if (!acc.has(key)) acc.set(key, [])
    acc.get(key).push(row)
    return acc
  }, new Map())
}

function sortRows(rows) {
  return [...rows].sort((a, b) => {
    const severityDelta = (statusRank[a.status] ?? 3) - (statusRank[b.status] ?? 3)
    if (severityDelta) return severityDelta
    return (b.rssValue || 0) - (a.rssValue || 0)
  })
}

function topGroups(map, limit = 8) {
  return [...map.entries()]
    .map(([key, rows]) => ({
      key,
      rows: sortRows(rows),
      red: rows.filter((row) => row.status === 'CRIT').length,
      yellow: rows.filter((row) => row.status === 'WARN').length,
      maxRss: Math.max(...rows.map((row) => row.rssValue || 0)),
    }))
    .sort((a, b) => b.red - a.red || b.yellow - a.yellow || b.maxRss - a.maxRss || b.rows.length - a.rows.length)
    .slice(0, limit)
}

function drawGroupedSummary(pdf, page, y, report) {
  const rows = report.rows.length ? report.rows : [report.top]
  const byHost = topGroups(groupedBy(rows, (row) => safeKey(row.host)), 6)
  const byType = topGroups(groupedBy(rows, (row) => safeKey(row.type)), 6)
  const summaryRows = [
    ['Severity Groups', `RED ${report.metrics.critical} / YELLOW ${report.metrics.warning} / GREEN ${report.metrics.ok}`, 'Primary triage grouping'],
    ['Host Groups', String(byHost.length), 'Sorted by RED count, warning count, then max RSS'],
    ['Type Groups', String(byType.length), 'Sorted by RED count, warning count, then max RSS'],
    ['Appendix Row Cap', '36 detailed rows', 'Protects browser memory for large evidence exports'],
  ]
  const widths = [42, 58, page.w - page.m * 2 - 100]

  drawPdfTableHeader(pdf, page, y, ['GROUPING', 'VALUE', 'RULE'], widths, { colors: C })
  summaryRows.forEach((row, index) => {
    drawPdfTableRow(pdf, page, y, row, widths, {
      colors: C,
      index,
      boldColumns: [0],
      colorForColumn: (value, col) => (col === 1 ? statusColor(value, C) : C.ink),
    })
  })
  y.value += 6
}

function drawGroupCards(pdf, page, y, title, groups) {
  writePdfText(pdf, page, y, title, { size: 11, style: 'bold', color: C.teal })
  if (!groups.length) {
    writePdfText(pdf, page, y, 'No grouping data available from parsed evidence.', { size: 8.5, style: 'italic', color: C.muted })
    return
  }

  const widths = [48, 26, 26, 27, page.w - page.m * 2 - 127]
  drawPdfTableHeader(pdf, page, y, ['GROUP', 'ROWS', 'RED', 'YELLOW', 'MAX RSS'], widths, { colors: C })
  groups.forEach((group, index) => {
    drawPdfTableRow(pdf, page, y, [group.key, String(group.rows.length), String(group.red), String(group.yellow), `${group.maxRss || 0} GB`], widths, {
      colors: C,
      index,
      boldColumns: [0],
      colorForColumn: (value, col) => (col === 2 || col === 3 ? statusColor(col === 2 && Number(value) > 0 ? 'RED' : col === 3 && Number(value) > 0 ? 'YELLOW' : 'GREEN', C) : C.ink),
    })
  })
  y.value += 6
}

function drawDetailedRows(pdf, page, y, rows) {
  const headers = ['#', 'STATUS', 'HOST', 'PID', 'TYPE', 'RSS', 'AGE/JOB']
  const widths = [8, 22, 35, 21, 17, 22, page.w - page.m * 2 - 125]
  const drawHeader = () => drawPdfTableHeader(pdf, page, y, headers, widths, { colors: C })

  drawHeader()
  rows.slice(0, 36).forEach((row, index) => {
    if (y.value > page.h - 28) {
      pdf.addPage('a4', 'portrait')
      Object.assign(page, pageOf(pdf))
      y.value = 16
      drawHeader()
    }

    const status = statusLabel(row.status)
    drawPdfTableRow(pdf, page, y, [String(index + 1), status, row.host, row.pid, row.type, row.rss, compact([row.age, row.job].filter(Boolean).join(' / '), 80)], widths, {
      colors: C,
      index,
      height: 9,
      fontSize: 7.1,
      boldColumns: [1],
      colorForColumn: (value, col) => (col === 1 ? statusColor(value, C) : C.ink),
      limit: 58,
    })
  })
}

export function appendixPage(pdf, y, report) {
  pdf.addPage('a4', 'portrait')
  const page = pageOf(pdf)
  y.value = 16
  const rows = sortRows(report.rows.length ? report.rows : [report.top])
  const byHost = topGroups(groupedBy(rows, (row) => safeKey(row.host)), 6)
  const byType = topGroups(groupedBy(rows, (row) => safeKey(row.type)), 6)

  drawPdfSectionTitle(pdf, page, y, 'Grouped Evidence Appendix', 'Evidence is grouped by severity, host, and process type so Basis can triage from highest operational risk first.', { colors: C })
  drawGroupedSummary(pdf, page, y, report)
  drawGroupCards(pdf, page, y, 'Top Host Groups', byHost)
  drawGroupCards(pdf, page, y, 'Top Process Type Groups', byType)

  if (y.value > page.h - 85) {
    pdf.addPage('a4', 'portrait')
    Object.assign(page, pageOf(pdf))
    y.value = 16
  }

  writePdfText(pdf, page, y, 'Detailed Evidence Rows — Severity First', { size: 11, style: 'bold', color: C.teal })
  writePdfText(pdf, page, y, 'Rows are sorted by severity and RSS. Large exports are capped to keep browser-side PDF rendering stable.', { size: 8.5, color: C.muted })
  y.value += 4
  drawDetailedRows(pdf, page, y, rows)
}
