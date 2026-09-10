import React from 'react'

const paths = {
  activity: <><path d="M3 12h3l2-5 4 10 2-5h7" /></>,
  server: <><rect x="4" y="4" width="16" height="6" rx="1.5" /><rect x="4" y="14" width="16" height="6" rx="1.5" /><path d="M8 7h.01M8 17h.01" /></>,
  trend: <><path d="M4 18V6" /><path d="M4 18h16" /><path d="m7 14 4-4 3 2 4-5" /></>,
  workload: <><rect x="7" y="7" width="10" height="10" rx="2" /><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" /></>,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>,
  alert: <><path d="M12 3 3.8 19h16.4L12 3Z" /><path d="M12 9v4M12 16h.01" /></>,
  upload: <><path d="M12 16V5" /><path d="m8 9 4-4 4 4" /><path d="M5 19h14" /></>,
  pdf: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5" /><path d="M8.5 16h7" /></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /><path d="M12 7v5l3 2" /></>,
  database: <><ellipse cx="12" cy="5" rx="7" ry="3" /><path d="M5 5v7c0 1.7 3.1 3 7 3s7-1.3 7-3V5" /><path d="M5 12v7c0 1.7 3.1 3 7 3s7-1.3 7-3v-7" /></>,
  refresh: <><path d="M20 7v5h-5" /><path d="M4 17v-5h5" /><path d="M6.1 8a7 7 0 0 1 11.8-2L20 8" /><path d="M17.9 16a7 7 0 0 1-11.8 2L4 16" /></>,
}

export default function SphereIcon({ name, size = 15, className = '', title = '' }) {
  const body = paths[name]
  if (!body) return null
  return <svg
    className={`sphereIcon ${className}`.trim()}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden={title ? undefined : 'true'}
    role={title ? 'img' : undefined}
  >
    {title && <title>{title}</title>}
    {body}
  </svg>
}
