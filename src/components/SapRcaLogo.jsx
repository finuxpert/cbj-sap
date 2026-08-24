import React from 'react'

export default function SapRcaLogo({ compact = false }) {
  return (
    <span className={`sapRcaLogo ${compact ? 'compact' : ''}`} aria-label="RCA Workspace wordmark">
      <span className="sapRcaWordmark">RCA</span>
    </span>
  )
}
