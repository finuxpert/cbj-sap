import React from 'react'

/**
 * Tools registry
 * - Single source of truth for:
 *   - slug → lazy importer
 *   - title/description/icon for UI
 * - Supports preload on hover.
 */

const importers = {
  comparer: () => import('./ToolComparer.jsx'),
  analyzer: () => import('./ToolAnalyzer.jsx'),
  backup: () => import('./ToolBackup.jsx'),
  charts: () => import('./ToolCharts.jsx'),
  deploy: () => import('./ToolDeploy.jsx'),
  logs: () => import('./ToolLogs.jsx'),
  metrics: () => import('./ToolMetrics.jsx'),
  rollback: () => import('./ToolRollback.jsx'),
  settings: () => import('./ToolSettings.jsx'),
  uploader: () => import('./ToolUploader.jsx'),
}

const meta = [
  { slug: 'comparer', title: 'Comparer', short: 'Daily Check / WP-SCOUT log comparer', icon: '🧩' },
  { slug: 'analyzer', title: 'Analyzer', short: 'ST03N export analyzer & offender ranking', icon: '📈' },
  { slug: 'backup', title: 'Backup', short: 'Backup utilities & helpers', icon: '💾' },
  { slug: 'deploy', title: 'Deploy', short: 'Build/deploy helpers', icon: '🚀' },
  { slug: 'rollback', title: 'Rollback', short: 'Rollback helpers & evidence', icon: '⏪' },
  { slug: 'logs', title: 'Logs', short: 'Log viewer & triage workspace', icon: '🧾' },
  { slug: 'metrics', title: 'Metrics', short: 'Quick health snapshots & trends', icon: '🧮' },
  { slug: 'charts', title: 'Charts', short: 'Charts & visualization playground', icon: '📊' },
  { slug: 'settings', title: 'Settings', short: 'Preferences & defaults', icon: '⚙️' },
  { slug: 'uploader', title: 'Uploader', short: 'Upload & parse helpers', icon: '📤' },
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
