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
const isStatus = (value = '') => /^(CRIT|WARN|OK|INFO|RED|YELLOW|GREEN)$/i.test(clean(value))

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
  const critical = rows.filter((row) => row.status === 'CRIT').length || numberOf(metric(root, ['Critical']))
  const warning = rows.filter((row) => row.status === 'WARN').length || numberOf(metric(root, ['Warning']))
  const maxRss = metric(root, ['Max RSS']) || top.rss
  const swap = swapStatus(root)
  const rss = numberOf(maxRss)
  const severity = top.status === 'CRIT' || critical > 0 || rss >= 128 ? 'CRITICAL' : top.status === 'WARN' || warning > 0 || rss >= 32 ? 'WARNING' : 'STABLE'
  const color = severity === 'CRITICAL' ? C.red : severity === 'WARNING' ? C.yellow : C.green
  const risk = Math.max(0, Math.min(100, (severity === 'CRITICAL' ? 72 : severity === 'WARNING' ? 48 : 22) + Math.min(18, Math.round(rss / 16)) + Math.min(8, critical * 3 + warning) + (swap.startsWith('ACTIVE') ? 8 : 0)))
  return {
    generatedAt: new Date().toLocaleString('id-ID'),
    rows,
    top,
    severity,
    color,
    risk,
    confidence: severity === 'CRITICAL' ? 'High' : severity === 'WARNING' ? 'Medium' : 'Normal',
    swap,
    metrics: {
      critical,
      warning,
      maxRss,
      hosts: metric(root, ['Hosts']) || '-',
      rawRows: metric(root, ['Raw Rows', 'Rows']) || rows.length,
    },
    reason: severity === 'CRITICAL' ? `RSS is very high (${maxRss}). Check the top process first.` : severity === 'WARNING' ? 'Memory pressure is above normal range. Validate the top process and correlate with runtime.' : 'No dominant critical WP-SCOUT signal in the current view.',
  }
}

const statusLabel = (severity) => (severity === 'CRITICAL' ? 'RED / CHECK NOW' : severity === 'WARNING' ? 'YELLOW / WATCH' : 'GREEN / OK')
const sevColor = (value) => /RED|CRIT/i.test(value) ? C.red : /YELLOW|WARN/i.test(value) ? C.yellow : C.green

function sizeOf(pdf) {
  return { w: pdf.internal.pageSize.getWidth(), h: pdf.internal.pageSize.getHeight(), m: 14 }
}

function ensure(pdf, page, y, need = 14) {
  if (y.value + need > page.h - 20) {
    pdf.addPage('a4', 'portrait')
    const next = sizeOf(pdf)
    page.w = next.w
    page.h = next.h
    page.m = next.m
    y.value = 16
  }
}

