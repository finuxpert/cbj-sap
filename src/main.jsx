import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './sapdev-polish.css'
import './sapdev-comparer-fix.css'
import './sapdev-premium-overhaul.css'
import './sapdev-final-force.css'
import './comparer-nav-style-override.js'
import './comparer-rca-final.css'
import './comparer-rca-dashboard-enhancer.js'
import './sap-zip-reader.js'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
