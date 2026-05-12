import { exportStructuredPdf as exportPolishedStructuredPdf } from './structuredPdfPolished.js'

function cleanText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function compactText(value = '', limit = 120) {
  const text = cleanText(value)
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}

function numberFrom(value = '') {
  const match = String(value || '').replace(',', '.').match(/-?\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : 0
}

function findMetric(root, labels = []) {
  const text = cleanText(root?.textContent || '')
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = text.match(new RegExp(`${escaped}[^0-9A-Z]{0,24}([A-Z]*\s*)?(\\d+(?:\\.\\d+)?)(?:\\s*(GB|%))?`, 'i'))
    if (match) return `${match[1] || ''}${match[2]}${match[3] ? ` ${match[3]}` : ''}`.trim()
  }
  return ''
}

function parseTableRows(root, limit = 12) {
  const rows = Array.from(root.querySelectorAll('tbody tr, .cmpCleanTable tbody tr'))
  return rows.slice(0, limit * 2).map((tr) => {
    const cells = Array.from(tr.querySelectorAll('td,th')).map((td) => cleanText(td.textContent)).filter(Boolean)
    const joined = cells.join(' | ')
    return { cells, text: joined }
  }).filter((row) => /\b(CRIT|WARN|OK)\b/i.test(row.text) || /\d+\s*GB/i.test(row.text)).slice(0, limit)
}

function parseTopRow(root) {
  const rows = parseTableRows(root, 20)
  const row = rows.find((item) => /\bCRIT\b/i.test(item.text)) || rows[0] || { cells: [], text: '' }
  const text = row.text
  const host = row.cells.find((cell) => /[A-Z0-9]+PAPPDC/i.test(cell)) || text.match(/[A-Z0-9]+PAPPDC/i)?.[0] || '-'
  const pid = row.cells.find((cell) => /^\d{3,8}$/.test(cell)) || text.match(/\b\d{3,8}\b/)?.[0] || '-'
  const type = row.cells.find((cell) => /^(BTC|DIA|UPD|SPO|ENQ|RFC|BGD|\?)$/i.test(cell)) || '-'
  const rss = row.cells.find((cell) => /\d+(?:\.\d+)?\s*GB/i.test(cell)) || text.match(/\d+(?:\.\d+)?\s*GB/i)?.[0] || '-'
  const age = row.cells.find((cell) => /\d+d|\d+h|\d+m/i.test(cell)) || '-'
  const job = row.cells.find((cell) => /^Z[A-Z0-9_]{4,}$/i.test(cell)) || '-'
  const sev = /\bCRIT\b/i.test(text) ? 'CRIT' : /\bWARN\b/i.test(text) ? 'WARN' : 'INFO'
  return { host, pid, type, rss, age, job, severity: sev, raw: text }
}

function buildReport(root) {
  const top = parseTopRow(root)
  const pageText = cleanText(root?.textContent || '')
  const critical = numberFrom(findMetric(root, ['Critical', 'CRIT']))
  const warning = numberFrom(findMetric(root, ['Warning', 'WARN']))
  const hosts = findMetric(root, ['Hosts']) || String((pageText.match(/[A-Z0-9]+PAPPDC/g) || []).filter((v, i, a) => a.indexOf(v) === i).length || '-')
  const maxRss = findMetric(root, ['Max RSS']) || top.rss
  const rawRows = findMetric(root, ['Raw Rows']) || '-'
  const uniqueRows = findMetric(root, ['Unique']) || '-'
  const severity = top.severity === 'CRIT' || critical > 0 || numberFrom(maxRss) >= 128 ? 'CRITICAL' : top.severity === 'WARN' || warning > 0 ? 'WARNING' : 'STABLE'
  const confidence = severity === 'CRITICAL' ? 'High / 92%' : severity === 'WARNING' ? 'Medium / 78%' : 'Normal / 65%'
  const owner = 'Basis / Infrastructure'
  const bottleneck = numberFrom(maxRss) >= 32 ? 'Memory / RSS pressure' : 'Work process pressure'
  const trend = {
    rss: numberFrom(maxRss) >= 128 ? 'UP SHARP' : numberFrom(maxRss) >= 32 ? 'UP' : 'FLAT',
    badWp: critical > 0 ? 'UP / CRIT' : warning > 0 ? 'UP / WARN' : 'FLAT',
    swap: /swap\s*[1-9]|swap si\s*[1-9]/i.test(pageText) ? 'ACTIVE' : 'CLEAR',
  }

  return {
    generatedAt: new Date().toLocaleString('id-ID'),
    severity,
    confidence,
    owner,
    bottleneck,
    top,
    metrics: { critical, warning, hosts, maxRss, rawRows, uniqueRows },
    trend,
    rows: parseTableRows(root, 12),
  }
}

