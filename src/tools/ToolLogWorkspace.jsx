import React from 'react'

const LogAnalysis2026 = React.lazy(() => import('./ToolLogAnalysis2026.jsx'))

function isProcessView(view = '') {
  return ['process', 'wp-scout', 'wpscout'].includes(String(view || '').toLowerCase())
}

export default function ToolLogWorkspace({ route }) {
  const processMode = isProcessView(route?.view)
  return (
    <React.Suspense fallback={<section className="container section"><div className="card">Loading LOG analysis…</div></section>}>
      <LogAnalysis2026 processMode={processMode} />
    </React.Suspense>
  )
}
