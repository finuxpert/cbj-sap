import React from 'react'

/**
 * RCA core tools only.
 * Fokus project saat ini: evidence/root-cause workflow, bukan helper deploy/backup/settings.
 */

const importers = {
  comparer: () => import('./ToolComparerClean.jsx'),
  analyzer: () => import('./ToolAnalyzerClean.jsx'),
  logs: () => import('./ToolLogs.jsx'),
}

const meta = [
  { slug: 'comparer', title: 'WP-SCOUT Comparator', short: 'Compare work process snapshots and rank offenders', icon: '🧩' },
  { slug: 'analyzer', title: 'ST03N Workload', short: 'Workload XLSX ranking and response-time analysis', icon: '📈' },
  { slug: 'logs', title: 'System Log Triage', short: 'Group log patterns and prepare action notes', icon: '🧾' },
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

export const tools = meta.map((t) => ({
  ...t,
  Component: lazyComponent(t.slug),
}))

export function preloadTool(slug) {
  const importer = importers[slug]
  return importer ? importer() : Promise.resolve()
}
