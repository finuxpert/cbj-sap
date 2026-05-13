function safeJsonParse(value) {
  if (!value || typeof value !== 'string') return null
  try {
    return JSON.parse(value)
  } catch (error) {
    console.warn('[SAP RCA PDF] Unable to parse WP-SCOUT evidence JSON source', error)
    return null
  }
}

function compactCell(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function rowTextFromObject(row = {}) {
  return [
    row.status || row.severity,
    row.host || row.server || row.instance,
    row.pid || row.processId,
    row.type || row.wpType || row.processType,
    row.rss || row.memory || row.rssGb,
    row.age || row.runtime || row.elapsed,
    row.job || row.program || row.report || row.name,
  ]
    .map(compactCell)
    .filter(Boolean)
    .join(' | ')
}

function normalizeEvidenceRow(row) {
  if (!row) return null

  if (typeof row === 'string') {
    const text = compactCell(row)
    return text ? { cells: text.split(/\s*\|\s*/), text } : null
  }

  if (Array.isArray(row)) {
    const cells = row.map(compactCell).filter(Boolean)
    return cells.length ? { cells, text: cells.join(' | ') } : null
  }

  if (Array.isArray(row.cells)) {
    const cells = row.cells.map(compactCell).filter(Boolean)
    const text = compactCell(row.text || cells.join(' | '))
    return text ? { cells, text } : null
  }

  if (typeof row === 'object') {
    const text = compactCell(row.text || row.raw || row.line || rowTextFromObject(row))
    if (!text) return null

    return {
      cells: [
        row.status || row.severity,
        row.host || row.server || row.instance,
        row.pid || row.processId,
        row.type || row.wpType || row.processType,
        row.rss || row.memory || row.rssGb,
        row.age || row.runtime || row.elapsed,
        row.job || row.program || row.report || row.name,
      ].map(compactCell).filter(Boolean),
      text,
    }
  }

  return null
}

function evidenceArrayFromCandidate(candidate) {
  if (!candidate) return []

  if (Array.isArray(candidate)) return candidate
  if (Array.isArray(candidate.rows)) return candidate.rows
  if (Array.isArray(candidate.evidenceRows)) return candidate.evidenceRows
  if (Array.isArray(candidate.wpScoutRows)) return candidate.wpScoutRows
  if (Array.isArray(candidate.processes)) return candidate.processes
  if (Array.isArray(candidate.data)) return candidate.data

  return []
}

function candidatesFromDom(root) {
  const datasetJson = root?.getAttribute?.('data-wpscout-evidence')
    || root?.dataset?.wpscoutEvidence
    || root?.querySelector?.('[data-wpscout-evidence]')?.getAttribute?.('data-wpscout-evidence')

  const scriptJson = root?.querySelector?.('script[type="application/json"][data-wpscout-evidence]')?.textContent

  return [safeJsonParse(datasetJson), safeJsonParse(scriptJson)].filter(Boolean)
}

export function getWpScoutPdfDataSourceRows(root) {
  const browserCandidates = typeof window === 'undefined'
    ? []
    : [
      window.__SAP_RCA_WP_SCOUT_EVIDENCE__,
      window.__WP_SCOUT_EVIDENCE__,
      window.sapRcaWpScoutEvidence,
      window.wpScoutEvidence,
      window.sapRcaParsedEvidence?.wpScout,
      window.sapRcaParsedEvidence?.comparer,
    ]

  const candidates = [...browserCandidates, ...candidatesFromDom(root)]

  for (const candidate of candidates) {
    const normalized = evidenceArrayFromCandidate(candidate)
      .map(normalizeEvidenceRow)
      .filter(Boolean)
      .filter((row) => /\b(CRIT|WARN|OK|RED|YELLOW|GREEN)\b/i.test(row.text) && /\d+(?:\.\d+)?\s*GB/i.test(row.text))

    if (normalized.length) {
      console.info('[SAP RCA PDF] WP-SCOUT using parsed evidence data source', {
        rows: normalized.length,
        source: candidate?.source || candidate?.name || 'browser-parsed-evidence',
      })
      return normalized
    }
  }

  return []
}
