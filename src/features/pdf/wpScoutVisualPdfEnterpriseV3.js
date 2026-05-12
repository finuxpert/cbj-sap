const C = {
  red: [214, 70, 88], yellow: [214, 155, 40], green: [30, 160, 130],
  dark: [5, 22, 22], ink: [25, 35, 35], muted: [82, 96, 96],
  teal: [0, 90, 84], light: [246, 251, 250], border: [224, 234, 232],
}

const clean = (v = '') => String(v || '').replace(/\s+/g, ' ').trim()
const compact = (v = '', n = 120) => {
  const text = clean(v)
  return text.length > n ? `${text.slice(0, n - 1)}…` : text
}
const num = (v = '') => Number(String(v || '').replace(',', '.').match(/-?\d+(?:\.\d+)?/)?.[0] || 0)
const isStatus = (v = '') => /^(CRIT|WARN|OK|INFO|RED|YELLOW|GREEN)$/i.test(clean(v))
const statusLabel = (s) => (s === 'CRITICAL' ? 'RED / CHECK NOW' : s === 'WARNING' ? 'YELLOW / WATCH' : 'GREEN / OK')
const statusColor = (v) => /RED|CRIT/i.test(v) ? C.red : /YELLOW|WARN/i.test(v) ? C.yellow : C.green

function metric(root, labels = []) {
  const text = clean(root?.textContent || '')
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = text.match(new RegExp(`${escaped}[^0-9]{0,34}(\\d+(?:\\.\\d+)?)(?:\\s*(GB|%|rows?))?`, 'i'))
    if (match) return `${match[1]}${match[2] ? ` ${match[2]}` : ''}`
  }
  return ''
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

function buildReport(root) {
  const rows = evidenceRows(root).map(parseRow)
  const top = rows.find((row) => row.status === 'CRIT') || rows[0] || parseRow()
  const critical = rows.filter((row) => row.status === 'CRIT').length || num(metric(root, ['Critical']))
  const warning = rows.filter((row) => row.status === 'WARN').length || num(metric(root, ['Warning']))
  const ok = rows.filter((row) => row.status === 'OK').length
  const maxRss = metric(root, ['Max RSS']) || top.rss
  const swap = swapStatus(root)
  const rss = num(maxRss)
  const severity = top.status === 'CRIT' || critical > 0 || rss >= 128 ? 'CRITICAL' : top.status === 'WARN' || warning > 0 || rss >= 32 ? 'WARNING' : 'STABLE'
  const color = severity === 'CRITICAL' ? C.red : severity === 'WARNING' ? C.yellow : C.green
  const risk = Math.max(0, Math.min(100, (severity === 'CRITICAL' ? 72 : severity === 'WARNING' ? 48 : 22) + Math.min(18, Math.round(rss / 16)) + Math.min(8, critical * 3 + warning) + (swap.startsWith('ACTIVE') ? 8 : 0)))
  return {
    generatedAt: new Date().toLocaleString('id-ID'), rows, top, severity, color, risk, swap,
    confidence: severity === 'CRITICAL' ? 'High' : severity === 'WARNING' ? 'Medium' : 'Normal',
    metrics: { critical, warning, ok, maxRss, hosts: metric(root, ['Hosts']) || '-', rawRows: metric(root, ['Raw Rows', 'Rows']) || rows.length },
    reason: severity === 'CRITICAL' ? `RSS is very high (${maxRss}). Check the top process first.` : severity === 'WARNING' ? 'Memory pressure is above normal range. Validate the top process and correlate with runtime.' : 'No dominant critical WP-SCOUT signal in the current view.',
  }
}

function pageOf(pdf) {
  return { w: pdf.internal.pageSize.getWidth(), h: pdf.internal.pageSize.getHeight(), m: 14 }
}

function ensure(pdf, page, y, need = 14) {
  if (y.value + need > page.h - 20) {
    pdf.addPage('a4', 'portrait')
    const next = pageOf(pdf)
    Object.assign(page, next)
    y.value = 16
  }
}

