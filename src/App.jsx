import React from 'react'
import './app/mobile-operational-polish.css'
import './app/operational-motion.css'
import './app/pages/case-history-mobile-density.css'
import './app/workspace-2026.css'
import './app/workspace-2026-shell.css'
import './app/rundeck-cohesion-v1194.css'
import './app/rundeck-v120.css'
import Navbar from './components/Navbar.jsx'
import Footer from './components/Footer.jsx'
import { tools } from './tools'
import useRoute from './app/useRoute.js'
import { APP_VERSION, formatAppTitle } from './app/version.js'
import CaseHistory from './app/pages/CaseHistory.jsx'
import CaseDetailWithAnalytics from './app/pages/CaseDetailWithAnalytics.jsx'
import NotFound from './app/pages/NotFound.jsx'

function routeTitle(route, tool) {
  if (route.name === 'cases') return 'Analysis History'
  if (route.name === 'caseDetail') return `Case ${route.caseId || ''}`.trim()
  if (route.name === 'tool' && route.slug === 'logs' && route.view === 'process') return 'Log Analysis · Jobs & Processes'
  if (route.name === 'tool') return tool?.title || 'SAP Analysis'
  return 'Not Found'
}

export default function App() {
  const route = useRoute()
  const tool = route.name === 'tool' ? tools.find((item) => item.slug === route.slug) : null
  const ActiveTool = tool ? tool.Component : null

  React.useEffect(() => {
    document.title = formatAppTitle(routeTitle(route, tool))
  }, [route, tool])

  return (
    <div className={`appShell ${route.name === 'tool' ? 'isTool' : ''}`} data-build={`sap-${APP_VERSION}`} data-version={APP_VERSION}>
      <Navbar />
      <main>
        {route.name === 'cases' && <CaseHistory />}
        {route.name === 'caseDetail' && <CaseDetailWithAnalytics caseId={route.caseId} />}
        {route.name === 'tool' && ActiveTool && (
          <React.Suspense fallback={<section className="container section"><div className="card">Loading SAP analysis module…</div></section>}>
            <div className="fullBleed"><ActiveTool route={route} /></div>
          </React.Suspense>
        )}
        {route.name === 'tool' && !ActiveTool && <section className="container section"><div className="card">Analysis workspace unavailable.</div></section>}
        {route.name === 'notfound' && <NotFound />}
      </main>
      {route.name !== 'tool' && <Footer />}
    </div>
  )
}
