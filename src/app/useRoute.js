import React from 'react'
import { getNormalizedHashParts } from './routeUtils.js'

function parseRoute() {
  const parts = getNormalizedHashParts()

  if (parts[0] === 'tool' && parts[1]) {
    return { name: 'tool', slug: parts[1], view: parts[2] || '' }
  }
  if (parts[0] === 'cases' && parts[1]) return { name: 'caseDetail', caseId: decodeURIComponent(parts[1]) }
  if (parts[0] === 'cases') return { name: 'cases' }

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
