export function normalizeHashRoute(value = '/') {
  const parts = value.split('/').filter(Boolean)

  if (parts[0] !== 'sap') return value || '/'

  const next = `/${parts.slice(1).join('/')}`
  return next === '/' ? '/' : next
}

export function getCurrentHashRoute() {
  if (typeof window === 'undefined') return '/'
  return normalizeHashRoute(window.location.hash.replace('#', '') || '/')
}

export function getNormalizedHashParts() {
  return getCurrentHashRoute().split('/').filter(Boolean)
}
