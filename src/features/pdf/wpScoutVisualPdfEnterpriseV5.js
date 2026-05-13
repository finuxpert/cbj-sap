import { exportWpScoutVisualPdf as exportV4WpScoutVisualPdf } from './wpScoutVisualPdfEnterpriseV4.js'
import {
  WP_SCOUT_PDF_V5_COLORS as C,
  cleanPdfText as clean,
  compactPdfText as compact,
  numberFromPdfText as numberOf,
  pdfStatusColor as statusColor,
  pdfStatusLabel as statusLabel,
  pdfPageBox as pageOf,
  ensurePdfSpace as ensure,
  writePdfText,
  drawPdfMetricCard as card,
  drawPdfSectionTitle,
  drawPdfTableHeader,
  drawPdfTableRow,
} from './wpScoutVisualPdfEnterpriseV5Primitives.js'
import { appendixPage } from './wpScoutVisualPdfEnterpriseV5Appendix.js'
import { estimateWpScoutPdfPerformance, pdfPerformanceLabel } from './wpScoutVisualPdfEnterpriseV5Performance.js'
import { isSectionEnabledForProfile, resolveWpScoutPdfProfileFromDom } from './wpScoutVisualPdfEnterpriseV5Profiles.js'
import { renderPdfSectionsWithProfiler } from './pdfSectionProfiler.js'

const STATUS_ONLY_RE = /^(CRIT|WARN|OK|INFO|RED|YELLOW|GREEN)$/i
const TYPE_RE = /^(BTC|DIA|UPD|SPO|ENQ|RFC|BGD|UP2|ICM|GATEWAY|\?)$/i
const HOST_TOKEN_RE = /\b[A-Z0-9][A-Z0-9_.-]{2,}(?:APP|DB|HDB|PAS|AAS|CI|DI|SCS|ERS|PAPPDC|SAP)[A-Z0-9_.-]*\b/i
const JOB_TOKEN_RE = /\b(?:Z|Y|SAP|RS|SM|RBD|BTC|BI|BW)[A-Z0-9_/-]{4,}\b/i

