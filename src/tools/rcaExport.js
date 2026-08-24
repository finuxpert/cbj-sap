export function downloadCsv(filename, columns, rows) {
  const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
  const header = columns.map((column) => escape(column.label || column.key)).join(',')
  const body = rows.map((row) => columns.map((column) => {
    const value = column.exportValue ? column.exportValue(row) : column.value ? column.value(row) : row?.[column.key]
    return escape(Array.isArray(value) ? value.join(' | ') : value)
  }).join(',')).join('\n')
  const blob = new Blob([`${header}\n${body}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

function blockNodes(root) {
  return Array.from(root?.children || []).filter((node) => {
    if (!(node instanceof HTMLElement)) return false
    const style = window.getComputedStyle(node)
    return style.display !== 'none' && node.offsetWidth > 0 && node.offsetHeight > 0
  })
}

function sliceCanvas(source, startY, height) {
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = height
  const context = canvas.getContext('2d')
  context.drawImage(source, 0, startY, source.width, height, 0, 0, source.width, height)
  return canvas
}

export async function downloadWorkspacePdf(root, options = {}) {
  if (!root) return
  const filename = options.filename || 'sap-rca-report.pdf'
  const title = options.title || 'SAP RCA Report'
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
  document.body.classList.add('rcaPdfExportMode')
  root.setAttribute('data-pdf-export', 'true')
  try {
    if (document.fonts?.ready) await document.fonts.ready
    await nextFrame()
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
    pdf.setProperties({ title, subject: 'SAP RCA engineering report', creator: 'SAP RCA Workspace' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 7
    const footer = 8
    const gap = 3
    const contentWidth = pageWidth - (margin * 2)
    const contentHeight = pageHeight - (margin * 2) - footer
    let y = margin
    let pageHasContent = false

    const addPage = () => {
      pdf.addPage('a4', 'landscape')
      y = margin
      pageHasContent = false
    }

    for (const node of blockNodes(root)) {
      const canvas = await html2canvas(node, {
        backgroundColor: '#ffffff',
        scale: 1.35,
        useCORS: true,
        logging: false,
        scrollX: 0,
        scrollY: -window.scrollY,
      })
      if (!canvas.width || !canvas.height) continue
      const mmPerPixel = contentWidth / canvas.width
      const renderedHeight = canvas.height * mmPerPixel
      const remaining = contentHeight - (y - margin)

      if (renderedHeight <= contentHeight) {
        if (pageHasContent && renderedHeight > remaining) addPage()
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin, y, contentWidth, renderedHeight, undefined, 'FAST')
        y += renderedHeight + gap
        pageHasContent = true
        continue
      }

      if (pageHasContent) addPage()
      const sliceHeightPx = Math.max(1, Math.floor(contentHeight / mmPerPixel))
      for (let offset = 0; offset < canvas.height; offset += sliceHeightPx) {
        const height = Math.min(sliceHeightPx, canvas.height - offset)
        const piece = sliceCanvas(canvas, offset, height)
        const pieceHeight = height * mmPerPixel
        pdf.addImage(piece.toDataURL('image/png'), 'PNG', margin, margin, contentWidth, pieceHeight, undefined, 'FAST')
        pageHasContent = true
        if (offset + height < canvas.height) addPage()
        else y = margin + pieceHeight + gap
      }
    }

    const pages = pdf.getNumberOfPages()
    const generated = new Intl.DateTimeFormat('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date())
    for (let page = 1; page <= pages; page += 1) {
      pdf.setPage(page)
      pdf.setDrawColor(210, 218, 224)
      pdf.line(margin, pageHeight - 7, pageWidth - margin, pageHeight - 7)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7.5)
      pdf.setTextColor(75, 88, 98)
      pdf.text(title, margin, pageHeight - 3.5)
      pdf.text(`Generated ${generated} · Page ${page} of ${pages}`, pageWidth - margin, pageHeight - 3.5, { align: 'right' })
    }
    pdf.save(filename)
  } finally {
    root.removeAttribute('data-pdf-export')
    document.body.classList.remove('rcaPdfExportMode')
  }
}
