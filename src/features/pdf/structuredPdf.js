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

  const virtualRows = Array.from(root.querySelectorAll('.cmpVtRow,.evidenceList > div,.statusList > div,.miniTable > div,.suspectList div,.groupList div')).slice(0, limit)
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
  const selectors = ['.decisionCard', '.cmpCleanStat', '.confidenceBox', '.detailScore', '.factsGrid span', '.opsMetric']
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

function collectPanels(root) {
  const selectors = [
    '.evidencePanel',
    '.cmpCleanFinding',
    '.cmpCleanActionsPanel',
    '.cmpCleanPanel',
    '.overviewCard',
    '.resultPanel',
    '.validatePanel',
    '.toolEvidenceIntro',
    '.evidenceHistory',
    '.caseCorrelationSummary',
  ]
  const nodes = selectors.flatMap((selector) => Array.from(root.querySelectorAll(selector)))
  const panels = []
  const seen = new Set()

  for (const panel of nodes) {
    const heading = cleanText(panel.querySelector('h2,h3,.sectionKicker,.cmpCleanKicker,.investKicker,strong,b')?.textContent || 'Evidence Section')
    const body = cleanText(panel.textContent).slice(0, 900)
    const key = `${heading}:${body.slice(0, 120)}`.toLowerCase()
    if (!body || seen.has(key)) continue
    seen.add(key)
    panels.push({ heading, body, rows: collectRows(panel, 8) })
    if (panels.length >= 10) break
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

  return {
    ...meta,
    generatedAt: now,
    session,
    status,
    uploadState,
    decisionCards,
    topRows,
    panels,
    correlation,
  }
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

export async function exportStructuredPdf(slug) {
  const jsPdfModule = await import('jspdf')
  const JsPDF = jsPdfModule.jsPDF || jsPdfModule.default
  const report = buildReportFromDom(slug)
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

  pdf.setFillColor(5, 22, 22)
  pdf.rect(0, 0, page.w, 35, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(15)
  pdf.text(report.title, page.m, 14)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8.5)
  pdf.text(report.subtitle, page.m, 22)
  pdf.text(`Active view: ${report.visibleTitle}`, page.m, 29)
  y = 44

  section('1. Executive Summary')
  line(`Generated: ${report.generatedAt}`, 9)
  if (report.session) line(`Session: ${report.session}`, 9)
  if (report.status) line(`Status: ${report.status}`, 9)
  line('Purpose: structured SAP RCA report generated from the active tool state. This report avoids screenshot-based export and summarizes visible evidence, rankings, and recommended checks.', 10)

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

  section(`${sectionNo('3', '4')}. Top Evidence / Ranking`)
  if (report.topRows.length) report.topRows.slice(0, 16).forEach((row, index) => bullet(row, index, 8.7))
  else line('No evidence ranking rows detected in the current view.', 10, 'italic')

  section(`${sectionNo('4', '5')}. Findings Detail`)
  if (report.panels.length) {
    report.panels.slice(0, 8).forEach((panel, index) => {
      line(`${index + 1}. ${panel.heading}`, 10.2, 'bold', 0, [35, 55, 55])
      line(panel.body, 8.4, 'normal', 4)
      if (panel.rows.length) panel.rows.slice(0, 4).forEach((row) => line(`- ${row}`, 8.1, 'normal', 7, [65, 65, 65]))
      y += 1.5
    })
  } else {
    line('No visible finding panel detected.', 10, 'italic')
  }

  section(`${sectionNo('5', '6')}. Recommended Basis / RCA Actions`)
  report.actions.forEach((action, index) => bullet(action, index, 9.8))

  section(`${sectionNo('6', '7')}. Evidence Handling Notes`)
  ;[
    'Use this PDF as a readable RCA summary, not as replacement for raw evidence.',
    'Attach original WP-SCOUT, ST03N, SM21/ST22, or job log files to the incident record.',
    'If confidence is low, collect another evidence snapshot from the same incident window.',
  ].forEach((note, index) => bullet(note, index, 9.2))

  addFooter(pdf, page, report)

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  pdf.save(`${report.filename}-${stamp}.pdf`)
}
