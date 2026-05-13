const STORE_KEY = '__SAP_RCA_WP_SCOUT_EVIDENCE__'
const LEGACY_KEY = '__WP_SCOUT_EVIDENCE__'

function normalizeRows(rows) {
  if (!Array.isArray(rows)) return []
  return rows.filter(Boolean)
}

function ensureParsedEvidenceRoot() {
  if (typeof window === 'undefined') return null
  if (!window.sapRcaParsedEvidence || typeof window.sapRcaParsedEvidence !== 'object') {
    window.sapRcaParsedEvidence = {}
  }
  return window.sapRcaParsedEvidence
}

export function setWpScoutParsedEvidence(rows, metadata = {}) {
  const normalizedRows = normalizeRows(rows)
  if (typeof window === 'undefined') return normalizedRows

  const payload = {
    rows: normalizedRows,
    evidenceRows: normalizedRows,
    source: metadata.source || 'wp-scout-uploader',
    fileName: metadata.fileName || metadata.filename || '',
    parsedAt: metadata.parsedAt || new Date().toISOString(),
    rowCount: normalizedRows.length,
    ...metadata,
  }

  window[STORE_KEY] = payload
  window[LEGACY_KEY] = normalizedRows

  const root = ensureParsedEvidenceRoot()
  if (root) {
    root.wpScout = payload
    root.comparer = payload
  }

  console.info('[SAP RCA PDF] WP-SCOUT parsed evidence stored for direct PDF export', {
    rows: normalizedRows.length,
    source: payload.source,
    fileName: payload.fileName,
  })

  return normalizedRows
}

export function clearWpScoutParsedEvidence() {
  if (typeof window === 'undefined') return

  delete window[STORE_KEY]
  delete window[LEGACY_KEY]

  if (window.sapRcaParsedEvidence && typeof window.sapRcaParsedEvidence === 'object') {
    delete window.sapRcaParsedEvidence.wpScout
    delete window.sapRcaParsedEvidence.comparer
  }
}

export function getWpScoutParsedEvidenceSnapshot() {
  if (typeof window === 'undefined') return null

  return window[STORE_KEY]
    || window.sapRcaParsedEvidence?.wpScout
    || window.sapRcaParsedEvidence?.comparer
    || window[LEGACY_KEY]
    || null
}
