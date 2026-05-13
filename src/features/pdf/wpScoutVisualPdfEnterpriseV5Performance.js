export function estimateWpScoutPdfPerformance(report, profile = {}) {
  const evidenceRows = Number(report?.metrics?.rawRows || report?.rows?.length || 0)
  const rowCap = Number(profile?.appendixRowCap ?? 36)
  const renderedRows = Math.min(evidenceRows, Math.max(0, rowCap))
  const omittedRows = Math.max(0, evidenceRows - renderedRows)
  const profileId = profile?.id || 'standard'
  const sectionWeight = profileId === 'executive' ? 5 : profileId === 'full' ? 9 : 7
  const estimatedWeight = sectionWeight + Math.ceil(renderedRows / 12)
  const level = evidenceRows >= 100 || estimatedWeight >= 14 ? 'high' : evidenceRows >= 48 || omittedRows > 0 || estimatedWeight >= 10 ? 'medium' : 'normal'

  const notes = []
  if (omittedRows > 0) notes.push(`${omittedRows} row(s) omitted by ${profile?.label || 'active'} row cap.`)
  if (evidenceRows >= 100) notes.push('Large evidence set detected; grouped appendix is intentionally capped for browser-side PDF stability.')
  if (profileId === 'executive') notes.push('Executive profile keeps the PDF compact and hides detailed appendix rows.')
  if (!notes.length) notes.push('Evidence volume is within the normal deterministic export range.')

  return {
    level,
    evidenceRows,
    renderedRows,
    omittedRows,
    estimatedWeight,
    rowCap,
    notes,
  }
}

export function pdfPerformanceLabel(performance) {
  if (performance?.level === 'high') return 'High export load'
  if (performance?.level === 'medium') return 'Moderate export load'
  return 'Normal export load'
}
