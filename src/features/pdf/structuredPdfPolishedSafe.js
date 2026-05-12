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
    const match = text.match(new RegExp(`${escaped}[^0-9A-Z]{0,24}([A-Z]*\s*)?(\\d+(?:\\.\\d+)?)(?:\\s*(GB|%|ms|sec|s))?`, 'i'))
    if (match) return `${match[1] || ''}${match[2]}${match[3] ? ` ${match[3]}` : ''}`.trim()
  }
  return ''
}

function parseTableRows(root, limit = 12) {
  const rows = Array.from(root.querySelectorAll('tbody tr, .cmpCleanTable tbody tr'))
  return rows.slice(0, limit * 3).map((tr) => {
    const cells = Array.from(tr.querySelectorAll('td,th')).map((td) => cleanText(td.textContent)).filter(Boolean)
    const joined = cells.join(' | ')
    return { cells, text: joined }
  }).filter((row) => /\b(CRIT|WARN|OK|ERROR|FAIL|HIGH|MEDIUM|LOW)\b/i.test(row.text) || /\d+\s*(GB|%|ms|sec|s)/i.test(row.text)).slice(0, limit)
}

function parseTopRow(root) {
  const rows = parseTableRows(root, 20)
  const row = rows.find((item) => /\b(CRIT|ERROR|FAIL|HIGH)\b/i.test(item.text)) || rows[0] || { cells: [], text: '' }
  const text = row.text
  const host = row.cells.find((cell) => /[A-Z0-9]+PAPPDC|[A-Z0-9._-]+/i.test(cell) && !/^\d/.test(cell)) || text.match(/[A-Z0-9]+PAPPDC/i)?.[0] || '-'
  const pid = row.cells.find((cell) => /^\d{3,8}$/.test(cell)) || text.match(/\b\d{3,8}\b/)?.[0] || '-'
  const type = row.cells.find((cell) => /^(BTC|DIA|UPD|SPO|ENQ|RFC|BGD|DB|CPU|WAIT|GUI|HTTP|\?)$/i.test(cell)) || '-'
  const rss = row.cells.find((cell) => /\d+(?:\.\d+)?\s*GB/i.test(cell)) || text.match(/\d+(?:\.\d+)?\s*GB/i)?.[0] || '-'
  const age = row.cells.find((cell) => /\d+d|\d+h|\d+m|\d+\s*(ms|sec|s)/i.test(cell)) || '-'
  const job = row.cells.find((cell) => /^Z[A-Z0-9_]{4,}$/i.test(cell)) || row.cells.find((cell) => /[A-Z0-9_]{8,}/i.test(cell)) || '-'
  const sev = /\b(CRIT|ERROR|FAIL|HIGH)\b/i.test(text) ? 'CRIT' : /\b(WARN|MEDIUM)\b/i.test(text) ? 'WARN' : 'INFO'
  return { host, pid, type, rss, age, job, severity: sev, raw: text }
}

function toolMeta(slug) {
  if (slug === 'analyzer') {
    return {
      title: 'ST03N Visual RCA Report',
      filename: 'sap-st03n-visual-rca',
      owner: 'Basis / Performance / Application Owner',
      focus: 'Workload response time / component bottleneck',
      primaryLabel: 'Worst Component',
      actions: [
        'ST03N: validate response time, dialog steps, and top component around incident time.',
        'Check whether bottleneck is DB time, wait time, CPU time, or frontend/network time.',
        'Correlate with SM50/SM66 and DB monitoring if response time is rising.',
        'Attach raw ST03N export and compare with normal baseline window.',
      ],
    }
  }
  if (slug === 'logs') {
    return {
      title: 'Log Evidence Visual RCA Report',
      filename: 'sap-log-visual-rca',
      owner: 'Basis / ABAP / Functional Owner',
      focus: 'Error pattern / repeated failure family',
      primaryLabel: 'Primary Error',
      actions: [
        'Group repeated errors by program, job, user, host, and timestamp.',
        'Check ST22/SM21/job log around the first red spike window.',
        'Assign owner based on error family: Basis, ABAP, DB, or Functional.',
        'Attach raw log evidence and keep only top repeated patterns in the summary.',
      ],
    }
  }
  return {
    title: 'WP-SCOUT Visual RCA Report',
    filename: 'sap-wpscout-visual-rca',
    owner: 'Basis / Infrastructure',
    focus: 'Memory / RSS pressure and long-running work process',
    primaryLabel: 'Worst Job',
    actions: [
      'SM50/SM66: validate the top PID/WP on the affected host.',
      'SM37: check job schedule, owner, variant, and runtime pattern.',
      'OS: validate memory/RSS pressure and long-running work process age.',
      'ST22/SM21: correlate dump/system log around the same timestamp.',
    ],
  }
}

