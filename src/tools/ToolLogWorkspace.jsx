import React from 'react'
import './RcaWorkspaceV153.css'
import './RcaWorkspaceV154.css'
import './RcaWorkspaceV155.css'
import './RcaWorkspaceV156.css'

const LogAutoRca = React.lazy(() => import('./ToolLogAutoRca.jsx'))

export default function ToolLogWorkspace() {
  return (
    <React.Suspense fallback={<section className="container section"><div className="card">Loading automatic LOG RCA…</div></section>}>
      <LogAutoRca />
    </React.Suspense>
  )
}
