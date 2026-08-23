import React from 'react'
import './ToolLogWorkspace.css'

const LogEvidence = React.lazy(() => import('./ToolLogEvidenceV2.jsx'))
const ProcessEvidence = React.lazy(() => import('./ToolComparerDirectHydrated.jsx'))

function isProcessView(view = '') {
  return ['process', 'wp-scout', 'wpscout'].includes(String(view || '').toLowerCase())
}

export default function ToolLogWorkspace({ route }) {
  const processView = isProcessView(route?.view)

  return (
    <>
      <section className="logWorkspaceModeBar" aria-label="Log analysis mode">
        <div className="logWorkspaceModeCopy">
          <span>LOG ANALYSIS</span>
          <strong>Unified error & process evidence</strong>
          <small>Use Log Evidence for SM21/ST22/dev_w/job logs. Use Process Evidence for WP-SCOUT PID/WP/job/program correlation.</small>
        </div>
        <nav className="logWorkspaceModeTabs" aria-label="Log analysis views">
          <a href="#/log" data-active={processView ? 'false' : 'true'} aria-current={processView ? undefined : 'page'}>
            Log Evidence
          </a>
          <a href="#/tool/logs/process" data-active={processView ? 'true' : 'false'} aria-current={processView ? 'page' : undefined}>
            Process Evidence · WP-SCOUT
          </a>
        </nav>
      </section>

      <React.Suspense fallback={<section className="container section"><div className="card">Loading Log analysis module…</div></section>}>
        {processView ? <ProcessEvidence /> : <LogEvidence />}
      </React.Suspense>
    </>
  )
}
