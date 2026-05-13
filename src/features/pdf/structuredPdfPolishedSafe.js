import { exportStructuredPdf as exportPolishedStructuredPdf } from './structuredPdfPolished.js'
import { exportWpScoutVisualPdf } from './wpScoutVisualPdfEnterpriseV5Instrumented.js'

export async function exportStructuredPdf(slug) {
  if (slug === 'comparer') {
    return exportWpScoutVisualPdf()
  }

  return exportPolishedStructuredPdf(slug)
}
