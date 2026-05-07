import React from 'react'

/**
 * SAP RCA Workspace core tools only.
 * Main investigation stays on Dashboard/Home.
 * Tool routes are specialist evidence drilldowns.
 */

const importers = {
  comparer: () => import('./ToolComparerClean.jsx'),
  analyzer: () => import('./ToolSt03nImpact.jsx'),
  logs: () => import('./ToolLogEvidence.jsx'),
}

const meta = [
  { slug: 'comparer', title: 'WP-SCOUT Process', short: 'Process-level suspect detector: PID, WP, job, program, error, recurrence', icon: '🟢' },
  { slug: 'analyzer', title: 'ST03N Impact', short: 'Workload impact validation: response, DB, wait, transaction/report ranking', icon: '📊' },
  { slug: 'logs', title: 'Log Evidence', short: 'Error-family validation: SM21, ST22, dev_w, job log, WP-SCOUT errors', icon: '🧾' },
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
