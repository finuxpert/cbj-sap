import React from 'react'

/**
 * SAP RCA Workspace core tools only.
 * Fokus: Basis evidence, observability triage, RCA workflow.
 */

const importers = {
  comparer: () => import('./ToolComparerClean.jsx'),
  analyzer: () => import('./ToolAnalyzerClean.jsx'),
  logs: () => import('./ToolLogs.jsx'),
}

const meta = [
  { slug: 'comparer', title: 'WP-SCOUT Monitor', short: 'Work process offender ranking, RSS, age, host pressure', icon: '🟢' },
  { slug: 'analyzer', title: 'ST03N Workload RCA', short: 'Transaction workload, DB share, wait, response-time triage', icon: '📊' },
  { slug: 'logs', title: 'SM21 / ST22 Log RCA', short: 'System log, dump pattern, correlation, action notes', icon: '🧾' },
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
