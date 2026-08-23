import React from 'react'

/**
 * SAP RCA Workspace exposes two primary analysis workspaces only:
 * - ST03N for workload/performance evidence
 * - Log for error/trace/process evidence, including WP-SCOUT
 *
 * Case History remains an internal persistence capability used by both tools.
 */

const importers = {
  analyzer: () => import('./ToolSt03nImpactV2.jsx'),
  logs: () => import('./ToolLogWorkspace.jsx'),
}

const meta = [
  {
    slug: 'analyzer',
    title: 'ST03N Analysis',
    short: 'Workload impact: response, DB, wait, completeness, and top workload offender',
    icon: '📊',
  },
  {
    slug: 'logs',
    title: 'Log Analysis',
    short: 'Error, trace, job/program, owner direction, infra signals, and WP-SCOUT process evidence',
    icon: '🧾',
  },
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