function write(pdf, page, y, value, size = 9, style = 'normal', color = C.ink, indent = 0) {
  pdf.setFont('helvetica', style)
  pdf.setFontSize(size)
  pdf.setTextColor(...color)
  for (const line of pdf.splitTextToSize(String(value || '-'), page.w - page.m * 2 - indent)) {
    ensure(pdf, page, y, size >= 12 ? 9 : 6)
    pdf.text(line, page.m + indent, y.value)
    y.value += size >= 12 ? 6.5 : 5
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

function pressureBars(pdf, page, y, report, title = 'Native Pressure Snapshot') {
  ensure(pdf, page, y, 42)
  const x = page.m
  const width = page.w - page.m * 2
  const top = y.value
  const bars = [
    ['RSS', Math.min(100, Math.round((num(report.metrics.maxRss) / 160) * 100)), report.metrics.maxRss],
    ['CRIT', Math.min(100, report.metrics.critical * 20), String(report.metrics.critical)],
    ['WARN', Math.min(100, report.metrics.warning * 12), String(report.metrics.warning)],
    ['SWAP', report.swap.startsWith('ACTIVE') ? 100 : 0, report.swap],
  ]
  pdf.setFillColor(...C.light)
  pdf.setDrawColor(...C.border)
  pdf.roundedRect(x, top, width, 36, 3, 3, 'FD')
  pdf.setTextColor(...C.teal)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  pdf.text(title, x + 5, top + 8)
  pdf.setTextColor(...C.muted)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7)
  pdf.text('Build-safe visual summary rendered directly in jsPDF.', x + 5, top + 14)
  bars.forEach(([label, value, note], index) => {
    const bx = x + 5 + index * ((width - 10) / 4)
    const bw = (width - 24) / 4
    pdf.setTextColor(...C.ink)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(7)
    pdf.text(label, bx, top + 23)
    pdf.setFillColor(230, 239, 237)
    pdf.roundedRect(bx + 20, top + 19, bw - 26, 5, 1.5, 1.5, 'F')
    pdf.setFillColor(...report.color)
    pdf.roundedRect(bx + 20, top + 19, Math.max(3, (bw - 26) * (value / 100)), 5, 1.5, 1.5, 'F')
    pdf.setTextColor(...C.muted)
    pdf.setFont('helvetica', 'normal')
    pdf.text(compact(note, 18), bx + 20, top + 30)
  })
  y.value += 42
}

function timelineRail(pdf, page, y, report) {
  ensure(pdf, page, y, 46)
  const x = page.m
  const width = page.w - page.m * 2
  const top = y.value
  const events = [
    ['Evidence loaded', `${report.metrics.rawRows} rows`, C.teal],
    ['Top offender', `${report.top.host} / PID ${report.top.pid}`, report.color],
    ['Memory pressure', `${report.metrics.maxRss} RSS`, report.color],
    ['Swap signal', report.swap, report.swap.startsWith('ACTIVE') ? C.red : C.green],
    ['Validation', 'SM50 / SM66 / SM37', C.teal],
  ]
  pdf.setFillColor(...C.light)
  pdf.setDrawColor(...C.border)
  pdf.roundedRect(x, top, width, 40, 3, 3, 'FD')
  pdf.setTextColor(...C.teal)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  pdf.text('RCA Timeline Rail', x + 5, top + 8)
  const railY = top + 19
  pdf.setDrawColor(205, 218, 216)
  pdf.line(x + 12, railY, x + width - 12, railY)
  const gap = (width - 24) / (events.length - 1)
  events.forEach(([label, note, color], index) => {
    const px = x + 12 + gap * index
    pdf.setFillColor(...color)
    pdf.circle(px, railY, 2.2, 'F')
    pdf.setTextColor(...C.ink)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(6.5)
    pdf.text(pdf.splitTextToSize(label, 32).slice(0, 1), px - 8, railY + 8)
    pdf.setTextColor(...C.muted)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(6)
    pdf.text(pdf.splitTextToSize(compact(note, 38), 35).slice(0, 2), px - 8, railY + 13)
  })
  y.value += 46
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
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' }))
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
    if (seen.has(title.toLowerCase())) continue
    const image = await svgToPng(svg).catch(() => null)
    if (!image) continue
    seen.add(title.toLowerCase())
    output.push({ title, ...image })
    if (output.length >= 5) break
  }
  return output
}

