const API_BASE = '/sap-api'

async function toJson(response) {
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    return { ok: false, status: response.status, raw: text }
  }
}

function buildSearch(params = {}) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  }
  const suffix = search.toString() ? `?${search.toString()}` : ''
  return suffix
}

async function postJson(path, payload = {}) {
  return toJson(await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }))
}

async function patchJson(path, payload = {}) {
  return toJson(await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }))
}

async function deleteJson(path) {
  return toJson(await fetch(`${API_BASE}${path}`, { method: 'DELETE' }))
}

export async function evidenceHealth() {
  return toJson(await fetch(`${API_BASE}/health`, { cache: 'no-store' }))
}

export async function listEvidence(params = {}) {
  return toJson(await fetch(`${API_BASE}/evidence${buildSearch(params)}`, { cache: 'no-store' }))
}

export async function uploadEvidence(file, meta = {}) {
  const form = new FormData()
  form.append('file', file)
  form.append('tool', meta.tool || 'unknown')
  form.append('sid', meta.sid || '')
  form.append('title', meta.title || file?.name || 'Evidence')
  form.append('note', meta.note || '')
  form.append('tags', Array.isArray(meta.tags) ? meta.tags.join(',') : (meta.tags || ''))
  if (meta.case_id) form.append('case_id', meta.case_id)
  return toJson(await fetch(`${API_BASE}/upload`, { method: 'POST', body: form }))
}

export async function createCase(payload = {}) {
  return postJson('/cases', payload)
}

export async function getCase(caseId) {
  if (!caseId) return { ok: false, detail: 'caseId is required' }
  return toJson(await fetch(`${API_BASE}/cases/${encodeURIComponent(caseId)}`, { cache: 'no-store' }))
}

export async function updateCase(caseId, payload = {}) {
  if (!caseId) return { ok: false, detail: 'caseId is required' }
  return patchJson(`/cases/${encodeURIComponent(caseId)}`, payload)
}

export async function deleteCase(caseId) {
  if (!caseId) return { ok: false, detail: 'caseId is required' }
  return deleteJson(`/cases/${encodeURIComponent(caseId)}`)
}

export async function archiveCase(caseId) {
  return updateCase(caseId, { status: 'ARCHIVED' })
}

export async function closeCase(caseId) {
  return updateCase(caseId, { status: 'CLOSED' })
}

export async function saveParsedResult(caseId, payload = {}) {
  if (!caseId) return { ok: false, detail: 'caseId is required' }
  return postJson(`/cases/${encodeURIComponent(caseId)}/parsed-results`, payload)
}

export async function listCaseParsedResults(caseId, params = {}) {
  if (!caseId) return { ok: false, detail: 'caseId is required', parsed_results: [] }
  return toJson(await fetch(`${API_BASE}/cases/${encodeURIComponent(caseId)}/parsed-results${buildSearch(params)}`, { cache: 'no-store' }))
}

export async function listCaseEvidence(caseId, params = {}) {
  if (!caseId) return { ok: false, detail: 'caseId is required', evidence: [] }
  return toJson(await fetch(`${API_BASE}/cases/${encodeURIComponent(caseId)}/evidence${buildSearch(params)}`, { cache: 'no-store' }))
}

export async function getCaseReplay(caseId) {
  if (!caseId) return { ok: false, detail: 'caseId is required' }
  return toJson(await fetch(`${API_BASE}/cases/${encodeURIComponent(caseId)}/replay`, { cache: 'no-store' }))
}

export async function listMobileCases(params = {}) {
  return toJson(await fetch(`${API_BASE}/mobile/cases${buildSearch(params)}`, { cache: 'no-store' }))
}

export async function getMobileCase(caseId) {
  return toJson(await fetch(`${API_BASE}/mobile/cases/${encodeURIComponent(caseId)}`, { cache: 'no-store' }))
}

export async function listEvidenceHistory(params = {}) {
  return toJson(await fetch(`${API_BASE}/evidence-history${buildSearch(params)}`, { cache: 'no-store' }))
}

export function evidenceDownloadUrl(id) {
  return `${API_BASE}/evidence/${encodeURIComponent(id)}/download`
}

export async function listParsedResultsHistory(params = {}) {
  return toJson(await fetch(`${API_BASE}/parsed-results-history${buildSearch(params)}`, { cache: 'no-store' }))
}
