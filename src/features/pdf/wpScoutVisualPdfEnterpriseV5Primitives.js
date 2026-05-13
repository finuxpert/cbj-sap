export const WP_SCOUT_PDF_V5_COLORS = {
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

export function cleanPdfText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

export function compactPdfText(value = '', limit = 120) {
  const text = cleanPdfText(value)
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text
}

export function numberFromPdfText(value = '') {
  return Number(String(value || '').replace(',', '.').match(/-?\d+(?:\.\d+)?/)?.[0] || 0)
}

export function pdfStatusColor(value, colors = WP_SCOUT_PDF_V5_COLORS) {
  return /RED|CRIT|HIGH|CRITICAL/i.test(value)
    ? colors.red
    : /YELLOW|WARN|MEDIUM|WARNING/i.test(value)
      ? colors.yellow
      : colors.green
}

export function pdfStatusLabel(severity) {
  return severity === 'CRITICAL'
    ? 'RED / CHECK NOW'
    : severity === 'WARNING'
      ? 'YELLOW / WATCH'
      : 'GREEN / OK'
}

export function pdfPageBox(pdf, margin = 14) {
  return {
    w: pdf.internal.pageSize.getWidth(),
    h: pdf.internal.pageSize.getHeight(),
    m: margin,
  }
}

export function ensurePdfSpace(pdf, page, y, need = 12) {
  if (y.value + need > page.h - 20) {
    pdf.addPage('a4', 'portrait')
    Object.assign(page, pdfPageBox(pdf, page.m || 14))
    y.value = 16
  }
}

export function writePdfText(pdf, page, y, value, options = {}) {
  const {
    size = 9,
    style = 'normal',
    color = WP_SCOUT_PDF_V5_COLORS.ink,
    indent = 0,
    lineHeight = size >= 12 ? 6.5 : 5,
  } = options

  pdf.setFont('helvetica', style)
  pdf.setFontSize(size)
  pdf.setTextColor(...color)
  pdf.splitTextToSize(String(value || '-'), page.w - page.m * 2 - indent).forEach((line) => {
    ensurePdfSpace(pdf, page, y, size >= 12 ? 9 : 6)
    pdf.text(line, page.m + indent, y.value)
    y.value += lineHeight
  })
}

export function drawPdfSectionTitle(pdf, page, y, title, subtitle = '', options = {}) {
  const colors = options.colors || WP_SCOUT_PDF_V5_COLORS
  writePdfText(pdf, page, y, title, {
    size: options.size || 14,
    style: 'bold',
    color: options.color || colors.teal,
  })

  if (subtitle) {
    writePdfText(pdf, page, y, subtitle, {
      size: options.subtitleSize || 8.5,
      style: 'normal',
      color: options.subtitleColor || colors.muted,
    })
  }

  y.value += options.afterGap ?? 4
}

export function drawPdfMetricCard(pdf, x, y, w, h, label, value, options = {}) {
  const colors = options.colors || WP_SCOUT_PDF_V5_COLORS
  const accent = options.accent || colors.teal

  pdf.setFillColor(...colors.light)
  pdf.setDrawColor(...colors.border)
  pdf.roundedRect(x, y, w, h, 3, 3, 'FD')
  pdf.setTextColor(...accent)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(7)
  pdf.text(String(label || '').toUpperCase(), x + 4, y + 6)
  pdf.setTextColor(...colors.ink)
  pdf.setFontSize(10)
  pdf.text(pdf.splitTextToSize(String(value || '-'), w - 8).slice(0, 2), x + 4, y + 14)
}

export function drawPdfTableHeader(pdf, page, y, headers, widths, options = {}) {
  const colors = options.colors || WP_SCOUT_PDF_V5_COLORS
  let x = page.m

  pdf.setFillColor(...(options.fill || colors.dark))
  pdf.rect(page.m, y.value, page.w - page.m * 2, options.height || 8, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(options.fontSize || 7)
  headers.forEach((header, index) => {
    pdf.text(header, x + 1, y.value + 5.5)
    x += widths[index]
  })
  y.value += options.height || 8
}

export function drawPdfTableRow(pdf, page, y, values, widths, options = {}) {
  const colors = options.colors || WP_SCOUT_PDF_V5_COLORS
  const rowHeight = options.height || 10
  const index = options.index || 0
  let x = page.m

  ensurePdfSpace(pdf, page, y, rowHeight + 2)
  pdf.setFillColor(index % 2 ? 250 : 245, 250, 249)
  pdf.rect(page.m, y.value, page.w - page.m * 2, rowHeight, 'F')
  values.forEach((value, col) => {
    const color = options.colorForColumn?.(value, col) || colors.ink
    pdf.setTextColor(...color)
    pdf.setFont('helvetica', options.boldColumns?.includes(col) ? 'bold' : 'normal')
    pdf.setFontSize(options.fontSize || 7.2)
    pdf.text(pdf.splitTextToSize(compactPdfText(value, options.limit || 80), widths[col] - 2).slice(0, 1), x + 1, y.value + rowHeight - 3.5)
    x += widths[col]
  })
  y.value += rowHeight
}
