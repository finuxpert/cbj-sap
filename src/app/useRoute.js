import React from 'react'

function parseRoute() {
  const hash = window.location.hash.slice(1) || '/'
  const parts = hash.split('/').filter(Boolean)

  if (parts.length === 0) return { name: 'home' }
  if (parts[0] === 'tool' && parts[1]) return { name: 'tool', slug: parts[1] }
  if (parts[0] === 'about') return { name: 'about' }
  if (parts[0] === 'contact') return { name: 'contact' }

  return { name: 'notfound' }
}

export default function useRoute() {
  const [route, setRoute] = React.useState(parseRoute)

  React.useEffect(() => {
    const onHash = () => setRoute(parseRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return route
}
