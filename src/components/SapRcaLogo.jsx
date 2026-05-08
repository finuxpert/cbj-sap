import React from 'react'

export default function SapRcaLogo({ compact = false }) {
  return (
    <span className={`sapRcaLogo ${compact ? 'compact' : ''}`} aria-label="SAP RCA Workspace logo">
      <svg viewBox="0 0 92 44" role="img" focusable="false">
        <defs>
          <linearGradient id="sapRcaLogoGradient" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="52%" stopColor="#2dd4bf" />
            <stop offset="100%" stopColor="#0f766e" />
          </linearGradient>
          <linearGradient id="sapRcaLogoEdge" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="rgba(255,255,255,0.92)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.36)" />
          </linearGradient>
        </defs>
        <path
          d="M8 5h56c4.4 0 8.7 1.8 11.7 5L88 23.2 75.7 39c-3 3.2-7.3 5-11.7 5H8c-4.4 0-8-3.6-8-8V13c0-4.4 3.6-8 8-8Z"
          fill="url(#sapRcaLogoGradient)"
        />
        <path d="M9 7h54.6c3.9 0 7.5 1.5 10.2 4.3l10 10.8" fill="none" stroke="url(#sapRcaLogoEdge)" strokeWidth="1.1" opacity="0.62" />
        <text x="11" y="24" fill="#04110f" fontSize="14" fontWeight="900" fontFamily="Inter, Arial, sans-serif" letterSpacing="-0.8">SAP</text>
        <text x="42" y="24" fill="#effffb" fontSize="10" fontWeight="900" fontFamily="Inter, Arial, sans-serif" letterSpacing="0.9">RCA</text>
        <path d="M12 31h34" stroke="rgba(4,17,15,0.45)" strokeWidth="2" strokeLinecap="round" />
        <path d="M52 31h14" stroke="rgba(239,255,251,0.72)" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </span>
  )
}
