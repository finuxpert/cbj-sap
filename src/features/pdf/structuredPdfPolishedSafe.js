import { exportStructuredPdf as exportPolishedStructuredPdf } from './structuredPdfPolished.js'

const STATUS = {
  red: [214, 70, 88],
  yellow: [214, 155, 40],
  green: [30, 160, 130],
  ink: [25, 35, 35],
  muted: [82, 96, 96],
  teal: [0, 90, 84],
}

function clean(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function compact(value = '', limit = 110) {
  const text = clean(value)
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}

function num(value = '') {
  const match = String(value || '').replace(',', '.').match(/-?\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : 0
}

function isStatus(value = '') {
  return /^(CRIT|WARN|OK|INFO|RED|YELLOW|GREEN)$/i.test(clean(value))
}

function getCells(tr) {
  return Array.from(tr.querySelectorAll('td,th')).map((td) => clean(td.textContent)).filter(Boolean)
}

function getWpRows(root) {
  return Array.from(root.querySelectorAll('tbody tr, .cmpCleanTable tbody tr'))
    .map((tr) => {
      const cells = getCells(tr)
      return { cells, text: cells.join(' | ') }
    })
    .filter((row) => /\b(CRIT|WARN|OK)\b/i.test(row.text) && /\d+(?:\.\d+)?\s*GB/i.test(row.text))
}

function findMetric(root, labels = []) {
  const body = clean(root?.textContent || '')
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = body.match(new RegExp(`${escaped}[^0-9]{0,24}(\\d+(?:\\.\\d+)?)(?:\\s*(GB|%))?`, 'i'))
    if (match) return `${match[1]}${match[2] ? ` ${match[2]}` : ''}`
  }
  return ''
}

function parseWpTop(root) {
  const rows = getWpRows(root)
  const row = rows.find((item) => /\bCRIT\b/i.test(item.text)) || rows[0] || { cells: [], text: '' }
  const text = row.text
  const cells = row.cells
  return {
    severity: /\bCRIT\b/i.test(text) ? 'CRIT' : /\bWARN\b/i.test(text) ? 'WARN' : 'OK',
    host: cells.find((cell) => !isStatus(cell) && /[A-Z0-9]+PAPPDC/i.test(cell)) || text.match(/[A-Z0-9]+PAPPDC/i)?.[0] || '-',
    pid: cells.find((cell) => /^\d{3,8}$/.test(cell)) || text.match(/\b\d{3,8}\b/)?.[0] || '-',
    type: cells.find((cell) => /^(BTC|DIA|UPD|SPO|ENQ|RFC|BGD|\?)$/i.test(cell)) || '-',
    rss: cells.find((cell) => /\d+(?:\.\d+)?\s*GB/i.test(cell)) || text.match(/\d+(?:\.\d+)?\s*GB/i)?.[0] || '-',
    age: cells.find((cell) => /\d+d|\d+h|\d+m/i.test(cell)) || '-',
    job: cells.find((cell) => /^Z[A-Z0-9_]{4,}$/i.test(cell)) || cells.find((cell) => !isStatus(cell) && /[A-Z0-9_]{8,}/i.test(cell)) || '-',
  }
}

function swapState(root) {
  const body = clean(root?.textContent || '')
  const badge = body.match(/\bSwap\s+([0-9]+)\b/i)
  if (badge) return Number(badge[1]) > 0 ? 'ACTIVE' : 'CLEAR'
  const strict = body.match(/\bswap\s*(?:si|so)?\s*[:=]\s*([0-9]+)\b/i)
  return strict && Number(strict[1]) > 0 ? 'ACTIVE' : 'CLEAR'
}

function buildWpReport(root) {
  const rows = getWpRows(root)
  const top = parseWpTop(root)
  const crit = rows.filter((row) => /\bCRIT\b/i.test(row.text)).length || num(findMetric(root, ['Critical']))
  const warn = rows.filter((row) => /\bWARN\b/i.test(row.text)).length || num(findMetric(root, ['Warning']))
  const maxRss = findMetric(root, ['Max RSS']) || top.rss
  const rssValue = num(maxRss)
  const severity = top.severity === 'CRIT' || crit > 0 || rssValue >= 128 ? 'CRITICAL' : top.severity === 'WARN' || warn > 0 || rssValue >= 32 ? 'WARNING' : 'STABLE'
  const hosts = findMetric(root, ['Hosts']) || String((clean(root?.textContent || '').match(/[A-Z0-9]+PAPPDC/g) || []).filter((v, i, arr) => arr.indexOf(v) === i).length || '-')
  const rawRows = findMetric(root, ['Raw Rows', 'Rows']) || rows.length
  return {
    generatedAt: new Date().toLocaleString('id-ID'),
    severity,
    color: severity === 'CRITICAL' ? STATUS.red : severity === 'WARNING' ? STATUS.yellow : STATUS.green,
    confidence: severity === 'CRITICAL' ? 'High' : severity === 'WARNING' ? 'Medium' : 'Normal',
    top,
    rows,
    metrics: { crit, warn, maxRss, hosts, rawRows },
    swap: swapState(root),
    reason: severity === 'CRITICAL'
      ? `RSS is very high (${maxRss}). Check the top process first.`
      : severity === 'WARNING'
        ? 'Memory pressure is above normal range. Validate the top process.'
        : 'No dominant critical WP-SCOUT signal in the current view.',
  }
}

function statusText(severity = '') {
  if (severity === 'CRITICAL') return 'RED / CHECK NOW'
  if (severity === 'WARNING') return 'YELLOW / WATCH'
  return 'GREEN / OK'
}

function line(pdf, page, y, text, size = 9, style = 'normal', color = STATUS.ink, indent = 0) {
  pdf.setFont('helvetica', style)
  pdf.setFontSize(size)
  pdf.setTextColor(...color)
  const parts = pdf.splitTextToSize(String(text || '-'), page.w - page.m * 2 - indent)
  for (const part of parts) {
    if (y.v > page.h - 20) {
      pdf.addPage()
      y.v = 16
    }
    pdf.text(part, page.m + indent, y.v)
    y.v += size >= 12 ? 6.5 : 5
  }
}

function card(pdf, x, y, w, h, label, value, color) {
  pdf.setFillColor(246, 251, 250)
  pdf.setDrawColor(224, 234, 232)
  pdf.roundedRect(x, y, w, h, 3, 3, 'FD')
  pdf.setTextColor(...color)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(7)
  pdf.text(String(label).toUpperCase(), x + 4, y + 6)
  pdf.setTextColor(...STATUS.ink)
  pdf.setFontSize(10)
  pdf.text(pdf.splitTextToSize(String(value || '-'), w - 8).slice(0, 2), x + 4, y + 14)
}

function traffic(pdf, x, y, label, value, color, note = '') {
  pdf.setFillColor(...color)
  pdf.circle(x + 3, y - 1.5, 2.2, 'F')
  pdf.setTextColor(...STATUS.ink)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.text(label, x + 8, y)
  pdf.setFont('helvetica', 'normal')
  pdf.text(String(value || '-'), x + 48, y)
  if (note) {
    pdf.setTextColor(...STATUS.muted)
    pdf.setFontSize(7)
    pdf.text(pdf.splitTextToSize(note, 92).slice(0, 1), x + 93, y)
  }
}

function footer(pdf, page, report) {
  const pages = pdf.getNumberOfPages()
  for (let i = 1; i <= pages; i += 1) {
    pdf.setPage(i)
    pdf.setDrawColor(218, 228, 226)
    pdf.line(page.m, page.h - 13, page.w - page.m, page.h - 13)
    pdf.setTextColor(110, 120, 120)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7)
    pdf.text(`SAP RCA Workspace • ${report.generatedAt}`, page.m, page.h - 7)
    pdf.text(`Page ${i} / ${pages}`, page.w - page.m - 18, page.h - 7)
  }
}

