import { pdfTelemetryNowMs } from './pdfExportTelemetry.js'

function pageCountOf(pdf) {
  if (pdf && typeof pdf.getNumberOfPages === 'function') return pdf.getNumberOfPages()
  return 0
}

function cursorValueOf(y) {
  return Math.round(Number(y?.value || 0))
}

export function renderPdfSectionsWithProfiler(sections = [], context = {}, options = {}) {
  const startedAt = pdfTelemetryNowMs()
  const sectionProfile = []
  const label = options.label || '[SAP RCA PDF] section profiler'
  const metadata = options.metadata || {}
  const pdf = context.pdf
  const y = context.y

  sections.forEach((section, index) => {
    const sectionStartedAt = pdfTelemetryNowMs()
    const startPageCount = pageCountOf(pdf)
    const startY = cursorValueOf(y)

    try {
      section.render(context)
    } finally {
      const endPageCount = pageCountOf(pdf)

      sectionProfile.push({
        id: section.id,
        title: section.title,
        order: index + 1,
        durationMs: Math.max(0, Math.round(pdfTelemetryNowMs() - sectionStartedAt)),
        startPageCount,
        endPageCount,
        pagesAdded: Math.max(0, endPageCount - startPageCount),
        startY,
        endY: cursorValueOf(y),
      })
    }
  })

  const totalSectionRenderMs = Math.max(0, Math.round(pdfTelemetryNowMs() - startedAt))

  console.info(label, {
    totalSectionRenderMs,
    sections: sectionProfile,
    ...metadata,
  })

  return {
    sectionProfile,
    sectionProfileTotalMs: totalSectionRenderMs,
  }
}
