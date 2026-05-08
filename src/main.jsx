import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './sapdev-polish.css'
import './sapdev-comparer-fix.css'
import './sapdev-premium-overhaul.css'
import './sapdev-final-force.css'
import './sap-intelligent-ux.css'
import './sap-intelligent-investigation.css'
// disabled: aggressive legacy comparer override
import './features/evidence/evidence.css'
import './app/shell-overrides.css'
import './app/rca-workspace.css'
import './sap-dynatrace-rca.css'
import './app/enterprise-ui-system.css'
import './app/enterprise-navigation.css'
import './app/log-evidence-ux.css'
import './app/st03n-impact-ux.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
