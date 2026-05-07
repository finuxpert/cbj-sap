import React from 'react'
import { exportStructuredPdf } from './structuredPdf.js'

export default function ToolExportDock({ slug }) {
  const [busy, setBusy] = React.useState(false)
  if (!['comparer', 'analyzer', 'logs'].includes(slug)) return null

  const label = slug === 'comparer' ? 'Comparator PDF' : slug === 'analyzer' ? 'ST03N PDF' : 'Logs PDF'
  const exportPdf = async () => {
    if (busy) return
    setBusy(true)
    try {
      await exportStructuredPdf(slug)
    } catch (err) {
      console.error('[SAP PDF Export] failed:', err)
      window.print()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sapPdfDock">
      <button type="button" onClick={exportPdf} disabled={busy}>{busy ? 'Preparing PDF…' : `Export ${label}`}</button>
      <span>Structured RCA report</span>
    </div>
  )
}
