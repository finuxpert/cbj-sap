export function countItems(value) {
  return Array.isArray(value) ? value.length : Number(value || 0) || 0
}

export function limitList(value, limit = 3) {
  return Array.isArray(value) ? value.slice(0, limit) : []
}

export function toUpperText(value, fallback = 'INFO') {
  return String(value || fallback).toUpperCase()
}

const HOST_STOPWORDS = new Set([
  'abap',
  'about',
  'around',
  'basis',
  'case',
  'check',
  'comparator',
  'confidence',
  'conversion',
  'critical',
  'daily',
  'data',
  'detected',
  'evidence',
  'failed',
  'format',
  'host',
  'impact',
  'issue',
  'linked',
  'log',
  'memory',
  'next',
  'parsed',
  'priority',
  'problem',
  'response',
  'result',
  'root',
  'save',
  'scout',
  'severity',
  'source',
  'summary',
  'suspect',
  'system',
  'tool',
  'uploaded',
  'user',
  'validation',
  'window',
  'workprocess',
  'workprocesses',
  'wp',
])

const HOST_LIKE_RE = /^(?=.{3,63}$)(?!\d+$)(?:[a-z0-9]+(?:-[a-z0-9]+)*)(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*$/
const WP_RE = /^(?:wp|dia|btc|upd|spo|icm)?[-_ ]?\d{1,4}$/i

function normalizeToken(value) {
  return String(value || '').trim()
}

function uniqueList(values = []) {
  const items = []
  const seen = new Set()
  for (const value of values) {
    const text = normalizeToken(value)
    if (!text) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    items.push(text)
  }
  return items
}

function looksLikeValidHost(value = '') {
  const text = normalizeToken(value).toLowerCase()
  if (!text || text.length < 3 || text.length > 63) return false
  if (HOST_STOPWORDS.has(text)) return false
  if (/^\d+$/.test(text)) return false
  if (text.endsWith('.log') || text.endsWith('.txt') || text.endsWith('.csv') || text.endsWith('.json') || text.endsWith('.zip')) return false
  if (text.includes('/') || text.includes('\\') || text.includes(':')) return false
  if (text.split('.').every((part) => HOST_STOPWORDS.has(part))) return false
  return HOST_LIKE_RE.test(text)
}

export function sanitizeCorrelationHosts(value, limit = 8) {
  const rawHosts = Array.isArray(value) ? value : []
  const validHosts = []
  const rawCount = rawHosts.length

  for (const host of uniqueList(rawHosts)) {
    if (!looksLikeValidHost(host)) continue
    validHosts.push(host.toLowerCase())
  }

  return {
    items: validHosts.slice(0, limit),
    all: validHosts,
    hiddenCount: Math.max(validHosts.length - limit, 0),
    needsReview: rawCount > 0 && validHosts.length === 0,
  }
}

export function sanitizeWorkprocesses(value, limit = 6) {
  const raw = Array.isArray(value) ? value : []
  const cleaned = uniqueList(raw).filter((item) => WP_RE.test(item) || /^pid[-_ ]?\d{2,6}$/i.test(item))
  return {
    items: cleaned.slice(0, limit),
    all: cleaned,
    hiddenCount: Math.max(cleaned.length - limit, 0),
  }
}

export function normalizeCorrelationSources(value, limit = 8) {
  const raw = Array.isArray(value) ? value : []
  const normalized = uniqueList(raw).map((item) => String(item).trim().toLowerCase().replace(/[_-]+/g, ' '))
  return {
    items: normalized.slice(0, limit),
    all: normalized,
    hiddenCount: Math.max(normalized.length - limit, 0),
  }
}

export function clampText(value, limit = 220) {
  const text = normalizeToken(value)
  if (!text) return ''
  if (text.length <= limit) return text
  return `${text.slice(0, limit - 1)}…`
}