function text(pdf, page, y, value, size = 9, style = 'normal', color = C.ink, indent = 0) {
  pdf.setFont('helvetica', style)
  pdf.setFontSize(size)
  pdf.setTextColor(...color)
  for (const part of pdf.splitTextToSize(String(value || '-'), page.w - page.m * 2 - indent)) {
    ensure(pdf, page, y, size >= 12 ? 9 : 6)
    pdf.text(part, page.m + indent, y.value)
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

function riskBar(pdf, x, y, w, report) {
  pdf.setTextColor(...C.teal)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.text('Risk Score', x, y)
  pdf.setFillColor(232, 240, 239)
  pdf.roundedRect(x, y + 4, w, 7, 2, 2, 'F')
  pdf.setFillColor(...report.color)
  pdf.roundedRect(x, y + 4, Math.max(5, w * (report.risk / 100)), 7, 2, 2, 'F')
  pdf.setTextColor(...C.ink)
  pdf.setFontSize(9)
  pdf.text(`${Math.round(report.risk)} / 100`, x + w - 25, y + 17)
  pdf.setTextColor(...C.muted)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7)
  pdf.text('Derived from severity, RSS, critical/warning rows, and swap signal.', x, y + 17)
}

function nativePressure(pdf, page, y, report) {
  ensure(pdf, page, y, 42)
  const x = page.m
  const width = page.w - page.m * 2
  const boxY = y.value
  const bars = [
    ['RSS', Math.min(100, Math.round((numberOf(report.metrics.maxRss) / 160) * 100)), report.metrics.maxRss],
    ['CRIT', Math.min(100, report.metrics.critical * 20), String(report.metrics.critical)],
    ['WARN', Math.min(100, report.metrics.warning * 12), String(report.metrics.warning)],
    ['SWAP', report.swap.startsWith('ACTIVE') ? 100 : 0, report.swap],
  ]
  pdf.setFillColor(...C.light)
  pdf.setDrawColor(...C.border)
  pdf.roundedRect(x, boxY, width, 36, 3, 3, 'FD')
  pdf.setTextColor(...C.teal)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  pdf.text('Native Pressure Snapshot', x + 5, boxY + 8)
  pdf.setTextColor(...C.muted)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7)
  pdf.text('Build-safe visual summary rendered directly in jsPDF.', x + 5, boxY + 14)
  bars.forEach(([label, value, note], index) => {
    const bx = x + 5 + index * ((width - 10) / 4)
    const bw = (width - 24) / 4
    pdf.setTextColor(...C.ink)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(7)
    pdf.text(label, bx, boxY + 23)
    pdf.setFillColor(230, 239, 237)
    pdf.roundedRect(bx + 20, boxY + 19, bw - 26, 5, 1.5, 1.5, 'F')
    pdf.setFillColor(...report.color)
    pdf.roundedRect(bx + 20, boxY + 19, Math.max(3, (bw - 26) * (value / 100)), 5, 1.5, 1.5, 'F')
    pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(...C.muted)
    pdf.text(compact(note, 18), bx + 20, boxY + 30)
  })
  y.value += 42
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

async function charts(root) {
  const svgs = Array.from(root.querySelectorAll('.recharts-wrapper svg,.chartPanel svg,.rcaReadableChartPanel svg')).slice(0, 8)
  const out = []
  const seen = new Set()
  for (const svg of svgs) {
    const panel = svg.closest('.cmpCleanPanel,.overviewCard,.resultPanel,.evidencePanel,.rcaReadableChartPanel')
    const title = compact(panel?.querySelector('h2,h3,.chartTitleBlock h2,.sectionKicker')?.textContent || 'Evidence Chart', 80)
    if (seen.has(title.toLowerCase())) continue
    const image = await svgToPng(svg).catch(() => null)
    if (!image) continue
    seen.add(title.toLowerCase())
    out.push({ title, ...image })
    if (out.length >= 5) break
  }
  return out
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
  riskBar(pdf, page.m, y.value, page.w - page.m * 2, report)
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
  text(pdf, page, y, 'Quick Read', 12, 'bold', C.teal)
  ;[
    ['Overall', statusLabel(report.severity), report.reason, report.color],
    ['Memory', `${report.metrics.maxRss} RSS`, 'Check the top PID first.', report.color],
    ['Swap', report.swap, report.swap.startsWith('ACTIVE') ? 'Swap activity detected.' : 'No swap activity detected.', report.swap.startsWith('ACTIVE') ? C.red : C.green],
    ['Host', report.top.host, 'Start validation from this host.', report.color],
  ].forEach(([label, value, note, color], index) => {
    const yy = y.value + 5 + index * 8
    pdf.setFillColor(...color)
    pdf.circle(page.m + 3, yy - 1.5, 2.2, 'F')
    pdf.setTextColor(...C.ink)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8)
    pdf.text(label, page.m + 8, yy)
    pdf.setFont('helvetica', 'normal')
    pdf.text(String(value || '-'), page.m + 48, yy)
    pdf.setTextColor(...C.muted)
    pdf.setFontSize(7)
    pdf.text(pdf.splitTextToSize(String(note || '-'), 92).slice(0, 1), page.m + 93, yy)
  })
  y.value += 40
  nativePressure(pdf, page, y, report)
}

function landscapeAnalytics(pdf, y, chartImages, report) {
  pdf.addPage('a4', 'landscape')
  const page = sizeOf(pdf)
  y.value = 16
  text(pdf, page, y, 'Landscape Visual Analytics', 14, 'bold', C.teal)
  nativePressure(pdf, page, y, report)
  const maxWidth = page.w - page.m * 2
  if (!chartImages.length) {
    text(pdf, page, y, 'No SVG/Recharts visual block was available. The native pressure snapshot above remains the build-safe visual fallback.', 9, 'italic', C.muted)
    return
  }
  chartImages.slice(0, 3).forEach((chart) => {
    ensure(pdf, page, y, 76)
    text(pdf, page, y, chart.title, 10, 'bold', C.ink)
    text(pdf, page, y, chartNote(chart.title, report), 8, 'normal', C.muted)
    const imageHeight = Math.min(56, maxWidth * (chart.height / chart.width))
    pdf.setDrawColor(...C.border)
    pdf.roundedRect(page.m, y.value, maxWidth, imageHeight + 6, 2, 2)
    pdf.addImage(chart.dataUrl, 'PNG', page.m + 3, y.value + 3, maxWidth - 6, imageHeight)
    y.value += imageHeight + 12
  })
}

