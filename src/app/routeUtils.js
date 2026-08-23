const ROUTE_ALIASES = {
  '/': '/tool/analyzer',
  '/st03n': '/tool/analyzer',
  '/log': '/tool/logs',
  '/wpscout': '/tool/logs/process',
  '/wp-scout': '/tool/logs/process',
  '/tool/comparer': '/tool/logs/process',
  '/about': '/tool/analyzer',
  '/contact': '/tool/logs',
}

export function normalizeHashRoute(value = '/') {
  const parts = value.split('/').filter(Boolean)
  const normalized = parts[0] === 'sap'
    ? `/${parts.slice(1).join('/')}`
    : (value || '/')
  const route = normalized === '' ? '/' : normalized
  return ROUTE_ALIASES[route] || route
}

export function getCurrentHashRoute() {
  if (typeof window === 'undefined') return '/tool/analyzer'
  return normalizeHashRoute(window.location.hash.replace('#', '') || '/')
}

export function getNormalizedHashParts() {
  return getCurrentHashRoute().split('/').filter(Boolean)
}
