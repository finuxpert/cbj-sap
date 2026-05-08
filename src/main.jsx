import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'
// Legacy base sapdev polish intentionally not imported anymore.
// Keep src/sapdev-polish.css for quick rollback if sapdev QA finds regression.
// Legacy comparer emergency fix intentionally not imported anymore.
// Keep src/sapdev-comparer-fix.css for quick rollback if comparer QA finds regression.
// Legacy premium overhaul intentionally not imported anymore.
// Keep src/sapdev-premium-overhaul.css for quick rollback if sapdev QA finds regression.
// Legacy force layer intentionally not imported anymore.
// Keep src/sapdev-final-force.css for quick rollback if sapdev QA finds regression.
// Legacy SAP intelligent UX override intentionally not imported anymore.
// Keep src/sap-intelligent-ux.css for quick rollback if sapdev QA finds regression.
// Legacy SAP intelligent investigation override intentionally not imported anymore.
// Keep src/sap-intelligent-investigation.css for quick rollback if sapdev QA finds regression.
// disabled: aggressive legacy comparer override
import './features/evidence/evidence.css'
import './app/shell-overrides.css'
import './app/rca-workspace.css'
// Legacy Dynatrace-inspired observability override intentionally not imported anymore.
// Keep src/sap-dynatrace-rca.css for quick rollback if chart/tool QA finds regression.
import './app/enterprise-theme.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
