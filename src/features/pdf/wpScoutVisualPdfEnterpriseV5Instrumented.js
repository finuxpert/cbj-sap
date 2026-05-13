import { exportWpScoutVisualPdf as exportWpScoutVisualPdfV5 } from './wpScoutVisualPdfEnterpriseV5.js'

const nowMs = () => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now()
  return Date.now()
}

export async function exportWpScoutVisualPdf() {
  const startedAt = nowMs()

  try {
    const result = await exportWpScoutVisualPdfV5()
    const durationMs = Math.max(0, Math.round(nowMs() - startedAt))
    console.info('[SAP RCA PDF] V5 instrumented export completed', {
      durationMs,
      engine: 'wp-scout-enterprise-v5',
      fallbackGuard: 'handled-by-v5',
    })
    return result
  } catch (error) {
    const durationMs = Math.max(0, Math.round(nowMs() - startedAt))
    console.warn('[SAP RCA PDF] V5 instrumented export failed', {
      durationMs,
      engine: 'wp-scout-enterprise-v5',
      error,
    })
    throw error
  }
}