function write(pdf, page, y, value, size = 9, style = 'normal', color = C.ink, indent = 0) {
  writePdfText(pdf, page, y, value, { size, style, color, indent })
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

function findHost(cells, text) {
  const byShape = cells.find((item) => !STATUS_ONLY_RE.test(item) && HOST_TOKEN_RE.test(item))
  return byShape || text.match(HOST_TOKEN_RE)?.[0] || '-'
}

function findJob(cells, text) {
  const explicitJob = cells.find((item) => JOB_TOKEN_RE.test(item)) || text.match(JOB_TOKEN_RE)?.[0]
  if (explicitJob) return compact(explicitJob, 70)

  const candidates = cells.filter((item) => {
    if (STATUS_ONLY_RE.test(item) || TYPE_RE.test(item)) return false
    if (/\d+(?:\.\d+)?\s*GB/i.test(item) || /^\d{3,8}$/.test(item)) return false
    if (HOST_TOKEN_RE.test(item)) return false
    return /[A-Z0-9_/-]{8,}/i.test(item)
  })

  return compact(candidates[0] || '-', 70)
}

function parseRow(row = { cells: [], text: '' }) {
  const cells = row.cells || []
  const text = row.text || cells.join(' | ')
  const status = /\bCRIT\b/i.test(text) ? 'CRIT' : /\bWARN\b/i.test(text) ? 'WARN' : 'OK'
  const rss = cells.find((item) => /\d+(?:\.\d+)?\s*GB/i.test(item)) || text.match(/\d+(?:\.\d+)?\s*GB/i)?.[0] || '-'

  return {
    status,
    host: findHost(cells, text),
    pid: cells.find((item) => /^\d{3,8}$/.test(item)) || text.match(/\b\d{3,8}\b/)?.[0] || '-',
    type: cells.find((item) => TYPE_RE.test(item)) || '-',
    rss,
    rssValue: numberOf(rss),
    age: cells.find((item) => /\b\d+\s*(?:d|h|m|s)\b/i.test(item)) || '-',
    job: findJob(cells, text),
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

function maxRssFromRows(rows, root) {
  const maxRow = rows.reduce((best, row) => (row.rssValue > (best?.rssValue || 0) ? row : best), null)
  if (maxRow?.rssValue > 0) return maxRow.rss
  return metric(root, ['Max RSS']) || '-'
}

function dataQuality(rows, root) {
  const missingHost = rows.filter((row) => row.host === '-').length
  const missingPid = rows.filter((row) => row.pid === '-').length
  const missingJob = rows.filter((row) => row.job === '-').length
  const evidenceCount = rows.length || numberOf(metric(root, ['Raw Rows', 'Rows']))
  const warnings = []

  if (!evidenceCount) warnings.push('No table evidence rows were detected; PDF uses visible summary metrics only.')
  if (missingHost) warnings.push(`${missingHost} evidence row(s) have unknown host after parser normalization.`)
  if (missingPid) warnings.push(`${missingPid} evidence row(s) have unknown PID.`)
  if (missingJob) warnings.push(`${missingJob} evidence row(s) have unknown or non-standard job/program field.`)

  return {
    evidenceCount,
    missingHost,
    missingPid,
    missingJob,
    warnings,
    confidence: warnings.length === 0 ? 'High' : warnings.length <= 2 ? 'Medium' : 'Needs Review',
  }
}

function buildReport(root) {
  const rows = evidenceRows(root).map(parseRow)
  const top = rows.find((row) => row.status === 'CRIT') || rows[0] || parseRow()
  const critical = rows.filter((row) => row.status === 'CRIT').length || numberOf(metric(root, ['Critical']))
  const warning = rows.filter((row) => row.status === 'WARN').length || numberOf(metric(root, ['Warning']))
  const ok = rows.filter((row) => row.status === 'OK').length
  const maxRss = maxRssFromRows(rows, root)
  const rss = numberOf(maxRss)
  const swap = swapStatus(root)
  const quality = dataQuality(rows, root)
  const severity = top.status === 'CRIT' || critical > 0 || rss >= 128 ? 'CRITICAL' : top.status === 'WARN' || warning > 0 || rss >= 32 ? 'WARNING' : 'STABLE'
  const color = severity === 'CRITICAL' ? C.red : severity === 'WARNING' ? C.yellow : C.green
  const risk = Math.max(0, Math.min(100, (severity === 'CRITICAL' ? 74 : severity === 'WARNING' ? 50 : 22) + Math.min(16, Math.round(rss / 18)) + Math.min(8, critical * 3 + warning) + (swap.startsWith('ACTIVE') ? 8 : 0) + (quality.confidence === 'Needs Review' ? 4 : 0)))

  return {
    generatedAt: new Date().toLocaleString('id-ID'),
    rows,
    top,
    severity,
    color,
    risk,
    swap,
    confidence: severity === 'CRITICAL' ? 'High' : severity === 'WARNING' ? 'Medium' : 'Normal',
    dataQuality: quality,
    metrics: { critical, warning, ok, maxRss, hosts: metric(root, ['Hosts']) || '-', rawRows: quality.evidenceCount },
  }
}

function buildNarrative(report) {
  const isRed = report.severity === 'CRITICAL'
  const isYellow = report.severity === 'WARNING'
  return {
    title: isRed ? 'Executive AI Narrative — Immediate Basis Validation Required' : isYellow ? 'Executive AI Narrative — Elevated Memory Pressure' : 'Executive AI Narrative — No Dominant Critical Signal',
    summary: isRed
      ? `WP-SCOUT evidence indicates a critical memory pressure pattern. First validation target: host ${report.top.host}, PID ${report.top.pid}, type ${report.top.type}, RSS ${report.metrics.maxRss}.`
      : isYellow
        ? `The evidence shows warning-level pressure. Validate the top process on ${report.top.host} and monitor RSS/swap trend before business impact increases.`
        : 'Current evidence does not show a dominant RED process. Keep the export as a baseline and continue normal monitoring.',
    impact: isRed
      ? 'Potential impact: dialog degradation, job delay, memory exhaustion, or user-facing performance issue if the offender remains active.'
      : isYellow
        ? 'Potential impact: slower runtime and higher queue risk if memory pressure continues.'
        : 'Potential impact: low based on the visible evidence set.',
    next: isRed
      ? `Basis to check SM50/SM66 for PID ${report.top.pid}, correlate job/program ${report.top.job}, then validate ST22/SM21 in the same time window.`
      : `Basis to monitor ${report.top.host}, confirm whether ${report.top.job} is expected, and attach this PDF to the incident record if escalation is needed.`,
  }
}

function performanceColor(performance) {
  if (performance?.level === 'high') return C.red
  if (performance?.level === 'medium') return C.yellow
  return C.green
}

function cover(pdf, page, y, report, profile, performance) {
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
  pdf.text(`Profile: ${profile.label} • ${pdfPerformanceLabel(performance)} • Deterministic export with V4 fallback.`, page.m, 34)
  y.value = 63
  pdf.setTextColor(...report.color)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(20)
  pdf.text(`${report.severity} — ${statusLabel(report.severity)}`, page.m, y.value)
  pdf.setTextColor(...C.ink)
  pdf.setFontSize(9)
  pdf.text(`RCA confidence: ${report.confidence} • Data quality: ${report.dataQuality.confidence} • Audience: ${profile.intendedAudience}`, page.m, y.value + 7)
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
  card(pdf, page.m, y.value, w, 22, 'Worst Host', report.top.host, { colors: C, accent: report.color })
  card(pdf, page.m + w + 4, y.value, w, 22, 'Worst PID / Type', `${report.top.pid} / ${report.top.type}`, { colors: C, accent: report.color })
  card(pdf, page.m + (w + 4) * 2, y.value, w, 22, 'Export Load', pdfPerformanceLabel(performance), { colors: C, accent: performanceColor(performance) })
  y.value += 27
  card(pdf, page.m, y.value, w, 22, 'Main Pressure', `${report.metrics.maxRss} RSS`, { colors: C, accent: report.color })
  card(pdf, page.m + w + 4, y.value, w, 22, 'CRIT / WARN', `${report.metrics.critical} CRIT / ${report.metrics.warning} WARN`, { colors: C, accent: report.color })
  card(pdf, page.m + (w + 4) * 2, y.value, w, 22, 'Rows Rendered', `${performance.renderedRows}/${performance.evidenceRows}`, { colors: C, accent: performanceColor(performance) })
  y.value += 32
}

function indexPage(pdf, y, report, sections, profile, performance) {
  pdf.addPage('a4', 'portrait')
  const page = pageOf(pdf)
  y.value = 16
  drawPdfSectionTitle(pdf, page, y, 'Report Index', `Profile: ${profile.label} • ${profile.description}`, { colors: C })
  const rows = sections.map((section, index) => [String(index + 1), section.title, `Page ${section.page}`, section.owner])
  const widths = [11, page.w - page.m * 2 - 86, 25, 50]
  drawPdfTableHeader(pdf, page, y, ['#', 'SECTION', 'PAGE', 'PRIMARY OWNER'], widths, { colors: C })
  rows.forEach((row, index) => {
    drawPdfTableRow(pdf, page, y, row, widths, {
      colors: C,
      index,
      boldColumns: [1],
      colorForColumn: (value, col) => (col === 2 ? C.teal : C.ink),
    })
  })
  y.value += 6
  write(pdf, page, y, `Severity: ${report.severity} • Data quality: ${report.dataQuality.confidence} • Evidence rows: ${report.metrics.rawRows} • Export: ${pdfPerformanceLabel(performance)}`, 8.5, 'normal', report.color)
  performance.notes.forEach((note) => write(pdf, page, y, `• ${note}`, 8.2, 'normal', performanceColor(performance)))
}

function narrativePage(pdf, y, report) {
  pdf.addPage('a4', 'portrait')
  const page = pageOf(pdf)
  y.value = 16
  const narrative = buildNarrative(report)
  drawPdfSectionTitle(pdf, page, y, narrative.title, 'Generated from visible WP-SCOUT evidence using deterministic rules. No network call, no runtime injector, no screenshot-only dependency.', { colors: C })
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

function dataQualityPage(pdf, y, report) {
  pdf.addPage('a4', 'portrait')
  const page = pageOf(pdf)
  y.value = 16
  drawPdfSectionTitle(pdf, page, y, 'Data Accuracy & Parser Quality', 'This page separates measured evidence from inferred fields so reviewers can trust the PDF without over-reading it.', { colors: C })
  const rows = [
    ['Detected Evidence Rows', String(report.dataQuality.evidenceCount), 'Measured from visible table rows containing status + GB value'],
    ['Missing Host Fields', String(report.dataQuality.missingHost), 'Should be 0 for fully structured evidence'],
    ['Missing PID Fields', String(report.dataQuality.missingPid), 'Should be 0 for process-level validation'],
    ['Missing Job/Program Fields', String(report.dataQuality.missingJob), 'May be normal if WP-SCOUT source does not include job/program'],
    ['Data Quality Confidence', report.dataQuality.confidence, 'High = complete fields, Medium/Needs Review = check source table'],
  ]
  const widths = [48, 38, page.w - page.m * 2 - 86]
  drawPdfTableHeader(pdf, page, y, ['CHECK', 'VALUE', 'MEANING'], widths, { colors: C })
  rows.forEach((row, index) => {
    drawPdfTableRow(pdf, page, y, row, widths, {
      colors: C,
      index,
      boldColumns: [0],
      colorForColumn: (value, col) => (col === 1 ? statusColor(value, C) : C.ink),
    })
  })
  y.value += 6
  const warnings = report.dataQuality.warnings.length ? report.dataQuality.warnings : ['No data-quality warning detected. Parsed evidence appears internally consistent.']
  warnings.forEach((warning) => write(pdf, page, y, `• ${warning}`, 8.5, 'normal', report.dataQuality.warnings.length ? C.yellow : C.green))
}

function kpiDeltaPage(pdf, y, report) {
  pdf.addPage('a4', 'portrait')
  const page = pageOf(pdf)
  y.value = 16
  drawPdfSectionTitle(pdf, page, y, 'KPI Delta Comparison', 'Baseline bands are static operational thresholds so the PDF remains deterministic and build-safe.', { colors: C })
  const rows = [
    ['Max RSS', report.metrics.maxRss, '< 32 GB normal / >= 128 GB critical', numberOf(report.metrics.maxRss) >= 128 ? 'Critical' : numberOf(report.metrics.maxRss) >= 32 ? 'Warning' : 'Stable'],
    ['Critical Rows', String(report.metrics.critical), '0 expected', report.metrics.critical > 0 ? 'Critical' : 'Stable'],
    ['Warning Rows', String(report.metrics.warning), '0 preferred', report.metrics.warning > 0 ? 'Warning' : 'Stable'],
    ['Swap', report.swap, 'CLEAR expected', report.swap.startsWith('ACTIVE') ? 'Critical' : 'Stable'],
    ['Evidence Coverage', String(report.metrics.rawRows), 'Rows exported from active view', numberOf(report.metrics.rawRows) > 0 ? 'Stable' : 'Warning'],
  ]
  const widths = [34, 35, page.w - page.m * 2 - 112, 43]
  drawPdfTableHeader(pdf, page, y, ['KPI', 'VALUE', 'BASELINE / DELTA RULE', 'STATUS'], widths, { colors: C })
  rows.forEach((row, index) => {
    drawPdfTableRow(pdf, page, y, row, widths, {
      colors: C,
      index,
      boldColumns: [0, 3],
      colorForColumn: (value, col) => (col === 3 ? statusColor(value, C) : C.ink),
    })
  })
}

function checklistPage(pdf, y, report) {
  pdf.addPage('a4', 'portrait')
  const page = pageOf(pdf)
  y.value = 16
  drawPdfSectionTitle(pdf, page, y, 'RCA Action Checklist', '', { colors: C })
  const items = [
    `Open SM50/SM66 and validate host ${report.top.host}, PID ${report.top.pid}, type ${report.top.type}.`,
    `Check whether job/program ${report.top.job} is expected, long-running, or safe to reschedule.`,
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

function buildSectionRegistry(report, profile, performance) {
  return [
    { id: 'cover', title: 'Executive RCA Cover', owner: 'Management / Basis', enabled: true, render: ({ pdf, page, y }) => cover(pdf, page, y, report, profile, performance) },
    { id: 'index', title: 'Report Index', owner: 'Management / Incident Mgmt', enabled: true, render: ({ pdf, y, sections }) => indexPage(pdf, y, report, sections, profile, performance) },
    { id: 'narrative', title: 'Executive AI Narrative', owner: 'Management / Basis', enabled: true, render: ({ pdf, y }) => narrativePage(pdf, y, report) },
    { id: 'data-quality', title: 'Data Accuracy & Parser Quality', owner: 'Basis / Reviewer', enabled: true, render: ({ pdf, y }) => dataQualityPage(pdf, y, report) },
    { id: 'kpi-delta', title: 'KPI Delta Comparison', owner: 'Basis / Infrastructure', enabled: true, render: ({ pdf, y }) => kpiDeltaPage(pdf, y, report) },
    { id: 'checklist', title: 'RCA Action Checklist', owner: 'Basis / Job Owner', enabled: true, render: ({ pdf, y }) => checklistPage(pdf, y, report) },
    { id: 'appendix', title: 'Grouped Evidence Appendix', owner: 'Basis / Incident Mgmt', enabled: true, render: ({ pdf, y }) => appendixPage(pdf, y, report, profile) },
  ]
    .filter((section) => section.enabled && isSectionEnabledForProfile(section.id, profile))
    .map((section, index) => ({ ...section, page: index + 1 }))
}

async function exportV5WpScoutVisualPdf() {
  const jsPdfModule = await import('jspdf')
  const JsPDF = jsPdfModule.jsPDF || jsPdfModule.default
  const root = document.querySelector('.fullBleed') || document.querySelector('main') || document.body
  const profile = resolveWpScoutPdfProfileFromDom(root)
  const report = buildReport(root)
  const performance = estimateWpScoutPdfPerformance(report, profile)
  const pdf = new JsPDF('p', 'mm', 'a4')
  const page = pageOf(pdf)
  const y = { value: 16 }
  const sections = buildSectionRegistry(report, profile, performance)

  const profileResult = renderPdfSectionsWithProfiler(sections, { pdf, page, y, report, sections, profile, performance }, {
    label: '[SAP RCA PDF] V5 section profiler',
    metadata: {
      engine: 'wp-scout-enterprise-v5',
      profile: profile?.id || 'standard',
    },
  })

  performance.sectionProfile = profileResult.sectionProfile
  performance.sectionProfileTotalMs = profileResult.sectionProfileTotalMs

  footer(pdf, report)

  pdf.save(`sap-wpscout-enterprise-v5-${profile.id}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.pdf`)
}

export async function exportWpScoutVisualPdf() {
  try {
    return await exportV5WpScoutVisualPdf()
  } catch (error) {
    console.warn('[SAP RCA PDF] V5 export failed, falling back to V4', error)
    return exportV4WpScoutVisualPdf()
  }
}
