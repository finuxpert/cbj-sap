function textOf(selector, fallback = '') {
  const el = document.querySelector(selector)
  return (el?.textContent || fallback).replace(/\s+/g, ' ').trim()
}

function collectRows(root, limit = 12) {
  const rows = []
  const tableRows = Array.from(root.querySelectorAll('tbody tr')).slice(0, limit)

  for (const tr of tableRows) {
    const cells = Array.from(tr.querySelectorAll('td,th'))
      .map((td) => td.textContent.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
    if (cells.length) rows.push(cells.join(' | '))
  }

  if (rows.length) return rows

  const virtualRows = Array.from(root.querySelectorAll('.cmpVtRow')).slice(0, limit)
  for (const row of virtualRows) {
    const cells = Array.from(row.querySelectorAll('span'))
      .map((td) => td.textContent.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
    if (cells.length) rows.push(cells.join(' | '))
  }

  return rows
}

function buildReportFromDom(slug) {
  const root = document.querySelector('.fullBleed') || document.querySelector('main') || document.body
  const now = new Date().toLocaleString('id-ID')
  const toolMeta = {
    comparer: {
      title: 'SAP Intelligent RCA Comparator Report',
      subtitle: 'Daily Check / WP-SCOUT Evidence',
      actions: [
        'Check SM50/SM66 for long-running work process.',
        'Validate top JobName owner and schedule.',
        'Check ST22/SM21 for repeated ErrorCode/RABAX.',
        'Use ST03N Analyzer if response-time or DB-access symptom appears.',
      ],
    },
    analyzer: {
      title: 'SAP Intelligent ST03N Workload RCA Report',
      subtitle: 'Workload XLSX Evidence',
      actions: [
        'Review top response-time transactions.',
        'Validate DB access and time-profile hotspots.',
        'Classify whether the issue is application code, database access, or workload spike.',
        'Attach exported XLSX source as supporting evidence.',
      ],
    },
    logs: {
      title: 'SAP Intelligent Log Triage RCA Report',
      subtitle: 'Log Evidence / Action Notes',
      actions: [
        'Group repeated error patterns by host/component.',
        'Confirm timeline around incident/change window.',
        'Map each error pattern to owner/action item.',
        'Attach raw logs only as appendix, not management summary.',
      ],
    },
  }[slug] || { title: 'SAP Intelligent RCA Report', subtitle: 'Evidence Report', actions: [] }

  const title = textOf('.cmpTitle', toolMeta.title) || toolMeta.title
  const subtitle = textOf('.cmpSub', toolMeta.subtitle) || toolMeta.subtitle
  const kpis = Array.from(root.querySelectorAll('.kpiMini,.summaryCard,.heroPanelMetric'))
    .slice(0, 10)
    .map((el) => el.textContent.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const panels = Array.from(root.querySelectorAll('.panel,.card'))
    .slice(0, 6)
    .map((panel) => {
      const heading = panel.querySelector('.panelTitle,.panelTitleSm,h2,h3,strong')?.textContent?.replace(/\s+/g, ' ')?.trim() || 'Evidence Section'
      const body = panel.textContent.replace(/\s+/g, ' ').trim().slice(0, 520)
      const rows = collectRows(panel, 8)
      return { heading, body, rows }
    })

  return {
    title: toolMeta.title,
    subtitle: title !== toolMeta.title ? `${title} — ${subtitle}` : subtitle,
    generatedAt: now,
    kpis,
    panels,
    rows: collectRows(root, 15),
    actions: toolMeta.actions,
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
    if (y + need > page.h - page.m) {
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
      addPageIfNeeded(6)
      pdf.text(part, page.m + indent, y)
      y += size >= 14 ? 7 : 5.5
    }
  }

  const section = (title) => {
    addPageIfNeeded(14)
    y += 2
    pdf.setDrawColor(45, 160, 145)
    pdf.line(page.m, y, page.w - page.m, y)
    y += 7
    line(title, 12, 'bold', 0, [0, 90, 84])
  }

  pdf.setFillColor(5, 22, 22)
  pdf.rect(0, 0, page.w, 32, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(16)
  pdf.text(report.title, page.m, 15)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.text(report.subtitle, page.m, 23)
  y = 42

  section('1. Executive Summary')
  line(`Generated: ${report.generatedAt}`, 9)
  line('Purpose: concise RCA evidence package generated from the active SAP tool view. This PDF focuses on readable findings instead of full-page screenshots.', 10)

  section('2. Key Metrics')
  if (report.kpis.length) report.kpis.forEach((k, i) => line(`${i + 1}. ${k}`, 10, 'normal', 3))
  else line('No KPI card detected. Upload/parse evidence first, then export again.', 10, 'italic')

  section('3. Top Evidence / Offenders')
  const rows = report.rows.length ? report.rows : report.panels.flatMap((p) => p.rows).slice(0, 12)
  if (rows.length) rows.slice(0, 12).forEach((r, i) => line(`${i + 1}. ${r}`, 8.5, 'normal', 3))
  else line('No table/offender rows detected in the current view.', 10, 'italic')

  section('4. Visible Findings')
  report.panels.forEach((p, i) => {
    line(`${i + 1}. ${p.heading}`, 10, 'bold')
    line(p.body, 8.5, 'normal', 4)
  })

  section('5. Recommended Action')
  report.actions.forEach((a, i) => line(`${i + 1}. ${a}`, 10, 'normal', 3))

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  pdf.save(`sap-intelligent-${slug}-rca-report-${stamp}.pdf`)
}
