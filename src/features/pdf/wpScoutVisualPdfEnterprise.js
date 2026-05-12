const COLORS = {
  red: [214, 70, 88],
  yellow: [214, 155, 40],
  green: [30, 160, 130],
  dark: [5, 22, 22],
  ink: [25, 35, 35],
  muted: [82, 96, 96],
  teal: [0, 90, 84],
  light: [246, 251, 250],
  border: [224, 234, 232],
  softRed: [255, 241, 243],
  softYellow: [255, 248, 232],
  softGreen: [235, 250, 246],
}

const clean = (value = '') => String(value || '').replace(/\s+/g, ' ').trim()
const compact = (value = '', limit = 110) => {
  const text = clean(value)
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}
const numberOf = (value = '') => {
  const match = String(value || '').replace(',', '.').match(/-?\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : 0
}
const isStatus = (value = '') => /^(CRIT|WARN|OK|INFO|RED|YELLOW|GREEN)$/i.test(clean(value))

function rowCells(row) {
  return Array.from(row.querySelectorAll('td,th')).map((cell) => clean(cell.textContent)).filter(Boolean)
}

function metric(root, labels = []) {
  const text = clean(root?.textContent || '')
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = text.match(new RegExp(`${escaped}[^0-9]{0,30}(\\d+(?:\\.\\d+)?)(?:\\s*(GB|%|rows?))?`, 'i'))
    if (match) return `${match[1]}${match[2] ? ` ${match[2]}` : ''}`
  }
  return ''
}

function evidenceRows(root) {
  return Array.from(root.querySelectorAll('tbody tr,.cmpCleanTable tbody tr'))
    .map((row) => {
      const cells = rowCells(row)
      return { cells, text: cells.join(' | ') }
    })
    .filter((row) => /\b(CRIT|WARN|OK)\b/i.test(row.text) && /\d+(?:\.\d+)?\s*GB/i.test(row.text))
}

function parseEvidenceRow(row = { cells: [], text: '' }) {
  const cells = row.cells || []
  const text = row.text || cells.join(' | ')
  return {
    status: /\bCRIT\b/i.test(text) ? 'CRIT' : /\bWARN\b/i.test(text) ? 'WARN' : 'OK',
    host: cells.find((item) => !isStatus(item) && /[A-Z0-9]+PAPPDC/i.test(item)) || text.match(/[A-Z0-9]+PAPPDC/i)?.[0] || '-',
    pid: cells.find((item) => /^\d{3,8}$/.test(item)) || text.match(/\b\d{3,8}\b/)?.[0] || '-',
    type: cells.find((item) => /^(BTC|DIA|UPD|SPO|ENQ|RFC|BGD|\?)$/i.test(item)) || '-',
    rss: cells.find((item) => /\d+(?:\.\d+)?\s*GB/i.test(item)) || text.match(/\d+(?:\.\d+)?\s*GB/i)?.[0] || '-',
    age: cells.find((item) => /\d+d|\d+h|\d+m/i.test(item)) || '-',
    job: cells.find((item) => /^Z[A-Z0-9_]{4,}$/i.test(item)) || cells.find((item) => !isStatus(item) && /[A-Z0-9_]{8,}/i.test(item)) || '-',
  }
}

function swapStatus(root) {
  const text = clean(root?.textContent || '')
  const badge = text.match(/\bSwap\s+([0-9]+)\b/i)
  if (badge) return Number(badge[1]) > 0 ? `ACTIVE (${badge[1]})` : 'CLEAR'
  const signal = text.match(/\bswap\s*(?:si|so)?\s*[:=]\s*([0-9]+)\b/i)
  return signal && Number(signal[1]) > 0 ? `ACTIVE (${signal[1]})` : 'CLEAR'
}

function severityFrom({ top, criticalCount, warningCount, maxRss }) {
  const rss = numberOf(maxRss)
  if (top.status === 'CRIT' || criticalCount > 0 || rss >= 128) return 'CRITICAL'
  if (top.status === 'WARN' || warningCount > 0 || rss >= 32) return 'WARNING'
  return 'STABLE'
}

function riskScore({ severity, criticalCount, warningCount, maxRss, swap }) {
  const base = severity === 'CRITICAL' ? 72 : severity === 'WARNING' ? 48 : 22
  const rssBoost = Math.min(18, Math.round(numberOf(maxRss) / 16))
  const rowBoost = Math.min(8, criticalCount * 3 + warningCount)
  const swapBoost = swap.startsWith('ACTIVE') ? 8 : 0
  return Math.max(0, Math.min(100, base + rssBoost + rowBoost + swapBoost))
}