function portraitCharts(pdf, y, chartImages, report) {
  pdf.addPage('a4', 'portrait')
  const page = sizeOf(pdf)
  y.value = 16
  text(pdf, page, y, 'Portrait Chart Evidence', 13, 'bold', C.teal)
  if (!chartImages.length) {
    text(pdf, page, y, 'No chart image was captured from the active view.', 9, 'italic', C.muted)
    return
  }
  const maxWidth = page.w - page.m * 2
  chartImages.slice(3, 5).forEach((chart) => {
    ensure(pdf, page, y, 82)
    text(pdf, page, y, chart.title, 10, 'bold', C.ink)
    text(pdf, page, y, chartNote(chart.title, report), 8, 'normal', C.muted)
    const imageHeight = Math.min(64, maxWidth * (chart.height / chart.width))
    pdf.setDrawColor(...C.border)
    pdf.roundedRect(page.m, y.value, maxWidth, imageHeight + 6, 2, 2)
    pdf.addImage(chart.dataUrl, 'PNG', page.m + 3, y.value + 3, maxWidth - 6, imageHeight)
    y.value += imageHeight + 12
  })
}

function evidenceAppendix(pdf, y, report) {
  pdf.addPage('a4', 'portrait')
  const page = sizeOf(pdf)
  y.value = 16
  text(pdf, page, y, 'Evidence Appendix', 13, 'bold', C.teal)
  text(pdf, page, y, 'This appendix keeps more WP-SCOUT rows for ticket attachment while the first page stays management-readable.', 8.5, 'normal', C.muted)
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
  const rows = report.rows.length ? report.rows : [report.top]
  rows.slice(0, 32).forEach((row, index) => {
    if (y.value > page.h - 28) {
      pdf.addPage('a4', 'portrait')
      y.value = 16
      drawHeader()
    }
    const status = row.status === 'CRIT' ? 'RED' : row.status === 'WARN' ? 'YELLOW' : 'GREEN'
    const values = [String(index + 1), status, row.host, row.pid, row.type, row.rss, compact([row.age, row.job].filter(Boolean).join(' / '), 80)]
    pdf.setFillColor(index % 2 ? 250 : 245, 250, 249)
    pdf.rect(page.m, y.value, page.w - page.m * 2, 9, 'F')
    let x = page.m
    values.forEach((value, col) => {
      pdf.setTextColor(...(col === 1 ? sevColor(value) : C.ink))
      pdf.setFont('helvetica', col === 1 ? 'bold' : 'normal')
      pdf.setFontSize(7.1)
      pdf.text(pdf.splitTextToSize(compact(value, 58), widths[col] - 2).slice(0, 1), x + 1, y.value + 6)
      x += widths[col]
    })
    y.value += 9
  })
  y.value += 8
  text(pdf, page, y, 'Recommended Validation Steps', 12, 'bold', C.teal)
  ;[
    `SM50/SM66: check PID ${report.top.pid} on ${report.top.host}.`,
    `SM37: check job ${report.top.job} owner, variant, runtime, and schedule.`,
    `OS: validate memory/RSS on ${report.top.host}; compare with vmstat/top/sar around incident time.`,
    'ST22/SM21: check dump or system log around the same time window.',
    'Attach raw WP-SCOUT source evidence to the incident ticket.',
  ].forEach((step, index) => text(pdf, page, y, `${index + 1}. ${step}`, 9, 'normal', C.ink, 3))
}

function footer(pdf, report) {
  const pages = pdf.getNumberOfPages()
  for (let i = 1; i <= pages; i += 1) {
    pdf.setPage(i)
    const page = sizeOf(pdf)
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
  const chartImages = await charts(root)
  const pdf = new JsPDF('p', 'mm', 'a4')
  const page = sizeOf(pdf)
  const y = { value: 16 }

  cover(pdf, page, y, report, chartImages.length)
  landscapeAnalytics(pdf, y, chartImages, report)
  portraitCharts(pdf, y, chartImages, report)
  evidenceAppendix(pdf, y, report)
  footer(pdf, report)

  pdf.save(`sap-wpscout-enterprise-v2-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.pdf`)
}
