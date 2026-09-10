function cleanText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function formatDate(value) {
  if (!value) return '-'
  try {
    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return String(value)
  }
}

function safeFilePart(value = 'case-history') {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'case-history'
}

function addFooter(pdf, page, generatedAt) {
  const count = pdf.getNumberOfPages()
  for (let i = 1; i <= count; i += 1) {
    pdf.setPage(i)
    pdf.setDrawColor(210, 220, 220)
    pdf.line(page.m, page.h - 13, page.w - page.m, page.h - 13)
    pdf.setTextColor(110, 120, 125)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7.5)
    pdf.text(`SPHERE Case History • ${generatedAt}`, page.m, page.h - 7)
    pdf.text(`Page ${i} / ${count}`, page.w - page.m - 20, page.h - 7)
  }
}

function createWriter(pdf) {
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
    const parts = pdf.splitTextToSize(cleanText(text) || '-', width)
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

  const header = (title, subtitle) => {
    pdf.setFillColor(5, 22, 22)
    pdf.rect(0, 0, page.w, 35, 'F')
    pdf.setTextColor(255, 255, 255)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(15)
    pdf.text(title, page.m, 14)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8.5)
    pdf.text(subtitle, page.m, 22)
    pdf.text('Generated from persistent file-backed Case History V1', page.m, 29)
    y = 44
  }

  return { page, line, section, header }
}

export async function exportCaseHistoryListPdf(cases = [], filters = {}) {
  const jsPdfModule = await import('jspdf')
  const JsPDF = jsPdfModule.jsPDF || jsPdfModule.default
  const pdf = new JsPDF('p', 'mm', 'a4')
  const generatedAt = new Date().toLocaleString('id-ID')
  const { page, line, section, header } = createWriter(pdf)

  header('SPHERE Case History Report', 'Persistent SPHERE Investigation Workspace')

  section('1. Executive Summary')
  line(`Generated: ${generatedAt}`, 9)
  line(`Total visible cases: ${cases.length}`, 9)
  if (filters.query) line(`Search filter: ${filters.query}`, 9)
  if (filters.status) line(`Status filter: ${filters.status}`, 9)
  line('This report summarizes visible SPHERE cases from the mobile-friendly Case History endpoint. Use it as a management snapshot and attach source evidence for technical validation.', 10)

  section('2. Case List')
  if (!cases.length) {
    line('No cases available in the current filtered view.', 10, 'italic')
  } else {
    cases.slice(0, 60).forEach((item, index) => {
      const caseNo = item.case_no || item.id || `CASE-${index + 1}`
      const title = item.title || caseNo
      const sev = item.severity || 'INFO'
      const status = item.status || 'OPEN'
      const sid = item.sid || '-'
      const updated = formatDate(item.updated_at || item.created_at)
      line(`${index + 1}. ${caseNo} — ${title}`, 9.8, 'bold', 0, [35, 55, 55])
      line(`SID: ${sid} | Severity: ${sev} | Status: ${status} | Updated: ${updated}`, 8.6, 'normal', 4, [65, 65, 65])
      line(`Summary: ${item.summary || 'No summary saved yet.'}`, 8.6, 'normal', 4)
      line(`Top problem: ${item.top_suspect || item.top_anomaly || 'Pending analysis'}`, 8.6, 'normal', 4)
      line(`Evidence: ${item.evidence_count ?? 0} | Reports: ${item.report_count ?? 0}`, 8.4, 'normal', 4, [65, 65, 65])
    })
  }

  section('3. Recommended Follow-Up')
  ;[
    'Open high-severity cases and validate timeline, parsed results, and linked raw evidence.',
    'Use Case Detail export for management-ready SPHERE summary per incident.',
    'Keep raw logs, ST03N, WP-SCOUT, or ZIP evidence attached to the incident/change record.',
  ].forEach((item, index) => line(`${index + 1}. ${item}`, 9.4, 'normal', 3))

  addFooter(pdf, page, generatedAt)
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  pdf.save(`sphere-case-history-${stamp}.pdf`)
}

export async function exportCaseDetailPdf(caseData = {}) {
  const jsPdfModule = await import('jspdf')
  const JsPDF = jsPdfModule.jsPDF || jsPdfModule.default
  const pdf = new JsPDF('p', 'mm', 'a4')
  const generatedAt = new Date().toLocaleString('id-ID')
  const { page, line, section, header } = createWriter(pdf)
  const caseNo = caseData.case_no || caseData.id || 'case-detail'
  const topProblem = caseData.top_problem || {}

  header('SPHERE Case Detail Report', `${caseNo} • Management SPHERE Snapshot`)

  section('1. Executive Summary')
  line(`Generated: ${generatedAt}`, 9)
  line(`Case: ${caseNo}`, 9)
  line(`Title: ${caseData.title || caseNo}`, 9)
  line(`SID: ${caseData.sid || '-'} | Environment: ${caseData.environment || '-'} | Severity: ${caseData.severity || 'INFO'} | Status: ${caseData.status || 'OPEN'}`, 9)
  line(`Updated: ${formatDate(caseData.updated_at || caseData.created_at)}`, 9)
  line(caseData.executive_summary || caseData.summary || 'No management summary saved yet.', 10)

  section('2. Top Problem / Suspect')
  line(topProblem.label || caseData.top_suspect || caseData.top_anomaly || 'Pending analysis', 11, 'bold', 0, [35, 55, 55])
  line(topProblem.reason || caseData.top_anomaly || 'Upload and parse evidence to generate anomaly detail.', 9.4)

  section('3. Timeline')
  const timeline = caseData.timeline || []
  if (!timeline.length) line('No timeline saved yet.', 10, 'italic')
  else timeline.slice(0, 20).forEach((item, index) => {
    line(`${index + 1}. ${formatDate(item.time || item.created_at)} — ${item.title || item.tool || 'SPHERE event'}`, 9.2, 'bold')
    line(item.description || item.summary || item.reason || '-', 8.6, 'normal', 4)
  })

  section('4. Parsed Results')
  const parsed = caseData.parsed_results || []
  if (!parsed.length) line('No parsed result saved yet.', 10, 'italic')
  else parsed.slice(0, 12).forEach((item, index) => {
    line(`${index + 1}. ${item.tool || 'tool'} | ${item.severity || 'INFO'} | ${item.verdict || item.top_anomaly || 'Parsed result'}`, 9.2, 'bold')
    line(item.summary || item.top_suspect || '-', 8.6, 'normal', 4)
  })

  section('5. Linked Evidence / Reports')
  const evidence = caseData.evidence || []
  if (!evidence.length) line('No linked evidence yet.', 10, 'italic')
  else evidence.slice(0, 20).forEach((item, index) => {
    line(`${index + 1}. ${item.title || item.original_filename || item.id || 'Evidence file'}`, 9, 'bold')
    line(`Tool: ${item.tool || '-'} | Created: ${formatDate(item.created_at)} | Download: ${item.download_url || '-'}`, 8.3, 'normal', 4)
  })

  const reports = caseData.reports || []
  if (reports.length) {
    section('6. Persisted Reports')
    reports.slice(0, 12).forEach((item, index) => line(`${index + 1}. ${item.title || item.id || 'Report'} | ${formatDate(item.created_at)}`, 8.8))
  }

  addFooter(pdf, page, generatedAt)
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  pdf.save(`sphere-case-${safeFilePart(caseNo)}-${stamp}.pdf`)
}