function chartCaption(title = '', report) {
  const t = title.toLowerCase()
  if (t.includes('cpu') || t.includes('mem') || t.includes('swap')) return `CPU is not the main issue if the line is flat. Main risk here is RSS memory. Swap: ${report.swap}.`
  if (t.includes('rss')) return `The longest bar is the first process to check. Top RSS is ${report.metrics.maxRss}.`
  if (t.includes('host')) return `The top host has the highest total pressure. Start from ${report.top.host}.`
  return 'Focus on the top item and compare it with the summary status on page 1.'
}

function usefulSvg(svg) {
  return Array.from(svg.querySelectorAll('path,line,polyline,polygon,circle,text,rect')).filter((node) => !node.closest('defs,clipPath,mask')).length >= 3
}

async function svgPng(svg) {
  if (!usefulSvg(svg)) return null
  const clone = svg.cloneNode(true)
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const rect = svg.getBoundingClientRect()
  const w = Math.max(420, Math.round(rect.width || 720))
  const h = Math.max(180, Math.round(rect.height || 260))
  clone.setAttribute('width', String(w))
  clone.setAttribute('height', String(h))
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
    canvas.width = w * 2
    canvas.height = h * 2
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#071315'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return { dataUrl: canvas.toDataURL('image/png'), width: w, height: h }
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function charts(root) {
  const svgs = Array.from(root.querySelectorAll('.recharts-wrapper svg, .chartPanel svg, .rcaReadableChartPanel svg')).slice(0, 6)
  const out = []
  const seen = new Set()
  for (const svg of svgs) {
    const panel = svg.closest('.cmpCleanPanel,.overviewCard,.resultPanel,.evidencePanel,.rcaReadableChartPanel')
    const title = compact(panel?.querySelector('h2,h3,.chartTitleBlock h2')?.textContent || 'Evidence Chart', 80)
    if (seen.has(title.toLowerCase())) continue
    const image = await svgPng(svg).catch(() => null)
    if (!image) continue
    seen.add(title.toLowerCase())
    out.push({ title, ...image })
  }
  return out
}

async function exportWpScoutVisualPdf() {
  const jsPdfModule = await import('jspdf')
  const JsPDF = jsPdfModule.jsPDF || jsPdfModule.default
  const root = document.querySelector('.fullBleed') || document.querySelector('main') || document.body
  const report = buildWpReport(root)
  const chartImages = await charts(root)
  const pdf = new JsPDF('p', 'mm', 'a4')
  const page = { w: pdf.internal.pageSize.getWidth(), h: pdf.internal.pageSize.getHeight(), m: 14 }
  const y = { v: 16 }

  pdf.setFillColor(5, 22, 22)
  pdf.rect(0, 0, page.w, 50, 'F')
  pdf.setFillColor(...report.color)
  pdf.rect(0, 0, 5, 50, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(17)
  pdf.text('WP-SCOUT RCA Summary', page.m, 16)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.text(`Generated: ${report.generatedAt}`, page.m, 25)
  pdf.text('Legend: Red = check now, Yellow = watch, Green = OK. Rising trend = getting worse.', page.m, 34)
  pdf.text(`Why: ${compact(report.reason, 120)}`, page.m, 43)

  y.v = 60
  pdf.setTextColor(...report.color)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(20)
  pdf.text(`${report.severity} — ${statusText(report.severity)}`, page.m, y.v)
  pdf.setTextColor(...STATUS.ink)
  pdf.setFontSize(9)
  pdf.text(`Confidence: ${report.confidence} • Owner: Basis / Infrastructure`, page.m, y.v + 7)
  y.v += 18

  const w = (page.w - page.m * 2 - 8) / 3
  card(pdf, page.m, y.v, w, 22, 'Worst Host', report.top.host, report.color)
  card(pdf, page.m + w + 4, y.v, w, 22, 'Worst PID / Type', `${report.top.pid} / ${report.top.type}`, report.color)
  card(pdf, page.m + (w + 4) * 2, y.v, w, 22, 'Top Job', report.top.job, report.color)
  y.v += 27
  card(pdf, page.m, y.v, w, 22, 'Main Pressure', `${report.metrics.maxRss} RSS`, report.color)
  card(pdf, page.m + w + 4, y.v, w, 22, 'CRIT / WARN', `${report.metrics.crit} CRIT / ${report.metrics.warn} WARN`, report.color)
  card(pdf, page.m + (w + 4) * 2, y.v, w, 22, 'Evidence Rows', report.metrics.rawRows, report.color)
  y.v += 33

  line(pdf, page, y, 'Quick Read', 12, 'bold', STATUS.teal)
  traffic(pdf, page.m, y.v + 5, 'Overall', statusText(report.severity), report.color, report.reason)
  traffic(pdf, page.m, y.v + 13, 'Memory', `${report.metrics.maxRss} RSS`, report.color, 'Check the top PID first.')
  traffic(pdf, page.m, y.v + 21, 'Swap', report.swap, report.swap === 'ACTIVE' ? STATUS.red : STATUS.green, report.swap === 'ACTIVE' ? 'Swap activity detected.' : 'No swap activity detected.')
  traffic(pdf, page.m, y.v + 29, 'Host', report.top.host, report.color, 'Start validation from this host.')
  y.v += 40

  line(pdf, page, y, 'Next Checks', 12, 'bold', STATUS.teal)
  ;[
    `SM50/SM66: check PID ${report.top.pid} on ${report.top.host}.`,
    `SM37: check job ${report.top.job} owner, variant, runtime, and schedule.`,
    `OS: validate memory/RSS on ${report.top.host}.`,
    'ST22/SM21: check dump or system log around the same time.',
  ].forEach((item, index) => line(pdf, page, y, `${index + 1}. ${item}`, 9, 'normal', STATUS.ink, 3))

  pdf.addPage()
  y.v = 16
  line(pdf, page, y, 'Charts', 13, 'bold', STATUS.teal)
  const maxW = page.w - page.m * 2
  for (const chart of chartImages.slice(0, 4)) {
    if (y.v > page.h - 86) {
      pdf.addPage()
      y.v = 16
    }
    line(pdf, page, y, chart.title, 10, 'bold', STATUS.ink)
    line(pdf, page, y, chartCaption(chart.title, report), 8, 'normal', STATUS.muted)
    const ratio = chart.height / chart.width
    const imgH = Math.min(66, maxW * ratio)
    pdf.setDrawColor(225, 234, 232)
    pdf.roundedRect(page.m, y.v, maxW, imgH + 6, 2, 2)
    pdf.addImage(chart.dataUrl, 'PNG', page.m + 3, y.v + 3, maxW - 6, imgH)
    y.v += imgH + 12
  }

  pdf.addPage()
  y.v = 16
  line(pdf, page, y, 'Top Evidence', 13, 'bold', STATUS.teal)
  const headers = ['#', 'STATUS', 'HOST', 'PID', 'DETAIL']
  const widths = [8, 22, 38, 24, page.w - page.m * 2 - 92]
  let x = page.m
  pdf.setFillColor(5, 22, 22)
  pdf.rect(page.m, y.v, page.w - page.m * 2, 8, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(7)
  headers.forEach((head, i) => { pdf.text(head, x + 1, y.v + 5.5); x += widths[i] })
  y.v += 8
  report.rows.slice(0, 10).forEach((row, index) => {
    const cells = row.cells
    const joined = row.text
    const sev = /\bCRIT\b/i.test(joined) ? 'RED' : /\bWARN\b/i.test(joined) ? 'YELLOW' : 'GREEN'
    const host = cells.find((cell) => !isStatus(cell) && /[A-Z0-9]+PAPPDC/i.test(cell)) || '-'
    const pid = cells.find((cell) => /^\d{3,8}$/.test(cell)) || '-'
    const rss = cells.find((cell) => /\d+(?:\.\d+)?\s*GB/i.test(cell)) || ''
    const age = cells.find((cell) => /\d+d|\d+h|\d+m/i.test(cell)) || ''
    const job = cells.find((cell) => /^Z[A-Z0-9_]{4,}$/i.test(cell)) || cells.slice(-1)[0] || ''
    pdf.setFillColor(index % 2 ? 250 : 245, 250, 249)
    pdf.rect(page.m, y.v, page.w - page.m * 2, 9, 'F')
    x = page.m
    ;[String(index + 1), sev, host, pid, compact([rss, age, job].filter(Boolean).join(' / '), 70)].forEach((value, i) => {
      const c = i === 1 ? statusColor(sev) : STATUS.ink
      pdf.setTextColor(...c)
      pdf.setFont('helvetica', i === 1 ? 'bold' : 'normal')
      pdf.setFontSize(7.2)
      pdf.text(pdf.splitTextToSize(compact(value, 58), widths[i] - 2).slice(0, 1), x + 1, y.v + 6)
      x += widths[i]
    })
    y.v += 9
  })

  y.v += 8
  line(pdf, page, y, 'Notes', 12, 'bold', STATUS.teal)
  ;[
    'This PDF is a short RCA summary. Keep the source evidence attached to the ticket.',
    'Red means check now. Yellow means watch and correlate. Green means no dominant issue in the current view.',
    'If the same item stays red after action, collect another snapshot from the same time window.',
  ].forEach((item, index) => line(pdf, page, y, `${index + 1}. ${item}`, 9, 'normal', STATUS.ink, 3))

  footer(pdf, page, report)
  pdf.save(`sap-wpscout-visual-rca-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.pdf`)
}

export async function exportStructuredPdf(slug) {
  if (slug === 'comparer') {
    try {
      return await exportWpScoutVisualPdf()
    } catch (error) {
      console.warn('[PDF Export] WP-SCOUT visual export failed; fallback to polished export:', error)
      return exportPolishedStructuredPdf(slug)
    }
  }
  return exportPolishedStructuredPdf(slug)
}
