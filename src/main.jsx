import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'
// Legacy base sapdev polish intentionally not imported anymore.
// Keep src/sapdev-polish.css for quick rollback if sapdev QA finds regression.
import './sapdev-comparer-fix.css'
// Legacy premium overhaul intentionally not imported anymore.
// Keep src/sapdev-premium-overhaul.css for quick rollback if sapdev QA finds regression.
// Legacy force layer intentionally not imported anymore.
// Keep src/sapdev-final-force.css for quick rollback if sapdev QA finds regression.
// Legacy SAP intelligent UX override intentionally not imported anymore.
// Keep src/sap-intelligent-ux.css for quick rollback if sapdev QA finds regression.
import './sap-intelligent-investigation.css'
// disabled: aggressive legacy comparer override
import './features/evidence/evidence.css'
import './app/shell-overrides.css'
import './app/rca-workspace.css'
import './sap-dynatrace-rca.css'
import './app/enterprise-theme.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
