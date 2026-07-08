import React from 'react'

const importers = {
  st03n: () => import('./ToolSt03nDashboardFinal.jsx'),
  log: () => import('./ToolLogDashboardFinal.jsx'),
}

const meta = [
  { slug: 'st03n', title: 'ST03N', short: 'Analyze ST03N Excel, CSV, or ZIP evidence.', icon: '📊' },
  { slug: 'log', title: 'Log', short: 'Analyze SAP, process, and OS log evidence.', icon: '🧾' },
]

const lazyCache = new Map()

function lazyComponent(slug) {
  if (lazyCache.has(slug)) return lazyCache.get(slug)
  const importer = importers[slug]
  if (!importer) return null
  const C = React.lazy(importer)
  lazyCache.set(slug, C)
  return C
}

export const tools = meta.map((tool) => ({
  ...tool,
  Component: lazyComponent(tool.slug),
}))

export function preloadTool(slug) {
  const importer = importers[slug]
  return importer ? importer() : Promise.resolve()
}
