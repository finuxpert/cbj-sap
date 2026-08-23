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
          <span>Log Analysis</span>
          <strong>{processView ? 'Process evidence' : 'Error evidence'}</strong>
          <small>{processView ? 'WP-SCOUT PID / work process / job / program correlation.' : 'SM21 / ST22 / dev_w / job log evidence and ownership direction.'}</small>
        </div>
        <nav className="logWorkspaceModeTabs" aria-label="Log analysis views">
          <a href="#/log" data-active={processView ? 'false' : 'true'} aria-current={processView ? undefined : 'page'}>Log Evidence</a>
          <a href="#/tool/logs/process" data-active={processView ? 'true' : 'false'} aria-current={processView ? 'page' : undefined}>Process Evidence</a>
        </nav>
      </section>

      <React.Suspense fallback={<section className="container section"><div className="card">Loading Log analysis module…</div></section>}>
        {processView ? <ProcessEvidence /> : <LogEvidence />}
      </React.Suspense>
    </>
  )
}
