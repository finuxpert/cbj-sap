import React from 'react'
import { exportStructuredPdf } from './structuredPdfPolished.js'

export default function ToolExportDock({ slug }) {
  const [busy, setBusy] = React.useState(false)
  if (!['comparer', 'analyzer', 'logs'].includes(slug)) return null

  const exportPdf = async () => {
    if (busy) return
    setBusy(true)
    try {
      await exportStructuredPdf(slug)
    } catch (err) {
      console.error('[PDF Export] failed:', err)
      window.print()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sapPdfDock">
      <button type="button" onClick={exportPdf} disabled={busy}>{busy ? 'Preparing…' : 'Export PDF'}</button>
    </div>
  )
}
