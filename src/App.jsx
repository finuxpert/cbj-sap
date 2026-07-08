import React from 'react'
import Navbar from './components/Navbar.jsx'
import { tools } from './tools'
import useRoute from './app/useRoute.js'
import { installEnterpriseRcaMockup } from './tools/installEnterpriseRcaMockup.js'
import { installEnterpriseRcaPhase2 } from './tools/installEnterpriseRcaPhase2.js'
import { installEnterpriseRcaPhase3 } from './tools/installEnterpriseRcaPhase3.js'
import { installEnterpriseRcaPhase4 } from './tools/installEnterpriseRcaPhase4.js'
import { installEnterpriseRcaPhase5 } from './tools/installEnterpriseRcaPhase5.js'
import './tools/EnterpriseRcaMockup.css'

const APP_BUILD_STAMP = 'sap-20260708-compact-rca-phase5'

export default function App() {
  const route = useRoute()
  const tool = tools.find((item) => item.slug === route.name) || tools[0]
  const ActiveTool = tool.Component

  React.useEffect(() => {
    installEnterpriseRcaMockup()
    installEnterpriseRcaPhase2()
    installEnterpriseRcaPhase3()
    installEnterpriseRcaPhase4()
    installEnterpriseRcaPhase5()
  }, [route.name])

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
