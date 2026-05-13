export function pdfTelemetryNowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now()
  return Date.now()
}

export async function withPdfExportTelemetry(exporter, options = {}) {
  const startedAt = pdfTelemetryNowMs()
  const label = options.label || '[SAP RCA PDF] export'
  const metadata = options.metadata || {}

  try {
    const result = await exporter()
    const durationMs = Math.max(0, Math.round(pdfTelemetryNowMs() - startedAt))

    console.info(`${label} completed`, {
      durationMs,
      ...metadata,
    })

    return result
  } catch (error) {
    const durationMs = Math.max(0, Math.round(pdfTelemetryNowMs() - startedAt))

    console.warn(`${label} failed`, {
      durationMs,
      ...metadata,
      error,
    })

    throw error
  }
}
