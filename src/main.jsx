import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './sapdev-polish.css'
import './sapdev-comparer-fix.css'
import './sapdev-premium-overhaul.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
