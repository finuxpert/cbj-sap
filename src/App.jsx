import React from 'react'
import Navbar from './components/Navbar.jsx'
import Footer from './components/Footer.jsx'
import { tools } from './tools'
import useRoute from './app/useRoute.js'
import Home from './app/pages/Home.jsx'
import About from './app/pages/About.jsx'
import Contact from './app/pages/Contact.jsx'
import NotFound from './app/pages/NotFound.jsx'
import ToolExportDock from './features/pdf/ToolExportDock.jsx'
import ToolEvidencePanel from './features/evidence/ToolEvidencePanel.jsx'

const APP_BUILD_STAMP = 'sap-20260507-log-evidence-panel'

export default function App() {
  const route = useRoute()
  const tool = route.name === 'tool' ? tools.find((t) => t.slug === route.slug) : null
  const ActiveTool = tool ? tool.Component : null
  const showEvidencePanel = route.name === 'tool' && route.slug === 'logs'

  return (
    <div className={`appShell ${route.name === 'tool' ? 'isTool' : ''}`} data-build={APP_BUILD_STAMP}>
      <Navbar />
      <main>
        {route.name === 'home' && <Home />}
        {route.name === 'about' && <About />}
        {route.name === 'contact' && <Contact />}
        {route.name === 'tool' && ActiveTool && (
          <React.Suspense fallback={<section className="container section"><div className="card">Loading SAP RCA module…</div></section>}>
            {showEvidencePanel && <ToolEvidencePanel tool={route.slug} />}
            <div className="fullBleed"><ActiveTool /></div>
            <ToolExportDock slug={route.slug} />
          </React.Suspense>
        )}
        {route.name === 'tool' && !ActiveTool && <section className="container section"><div className="card">Tool hidden or not found.</div></section>}
        {route.name === 'notfound' && <NotFound />}
      </main>
      {route.name !== 'tool' && <Footer />}
    </div>
  )
}
