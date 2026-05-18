import React from 'react'
import RcaInsightPanel from './RcaInsightPanel.jsx'

const DIRECT_UPLOAD_CACHE_KEY = 'sap_rca_wpscout_direct_upload_payload_v1'

function readDirectUploadPayload() {
  if (typeof window === 'undefined') return null

  if (window.__SAP_RCA_WP_SCOUT_DIRECT_UPLOAD__?.rows?.length) {
    return window.__SAP_RCA_WP_SCOUT_DIRECT_UPLOAD__
  }

  try {
    const cached = window.sessionStorage?.getItem(DIRECT_UPLOAD_CACHE_KEY)
    return cached ? JSON.parse(cached) : null
  } catch (error) {
    console.warn('[WP-SCOUT Comparator] direct upload cache restore skipped', error)
    return null
  }
}

function normalizeDirectRows(rows = []) {
  return rows.map((row, index) => ({
    ...row,
    id: row.id || `direct-upload-${row.host || 'host'}-${row.pid || index}-${index}`,
    hits: Number(row.hits || 1),
    rssGb: Number(row.rssGb || 0),
    ageHours: Number(row.ageHours || 0),
    cpu: Number(row.cpu || 0),
    severity: row.severity || row.status || 'OK',
    status: row.status || row.severity || 'OK',
    score: Number(row.score || 0),
  }))
}

export function getWpScoutDirectUploadHydrationPayload() {
  const payload = readDirectUploadPayload()
  const rows = normalizeDirectRows(payload?.rows || [])
  if (!rows.length) return null

  return {
    ...payload,
    rows,
    resourceSamples: Array.isArray(payload?.resourceSamples) ? payload.resourceSamples : [],
    sourceFiles: Array.isArray(payload?.sourceFiles) ? payload.sourceFiles : [],
  }
}

export default function ToolComparerDirectHydrated() {
  const [ToolComparerClean, setToolComparerClean] = React.useState(null)

  React.useEffect(() => {
    let active = true

    import('./ToolComparerClean.jsx').then((module) => {
      if (active) setToolComparerClean(() => module.default)
    })

    return () => {
      active = false
    }
  }, [])

  React.useEffect(() => {
    const payload = getWpScoutDirectUploadHydrationPayload()
    if (!payload) return

    window.dispatchEvent(new CustomEvent('sap-rca:wpscout-direct-upload-hydration-ready', {
      detail: payload,
    }))
  }, [ToolComparerClean])

  if (!ToolComparerClean) {
    return (
      <section className="container section">
        <div className="card">Loading WP-SCOUT comparator…</div>
      </section>
    )
  }

  return (
    <>
      <ToolComparerClean />
      <RcaInsightPanel />
    </>
  )
}
