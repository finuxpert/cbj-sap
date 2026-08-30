import React from 'react'
import './RcaWorkspaceV153.css'
import './RcaWorkspaceV154.css'
import './RcaWorkspaceV155.css'
import './RcaWorkspaceV156.css'

const LogAutoRcaV5 = React.lazy(() => import('./ToolLogAutoRcaV5.jsx'))

export default function ToolLogWorkspace() {
  return (
    <React.Suspense fallback={<section className="container section"><div className="card">Loading deterministic LOG analysis v1.14…</div></section>}>
      <LogAutoRcaV5 />
    </React.Suspense>
  )
}