function hasMeaningfulSvg(svg) {
  return Array.from(svg.querySelectorAll('path,line,polyline,polygon,circle,text,rect')).filter((node) => !node.closest('defs,clipPath,mask')).length >= 3
}

async function svgToPng(svg) {
  if (!hasMeaningfulSvg(svg)) return null
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
    const scale = 2
    canvas.width = width * scale
    canvas.height = height * scale
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
  const svgs = Array.from(root.querySelectorAll('.recharts-wrapper svg, .chartPanel svg, .rcaReadableChartPanel svg')).slice(0, 8)
  const charts = []
  const seen = new Set()
  for (const svg of svgs) {
    const panel = svg.closest('.cmpCleanPanel,.overviewCard,.resultPanel,.evidencePanel,.rcaReadableChartPanel')
    const title = compactText(panel?.querySelector('h2,h3,.chartTitleBlock h2')?.textContent || 'Evidence Chart', 80)
    if (seen.has(title.toLowerCase())) continue
    const image = await svgToPng(svg).catch(() => null)
    if (!image) continue
    seen.add(title.toLowerCase())
    charts.push({ title, ...image })
  }
  return charts
}

function statusColor(status = '') {
  const text = String(status).toUpperCase()
  if (text.includes('CRIT')) return [214, 70, 88]
  if (text.includes('WARN')) return [214, 155, 40]
  return [30, 160, 130]
}

function addFooter(pdf, page, report) {
  const pages = pdf.getNumberOfPages()
  for (let i = 1; i <= pages; i += 1) {
    pdf.setPage(i)
    pdf.setDrawColor(218, 228, 226)
    pdf.line(page.m, page.h - 13, page.w - page.m, page.h - 13)
    pdf.setTextColor(110, 120, 120)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7)
    pdf.text(`SAP Intelligent RCA Workspace • ${report.generatedAt}`, page.m, page.h - 7)
    pdf.text(`Page ${i} / ${pages}`, page.w - page.m - 18, page.h - 7)
  }
}

function textLine(pdf, page, yRef, text, size = 9, style = 'normal', color = [30, 40, 40], indent = 0) {
  pdf.setFont('helvetica', style)
  pdf.setFontSize(size)
  pdf.setTextColor(...color)
  const parts = pdf.splitTextToSize(String(text || '-'), page.w - page.m * 2 - indent)
  parts.forEach((part) => {
    if (yRef.y > page.h - 20) {
      pdf.addPage()
      yRef.y = 16
    }
    pdf.text(part, page.m + indent, yRef.y)
    yRef.y += size >= 12 ? 6.5 : 5
  })
}

function drawCard(pdf, x, y, w, h, label, value, color = [35, 155, 145]) {
  pdf.setFillColor(246, 251, 250)
  pdf.setDrawColor(224, 234, 232)
  pdf.roundedRect(x, y, w, h, 3, 3, 'FD')
  pdf.setTextColor(...color)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(7)
  pdf.text(String(label).toUpperCase(), x + 4, y + 6)
  pdf.setTextColor(20, 30, 32)
  pdf.setFontSize(11)
  pdf.text(pdf.splitTextToSize(String(value || '-'), w - 8).slice(0, 2), x + 4, y + 14)
}

function drawTrafficRow(pdf, x, y, label, value, status) {
  const color = statusColor(status)
  pdf.setFillColor(...color)
  pdf.circle(x + 3, y - 1.5, 2.2, 'F')
  pdf.setTextColor(35, 45, 45)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.text(label, x + 8, y)
  pdf.setFont('helvetica', 'normal')
  pdf.text(String(value || '-'), x + 48, y)
}

