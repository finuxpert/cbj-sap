import React from 'react'
import { APP_NAME } from '../app/version.js'

export default function Footer() {
  return (
    <footer className="footer">
      <p>© {new Date().getFullYear()} {APP_NAME} — ST03N & Log Analysis.</p>
    </footer>
  )
}
