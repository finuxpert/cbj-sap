function cleanText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function textOf(selector, fallback = '') {
  const el = document.querySelector(selector)
  return cleanText(el?.textContent || fallback)
}

function unique(items = []) {
  const seen = new Set()
  const out = []
  for (const item of items.map(cleanText).filter(Boolean)) {
    const key = item.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

function collectTextCards(root, selectors, limit = 12) {
  const nodes = selectors.flatMap((selector) => Array.from(root.querySelectorAll(selector)))
  return unique(nodes.slice(0, limit * 2).map((node) => cleanText(node.textContent)).filter((text) => text.length >= 2)).slice(0, limit)
}

function collectRows(root, limit = 18) {
  const rows = []
  const tableRows = Array.from(root.querySelectorAll('tbody tr')).slice(0, limit)

  for (const tr of tableRows) {
    const cells = Array.from(tr.querySelectorAll('td,th'))
      .map((td) => cleanText(td.textContent))
      .filter(Boolean)
    if (cells.length) rows.push(cells.join(' | '))
  }

  if (rows.length) return rows

  const virtualRows = Array.from(root.querySelectorAll('.cmpVtRow,.evidenceList > div,.statusList > div,.miniTable > div,.suspectList div,.groupList div,.scoreBreakdownRow,.infraMetricCard,.incidentRailItem')).slice(0, limit)
  for (const row of virtualRows) {
    const cells = Array.from(row.querySelectorAll('b,strong,span,small,td,th'))
      .map((td) => cleanText(td.textContent))
      .filter(Boolean)
    const text = cells.length ? cells.join(' | ') : cleanText(row.textContent)
    if (text) rows.push(text)
  }

  return unique(rows).slice(0, limit)
}

function collectDecisionCards(root) {
  const selectors = ['.incidentCockpitStrip > div', '.decisionCard', '.cmpCleanStat', '.confidenceBox', '.detailScore', '.factsGrid span', '.opsMetric', '.infraMetricCard']
  return collectTextCards(root, selectors, 14)
}

function collectCorrelationSummary(root) {
  const panel = root.querySelector('[data-rca-correlation="true"], .caseCorrelationSummary')
  if (!panel || cleanText(panel.textContent).length < 20) return null

  return {
    severity: cleanText(panel.querySelector('[data-correlation-severity]')?.textContent || ''),
    confidence: cleanText(panel.querySelector('[data-correlation-confidence]')?.textContent || ''),
    rootCause: cleanText(panel.querySelector('[data-correlation-root-cause]')?.textContent || ''),
    metrics: collectTextCards(panel, ['.opsMetric', '.intelSteps > div'], 8),
    actions: collectTextCards(panel, ['.workbenchCheck'], 6),
  }
}

function isNoisyPanel(heading = '', body = '') {
  const text = `${heading} ${body}`.toLowerCase()
  return [
    'case history link',
    'existing case',
    'new case title',
    'evidence history',
    'uploaded files',
    'server-side evidence',
    'download',
    'refresh',
  ].some((pattern) => text.includes(pattern))
}

function collectPanels(root) {
  const selectors = [
    '.infraSaturationPanel',
    '.scoringBreakdownPanel',
    '.evidencePanel',
    '.cmpCleanFinding',
    '.cmpCleanActionsPanel',
    '.cmpCleanPanel',
    '.overviewCard',
    '.resultPanel',
    '.validatePanel',
    '.toolEvidenceIntro',
    '.caseCorrelationSummary',
  ]
  const nodes = selectors.flatMap((selector) => Array.from(root.querySelectorAll(selector)))
  const panels = []
  const seen = new Set()

  for (const panel of nodes) {
    const heading = cleanText(panel.querySelector('h2,h3,.sectionKicker,.cmpCleanKicker,.investKicker,.intelHead span,strong,b')?.textContent || 'Evidence Section')
    const body = cleanText(panel.textContent).slice(0, 900)
    const key = `${heading}:${body.slice(0, 120)}`.toLowerCase()
    if (!body || seen.has(key) || isNoisyPanel(heading, body)) continue
    seen.add(key)
    panels.push({ heading, body, rows: collectRows(panel, 8) })
    if (panels.length >= 9) break
  }

  return panels
}

function detectToolTitle(slug) {
  const activeTitle = textOf('h1', '')
  const map = {
    comparer: {
      title: 'SAP Intelligent RCA Comparator Report',
      subtitle: 'WP-SCOUT Process Evidence',
      filename: 'sap-comparator-wpscout-rca-report',
      actions: [
        'Validate top PID/WP in SM50 or SM66.',
        'Check JobName owner and latest execution in SM37.',
        'Correlate ErrorCode with ST22, SM21, and work process trace.',
        'Validate OS memory/CPU pressure around the same evidence window.',
      ],
    },
    analyzer: {
      title: 'SAP Intelligent ST03N Workload RCA Report',
      subtitle: 'ST03N Impact Evidence',
      filename: 'sap-st03n-impact-rca-report',
      actions: [
        'Review Top ST03N Evidence and dominant component.',
        'Validate whether response time is driven by DB, wait, CPU, or workload spike.',
        'Check completeness of required ST03N files before final RCA conclusion.',
        'Attach source XLSX/CSV evidence with the incident record.',
      ],
    },
    logs: {
      title: 'SAP Intelligent Log Evidence RCA Report',
      subtitle: 'Log Evidence / Error Pattern Drilldown',
      filename: 'sap-log-evidence-rca-report',
      actions: [
        'Group repeated error patterns by ErrorCode, JobName, and Program.',
        'Confirm owner direction before assigning Basis, ABAP, DB, or Functional action.',
        'Correlate log timeline with incident/change window.',
        'Attach raw logs as appendix; keep management summary concise.',
      ],
    },
  }

  const meta = map[slug] || {
    title: 'SAP Intelligent RCA Workspace Report',
    subtitle: 'Evidence Pack Summary',
    filename: 'sap-intelligent-rca-report',
    actions: [
      'Validate uploaded evidence completeness.',
      'Confirm primary suspect before escalation.',
      'Attach generated report and source evidence to incident record.',
    ],
  }

  return {
    ...meta,
    visibleTitle: activeTitle || meta.title,
  }
}

function parsePercent(text = '') {
  const match = String(text).match(/(\d+(?:\.\d+)?)\s*%/)
  return match ? Math.max(0, Math.min(100, Number(match[1]) || 0)) : 0
}

function parseFirstPercentNear(text = '', labels = []) {
  const body = cleanText(text)
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const direct = body.match(new RegExp(`${escaped}[^0-9]{0,36}(\\d+(?:\\.\\d+)?)\\s*%`, 'i'))
    if (direct) return Math.max(0, Math.min(100, Number(direct[1]) || 0))
    const reversed = body.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*%[^A-Za-z0-9]{0,24}${escaped}`, 'i'))
    if (reversed) return Math.max(0, Math.min(100, Number(reversed[1]) || 0))
  }
  return 0
}

function parseTopEvidence(rows = []) {
  return rows.slice(0, 8).map((row) => {
    const text = cleanText(row)
    const score = Number(text.match(/\|\s*(\d+)\s*$/)?.[1] || text.match(/score\s*(\d+)/i)?.[1] || text.match(/hits\s*(\d+)/i)?.[1] || 0)
    const label = text.split('|')[0].replace(/^\d+\.\s*/, '').slice(0, 42)
    return { label, score: score || 1, text }
  })
}

function parseInfraPressure(report) {
  const joined = cleanText([...report.decisionCards, ...report.topRows, ...report.panels.flatMap((panel) => [panel.heading, panel.body, ...panel.rows])].join(' '))
  const metrics = [
    { label: 'CPU', value: parseFirstPercentNear(joined, ['cpu', 'processor']) },
    { label: 'MEM', value: parseFirstPercentNear(joined, ['mem', 'memory', 'ram']) },
    { label: 'SWAP', value: parseFirstPercentNear(joined, ['swap']) },
  ].filter((item) => item.value > 0)

  if (metrics.length) return metrics

  const fallback = parsePercent(report.executive.confidence)
  return fallback ? [{ label: 'Signal', value: fallback }] : []
}

function parseTimelinePoints(report) {
  const candidates = unique([
    ...report.topRows,
    ...report.decisionCards,
    ...report.panels.flatMap((panel) => [panel.heading, ...panel.rows, panel.body]),
  ])
  const points = []

  for (const item of candidates) {
    const text = cleanText(item)
    const time = text.match(/\b(?:\d{2}:\d{2}(?::\d{2})?|\d{4}-\d{2}-\d{2}|\d{1,2}\/[A-Za-z]{3}\/\d{4})\b/)?.[0]
    const hasTimelineSignal = /timeline|incident|window|event|error|job|pid|wp|sm21|st22|spike/i.test(text)
    if ((time || hasTimelineSignal) && text.length >= 8) {
      points.push({ time: time || `T+${points.length + 1}`, label: text.slice(0, 92) })
    }
    if (points.length >= 6) break
  }

  return points
}

function extractExecutiveSignal(report) {
  const joined = [...report.decisionCards, ...report.topRows, ...report.panels.map((panel) => panel.body)].join(' ')
  const confidence = cleanText(joined.match(/confidence\s*\|?\s*(\d+%)/i)?.[1] || joined.match(/(\d+%)\s*confidence/i)?.[1] || '')
  const severity = cleanText(joined.match(/severity\s*\|?\s*(CRIT|WARN|INFO|OK)/i)?.[1] || joined.match(/\b(CRIT|WARN|INFO)\b/i)?.[1] || '')
  const owner = cleanText(joined.match(/owner\s*\|?\s*([^|·]{3,42})/i)?.[1] || joined.match(/owner\s+(ABAP|INFRA\/BASIS|Basis|DBA|Functional[^|.]{0,24})/i)?.[1] || '')
  const bottleneck = cleanText(joined.match(/bottleneck\s*\|?\s*([^|·]{2,24})/i)?.[1] || joined.match(/dominant bottleneck\s*\|?\s*([^|·]{2,24})/i)?.[1] || '')
  const suspect = cleanText(joined.match(/primary (?:suspect|error|rca candidate)\s*\|?\s*([^|.]{3,60})/i)?.[1] || report.topRows[0] || report.visibleTitle)
  return {
    severity: severity || 'INFO',
    confidence: confidence || 'N/A',
    confidenceValue: parsePercent(confidence),
    owner: owner || 'Review required',
    bottleneck: bottleneck || 'Not confirmed',
    suspect: suspect || report.visibleTitle,
  }
}

function buildReportFromDom(slug) {
  const root = document.querySelector('.fullBleed') || document.querySelector('main') || document.body
  const pageRoot = document.querySelector('main') || root
  const now = new Date().toLocaleString('id-ID')
  const meta = detectToolTitle(slug)
  const decisionCards = collectDecisionCards(root)
  const topRows = collectRows(root, 20)
  const panels = collectPanels(root)
  const correlation = collectCorrelationSummary(pageRoot)
  const session = textOf('.sessionBanner', '') || textOf('[data-build]', '')
  const status = textOf('.cmpCleanLoadState,.investStatus,.evidenceError', '')
  const uploadState = textOf('.evidenceUpload,.cmpCleanPrimary,.bigDrop', '')

  const report = {
    ...meta,
    generatedAt: now,
    session,
    status,
    uploadState,
    decisionCards,
    topRows,
    topEvidenceBars: parseTopEvidence(topRows),
    panels,
    correlation,
  }
  report.executive = extractExecutiveSignal(report)
  report.infraPressure = parseInfraPressure(report)
  report.timelinePoints = parseTimelinePoints(report)
  return report
}

function addFooter(pdf, page, report) {
  const count = pdf.getNumberOfPages()
  for (let i = 1; i <= count; i += 1) {
    pdf.setPage(i)
    pdf.setDrawColor(210, 220, 220)
    pdf.line(page.m, page.h - 13, page.w - page.m, page.h - 13)
    pdf.setTextColor(110, 120, 125)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7.5)
    pdf.text(`SAP Intelligent RCA Workspace • ${report.generatedAt}`, page.m, page.h - 7)
    pdf.text(`Page ${i} / ${count}`, page.w - page.m - 20, page.h - 7)
  }
}

async function svgToPngDataUrl(svg) {
  const clone = svg.cloneNode(true)
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const rect = svg.getBoundingClientRect()
  const width = Math.max(420, Math.round(rect.width || Number(svg.getAttribute('width')) || 720))
  const height = Math.max(160, Math.round(rect.height || Number(svg.getAttribute('height')) || 260))
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  clone.style.background = '#071315'
  const data = new XMLSerializer().serializeToString(clone)
  const blob = new Blob([data], { type: 'image/svg+xml;charset=utf-8' })
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
    const scale = 2
    const canvas = document.createElement('canvas')
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

async function collectChartImages() {
  const root = document.querySelector('.fullBleed') || document.querySelector('main') || document.body
  const svgNodes = Array.from(root.querySelectorAll('.chartPanel svg, .recharts-wrapper svg')).slice(0, 6)
  const charts = []
  for (const svg of svgNodes) {
    const panel = svg.closest('.evidencePanel,.chartPanel,.cmpCleanPanel,.overviewCard,.resultPanel')
    const title = cleanText(panel?.querySelector('h2,h3,.chartTitleBlock h2,.sectionKicker')?.textContent || 'Evidence Chart')
    try {
      const image = await svgToPngDataUrl(svg)
      charts.push({ title, ...image })
    } catch (error) {
      console.warn('[PDF Export] failed to render chart svg:', error)
    }
  }
  return charts
}

function severityColor(severity = '') {
  const text = String(severity).toUpperCase()
  if (text.includes('CRIT')) return [215, 80, 80]
  if (text.includes('WARN')) return [205, 150, 35]
  return [35, 155, 145]
}

export async function exportStructuredPdf(slug) {
  const jsPdfModule = await import('jspdf')
  const JsPDF = jsPdfModule.jsPDF || jsPdfModule.default
  const report = buildReportFromDom(slug)
  const chartImages = await collectChartImages()
  const pdf = new JsPDF('p', 'mm', 'a4')
  const page = { w: pdf.internal.pageSize.getWidth(), h: pdf.internal.pageSize.getHeight(), m: 14 }
  let y = 16

  const addPageIfNeeded = (need = 12) => {
    if (y + need > page.h - 18) {
      pdf.addPage()
      y = 16
    }
  }

  const line = (text, size = 10, style = 'normal', indent = 0, color = [25, 25, 25]) => {
    pdf.setFont('helvetica', style)
    pdf.setFontSize(size)
    pdf.setTextColor(...color)
    const width = page.w - page.m * 2 - indent
    const parts = pdf.splitTextToSize(String(text || '-'), width)
    for (const part of parts) {
      addPageIfNeeded(size >= 13 ? 8 : 6)
      pdf.text(part, page.m + indent, y)
      y += size >= 14 ? 7 : size >= 11 ? 6.1 : 5.2
    }
  }

  const section = (title) => {
    addPageIfNeeded(16)
    y += 2
    pdf.setDrawColor(45, 160, 145)
    pdf.line(page.m, y, page.w - page.m, y)
    y += 7
    line(title, 12, 'bold', 0, [0, 90, 84])
  }

  const bullet = (text, idx, size = 9.2) => line(`${idx + 1}. ${text}`, size, 'normal', 3)
  const sectionNo = (withoutCorrelation, withCorrelation) => (report.correlation ? withCorrelation : withoutCorrelation)

  const drawSafeGauge = (cx, cy, radius, value, color) => {
    const safeValue = Math.max(0, Math.min(100, Number(value) || 0))
    const ticks = 24
    for (let i = 0; i <= ticks; i += 1) {
      const active = i <= Math.round((safeValue / 100) * ticks)
      const angle = Math.PI + (Math.PI * i) / ticks
      const inner = radius - 2.8
      const outer = radius
      const x1 = cx + Math.cos(angle) * inner
      const y1 = cy + Math.sin(angle) * inner
      const x2 = cx + Math.cos(angle) * outer
      const y2 = cy + Math.sin(angle) * outer
      pdf.setDrawColor(...(active ? color : [218, 226, 226]))
      pdf.setLineWidth(active ? 1.25 : 0.75)
      pdf.line(x1, y1, x2, y2)
    }
    pdf.setLineWidth(0.2)
    pdf.setDrawColor(225, 232, 232)
    pdf.line(cx - radius, cy, cx + radius, cy)
  }

  const drawMetricBar = (x, yy, width, label, value, color) => {
    const safeValue = Math.max(0, Math.min(100, Number(value) || 0))
    pdf.setTextColor(45, 55, 55)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(6.8)
    pdf.text(label, x, yy)
    pdf.setFont('helvetica', 'normal')
    pdf.text(`${Math.round(safeValue)}%`, x + width - 12, yy)
    pdf.setFillColor(225, 232, 232)
    pdf.roundedRect(x, yy + 2, width, 3.5, 1, 1, 'F')
    pdf.setFillColor(...color)
    pdf.roundedRect(x, yy + 2, Math.max(3, width * (safeValue / 100)), 3.5, 1, 1, 'F')
  }

  const drawMiniTimeline = (x, yy, width, points, color) => {
    if (!points.length) return
    const gap = points.length > 1 ? width / (points.length - 1) : width
    pdf.setDrawColor(210, 222, 222)
    pdf.line(x, yy + 7, x + width, yy + 7)
    points.forEach((point, index) => {
      const px = x + gap * index
      pdf.setFillColor(...color)
      pdf.circle(px, yy + 7, 1.8, 'F')
      pdf.setTextColor(55, 65, 65)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(6)
      pdf.text(String(point.time).slice(0, 12), px - 4, yy + 14)
      pdf.setFont('helvetica', 'normal')
      pdf.text(pdf.splitTextToSize(point.label, 29).slice(0, 2), px - 4, yy + 19)
    })
  }

  const drawNativeAnalytics = () => {
    addPageIfNeeded(76)
    const x = page.m
    const w = page.w - page.m * 2
    const sev = severityColor(report.executive.severity)
    const boxY = y
    pdf.setFillColor(248, 252, 251)
    pdf.roundedRect(x, boxY, w, 66, 3, 3, 'F')
    pdf.setDrawColor(226, 235, 233)
    pdf.roundedRect(x, boxY, w, 66, 3, 3)
    pdf.setTextColor(0, 90, 84)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10)
    pdf.text('RCA Visual Summary', x + 5, boxY + 8)

    drawSafeGauge(x + 22, boxY + 31, 13, report.executive.confidenceValue || 55, sev)
    pdf.setTextColor(25, 35, 35)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8.2)
    pdf.text(report.executive.confidence, x + 15, boxY + 30)
    pdf.setTextColor(90, 100, 100)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(6.8)
    pdf.text('Confidence', x + 12, boxY + 41)

    const bars = report.topEvidenceBars.slice(0, 4)
    const maxScore = Math.max(...bars.map((item) => item.score), 1)
    bars.forEach((item, index) => {
      const bx = x + 45
      const by = boxY + 16 + index * 7
      const bw = 58
      pdf.setTextColor(40, 50, 50)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(6.6)
      pdf.text(item.label, bx, by)
      pdf.setFillColor(225, 232, 232)
      pdf.roundedRect(bx + 46, by - 4, bw, 3.4, 1, 1, 'F')
      pdf.setFillColor(...sev)
      pdf.roundedRect(bx + 46, by - 4, Math.max(4, bw * (item.score / maxScore)), 3.4, 1, 1, 'F')
    })

    const metricX = x + 115
    const metrics = report.infraPressure.slice(0, 3)
    if (metrics.length) {
      pdf.setTextColor(0, 90, 84)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(7)
      pdf.text('Infra Pressure', metricX, boxY + 15)
      metrics.forEach((item, index) => drawMetricBar(metricX, boxY + 21 + index * 10, 36, item.label, item.value, sev))
    }

    pdf.setFillColor(...sev)
    pdf.roundedRect(x + w - 35, boxY + 12, 26, 9, 2, 2, 'F')
    pdf.setTextColor(255, 255, 255)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8)
    pdf.text(report.executive.severity, x + w - 31, boxY + 18.5)
    pdf.setTextColor(65, 75, 75)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(6.7)
    pdf.text(pdf.splitTextToSize(`Owner: ${report.executive.owner}`, 35).slice(0, 2), x + w - 40, boxY + 29)
    pdf.text(pdf.splitTextToSize(`Bottleneck: ${report.executive.bottleneck}`, 35).slice(0, 2), x + w - 40, boxY + 41)

    if (report.timelinePoints.length) {
      drawMiniTimeline(x + 8, boxY + 48, w - 16, report.timelinePoints.slice(0, 5), sev)
    }

    y += 74
  }

  const drawCover = () => {
    const sev = severityColor(report.executive.severity)
    pdf.setFillColor(5, 22, 22)
    pdf.rect(0, 0, page.w, 62, 'F')
    pdf.setFillColor(...sev)
    pdf.rect(0, 0, 5, 62, 'F')
    pdf.setTextColor(255, 255, 255)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(16)
    pdf.text(report.title, page.m, 17)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.text(report.subtitle, page.m, 26)
    pdf.text(`Generated: ${report.generatedAt}`, page.m, 34)
    pdf.setFontSize(8)
    pdf.text(`Active view: ${report.visibleTitle}`, page.m, 42)

    y = 72
    const cardW = (page.w - page.m * 2 - 8) / 3
    const cards = [
      ['Severity', report.executive.severity],
      ['Confidence', report.executive.confidence],
      ['Owner', report.executive.owner],
      ['Bottleneck', report.executive.bottleneck],
      ['Primary Suspect', report.executive.suspect],
      ['Charts', `${chartImages.length} visual block(s)`],
    ]
    cards.forEach(([label, value], index) => {
      const col = index % 3
      const row = Math.floor(index / 3)
      const x = page.m + col * (cardW + 4)
      const yy = y + row * 25
      pdf.setFillColor(245, 250, 249)
      pdf.roundedRect(x, yy, cardW, 20, 2.5, 2.5, 'F')
      pdf.setTextColor(0, 100, 92)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(7.2)
      pdf.text(label.toUpperCase(), x + 3, yy + 6)
      pdf.setTextColor(20, 30, 35)
      pdf.setFontSize(9)
      pdf.text(pdf.splitTextToSize(String(value || '-'), cardW - 6).slice(0, 2), x + 3, yy + 13)
    })
    y += 56
    drawNativeAnalytics()
    line('Executive RCA narrative: this PDF is generated from structured tool state and embedded chart graphics, prioritizing decision summary, visual evidence, infra pressure, incident timeline, and recommended validation steps.', 10)
  }

  drawCover()

  section('1. Executive Summary')
  if (report.session) line(`Session: ${report.session}`, 9)
  if (report.status) line(`Status: ${report.status}`, 9)
  line('Purpose: structured SAP RCA report generated from the active tool state. It combines executive summary, native chart captures, top evidence, and recommended checks.', 10)

  if (report.correlation) {
    section('2. RCA Correlation Summary')
    if (report.correlation.severity) line(`Severity: ${report.correlation.severity}`, 9.5, 'bold')
    if (report.correlation.confidence) line(`Confidence: ${report.correlation.confidence}`, 9.5, 'bold')
    if (report.correlation.rootCause) line(`Top Root Cause: ${report.correlation.rootCause}`, 9.6)
    if (report.correlation.metrics.length) {
      line('Correlation Metrics', 9.6, 'bold', 0, [35, 55, 55])
      report.correlation.metrics.slice(0, 6).forEach((item, index) => bullet(item, index, 8.7))
    }
    if (report.correlation.actions.length) {
      line('Recommended Correlation Actions', 9.6, 'bold', 0, [35, 55, 55])
      report.correlation.actions.slice(0, 5).forEach((item, index) => bullet(item, index, 8.7))
    }
  }

  section(`${sectionNo('2', '3')}. Decision Summary`)
  if (report.decisionCards.length) report.decisionCards.slice(0, 12).forEach((item, index) => bullet(item, index, 9.4))
  else line('No decision cards detected. Upload/parse evidence first, then export again.', 10, 'italic')

  if (chartImages.length) {
    section(`${sectionNo('3', '4')}. Visual Evidence / Charts`)
    chartImages.forEach((chart, index) => {
      addPageIfNeeded(74)
      line(`${index + 1}. ${chart.title}`, 10.2, 'bold', 0, [35, 55, 55])
      const maxW = page.w - page.m * 2
      const maxH = 70
      const ratio = Math.min(maxW / chart.width, maxH / chart.height)
      const w = chart.width * ratio
      const h = chart.height * ratio
      pdf.setDrawColor(220, 230, 228)
      pdf.roundedRect(page.m, y, maxW, h + 7, 2, 2)
      pdf.addImage(chart.dataUrl, 'PNG', page.m + (maxW - w) / 2, y + 3.5, w, h)
      y += h + 12
    })
  }

  section(`${sectionNo(chartImages.length ? '4' : '3', chartImages.length ? '5' : '4')}. Top Evidence / Ranking`)
  if (report.topRows.length) report.topRows.slice(0, 12).forEach((row, index) => bullet(row, index, 8.7))
  else line('No evidence ranking rows detected in the current view.', 10, 'italic')

  section(`${sectionNo(chartImages.length ? '5' : '4', chartImages.length ? '6' : '5')}. Findings Detail`)
  if (report.panels.length) {
    report.panels.slice(0, 7).forEach((panel, index) => {
      line(`${index + 1}. ${panel.heading}`, 10.2, 'bold', 0, [35, 55, 55])
      line(panel.body, 8.4, 'normal', 4)
      if (panel.rows.length) panel.rows.slice(0, 4).forEach((row) => line(`- ${row}`, 8.1, 'normal', 7, [65, 65, 65]))
      y += 1.5
    })
  } else {
    line('No visible finding panel detected.', 10, 'italic')
  }

  section(`${sectionNo(chartImages.length ? '6' : '5', chartImages.length ? '7' : '6')}. Recommended Basis / RCA Actions`)
  report.actions.forEach((action, index) => bullet(action, index, 9.8))

  section(`${sectionNo(chartImages.length ? '7' : '6', chartImages.length ? '8' : '7')}. Evidence Handling Notes`)
  ;[
    'Use this PDF as a readable RCA summary, not as replacement for raw evidence.',
    'Attach original WP-SCOUT, ST03N, SM21/ST22, or job log files to the incident record.',
    'If confidence is low, collect another evidence snapshot from the same incident window.',
  ].forEach((note, index) => bullet(note, index, 9.2))

  addFooter(pdf, page, report)

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  pdf.save(`${report.filename}-${stamp}.pdf`)
}
