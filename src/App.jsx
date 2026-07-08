import React from 'react'
import Navbar from './components/Navbar.jsx'
import { tools } from './tools'
import useRoute from './app/useRoute.js'

const APP_BUILD_STAMP = 'sap-20260708-final-rca-dashboard'

export default function App() {
  const route = useRoute()
  const tool = tools.find((item) => item.slug === route.name) || tools[0]
  const ActiveTool = tool.Component

  return (
    <div className="appShell isTool compactRcaApp" data-build={APP_BUILD_STAMP}>
      <Navbar />
      <main>
        <React.Suspense fallback={<section className="container section"><div className="card">Loading RCA module…</div></section>}>
          <div className="fullBleed"><ActiveTool /></div>
        </React.Suspense>
      </main>
    </div>
  )
}
