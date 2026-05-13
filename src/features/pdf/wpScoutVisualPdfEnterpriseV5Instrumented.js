import { exportWpScoutVisualPdf as exportWpScoutVisualPdfV5 } from './wpScoutVisualPdfEnterpriseV5.js'
import { withPdfExportTelemetry } from './pdfExportTelemetry.js'

export async function exportWpScoutVisualPdf() {
  return withPdfExportTelemetry(() => exportWpScoutVisualPdfV5(), {
    label: '[SAP RCA PDF] V5 instrumented export',
    metadata: {
      engine: 'wp-scout-enterprise-v5',
      fallbackGuard: 'handled-by-v5',
    },
  })
}
