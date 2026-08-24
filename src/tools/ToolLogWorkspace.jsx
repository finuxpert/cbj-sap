import React from 'react'
import './RcaWorkspaceV153.css'
import './RcaWorkspaceV154.css'
import './RcaWorkspaceV155.css'

const LogAnalysis2026 = React.lazy(() => import('./ToolLogAnalysis2026.jsx'))

export default function ToolLogWorkspace() {
  return (
    <React.Suspense fallback={<section className="container section"><div className="card">Loading LOG analysis…</div></section>}>
      <LogAnalysis2026 />
    </React.Suspense>
  )
}
