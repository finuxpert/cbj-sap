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
import './comparer-rca-final.css'
import './features/evidence/evidence.css'
import './app/shell-overrides.css'
import './tools/ToolComparer.clean.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