function buildReport(root) {
  const parsedRows = evidenceRows(root).map(parseEvidenceRow)
  const top = parsedRows.find((row) => row.status === 'CRIT') || parsedRows[0] || parseEvidenceRow()
  const criticalCount = parsedRows.filter((row) => row.status === 'CRIT').length || numberOf(metric(root, ['Critical']))
  const warningCount = parsedRows.filter((row) => row.status === 'WARN').length || numberOf(metric(root, ['Warning']))
  const maxRss = metric(root, ['Max RSS']) || top.rss
  const swap = swapStatus(root)
  const severity = severityFrom({ top, criticalCount, warningCount, maxRss })
  const color = severity === 'CRITICAL' ? COLORS.red : severity === 'WARNING' ? COLORS.yellow : COLORS.green
  const score = riskScore({ severity, criticalCount, warningCount, maxRss, swap })

  return {
    generatedAt: new Date().toLocaleString('id-ID'),
    severity,
    color,
    riskScore: score,
    confidence: severity === 'CRITICAL' ? 'High' : severity === 'WARNING' ? 'Medium' : 'Normal',
    top,
    rows: parsedRows,
    metrics: {
      criticalCount,
      warningCount,
      maxRss,
      hosts: metric(root, ['Hosts']) || '-',
      rawRows: metric(root, ['Raw Rows', 'Rows']) || parsedRows.length,
    },
    swap,
    reason:
      severity === 'CRITICAL'
        ? `RSS is very high (${maxRss}). Check the top process first.`
        : severity === 'WARNING'
          ? 'Memory pressure is above normal range. Validate the top process and correlate with job/runtime.'
          : 'No dominant critical WP-SCOUT signal in the current view.',
  }
}

const severityLabel = (severity) => (severity === 'CRITICAL' ? 'RED / CHECK NOW' : severity === 'WARNING' ? 'YELLOW / WATCH' : 'GREEN / OK')
const severityColor = (value) => {
  const text = String(value).toUpperCase()
  if (text.includes('RED') || text.includes('CRIT')) return COLORS.red
  if (text.includes('YELLOW') || text.includes('WARN')) return COLORS.yellow
  return COLORS.green
}

function ensurePage(pdf, page, y, need = 16) {
  if (y.value + need > page.h - 20) {
    pdf.addPage()
    y.value = 16
  }
}

function writeLine(pdf, page, y, text, size = 9, style = 'normal', color = COLORS.ink, indent = 0) {
  pdf.setFont('helvetica', style)
  pdf.setFontSize(size)
  pdf.setTextColor(...color)
  for (const part of pdf.splitTextToSize(String(text || '-'), page.w - page.m * 2 - indent)) {
    ensurePage(pdf, page, y, size >= 12 ? 9 : 6)
    pdf.text(part, page.m + indent, y.value)
    y.value += size >= 12 ? 6.5 : 5
  }
}

function drawCard(pdf, x, y, w, h, label, value, color) {
  pdf.setFillColor(...COLORS.light)
  pdf.setDrawColor(...COLORS.border)
  pdf.roundedRect(x, y, w, h, 3, 3, 'FD')
  pdf.setTextColor(...color)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(7)
  pdf.text(label.toUpperCase(), x + 4, y + 6)
  pdf.setTextColor(...COLORS.ink)
  pdf.setFontSize(10)
  pdf.text(pdf.splitTextToSize(String(value || '-'), w - 8).slice(0, 2), x + 4, y + 14)
}

function drawTrafficRow(pdf, x, y, label, value, color, note = '') {
  pdf.setFillColor(...color)
  pdf.circle(x + 3, y - 1.5, 2.2, 'F')
  pdf.setTextColor(...COLORS.ink)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.text(label, x + 8, y)
  pdf.setFont('helvetica', 'normal')
  pdf.text(String(value || '-'), x + 48, y)
  if (note) {
    pdf.setTextColor(...COLORS.muted)
    pdf.setFontSize(7)
    pdf.text(pdf.splitTextToSize(note, 92).slice(0, 1), x + 93, y)
  }
}

