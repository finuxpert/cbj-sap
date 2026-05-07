const API_BASE = '/sap-api'

async function toJson(response) {
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    return { ok: false, status: response.status, raw: text }
  }
}

export async function evidenceHealth() {
  return toJson(await fetch(`${API_BASE}/health`, { cache: 'no-store' }))
}

export async function listEvidence(params = {}) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  }
  const suffix = search.toString() ? `?${search.toString()}` : ''
  return toJson(await fetch(`${API_BASE}/evidence${suffix}`, { cache: 'no-store' }))
}

export async function uploadEvidence(file, meta = {}) {
  const form = new FormData()
  form.append('file', file)
  form.append('tool', meta.tool || 'unknown')
  form.append('sid', meta.sid || '')
  form.append('title', meta.title || file?.name || 'Evidence')
  form.append('note', meta.note || '')
  form.append('tags', Array.isArray(meta.tags) ? meta.tags.join(',') : (meta.tags || ''))
  return toJson(await fetch(`${API_BASE}/upload`, { method: 'POST', body: form }))
}

export function evidenceDownloadUrl(id) {
  return `${API_BASE}/evidence/${encodeURIComponent(id)}/download`
}
