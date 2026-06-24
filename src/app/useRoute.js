import React from 'react'

const ROUTES = new Set(['st03n', 'log'])

function normalizeRoute() {
  const hash = window.location.hash.replace(/^#\/?/, '')
  const slug = hash.split('/').filter(Boolean)[0]

  if (ROUTES.has(slug)) return { name: slug }

  if (typeof window !== 'undefined' && window.location.hash !== '#/st03n') {
    window.location.hash = '#/st03n'
  }

  return { name: 'st03n' }
}

export default function useRoute() {
  const [route, setRoute] = React.useState(normalizeRoute)

  React.useEffect(() => {
    const onHash = () => setRoute(normalizeRoute())
    window.addEventListener('hashchange', onHash)
    onHash()
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return route
}
