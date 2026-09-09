import React from 'react'
import './SphereWorkspaceV153.css'
import './SphereWorkspaceV154.css'
import './SphereWorkspaceV155.css'
import './SphereWorkspaceV156.css'

const LogAutoRcaV5 = React.lazy(() => import('./ToolLogAutoSphereV5.jsx'))

export default function ToolLogWorkspace() {
  return (
    <React.Suspense fallback={<section className="container section"><div className="card">Loading deterministic LOG analysis v1.14…</div></section>}>
      <LogAutoRcaV5 />
    </React.Suspense>
  )
}