function inferSeverity(slug, root, top, metrics) {
  const text = cleanText(root?.textContent || '')
  const maxRss = numberFrom(metrics.maxRss || top.rss)
  const critical = Number(metrics.critical || 0)
  const warning = Number(metrics.warning || 0)
  const pct = Math.max(...(text.match(/\d+(?:\.\d+)?\s*%/g) || ['0']).map(numberFrom), 0)
  const response = Math.max(...(text.match(/\d+(?:\.\d+)?\s*(ms|sec|s)/gi) || ['0']).map(numberFrom), 0)
  if (top.severity === 'CRIT' || critical > 0 || maxRss >= 128 || /\b(ERROR|FAILED|DUMP|TIME_OUT|SYSTEM_FAILURE)\b/i.test(text)) return 'CRITICAL'
  if (top.severity === 'WARN' || warning > 0 || maxRss >= 32 || pct >= 80 || response >= 1000 || /\b(WARN|SLOW|WAIT|BOTTLENECK)\b/i.test(text)) return 'WARNING'
  return 'STABLE'
}

function buildReport(root, slug = 'comparer') {
  const meta = toolMeta(slug)
  const top = parseTopRow(root)
  const pageText = cleanText(root?.textContent || '')
  const critical = numberFrom(findMetric(root, ['Critical', 'CRIT', 'Errors', 'Failed', 'High']))
  const warning = numberFrom(findMetric(root, ['Warning', 'WARN', 'Medium']))
  const hosts = findMetric(root, ['Hosts']) || String((pageText.match(/[A-Z0-9]+PAPPDC/g) || []).filter((v, i, a) => a.indexOf(v) === i).length || '-')
  const maxRss = findMetric(root, ['Max RSS', 'RSS']) || top.rss
  const rawRows = findMetric(root, ['Raw Rows', 'Rows', 'Evidence']) || '-'
  const uniqueRows = findMetric(root, ['Unique', 'Patterns', 'Offenders']) || '-'
  const maxPct = Math.max(...(pageText.match(/\d+(?:\.\d+)?\s*%/g) || ['0']).map(numberFrom), 0)
  const maxTime = Math.max(...(pageText.match(/\d+(?:\.\d+)?\s*(ms|sec|s)/gi) || ['0']).map(numberFrom), 0)
  const metrics = { critical, warning, hosts, maxRss, rawRows, uniqueRows, maxPct, maxTime }
  const severity = inferSeverity(slug, root, top, metrics)
  const confidence = severity === 'CRITICAL' ? 'High / 92%' : severity === 'WARNING' ? 'Medium / 78%' : 'Normal / 65%'
  const bottleneck = slug === 'comparer'
    ? (numberFrom(maxRss) >= 32 ? 'Memory / RSS pressure' : 'Work process pressure')
    : slug === 'analyzer'
      ? (maxTime >= 1000 ? 'Response time spike' : maxPct >= 80 ? 'High utilization trend' : meta.focus)
      : (/TIME_OUT|DUMP|ERROR|FAILED/i.test(pageText) ? 'Repeated error pattern' : meta.focus)
  const reason = severity === 'CRITICAL'
    ? (slug === 'comparer'
      ? `Bahaya karena RSS ${maxRss || top.rss} dan ${critical || 0} critical offender.`
      : slug === 'analyzer'
        ? `Bahaya karena workload/response indicator melewati threshold atau ada bottleneck dominan.`
        : `Bahaya karena error/failure pattern berulang atau ada dump/system failure.`)
    : severity === 'WARNING'
      ? 'Warning karena ada tren naik atau indikator mendekati threshold.'
      : 'Aman karena belum ada indikator kritikal yang dominan.'
  const trend = {
    primary: severity === 'CRITICAL' ? 'UP / RED' : severity === 'WARNING' ? 'UP / YELLOW' : 'FLAT / GREEN',
    rss: numberFrom(maxRss) >= 128 ? 'UP SHARP' : numberFrom(maxRss) >= 32 ? 'UP' : 'FLAT',
    errors: critical > 0 ? 'UP / CRIT' : warning > 0 ? 'UP / WARN' : 'FLAT',
    swap: /swap\s*[1-9]|swap si\s*[1-9]/i.test(pageText) ? 'ACTIVE' : 'CLEAR',
  }

  return {
    ...meta,
    slug,
    generatedAt: new Date().toLocaleString('id-ID'),
    severity,
    confidence,
    bottleneck,
    reason,
    top,
    metrics,
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
  if (text.includes('CRIT') || text.includes('RED')) return [214, 70, 88]
  if (text.includes('WARN') || text.includes('YELLOW')) return [214, 155, 40]
  return [30, 160, 130]
}

function statusLabel(status = '') {
  const text = String(status).toUpperCase()
  if (text.includes('CRIT') || text.includes('RED')) return 'MERAH / BAHAYA'
  if (text.includes('WARN') || text.includes('YELLOW')) return 'KUNING / WARNING'
  return 'HIJAU / AMAN'
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
  pdf.setFontSize(10)
  pdf.text(pdf.splitTextToSize(String(value || '-'), w - 8).slice(0, 2), x + 4, y + 14)
}

function drawTrafficRow(pdf, x, y, label, value, status, why = '') {
  const color = statusColor(status)
  pdf.setFillColor(...color)
  pdf.circle(x + 3, y - 1.5, 2.2, 'F')
  pdf.setTextColor(35, 45, 45)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.text(label, x + 8, y)
  pdf.setFont('helvetica', 'normal')
  pdf.text(String(value || '-'), x + 48, y)
  if (why) {
    pdf.setTextColor(90, 100, 100)
    pdf.setFontSize(7)
    pdf.text(pdf.splitTextToSize(why, 90).slice(0, 1), x + 94, y)
  }
}

async function exportVisualFirstPdf(slug) {
  const jsPdfModule = await import('jspdf')
  const JsPDF = jsPdfModule.jsPDF || jsPdfModule.default
  const root = document.querySelector('.fullBleed') || document.querySelector('main') || document.body
  const report = buildReport(root, slug)
  const charts = await collectCharts(root)
  const pdf = new JsPDF('p', 'mm', 'a4')
  const page = { w: pdf.internal.pageSize.getWidth(), h: pdf.internal.pageSize.getHeight(), m: 14 }
  const yRef = { y: 16 }
  const sevColor = statusColor(report.severity)

  pdf.setFillColor(5, 22, 22)
  pdf.rect(0, 0, page.w, 50, 'F')
  pdf.setFillColor(...sevColor)
  pdf.rect(0, 0, 5, 50, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(17)
  pdf.text(report.title, page.m, 16)
  pdf.setFontSize(9)
  pdf.setFont('helvetica', 'normal')
  pdf.text(`Generated: ${report.generatedAt}`, page.m, 25)
  pdf.text('Legend: merah = bahaya, kuning = warning, hijau = aman. Panah naik = memburuk.', page.m, 34)
  pdf.text(`Why: ${compactText(report.reason, 120)}`, page.m, 43)

  yRef.y = 60
  pdf.setTextColor(...sevColor)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(20)
  pdf.text(`${report.severity} — ${statusLabel(report.severity)}`, page.m, yRef.y)
  pdf.setTextColor(60, 70, 70)
  pdf.setFontSize(9)
  pdf.text(`Confidence: ${report.confidence} • Owner: ${report.owner}`, page.m, yRef.y + 7)
  yRef.y += 18

  const cardW = (page.w - page.m * 2 - 8) / 3
  drawCard(pdf, page.m, yRef.y, cardW, 22, report.slug === 'comparer' ? 'Worst Host' : 'Main Object', report.top.host, sevColor)
  drawCard(pdf, page.m + cardW + 4, yRef.y, cardW, 22, report.slug === 'comparer' ? 'Worst PID / Type' : 'Primary Key', `${report.top.pid} / ${report.top.type}`, sevColor)
  drawCard(pdf, page.m + (cardW + 4) * 2, yRef.y, cardW, 22, report.primaryLabel, report.top.job, sevColor)
  yRef.y += 27
  drawCard(pdf, page.m, yRef.y, cardW, 22, 'Main Pressure', report.slug === 'comparer' ? report.metrics.maxRss : report.bottleneck, sevColor)
  drawCard(pdf, page.m + cardW + 4, yRef.y, cardW, 22, 'Red / Yellow', `${report.metrics.critical} red / ${report.metrics.warning} yellow`, sevColor)
  drawCard(pdf, page.m + (cardW + 4) * 2, yRef.y, cardW, 22, 'Evidence Rows', report.metrics.rawRows || report.rows.length, sevColor)
  yRef.y += 33

  textLine(pdf, page, yRef, 'Quick Read — mana yang naik, bahaya, atau aman?', 12, 'bold', [0, 90, 84])
  drawTrafficRow(pdf, page.m, yRef.y + 5, 'Overall', statusLabel(report.severity), report.severity, report.reason)
  drawTrafficRow(pdf, page.m, yRef.y + 13, 'Trend', report.trend.primary, report.severity, report.trend.primary.includes('UP') ? 'Naik berarti makin perlu dicek.' : 'Stabil.')
  drawTrafficRow(pdf, page.m, yRef.y + 21, 'Pressure', report.slug === 'comparer' ? `${report.metrics.maxRss} / ${report.trend.rss}` : report.bottleneck, report.severity, 'Bahaya jika melewati threshold tool.')
  drawTrafficRow(pdf, page.m, yRef.y + 29, 'Swap/Error', report.slug === 'comparer' ? report.trend.swap : report.trend.errors, report.trend.swap === 'ACTIVE' || report.trend.errors.includes('CRIT') ? 'CRIT' : report.metrics.warning > 0 ? 'WARN' : 'OK', 'Merah jika aktif/berulang.')
  yRef.y += 40

  textLine(pdf, page, yRef, 'Immediate Actions', 12, 'bold', [0, 90, 84])
  report.actions.forEach((item, index) => textLine(pdf, page, yRef, `${index + 1}. ${item}`, 9, 'normal', [35, 45, 45], 3))

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
  if (!charts.length) {
    textLine(pdf, page, yRef, 'No chart detected in the current view. Export from a parsed/visualized evidence screen to include charts.', 10, 'italic', [90, 100, 100])
  }

  pdf.addPage()
  yRef.y = 16
  textLine(pdf, page, yRef, 'Top RCA Evidence — bukti utama', 13, 'bold', [0, 90, 84])
  const headers = ['#', 'STATUS', 'OBJECT', 'KEY', 'DETAIL']
  const widths = [8, 22, 38, 24, page.w - page.m * 2 - 92]
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
    const sev = /\b(CRIT|ERROR|FAIL|HIGH)\b/i.test(joined) ? 'RED' : /\b(WARN|MEDIUM)\b/i.test(joined) ? 'YELLOW' : 'GREEN'
    const object = cells.find((cell) => /[A-Z0-9]+PAPPDC/i.test(cell)) || cells[0] || '-'
    const key = cells.find((cell) => /^\d{3,8}$/.test(cell)) || cells[1] || '-'
    const rss = cells.find((cell) => /\d+(?:\.\d+)?\s*GB/i.test(cell)) || ''
    const age = cells.find((cell) => /\d+d|\d+h|\d+m|\d+\s*(ms|sec|s)/i.test(cell)) || ''
    const job = cells.find((cell) => /^Z[A-Z0-9_]{4,}$/i.test(cell)) || cells.slice(-1)[0] || ''
    pdf.setFillColor(index % 2 ? 250 : 245, 250, 249)
    pdf.rect(page.m, yRef.y, page.w - page.m * 2, 9, 'F')
    x = page.m
    pdf.setTextColor(...statusColor(sev))
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(7.2)
    ;[String(index + 1), sev, object, key, compactText([rss, age, job].filter(Boolean).join(' / '), 70)].forEach((val, i) => {
      if (i > 1) {
        pdf.setTextColor(35, 45, 45)
        pdf.setFont('helvetica', 'normal')
      }
      pdf.text(pdf.splitTextToSize(compactText(val, 58), widths[i] - 2).slice(0, 1), x + 1, yRef.y + 6)
      x += widths[i]
    })
    yRef.y += 9
  })

  yRef.y += 8
  textLine(pdf, page, yRef, 'Evidence Handling Notes', 12, 'bold', [0, 90, 84])
  ;[
    'Use this PDF as visual RCA summary; keep raw evidence attached to incident/change record.',
    'Red status means immediate validation; yellow means monitor and correlate with adjacent SAP evidence.',
    'If trend remains red after action, collect another snapshot from the same incident window.',
  ].forEach((item, index) => textLine(pdf, page, yRef, `${index + 1}. ${item}`, 9, 'normal', [35, 45, 45], 3))

  addFooter(pdf, page, report)
  pdf.save(`${report.filename}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.pdf`)
}

export async function exportStructuredPdf(slug) {
  try {
    return await exportVisualFirstPdf(slug)
  } catch (error) {
    console.warn('[PDF Export] visual-first mode failed, falling back to polished export:', error)
    return exportPolishedStructuredPdf(slug)
  }
}