function chartNote(title, report) {
  const lower = title.toLowerCase()
  if (lower.includes('cpu') || lower.includes('mem') || lower.includes('swap')) return `CPU/memory trend supports RCA context. Main process risk: ${report.metrics.maxRss} RSS. Swap: ${report.swap}.`
  if (lower.includes('rss')) return `The longest bar is the first process to validate. Top RSS is ${report.metrics.maxRss}.`
  if (lower.includes('host')) return `The top host has the highest pressure. Start from ${report.top.host}.`
  return 'Use this visual as supporting evidence; primary validation starts from top WP/PID.'
}

function cover(pdf, page, y, report, chartCount) {
  pdf.setFillColor(...C.dark)
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
  pdf.text(`${report.severity} — ${statusLabel(report.severity)}`, page.m, y.value)
  pdf.setTextColor(...C.ink)
  pdf.setFontSize(9)
  pdf.text(`Confidence: ${report.confidence} • Owner Direction: Basis / Infrastructure • Charts: ${chartCount}`, page.m, y.value + 7)
  y.value += 17

  const barW = page.w - page.m * 2
  pdf.setTextColor(...C.teal)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.text('Risk Score', page.m, y.value)
  pdf.setFillColor(232, 240, 239)
  pdf.roundedRect(page.m, y.value + 4, barW, 7, 2, 2, 'F')
  pdf.setFillColor(...report.color)
  pdf.roundedRect(page.m, y.value + 4, Math.max(5, barW * (report.risk / 100)), 7, 2, 2, 'F')
  pdf.setTextColor(...C.ink)
  pdf.setFontSize(9)
  pdf.text(`${Math.round(report.risk)} / 100`, page.m + barW - 25, y.value + 17)
  y.value += 24

  const w = (page.w - page.m * 2 - 8) / 3
  card(pdf, page.m, y.value, w, 22, 'Worst Host', report.top.host, report.color)
  card(pdf, page.m + w + 4, y.value, w, 22, 'Worst PID / Type', `${report.top.pid} / ${report.top.type}`, report.color)
  card(pdf, page.m + (w + 4) * 2, y.value, w, 22, 'Top Job', report.top.job, report.color)
  y.value += 27
  card(pdf, page.m, y.value, w, 22, 'Main Pressure', `${report.metrics.maxRss} RSS`, report.color)
  card(pdf, page.m + w + 4, y.value, w, 22, 'CRIT / WARN', `${report.metrics.critical} CRIT / ${report.metrics.warning} WARN`, report.color)
  card(pdf, page.m + (w + 4) * 2, y.value, w, 22, 'Evidence Rows', report.metrics.rawRows, report.color)
  y.value += 32
  timelineRail(pdf, page, y, report)
  pressureBars(pdf, page, y, report)
}

function landscapeAnalytics(pdf, y, chartImages, report) {
  pdf.addPage('a4', 'landscape')
  const page = pageOf(pdf)
  y.value = 16
  write(pdf, page, y, 'Landscape Visual Analytics', 14, 'bold', C.teal)
  timelineRail(pdf, page, y, report)
  pressureBars(pdf, page, y, report, 'Landscape Pressure Snapshot')
  const maxWidth = page.w - page.m * 2
  if (!chartImages.length) {
    write(pdf, page, y, 'No SVG/Recharts visual block was available. Native timeline and pressure visuals remain as build-safe fallback.', 9, 'italic', C.muted)
    return
  }
  chartImages.slice(0, 3).forEach((chart) => {
    ensure(pdf, page, y, 72)
    write(pdf, page, y, chart.title, 10, 'bold', C.ink)
    write(pdf, page, y, chartNote(chart.title, report), 8, 'normal', C.muted)
    const h = Math.min(50, maxWidth * (chart.height / chart.width))
    pdf.setDrawColor(...C.border)
    pdf.roundedRect(page.m, y.value, maxWidth, h + 6, 2, 2)
    pdf.addImage(chart.dataUrl, 'PNG', page.m + 3, y.value + 3, maxWidth - 6, h)
    y.value += h + 12
  })
}

