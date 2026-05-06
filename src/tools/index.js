import React from 'react'

/**
 * RCA core tools only.
 * Fokus project saat ini: evidence/root-cause workflow, bukan helper deploy/backup/settings.
 */

const importers = {
  comparer: () => import('./ToolComparer.jsx'),
  analyzer: () => import('./ToolAnalyzer.jsx'),
  logs: () => import('./ToolLogs.jsx'),
}

const meta = [
  { slug: 'comparer', title: 'RCA Comparator', short: 'Daily Check / WP-SCOUT root-cause evidence', icon: '🧩' },
  { slug: 'analyzer', title: 'ST03N Analyzer', short: 'Workload XLSX analyzer & offender ranking', icon: '📈' },
  { slug: 'logs', title: 'Log Triage', short: 'Log evidence viewer & action notes', icon: '🧾' },
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
