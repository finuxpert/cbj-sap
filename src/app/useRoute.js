import React from 'react'
import { getNormalizedHashParts } from './routeUtils.js'

function parseRoute() {
  const parts = getNormalizedHashParts()

  if (parts.length === 0) return { name: 'home' }
  if (parts[0] === 'tool' && parts[1]) return { name: 'tool', slug: parts[1] }
  if (parts[0] === 'cases' && parts[1]) return { name: 'caseDetail', caseId: decodeURIComponent(parts[1]) }
  if (parts[0] === 'cases') return { name: 'cases' }
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
