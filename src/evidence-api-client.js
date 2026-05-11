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

function normalizeCaseResponse(response = {}) {
  return response?.case || response?.item || response?.data || response || {}
}

function limitItems(items = [], params = {}) {
  const limit = Number(params.limit || 0)
  if (!limit || limit < 1) return items
  return items.slice(0, limit)
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

export async function getCaseCorrelation(caseId) {
  if (!caseId) return { ok: false, detail: 'caseId is required' }
  return toJson(await fetch(`${API_BASE}/cases/${encodeURIComponent(caseId)}/correlation`, { cache: 'no-store' }))
}

export async function getCaseSession(caseId) {
  if (!caseId) return { ok: false, detail: 'caseId is required' }
  return toJson(await fetch(`${API_BASE}/cases/${encodeURIComponent(caseId)}/session`, { cache: 'no-store' }))
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
  const response = await getCase(caseId)
  if (response?.ok === false) return { ...response, parsed_results: [] }
  const caseData = normalizeCaseResponse(response)
  const items = limitItems(Array.isArray(caseData.parsed_results) ? caseData.parsed_results : [], params)
  return { ok: true, case_id: caseId, count: items.length, parsed_results: items }
}

export async function listCaseEvidence(caseId, params = {}) {
  if (!caseId) return { ok: false, detail: 'caseId is required', evidence: [] }
  const response = await getCase(caseId)
  if (response?.ok === false) return { ...response, evidence: [] }
  const caseData = normalizeCaseResponse(response)
  const items = limitItems(Array.isArray(caseData.evidence) ? caseData.evidence : [], params)
  return { ok: true, case_id: caseId, count: items.length, evidence: items }
}

export async function getCaseReplay(caseId) {
  if (!caseId) return { ok: false, detail: 'caseId is required' }
  const session = await getCaseSession(caseId)
  if (session?.ok !== false && session?.replay) {
    return {
      ok: true,
      case_id: session.case_id || caseId,
      session,
      replay_ready: Boolean(session.replay?.replay_ready),
      count: Number(session.replay?.count || 0),
      events: Array.isArray(session.replay?.events) ? session.replay.events : [],
    }
  }

  const response = await getCase(caseId)
  if (response?.ok === false) return response
  const caseData = normalizeCaseResponse(response)
  const parsedResults = Array.isArray(caseData.parsed_results) ? caseData.parsed_results : []
  const evidence = Array.isArray(caseData.evidence) ? caseData.evidence : []
  const latestParsedResult = parsedResults[parsedResults.length - 1] || null
  return {
    ok: true,
    case_id: caseId,
    case: caseData,
    parsed_results: parsedResults,
    evidence,
    latest_parsed_result: latestParsedResult,
    replay_ready: Boolean(latestParsedResult || evidence.length),
  }
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
