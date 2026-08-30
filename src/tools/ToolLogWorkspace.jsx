import React from 'react'
import './RcaWorkspaceV153.css'
import './RcaWorkspaceV154.css'
import './RcaWorkspaceV155.css'
import './RcaWorkspaceV156.css'

const LogAutoRcaV3 = React.lazy(() => import('./ToolLogAutoRcaV3.jsx'))

export default function ToolLogWorkspace() {
  return (
    <React.Suspense fallback={<section className="container section"><div className="card">Loading deterministic LOG analysis…</div></section>}>
      <LogAutoRcaV3 />
    </React.Suspense>
  )
}
