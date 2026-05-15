export function normalizeCaseId(response) {
  const candidate = response?.case || response?.item || response?.data || response
  return candidate?.id || candidate?.case_no || response?.id || response?.case_id || response?.caseNo || ''
}

export function normalizeCaseList(response) {
  if (Array.isArray(response)) return response
  if (Array.isArray(response?.items)) return response.items
  if (Array.isArray(response?.cases)) return response.cases
  if (Array.isArray(response?.data)) return response.data
  return []
}

export function caseItemId(item) {
  return item?.id || item?.case_no || item?.case_id || item?.caseNo || ''
}

export function findFallbackCase(items = [], title = '') {
  const wanted = String(title || '').trim().toLowerCase()
  if (!items.length || !wanted) return null
  return items.find((item) => String(item.title || '').trim().toLowerCase() === wanted) || null
}

export function severityFromValue(value = '') {
  const text = String(value || '').toUpperCase()
  if (text.includes('CRIT') || text.includes('HIGH')) return 'CRIT'
  if (text.includes('WARN') || text.includes('MEDIUM')) return 'WARN'
  if (text.includes('OK') || text.includes('LOW')) return 'INFO'
  return text || 'INFO'
}
