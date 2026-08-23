import React from 'react'
import './app/mobile-operational-polish.css'
import './app/operational-motion.css'
import './app/pages/case-history-mobile-density.css'
import Navbar from './components/Navbar.jsx'
import Footer from './components/Footer.jsx'
import { tools } from './tools'
import useRoute from './app/useRoute.js'
import { APP_VERSION, formatAppTitle } from './app/version.js'
import Home from './app/pages/Home.jsx'
import About from './app/pages/About.jsx'
import Contact from './app/pages/Contact.jsx'
import CaseHistory from './app/pages/CaseHistory.jsx'
import CaseDetailWithAnalytics from './app/pages/CaseDetailWithAnalytics.jsx'
import NotFound from './app/pages/NotFound.jsx'
import ToolExportDock from './features/pdf/ToolExportDock.jsx'
import ToolEvidencePanel from './features/evidence/ToolEvidencePanel.jsx'

function routeTitle(route, tool) {
  if (route.name === 'home') return 'Dashboard'
  if (route.name === 'cases') return 'Case History'
  if (route.name === 'caseDetail') return `Case ${route.caseId || ''}`.trim()
  if (route.name === 'about') return 'Runbook'
  if (route.name === 'contact') return 'Ops'
  if (route.name === 'tool') return tool?.title || 'RCA Tool'
  return 'Not Found'
}

export default function App() {
  const route = useRoute()
  const tool = route.name === 'tool' ? tools.find((t) => t.slug === route.slug) : null
  const ActiveTool = tool ? tool.Component : null
  const showEvidencePanel = route.name === 'tool' && route.slug === 'logs'

  React.useEffect(() => {
    document.title = formatAppTitle(routeTitle(route, tool))
  }, [route, tool])

  return (
    <div className={`appShell ${route.name === 'tool' ? 'isTool' : ''}`} data-build={`sap-${APP_VERSION}`} data-version={APP_VERSION}>
      <Navbar />
      <main>
        {route.name === 'home' && <Home />}
        {route.name === 'about' && <About />}
        {route.name === 'contact' && <Contact />}
        {route.name === 'cases' && <CaseHistory />}
        {route.name === 'caseDetail' && <CaseDetailWithAnalytics caseId={route.caseId} />}
        {route.name === 'tool' && ActiveTool && (
          <React.Suspense fallback={<section className="container section"><div className="card">Loading RCA module…</div></section>}>
            {showEvidencePanel && <ToolEvidencePanel tool={route.slug} />}
            <div className="fullBleed"><ActiveTool /></div>
            <ToolExportDock slug={route.slug} />
          </React.Suspense>
        )}
        {route.name === 'tool' && !ActiveTool && <section className="container section"><div className="card">Tool unavailable.</div></section>}
        {route.name === 'notfound' && <NotFound />}
      </main>
      {route.name !== 'tool' && <Footer />}
    </div>
  )
}