function drawRiskGauge(pdf, x, y, w, score, color) {
  const safeScore = Math.max(0, Math.min(100, Number(score) || 0))
  pdf.setTextColor(...COLORS.teal)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.text('Risk Score', x, y)
  pdf.setFillColor(232, 240, 239)
  pdf.roundedRect(x, y + 4, w, 7, 2, 2, 'F')
  pdf.setFillColor(...color)
  pdf.roundedRect(x, y + 4, Math.max(5, w * (safeScore / 100)), 7, 2, 2, 'F')
  pdf.setTextColor(...COLORS.ink)
  pdf.setFontSize(9)
  pdf.text(`${Math.round(safeScore)} / 100`, x + w - 25, y + 17)
  pdf.setTextColor(...COLORS.muted)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7)
  pdf.text('Derived from severity, RSS, critical/warning rows, and swap signal.', x, y + 17)
}

function drawNativeTrend(pdf, page, y, report) {
  ensurePage(pdf, page, y, 42)
  const x = page.m
  const width = page.w - page.m * 2
  const boxY = y.value
  const bars = [
    { label: 'RSS', value: Math.min(100, Math.round((numberOf(report.metrics.maxRss) / 160) * 100)), note: report.metrics.maxRss },
    { label: 'CRIT', value: Math.min(100, report.metrics.criticalCount * 20), note: String(report.metrics.criticalCount) },
    { label: 'WARN', value: Math.min(100, report.metrics.warningCount * 12), note: String(report.metrics.warningCount) },
    { label: 'SWAP', value: report.swap.startsWith('ACTIVE') ? 100 : 0, note: report.swap },
  ]

  pdf.setFillColor(...COLORS.light)
  pdf.setDrawColor(...COLORS.border)
  pdf.roundedRect(x, boxY, width, 36, 3, 3, 'FD')
  pdf.setTextColor(...COLORS.teal)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  pdf.text('Native Pressure Snapshot', x + 5, boxY + 8)
  pdf.setTextColor(...COLORS.muted)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7)
  pdf.text('Fallback visual summary rendered directly in jsPDF, independent from SVG/Recharts capture.', x + 5, boxY + 14)

  bars.forEach((bar, index) => {
    const bx = x + 5 + index * ((width - 10) / 4)
    const bw = (width - 24) / 4
    pdf.setTextColor(...COLORS.ink)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(7)
    pdf.text(bar.label, bx, boxY + 23)
    pdf.setFillColor(230, 239, 237)
    pdf.roundedRect(bx + 20, boxY + 19, bw - 26, 5, 1.5, 1.5, 'F')
    pdf.setFillColor(...report.color)
    pdf.roundedRect(bx + 20, boxY + 19, Math.max(3, (bw - 26) * (bar.value / 100)), 5, 1.5, 1.5, 'F')
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(...COLORS.muted)
    pdf.text(compact(bar.note, 18), bx + 20, boxY + 30)
  })
  y.value += 42
}

function drawFooter(pdf, page, report) {
  const pages = pdf.getNumberOfPages()
  for (let i = 1; i <= pages; i += 1) {
    pdf.setPage(i)
    pdf.setDrawColor(...COLORS.border)
    pdf.line(page.m, page.h - 13, page.w - page.m, page.h - 13)
    pdf.setTextColor(110, 120, 120)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7)
    pdf.text(`SAP RCA Workspace • ${report.generatedAt}`, page.m, page.h - 7)
    pdf.text(`Page ${i} / ${pages}`, page.w - page.m - 18, page.h - 7)
  }
}

function usefulSvg(svg) {
  return Array.from(svg.querySelectorAll('path,line,polyline,polygon,circle,text,rect')).filter((node) => !node.closest('defs,clipPath,mask')).length >= 3
}

