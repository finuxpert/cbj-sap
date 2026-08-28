import React from 'react'
import './RcaWorkspaceV153.css'
import './RcaWorkspaceV154.css'
import './RcaWorkspaceV155.css'
import './RcaWorkspaceV156.css'

const LogAutoRcaV2 = React.lazy(() => import('./ToolLogAutoRcaV2.jsx'))

export default function ToolLogWorkspace() {
  return (
    <React.Suspense fallback={<section className="container section"><div className="card">Loading time-first LOG analysis…</div></section>}>
      <LogAutoRcaV2 />
    </React.Suspense>
  )
}