function portraitCharts(pdf, y, chartImages, report) {
  pdf.addPage('a4', 'portrait')
  const page = pageOf(pdf)
  y.value = 16
  write(pdf, page, y, 'Portrait Chart Evidence', 13, 'bold', C.teal)
  if (!chartImages.length) {
    write(pdf, page, y, 'No chart image was captured from the active view.', 9, 'italic', C.muted)
    return
  }
  const maxWidth = page.w - page.m * 2
  chartImages.slice(3, 5).forEach((chart) => {
    ensure(pdf, page, y, 82)
    write(pdf, page, y, chart.title, 10, 'bold', C.ink)
    write(pdf, page, y, chartNote(chart.title, report), 8, 'normal', C.muted)
    const h = Math.min(64, maxWidth * (chart.height / chart.width))
    pdf.setDrawColor(...C.border)
    pdf.roundedRect(page.m, y.value, maxWidth, h + 6, 2, 2)
    pdf.addImage(chart.dataUrl, 'PNG', page.m + 3, y.value + 3, maxWidth - 6, h)
    y.value += h + 12
  })
}

function appendixSection(pdf, page, y, title, rows, startIndex = 0) {
  write(pdf, page, y, title, 11, 'bold', C.teal)
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
  rows.forEach((row, index) => {
    if (y.value > page.h - 28) {
      pdf.addPage('a4', 'portrait')
      Object.assign(page, pageOf(pdf))
      y.value = 16
      drawHeader()
    }
    const status = row.status === 'CRIT' ? 'RED' : row.status === 'WARN' ? 'YELLOW' : 'GREEN'
    const values = [String(startIndex + index + 1), status, row.host, row.pid, row.type, row.rss, compact([row.age, row.job].filter(Boolean).join(' / '), 80)]
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
  y.value += 8
}

function severityAppendix(pdf, y, report) {
  pdf.addPage('a4', 'portrait')
  const page = pageOf(pdf)
  y.value = 16
  write(pdf, page, y, 'Severity-Split Evidence Appendix', 13, 'bold', C.teal)
  write(pdf, page, y, 'Rows are grouped by severity so incident reviewers can start with RED, then YELLOW, then GREEN.', 8.5, 'normal', C.muted)
  const rows = report.rows.length ? report.rows : [report.top]
  const red = rows.filter((row) => row.status === 'CRIT')
  const yellow = rows.filter((row) => row.status === 'WARN')
  const green = rows.filter((row) => row.status === 'OK')
  appendixSection(pdf, page, y, `RED / Critical Rows (${red.length})`, red.slice(0, 16), 0)
  appendixSection(pdf, page, y, `YELLOW / Warning Rows (${yellow.length})`, yellow.slice(0, 16), red.length)
  appendixSection(pdf, page, y, `GREEN / OK Rows (${green.length})`, green.slice(0, 16), red.length + yellow.length)
  write(pdf, page, y, 'Recommended Validation Steps', 12, 'bold', C.teal)
  ;[
    `SM50/SM66: check PID ${report.top.pid} on ${report.top.host}.`,
    `SM37: check job ${report.top.job} owner, variant, runtime, and schedule.`,
    `OS: validate memory/RSS on ${report.top.host}; compare with vmstat/top/sar around incident time.`,
    'ST22/SM21: check dump or system log around the same time window.',
    'Attach raw WP-SCOUT source evidence to the incident ticket.',
  ].forEach((step, index) => write(pdf, page, y, `${index + 1}. ${step}`, 9, 'normal', C.ink, 3))
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
    pdf.text(`SAP RCA Workspace • ${report.generatedAt}`, page.m, page.h - 7)
    pdf.text(`Page ${i} / ${pages}`, page.w - page.m - 18, page.h - 7)
  }
}

export async function exportWpScoutVisualPdf() {
  const jsPdfModule = await import('jspdf')
  const JsPDF = jsPdfModule.jsPDF || jsPdfModule.default
  const root = document.querySelector('.fullBleed') || document.querySelector('main') || document.body
  const report = buildReport(root)
  const chartImages = await collectCharts(root)
  const pdf = new JsPDF('p', 'mm', 'a4')
  const page = pageOf(pdf)
  const y = { value: 16 }

  cover(pdf, page, y, report, chartImages.length)
  landscapeAnalytics(pdf, y, chartImages, report)
  portraitCharts(pdf, y, chartImages, report)
  severityAppendix(pdf, y, report)
  footer(pdf, report)

  pdf.save(`sap-wpscout-enterprise-v3-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.pdf`)
}