async function exportWpScoutVisualPdf() {
  const jsPdfModule = await import('jspdf')
  const JsPDF = jsPdfModule.jsPDF || jsPdfModule.default
  const root = document.querySelector('.fullBleed') || document.querySelector('main') || document.body
  const report = buildReport(root)
  const charts = await collectCharts(root)
  const pdf = new JsPDF('p', 'mm', 'a4')
  const page = { w: pdf.internal.pageSize.getWidth(), h: pdf.internal.pageSize.getHeight(), m: 14 }
  const yRef = { y: 16 }
  const sevColor = statusColor(report.severity)

  pdf.setFillColor(5, 22, 22)
  pdf.rect(0, 0, page.w, 48, 'F')
  pdf.setFillColor(...sevColor)
  pdf.rect(0, 0, 5, 48, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(17)
  pdf.text('WP-SCOUT Visual RCA Report', page.m, 16)
  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'normal')
  pdf.text(`Generated: ${report.generatedAt}`, page.m, 25)
  pdf.text('Visual-first summary: merah = kritikal, kuning = warning, hijau = aman.', page.m, 34)

  yRef.y = 58
  pdf.setTextColor(...sevColor)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(20)
  pdf.text(report.severity, page.m, yRef.y)
  pdf.setTextColor(60, 70, 70)
  pdf.setFontSize(9)
  pdf.text(`Confidence: ${report.confidence} • Owner: ${report.owner}`, page.m, yRef.y + 7)
  yRef.y += 18

  const cardW = (page.w - page.m * 2 - 8) / 3
  drawCard(pdf, page.m, yRef.y, cardW, 22, 'Worst Host', report.top.host, sevColor)
  drawCard(pdf, page.m + cardW + 4, yRef.y, cardW, 22, 'Worst PID / Type', `${report.top.pid} / ${report.top.type}`, sevColor)
  drawCard(pdf, page.m + (cardW + 4) * 2, yRef.y, cardW, 22, 'Worst Job', report.top.job, sevColor)
  yRef.y += 27
  drawCard(pdf, page.m, yRef.y, cardW, 22, 'Max RSS', report.metrics.maxRss, sevColor)
  drawCard(pdf, page.m + cardW + 4, yRef.y, cardW, 22, 'Bad WP', `${report.metrics.critical} CRIT / ${report.metrics.warning} WARN`, sevColor)
  drawCard(pdf, page.m + (cardW + 4) * 2, yRef.y, cardW, 22, 'Hosts', report.metrics.hosts, sevColor)
  yRef.y += 33

  textLine(pdf, page, yRef, 'Quick Read — mana yang merah / naik?', 12, 'bold', [0, 90, 84])
  drawTrafficRow(pdf, page.m, yRef.y + 5, 'RSS', `${report.metrics.maxRss} (${report.trend.rss})`, report.trend.rss.includes('UP') ? 'CRIT' : 'OK')
  drawTrafficRow(pdf, page.m, yRef.y + 13, 'Bad WP', `${report.metrics.critical} critical / ${report.trend.badWp}`, report.metrics.critical > 0 ? 'CRIT' : report.metrics.warning > 0 ? 'WARN' : 'OK')
  drawTrafficRow(pdf, page.m, yRef.y + 21, 'Swap', report.trend.swap, report.trend.swap === 'ACTIVE' ? 'CRIT' : 'OK')
  drawTrafficRow(pdf, page.m, yRef.y + 29, 'Bottleneck', report.bottleneck, report.severity)
  yRef.y += 40

  textLine(pdf, page, yRef, 'Immediate Actions', 12, 'bold', [0, 90, 84])
  const actions = [
    `SM50/SM66: validate PID ${report.top.pid} on ${report.top.host}.`,
    `SM37: check job ${report.top.job} schedule, owner, and runtime pattern.`,
    'OS: validate memory/RSS pressure and long-running work process age.',
    'ST22/SM21: correlate dump/system log around the same timestamp.',
  ]
  actions.forEach((item, index) => textLine(pdf, page, yRef, `${index + 1}. ${item}`, 9, 'normal', [35, 45, 45], 3))

  pdf.addPage()
  yRef.y = 16
  textLine(pdf, page, yRef, 'Visual Evidence — grafik utama', 13, 'bold', [0, 90, 84])
  const chartMaxW = page.w - page.m * 2
  for (const chart of charts.slice(0, 4)) {
    if (yRef.y > page.h - 80) {
      pdf.addPage()
      yRef.y = 16
    }
    textLine(pdf, page, yRef, chart.title, 10, 'bold', [25, 35, 35])
    const ratio = chart.height / chart.width
    const imgW = chartMaxW
    const imgH = Math.min(70, imgW * ratio)
    pdf.setDrawColor(225, 234, 232)
    pdf.roundedRect(page.m, yRef.y, imgW, imgH + 6, 2, 2)
    pdf.addImage(chart.dataUrl, 'PNG', page.m + 3, yRef.y + 3, imgW - 6, imgH)
    yRef.y += imgH + 12
  }

  pdf.addPage()
  yRef.y = 16
  textLine(pdf, page, yRef, 'Top RCA Evidence — offender utama', 13, 'bold', [0, 90, 84])
  const headers = ['#', 'SEV', 'HOST', 'PID', 'RSS / AGE / JOB']
  const widths = [8, 18, 33, 20, page.w - page.m * 2 - 79]
  let x = page.m
  pdf.setFillColor(5, 22, 22)
  pdf.rect(page.m, yRef.y, page.w - page.m * 2, 8, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(7)
  headers.forEach((head, i) => { pdf.text(head, x + 1, yRef.y + 5.5); x += widths[i] })
  yRef.y += 8
  report.rows.slice(0, 10).forEach((row, index) => {
    if (yRef.y > page.h - 24) { pdf.addPage(); yRef.y = 16 }
    const cells = row.cells
    const joined = row.text
    const sev = /\bCRIT\b/i.test(joined) ? 'CRIT' : /\bWARN\b/i.test(joined) ? 'WARN' : 'INFO'
    const host = cells.find((cell) => /[A-Z0-9]+PAPPDC/i.test(cell)) || '-'
    const pid = cells.find((cell) => /^\d{3,8}$/.test(cell)) || '-'
    const rss = cells.find((cell) => /\d+(?:\.\d+)?\s*GB/i.test(cell)) || '-'
    const age = cells.find((cell) => /\d+d|\d+h|\d+m/i.test(cell)) || '-'
    const job = cells.find((cell) => /^Z[A-Z0-9_]{4,}$/i.test(cell)) || '-'
    pdf.setFillColor(index % 2 ? 250 : 245, 250, 249)
    pdf.rect(page.m, yRef.y, page.w - page.m * 2, 9, 'F')
    x = page.m
    pdf.setTextColor(35, 45, 45)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7.2)
    ;[String(index + 1), sev, host, pid, `${rss} / ${age} / ${job}`].forEach((val, i) => {
      pdf.text(pdf.splitTextToSize(compactText(val, 58), widths[i] - 2).slice(0, 1), x + 1, yRef.y + 6)
      x += widths[i]
    })
    yRef.y += 9
  })

  yRef.y += 8
  textLine(pdf, page, yRef, 'Evidence Handling Notes', 12, 'bold', [0, 90, 84])
  ;[
    'Use this PDF as visual RCA summary; keep raw WP-SCOUT evidence attached to incident/change record.',
    'Red status means immediate Basis validation; yellow means monitor and correlate with ST03N/log evidence.',
    'If trend remains red after action, collect another snapshot from the same incident window.',
  ].forEach((item, index) => textLine(pdf, page, yRef, `${index + 1}. ${item}`, 9, 'normal', [35, 45, 45], 3))

  addFooter(pdf, page, report)
  pdf.save(`sap-wpscout-visual-rca-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.pdf`)
}

export async function exportStructuredPdf(slug) {
  if (slug === 'comparer') return exportWpScoutVisualPdf()
  return exportPolishedStructuredPdf(slug)
}
