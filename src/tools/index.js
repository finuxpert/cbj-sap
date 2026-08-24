import React from 'react'

const importers = {
  analyzer: () => import('./ToolSt03nAnalysis2026.jsx'),
  logs: () => import('./ToolLogWorkspace.jsx'),
}

const meta = [
  {
    slug: 'analyzer',
    title: 'ST03N Analysis',
    short: 'Workload contribution, response decomposition, completeness, and top SAP offenders',
    icon: '📊',
  },
  {
    slug: 'logs',
    title: 'LOG Analysis',
    short: 'CPU, RAM, swap, jobs, work processes, errors, and incident correlation',
    icon: '🧾',
  },
]

const lazyCache = new Map()

function lazyComponent(slug) {
  if (lazyCache.has(slug)) return lazyCache.get(slug)
  const importer = importers[slug]
  if (!importer) return null
  const Component = React.lazy(importer)
  lazyCache.set(slug, Component)
  return Component
}

export const tools = meta.map((tool) => ({ ...tool, Component: lazyComponent(tool.slug) }))

export function preloadTool(slug) {
  const importer = importers[slug]
  return importer ? importer() : Promise.resolve()
}