async function svgToPng(svg) {
  if (!usefulSvg(svg)) return null
  const clone = svg.cloneNode(true)
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const rect = svg.getBoundingClientRect()
  const width = Math.max(420, Math.round(rect.width || Number(svg.getAttribute('width')) || 720))
  const height = Math.max(180, Math.round(rect.height || Number(svg.getAttribute('height')) || 260))
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  clone.style.background = '#071315'
  const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.crossOrigin = 'anonymous'
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = reject
      img.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = width * 2
    canvas.height = height * 2
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#071315'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return { dataUrl: canvas.toDataURL('image/png'), width, height }
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function collectCharts(root) {
  const svgs = Array.from(root.querySelectorAll('.recharts-wrapper svg,.chartPanel svg,.rcaReadableChartPanel svg')).slice(0, 8)
  const output = []
  const seen = new Set()
  for (const svg of svgs) {
    const panel = svg.closest('.cmpCleanPanel,.overviewCard,.resultPanel,.evidencePanel,.rcaReadableChartPanel')
    const title = compact(panel?.querySelector('h2,h3,.chartTitleBlock h2,.sectionKicker')?.textContent || 'Evidence Chart', 80)
    const key = title.toLowerCase()
    if (seen.has(key)) continue
    const image = await svgToPng(svg).catch(() => null)
    if (!image) continue
    seen.add(key)
    output.push({ title, ...image })
    if (output.length >= 5) break
  }
  return output
}

function chartNote(title, report) {
  const lower = title.toLowerCase()
  if (lower.includes('cpu') || lower.includes('mem') || lower.includes('swap')) return `CPU/memory trend supports the RCA context. Main process risk: ${report.metrics.maxRss} RSS. Swap: ${report.swap}.`
  if (lower.includes('rss')) return `The longest bar is the first process to validate. Top RSS is ${report.metrics.maxRss}.`
  if (lower.includes('host')) return `The top host has the highest pressure. Start from ${report.top.host}.`
  return 'Use this chart as supporting evidence; primary validation still starts from the top WP/PID.'
}

function drawCover(pdf, page, y, report, chartCount) {
  pdf.setFillColor(...COLORS.dark)
  pdf.rect(0, 0, page.w, 53, 'F')
  pdf.setFillColor(...report.color)
  pdf.rect(0, 0, 5, 53, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(17)
  pdf.text('WP-SCOUT Enterprise RCA Report', page.m, 16)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.text(`Generated: ${report.generatedAt}`, page.m, 25)
  pdf.text('Legend: Red = check now, Yellow = watch, Green = OK. Rising trend = getting worse.', page.m, 34)
  pdf.text(`Reason: ${compact(report.reason, 125)}`, page.m, 43)

  y.value = 63
  pdf.setTextColor(...report.color)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(20)
  pdf.text(`${report.severity} — ${severityLabel(report.severity)}`, page.m, y.value)
  pdf.setTextColor(...COLORS.ink)
  pdf.setFontSize(9)
  pdf.text(`Confidence: ${report.confidence} • Owner Direction: Basis / Infrastructure • Charts: ${chartCount}`, page.m, y.value + 7)
  y.value += 17

  drawRiskGauge(pdf, page.m, y.value, page.w - page.m * 2, report.riskScore, report.color)
  y.value += 24

  const cardWidth = (page.w - page.m * 2 - 8) / 3
  drawCard(pdf, page.m, y.value, cardWidth, 22, 'Worst Host', report.top.host, report.color)
  drawCard(pdf, page.m + cardWidth + 4, y.value, cardWidth, 22, 'Worst PID / Type', `${report.top.pid} / ${report.top.type}`, report.color)
  drawCard(pdf, page.m + (cardWidth + 4) * 2, y.value, cardWidth, 22, 'Top Job', report.top.job, report.color)
  y.value += 27
  drawCard(pdf, page.m, y.value, cardWidth, 22, 'Main Pressure', `${report.metrics.maxRss} RSS`, report.color)
  drawCard(pdf, page.m + cardWidth + 4, y.value, cardWidth, 22, 'CRIT / WARN', `${report.metrics.criticalCount} CRIT / ${report.metrics.warningCount} WARN`, report.color)
  drawCard(pdf, page.m + (cardWidth + 4) * 2, y.value, cardWidth, 22, 'Evidence Rows', report.metrics.rawRows, report.color)
  y.value += 32

  writeLine(pdf, page, y, 'Quick Read', 12, 'bold', COLORS.teal)
  drawTrafficRow(pdf, page.m, y.value + 5, 'Overall', severityLabel(report.severity), report.color, report.reason)
  drawTrafficRow(pdf, page.m, y.value + 13, 'Memory', `${report.metrics.maxRss} RSS`, report.color, 'Check the top PID first.')
  drawTrafficRow(pdf, page.m, y.value + 21, 'Swap', report.swap, report.swap.startsWith('ACTIVE') ? COLORS.red : COLORS.green, report.swap.startsWith('ACTIVE') ? 'Swap activity detected.' : 'No swap activity detected.')
  drawTrafficRow(pdf, page.m, y.value + 29, 'Host', report.top.host, report.color, 'Start validation from this host.')
  y.value += 40

  drawNativeTrend(pdf, page, y, report)
}

function drawCharts(pdf, page, y, charts, report) {
  pdf.addPage()
  y.value = 16
  writeLine(pdf, page, y, 'Visual Analytics', 13, 'bold', COLORS.teal)
  drawNativeTrend(pdf, page, y, report)
  const maxWidth = page.w - page.m * 2

  if (!charts.length) {
    writeLine(pdf, page, y, 'No SVG/Recharts visual block was available. The native pressure snapshot above is kept as the build-safe visual fallback.', 9, 'italic', COLORS.muted)
    return
  }

  for (const chart of charts) {
    ensurePage(pdf, page, y, 86)
    writeLine(pdf, page, y, chart.title, 10, 'bold', COLORS.ink)
    writeLine(pdf, page, y, chartNote(chart.title, report), 8, 'normal', COLORS.muted)
    const imageHeight = Math.min(66, maxWidth * (chart.height / chart.width))
    pdf.setDrawColor(...COLORS.border)
    pdf.roundedRect(page.m, y.value, maxWidth, imageHeight + 6, 2, 2)
    pdf.addImage(chart.dataUrl, 'PNG', page.m + 3, y.value + 3, maxWidth - 6, imageHeight)
    y.value += imageHeight + 12
  }
}

function drawEvidenceTable(pdf, page, y, report) {
  pdf.addPage()
  y.value = 16
  writeLine(pdf, page, y, 'Top Evidence', 13, 'bold', COLORS.teal)
  const headers = ['#', 'STATUS', 'HOST', 'PID', 'DETAIL']
  const widths = [8, 22, 38, 24, page.w - page.m * 2 - 92]
  let x = page.m
  pdf.setFillColor(...COLORS.dark)
  pdf.rect(page.m, y.value, page.w - page.m * 2, 8, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(7)
  headers.forEach((header, index) => {
    pdf.text(header, x + 1, y.value + 5.5)
    x += widths[index]
  })
  y.value += 8

  const rows = report.rows.length ? report.rows : [report.top]
  rows.slice(0, 12).forEach((row, index) => {
    ensurePage(pdf, page, y, 12)
    const severity = row.status === 'CRIT' ? 'RED' : row.status === 'WARN' ? 'YELLOW' : 'GREEN'
    const detail = compact([row.type, row.rss, row.age, row.job].filter(Boolean).join(' / '), 72)
    pdf.setFillColor(index % 2 ? 250 : 245, 250, 249)
    pdf.rect(page.m, y.value, page.w - page.m * 2, 9, 'F')
    x = page.m
    ;[String(index + 1), severity, row.host, row.pid, detail].forEach((value, columnIndex) => {
      const color = columnIndex === 1 ? severityColor(severity) : COLORS.ink
      pdf.setTextColor(...color)
      pdf.setFont('helvetica', columnIndex === 1 ? 'bold' : 'normal')
      pdf.setFontSize(7.2)
      pdf.text(pdf.splitTextToSize(compact(value, 58), widths[columnIndex] - 2).slice(0, 1), x + 1, y.value + 6)
      x += widths[columnIndex]
    })
    y.value += 9
  })

  y.value += 8
  writeLine(pdf, page, y, 'Recommended Validation Steps', 12, 'bold', COLORS.teal)
  ;[
    `SM50/SM66: check PID ${report.top.pid} on ${report.top.host}.`,
    `SM37: check job ${report.top.job} owner, variant, runtime, and schedule.`,
    `OS: validate memory/RSS on ${report.top.host}; compare with vmstat/top/sar around incident time.`,
    'ST22/SM21: check dump or system log around the same time window.',
    'Attach raw WP-SCOUT evidence to the ticket so the PDF remains an executive summary, not the only evidence source.',
  ].forEach((action, index) => writeLine(pdf, page, y, `${index + 1}. ${action}`, 9, 'normal', COLORS.ink, 3))
}

export async function exportWpScoutVisualPdf() {
  const jsPdfModule = await import('jspdf')
  const JsPDF = jsPdfModule.jsPDF || jsPdfModule.default
  const root = document.querySelector('.fullBleed') || document.querySelector('main') || document.body
  const report = buildReport(root)
  const chartImages = await collectCharts(root)
  const pdf = new JsPDF('p', 'mm', 'a4')
  const page = { w: pdf.internal.pageSize.getWidth(), h: pdf.internal.pageSize.getHeight(), m: 14 }
  const y = { value: 16 }

  drawCover(pdf, page, y, report, chartImages.length)
  drawCharts(pdf, page, y, chartImages, report)
  drawEvidenceTable(pdf, page, y, report)
  drawFooter(pdf, page, report)

  pdf.save(`sap-wpscout-enterprise-rca-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.pdf`)
}
