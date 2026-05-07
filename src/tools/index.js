import React from 'react'

/**
 * SAP RCA Workspace core tools only.
 * Main investigation stays on Dashboard/Home.
 * Tool routes are specialist evidence drilldowns.
 */

const importers = {
  comparer: () => import('./ToolComparerClean.jsx'),
  analyzer: () => import('./ToolSt03nImpactV2.jsx'),
  logs: () => import('./ToolLogEvidenceV2.jsx'),
}

const meta = [
  { slug: 'comparer', title: 'WP-SCOUT Process', short: 'Process-level suspect detector: PID, WP, job, program, error, recurrence', icon: '🟢' },
  { slug: 'analyzer', title: 'ST03N Impact V2', short: 'Decision-first workload impact validation: response, DB, wait, completeness', icon: '📊' },
  { slug: 'logs', title: 'Log Evidence V2', short: 'Decision-first error evidence: family, owner direction, job/program mapping', icon: '🧾' },
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
